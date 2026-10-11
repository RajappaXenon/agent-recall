import type { Filter } from 'mongodb';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { EventListQuerySchema, EventSchema, paginated } from '@agent-recall/shared';
import type { EventDoc } from '../db/collections.js';
import { eventsRepo, toObjectId } from '../db/repositories/index.js';

const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/events',
    { schema: { tags: ['events'], summary: 'Activity log / audit trail (filterable, paginated)', querystring: EventListQuerySchema, response: { 200: paginated(EventSchema) } } },
    async (req) => {
      const q = req.query;
      const filter: Filter<EventDoc> = {};
      if (q.type) filter.type = q.type;
      else if (q.typePrefix) filter.type = { $regex: `^${q.typePrefix.replace(/[^a-z_]/gi, '')}\\.` };
      if (q.status) filter.status = q.status;
      if (q.agentId) filter.agentId = toObjectId(q.agentId, 'Agent');
      if (q.taskId) filter.taskId = toObjectId(q.taskId, 'Task');
      if (q.memoryId) filter.memoryId = toObjectId(q.memoryId, 'Memory');
      const [docs, total] = await Promise.all([
        eventsRepo.find(req.auth.orgId, filter, { sort: { createdAt: -1, _id: -1 }, skip: (q.page - 1) * q.pageSize, limit: q.pageSize }),
        eventsRepo.count(req.auth.orgId, filter),
      ]);
      return {
        items: docs.map((e) => ({
          id: String(e._id),
          type: e.type,
          status: e.status,
          actor: e.actor,
          agentId: e.agentId ? String(e.agentId) : null,
          taskId: e.taskId ? String(e.taskId) : null,
          memoryId: e.memoryId ? String(e.memoryId) : null,
          summary: e.summary,
          details: e.details,
          isSeed: e.isSeed,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    },
  );
};

export default eventRoutes;
