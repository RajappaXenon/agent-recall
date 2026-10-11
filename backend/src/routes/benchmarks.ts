import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { BenchmarkRunSchema, BenchmarkRunSummarySchema, BenchmarkSetResponseSchema, IdSchema } from '@agent-recall/shared';
import { benchmarkSet, getBenchmarkRun, listBenchmarkRuns, runBenchmark } from '../services/benchmark.js';
import { userActor } from '../services/events.js';

const benchmarkRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/benchmarks/set',
    { schema: { tags: ['benchmarks'], summary: 'The labelled query set and labelling rule', response: { 200: BenchmarkSetResponseSchema } } },
    async (req) => benchmarkSet(req.auth.orgId),
  );

  app.post(
    '/benchmarks/runs',
    {
      // Each run embeds every query (Voyage) and runs ~50 Atlas searches.
      config: { rateLimit: { max: 4, timeWindow: '10 minutes' } },
      schema: { tags: ['benchmarks'], summary: 'Run the retrieval benchmark now (takes ~20–40 s)', response: { 201: BenchmarkRunSchema } },
    },
    async (req, reply) => reply.status(201).send(await runBenchmark(req.auth.orgId, userActor(req.auth.userId), req.auth.userId)),
  );

  app.get(
    '/benchmarks/runs',
    { schema: { tags: ['benchmarks'], response: { 200: z.object({ items: z.array(BenchmarkRunSummarySchema) }) } } },
    async (req) => ({ items: await listBenchmarkRuns(req.auth.orgId) }),
  );

  app.get(
    '/benchmarks/runs/:id',
    { schema: { tags: ['benchmarks'], params: z.object({ id: IdSchema }), response: { 200: BenchmarkRunSchema } } },
    async (req) => getBenchmarkRun(req.auth.orgId, req.params.id),
  );
};

export default benchmarkRoutes;
