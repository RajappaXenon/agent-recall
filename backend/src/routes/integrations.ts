import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { IntegrationsResponseSchema } from '@agent-recall/shared';
import { getIntegrationStatus } from '../services/integrations.js';

const integrationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/integrations/status',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['integrations'],
        summary: 'Live probe of every integration (cached 60 s; ?refresh=true re-probes)',
        querystring: z.object({ refresh: z.enum(['true', 'false']).optional() }),
        response: { 200: IntegrationsResponseSchema },
      },
    },
    async (req) => getIntegrationStatus(req.query.refresh === 'true'),
  );
};

export default integrationRoutes;
