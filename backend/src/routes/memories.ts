import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CreateMemorySchema,
  IdSchema,
  MemoryListQuerySchema,
  MemoryRelatedResponseSchema,
  MemoryRetrievalsResponseSchema,
  MemorySchema,
  SearchableResponseSchema,
  UpdateMemorySchema,
  paginated,
} from '@agent-recall/shared';
import { memoryRetrievals, relatedMemories, searchability } from '../services/memory-insights.js';
import { memoriesRepo } from '../db/repositories/index.js';
import { notFound } from '../lib/errors.js';
import { toMemory } from '../lib/serialize.js';
import { archiveMemory, createMemory, listMemories, updateMemory } from '../services/memories.js';
import { userActor } from '../services/events.js';

const Params = z.object({ id: IdSchema });

const memoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/memories',
    { schema: { tags: ['memories'], querystring: MemoryListQuerySchema, response: { 200: paginated(MemorySchema) } } },
    async (req) => {
      const { items, total } = await listMemories(req.auth.orgId, req.query);
      return { items: items.map(toMemory), total, page: req.query.page, pageSize: req.query.pageSize };
    },
  );

  app.post(
    '/memories',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { tags: ['memories'], body: CreateMemorySchema, response: { 201: MemorySchema } },
    },
    async (req, reply) => {
      const doc = await createMemory(req.auth.orgId, req.body, userActor(req.auth.userId));
      return reply.status(201).send(toMemory(doc));
    },
  );

  app.get('/memories/:id', { schema: { tags: ['memories'], params: Params, response: { 200: MemorySchema } } }, async (req) => {
    const doc = await memoriesRepo.findById(req.auth.orgId, req.params.id);
    if (!doc) throw notFound('Memory');
    return toMemory(doc);
  });

  app.patch(
    '/memories/:id',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['memories'], params: Params, body: UpdateMemorySchema, response: { 200: MemorySchema } } },
    async (req) => toMemory(await updateMemory(req.auth.orgId, req.params.id, req.body, userActor(req.auth.userId))),
  );

  app.post(
    '/memories/:id/archive',
    { schema: { tags: ['memories'], params: Params, response: { 200: MemorySchema } } },
    async (req) => toMemory(await archiveMemory(req.auth.orgId, req.params.id, userActor(req.auth.userId))),
  );

  app.get(
    '/memories/:id/related',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['memories'], params: Params, response: { 200: MemoryRelatedResponseSchema } } },
    async (req) => relatedMemories(req.auth.orgId, req.params.id),
  );

  app.get(
    '/memories/:id/retrievals',
    { schema: { tags: ['memories'], params: Params, response: { 200: MemoryRetrievalsResponseSchema } } },
    async (req) => memoryRetrievals(req.auth.orgId, req.params.id),
  );

  app.get(
    '/memories/:id/searchable',
    {
      config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
      schema: { tags: ['memories'], summary: 'Is this memory retrievable through the search indexes yet?', params: Params, response: { 200: SearchableResponseSchema } },
    },
    async (req) => searchability(req.auth.orgId, req.params.id),
  );
};

export default memoryRoutes;
