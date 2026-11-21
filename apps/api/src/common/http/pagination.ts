import type { PageMeta, PaginationQuery } from '@afyalink/shared';

/** Marker for paginated responses; the response interceptor emits `{ data, meta }`. */
export class Page<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PageMeta,
  ) {}
}

export function paginate<T>(items: T[], total: number, q: PaginationQuery): Page<T> {
  return new Page(items, {
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  });
}

export function skipTake(q: PaginationQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}
