import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { LearningResponseSchema, OverviewResponseSchema } from '@agent-recall/shared';
import { learning, overview } from '../services/insights.js';

const insightRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/overview',
    { schema: { tags: ['insights'], summary: 'Memory Intelligence metrics, computed from stored data (tagged seed/live/mixed)', response: { 200: OverviewResponseSchema } } },
    async (req) => overview(req.auth.orgId),
  );

  app.get(
    '/learning',
    { schema: { tags: ['insights'], summary: 'Outcome analytics: outcomes over time, useful/retrieved memories, verified procedures, recurring problems', response: { 200: LearningResponseSchema } } },
    async (req) => learning(req.auth.orgId),
  );
};

export default insightRoutes;
