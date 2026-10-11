import { z } from 'zod';
import { IdSchema } from './common.js';

export const SessionSchema = z.object({
  user: z.object({ id: IdSchema, email: z.string(), name: z.string() }),
  org: z.object({ id: IdSchema, name: z.string() }),
  authMode: z.literal('demo'),
});
export type Session = z.infer<typeof SessionSchema>;

export const DemoLoginResponseSchema = SessionSchema.extend({ token: z.string() });
export type DemoLoginResponse = z.infer<typeof DemoLoginResponseSchema>;
