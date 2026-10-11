import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HealthResponseSchema, ReadyResponseSchema } from '@agent-recall/shared';
import { config } from '../config.js';
import { isMongoConfigured, pingMongo } from '../db/client.js';

const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    { schema: { tags: ['system'], summary: 'Liveness', response: { 200: HealthResponseSchema } } },
    async () => ({ status: 'ok' as const, uptimeS: Math.round(process.uptime()) }),
  );

  app.get(
    '/ready',
    {
      schema: {
        tags: ['system'],
        summary: 'Readiness: live ping to the Atlas cluster',
        response: { 200: ReadyResponseSchema, 503: ReadyResponseSchema },
      },
    },
    async (_req, reply) => {
      const checkedAt = new Date().toISOString();
      if (!isMongoConfigured()) {
        return reply.status(503).send({
          status: 'not_ready',
          mongo: { connected: false, latencyMs: null, checkedAt, database: config.DB_NAME, detail: 'MONGODB_URI is not set in .env' },
        });
      }
      const ping = await pingMongo();
      if (!ping.ok) {
        return reply.status(503).send({
          status: 'not_ready',
          // Driver detail can include the cluster host; keep it in logs only in production.
          mongo: { connected: false, latencyMs: null, checkedAt, database: config.DB_NAME, detail: config.NODE_ENV === 'production' ? 'database unreachable' : ping.detail },
        });
      }
      return {
        status: 'ready' as const,
        mongo: { connected: true, latencyMs: ping.latencyMs, checkedAt, database: config.DB_NAME, detail: 'ping ok' },
      };
    },
  );
};

export default healthRoutes;
