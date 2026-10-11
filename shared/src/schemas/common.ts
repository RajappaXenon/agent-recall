import { z } from 'zod';

export const IdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
export const IsoDateSchema = z.string().datetime();

export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() });

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const BaseDocSchema = z.object({
  id: IdSchema,
  orgId: IdSchema,
  isSeed: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
