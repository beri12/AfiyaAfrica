import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContextData {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Express middleware: assigns a request id (honours a well-formed inbound X-Request-Id) and stores context. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  const requestId = inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  (req as Request & { id: string }).id = requestId;
  storage.run(
    { requestId, ipAddress: req.ip, userAgent: req.header('user-agent')?.slice(0, 300) },
    () => next(),
  );
}
