import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { DevStatusSchema } from '@agent-recall/shared';
import { config } from '../config.js';
import { recentWorkers, requestCrash } from '../db/repositories/worker.js';
import { tasksRepo } from '../db/repositories/index.js';
import { AppError } from '../lib/errors.js';
import { logEvent, userActor } from '../services/events.js';

const devRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/dev/status', { schema: { tags: ['dev'], summary: 'Demo mode flag and live workers (heartbeat ≤ 10 s)', response: { 200: DevStatusSchema } } }, async (req) => {
    const workers = await recentWorkers();
    // Workers serve every tenant: only reveal task ids that belong to the caller's org.
    const ids = workers.flatMap((w) => (w.currentTaskId ? [w.currentTaskId] : []));
    const own = new Set((await tasksRepo.findByIds(req.auth.orgId, ids)).map((t) => String(t._id)));
    return {
      demoMode: config.DEMO_MODE,
      leaseMs: config.LEASE_MS,
      stepDelayMs: config.DEMO_STEP_DELAY_MS,
      workers: workers.map((w) => ({
        workerId: w.workerId ?? 'unknown',
        pid: w.pid ?? null,
        currentTaskId: w.currentTaskId && own.has(String(w.currentTaskId)) ? w.currentTaskId.toHexString() : null,
        lastSeen: (w.lastSeen ?? new Date()).toISOString(),
      })),
    };
  });

  app.post(
    '/dev/worker/crash',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['dev'],
        summary: 'DEMO_MODE only: the worker running a task in this org exits with code 1 after its current step',
        response: { 202: z.object({ requested: z.literal(true), detail: z.string() }) },
      },
    },
    async (req, reply) => {
      if (!config.DEMO_MODE) throw new AppError(404, 'NOT_FOUND', 'Route POST /api/dev/worker/crash not found');
      await requestCrash(req.auth.orgId, req.auth.userId.toHexString());
      await logEvent(req.auth.orgId, {
        type: 'worker.crash_requested',
        status: 'warning',
        actor: userActor(req.auth.userId),
        summary: 'Worker crash requested (demo): the worker exits after its current step',
      });
      return reply.status(202).send({ requested: true as const, detail: 'The worker will exit with code 1 after committing its current step.' });
    },
  );
};

export default devRoutes;
