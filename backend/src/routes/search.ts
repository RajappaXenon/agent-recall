import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { RetrievalLogSchema, SearchModeSchema, SearchRequestSchema, SearchResponseSchema, paginated } from '@agent-recall/shared';
import { config } from '../config.js';
import { retrievalLogsRepo } from '../db/repositories/index.js';
import { search } from '../services/search.js';
import { userActor } from '../services/events.js';

const SearchBody = SearchRequestSchema.extend({
  /** DEMO_MODE only: treat the keyword index as unavailable to show the labelled fallback. */
  forceKeywordFallback: z.boolean().optional(),
});

const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  for (const mode of SearchModeSchema.options) {
    app.post(
      `/search/${mode}`,
      {
        config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
        schema: { tags: ['search'], summary: `${mode} search`, body: SearchBody, response: { 200: SearchResponseSchema } },
      },
      async (req) =>
        search(
          req.auth.orgId,
          mode,
          {
            query: req.body.query,
            filters: req.body.filters,
            limit: req.body.limit,
            applyOutcomePolicy: req.body.applyOutcomePolicy,
            forceKeywordFallback: config.DEMO_MODE ? req.body.forceKeywordFallback : false,
          },
          userActor(req.auth.userId),
          req.auth.userId,
        ),
    );
  }

  app.get(
    '/search/logs',
    {
      schema: {
        tags: ['search'],
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }),
        response: { 200: paginated(RetrievalLogSchema) },
      },
    },
    async (req) => {
      const { page, pageSize } = req.query;
      const [docs, total] = await Promise.all([
        retrievalLogsRepo.find(req.auth.orgId, {}, { sort: { createdAt: -1 }, skip: (page - 1) * pageSize, limit: pageSize }),
        retrievalLogsRepo.count(req.auth.orgId),
      ]);
      return {
        items: docs.map((d) => ({
          id: d._id.toHexString(),
          query: d.query,
          mode: d.mode,
          engine: d.engine as z.infer<typeof RetrievalLogSchema>['engine'],
          resultCount: d.results.length,
          topMemoryIds: d.results.slice(0, 3).map((r) => r.memoryId.toHexString()),
          latencyMs: d.latencyMs,
          applyOutcomePolicy: d.applyOutcomePolicy,
          warnings: d.warnings,
          isSeed: d.isSeed,
          createdAt: d.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    },
  );
};

export default searchRoutes;
