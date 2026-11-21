# syntax=docker/dockerfile:1
# Optional extra CA for builds behind corporate/egress proxies:
#   docker build --secret id=extra_ca,src=/path/to/ca.crt ...
# ---------- build (full image: compilers + OpenSSL, no apt needed) ----------
FROM node:22-bookworm AS build
RUN --mount=type=secret,id=extra_ca,required=false sh -c 'if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; corepack enable && corepack prepare pnpm@10.28.0 --activate'
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN --mount=type=secret,id=extra_ca,required=false sh -c 'if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; pnpm install --frozen-lockfile --filter @afyalink/api... --filter @afyalink/config'
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @afyalink/shared build && pnpm --filter @afyalink/api build
# Self-contained production bundle: prod deps only, workspace packages copied in.
RUN pnpm --filter @afyalink/api deploy --prod --legacy /out && cp -r apps/api/dist apps/api/prisma /out/
RUN --mount=type=secret,id=extra_ca,required=false sh -c 'if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; cd /out && npx --yes prisma@6.19.3 generate --schema prisma/schema.prisma' \
 && mkdir -p /out/prisma-engine \
 && cp "$(find /out/node_modules -name 'libquery_engine-debian-openssl-3.0.x.so.node' | head -1)" /out/prisma-engine/

# ---------- runtime: distroless, non-root, no shell ----------
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ENV NODE_ENV=production \
    PRISMA_QUERY_ENGINE_LIBRARY=/app/prisma-engine/libquery_engine-debian-openssl-3.0.x.so.node
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out ./
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["dist/main.js"]
