import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { DemoLoginResponseSchema, SessionSchema } from '@agent-recall/shared';
import { identityRepo } from '../db/repositories/index.js';
import { AppError } from '../lib/errors.js';

const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/demo-login',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Demo login (AUTH_MODE=demo, not production-secure)',
        response: { 200: DemoLoginResponseSchema },
      },
    },
    async () => {
      const { org, user } = await identityRepo.ensureDemoIdentity();
      const token = app.jwt.sign({ sub: user._id.toHexString(), org: org._id.toHexString() });
      return {
        token,
        user: { id: user._id.toHexString(), email: user.email, name: user.name },
        org: { id: org._id.toHexString(), name: org.name },
        authMode: 'demo' as const,
      };
    },
  );

  app.get(
    '/auth/me',
    { onRequest: [app.authenticate], schema: { tags: ['auth'], response: { 200: SessionSchema } } },
    async (req) => {
      const [org, user] = await Promise.all([
        identityRepo.findOrgById(req.auth.orgId),
        identityRepo.findUser(req.auth.orgId, req.auth.userId),
      ]);
      if (!org || !user) throw new AppError(401, 'UNAUTHORIZED', 'Session no longer valid. Sign in again.');
      return {
        user: { id: user._id.toHexString(), email: user.email, name: user.name },
        org: { id: org._id.toHexString(), name: org.name },
        authMode: 'demo' as const,
      };
    },
  );
};

export default authRoutes;
