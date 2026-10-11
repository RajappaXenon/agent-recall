import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AgentWithStatsSchema, CreateAgentSchema, IdSchema, MemorySchema, OutcomeListItemSchema, TaskSchema, UpdateAgentSchema, paginated } from '@agent-recall/shared';
import { listOutcomes, listTasks } from '../services/tasks.js';
import { createAgent, getAgent, listAgents, updateAgent } from '../services/agents.js';
import { listMemories } from '../services/memories.js';
import { userActor } from '../services/events.js';
import { toMemory } from '../lib/serialize.js';

const Params = z.object({ id: IdSchema });

const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/agents', { schema: { tags: ['agents'], response: { 200: z.object({ items: z.array(AgentWithStatsSchema) }) } } }, async (req) => ({
    items: await listAgents(req.auth.orgId),
  }));

  app.post('/agents', { schema: { tags: ['agents'], body: CreateAgentSchema, response: { 201: AgentWithStatsSchema } } }, async (req, reply) => {
    const agent = await createAgent(req.auth.orgId, req.body, userActor(req.auth.userId));
    return reply.status(201).send(await getAgent(req.auth.orgId, agent._id.toHexString()));
  });

  app.get('/agents/:id', { schema: { tags: ['agents'], params: Params, response: { 200: AgentWithStatsSchema } } }, async (req) =>
    getAgent(req.auth.orgId, req.params.id),
  );

  app.patch(
    '/agents/:id',
    { schema: { tags: ['agents'], params: Params, body: UpdateAgentSchema, response: { 200: AgentWithStatsSchema } } },
    async (req) => updateAgent(req.auth.orgId, req.params.id, req.body, userActor(req.auth.userId)),
  );

  app.get(
    '/agents/:id/memories',
    {
      schema: {
        tags: ['agents'],
        params: Params,
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }),
        response: { 200: paginated(MemorySchema) },
      },
    },
    async (req) => {
      await getAgent(req.auth.orgId, req.params.id);
      const { items, total } = await listMemories(req.auth.orgId, {
        ...req.query,
        agentId: req.params.id,
        sort: 'newest',
        includeArchived: false,
      });
      return { items: items.map(toMemory), total, page: req.query.page, pageSize: req.query.pageSize };
    },
  );

  app.get(
    '/agents/:id/tasks',
    {
      schema: {
        tags: ['agents'],
        params: Params,
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }),
        response: { 200: paginated(TaskSchema) },
      },
    },
    async (req) => {
      await getAgent(req.auth.orgId, req.params.id);
      return listTasks(req.auth.orgId, { ...req.query, agentId: req.params.id });
    },
  );

  app.get(
    '/agents/:id/outcomes',
    { schema: { tags: ['agents'], params: Params, response: { 200: z.object({ items: z.array(OutcomeListItemSchema) }) } } },
    async (req) => {
      await getAgent(req.auth.orgId, req.params.id);
      return { items: await listOutcomes(req.auth.orgId, { agentId: req.params.id }) };
    },
  );
};

export default agentRoutes;
