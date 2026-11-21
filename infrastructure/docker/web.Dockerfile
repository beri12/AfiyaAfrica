# syntax=docker/dockerfile:1
FROM node:22-bookworm AS build
RUN --mount=type=secret,id=extra_ca,required=false sh -c 'if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; corepack enable && corepack prepare pnpm@10.28.0 --activate'
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=extra_ca,required=false sh -c 'if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca npm_config_cafile=/run/secrets/extra_ca; fi; pnpm install --frozen-lockfile --filter @afyalink/web... --filter @afyalink/config'
COPY packages packages
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @afyalink/shared build && pnpm --filter @afyalink/web build

# ---------- runtime: distroless, non-root ----------
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/public ./apps/web/public
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["apps/web/server.js"]
