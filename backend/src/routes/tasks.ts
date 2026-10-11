import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  AnswerRequestSchema,
  AnswerResponseSchema,
  CheckpointSchema,
  IdSchema,
  OutcomeRequestSchema,
  OutcomeResponseSchema,
  TaskListQuerySchema,
  TaskSchema,
  paginated,
} from '@agent-recall/shared';
import { createAnswer } from '../services/answers.js';
import { recordOutcome } from '../services/outcomes.js';
import { getTask, listCheckpoints, listTasks } from '../services/tasks.js';
import { userActor } from '../services/events.js';

const Params = z.object({ id: IdSchema });

const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post(
    '/answers',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['answers'],
        summary: 'Grounded answer from selected memories (creates a qa task)',
        body: AnswerRequestSchema,
        response: { 200: AnswerResponseSchema },
      },
    },
    async (req) => createAnswer(req.auth.orgId, req.body, userActor(req.auth.userId)),
  );

  app.get('/tasks', { schema: { tags: ['tasks'], querystring: TaskListQuerySchema, response: { 200: paginated(TaskSchema) } } }, async (req) =>
    listTasks(req.auth.orgId, req.query),
  );

  app.get('/tasks/:id', { schema: { tags: ['tasks'], params: Params, response: { 200: TaskSchema } } }, async (req) =>
    getTask(req.auth.orgId, req.params.id),
  );

  app.get(
    '/tasks/:id/checkpoints',
    { schema: { tags: ['tasks'], params: Params, response: { 200: z.object({ items: z.array(CheckpointSchema) }) } } },
    async (req) => ({ items: await listCheckpoints(req.auth.orgId, req.params.id) }),
  );

  app.post(
    '/tasks/:id/outcome',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['tasks'], summary: 'Record whether the answer worked', params: Params, body: OutcomeRequestSchema, response: { 200: OutcomeResponseSchema } },
    },
    async (req) => recordOutcome(req.auth.orgId, req.auth.userId, req.params.id, req.body, userActor(req.auth.userId)),
  );
};

export default taskRoutes;
