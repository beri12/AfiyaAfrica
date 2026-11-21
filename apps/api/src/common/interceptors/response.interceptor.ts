import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { Page } from '../http/pagination';

/** Wraps handler results as `{ data }` or `{ data, meta }` for paginated results. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (value instanceof StreamableFile) return value;
        if (value instanceof Page) return { data: value.items, meta: value.meta };
        return { data: value ?? null };
      }),
    );
  }
}
