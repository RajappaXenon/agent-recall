import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { IntegrationStatusSchema } from '@agent-recall/shared';
import { getIntegrationStatus } from '../services/integrations.js';
import { logEvent, userActor } from '../services/events.js';
import { synthesize, TTS_MAX_CHARS, ttsModel } from '../services/tts.js';

const audioRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/integrations/elevenlabs/status',
    {
      schema: {
        tags: ['audio'],
        querystring: z.object({ refresh: z.enum(['true', 'false']).optional() }),
        response: { 200: IntegrationStatusSchema },
      },
    },
    async (req) => {
      const { integrations } = await getIntegrationStatus(req.query.refresh === 'true');
      return integrations.find((i) => i.key === 'elevenlabs')!;
    },
  );

  app.post(
    '/audio/speech',
    {
      config: {
        // 10 requests per minute per user (not per IP).
        rateLimit: { max: 10, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: (req) => (req.auth ? `tts:${req.auth.userId.toHexString()}` : `tts-ip:${req.ip}`) },
      },
      schema: {
        tags: ['audio'],
        summary: `Text to speech (ElevenLabs), streamed as audio/mpeg. Max ${TTS_MAX_CHARS} characters. Nothing is stored.`,
        body: z.object({ text: z.string().trim().min(1).max(TTS_MAX_CHARS) }),
      },
    },
    async (req, reply) => {
      const { body, contentType } = await synthesize(req.body.text);
      await logEvent(req.auth.orgId, {
        type: 'audio.generated',
        status: 'success',
        actor: userActor(req.auth.userId),
        summary: `Audio generated (${req.body.text.length} characters)`,
        details: { characters: req.body.text.length, model: ttsModel() },
      });
      reply.header('Content-Type', contentType).header('Cache-Control', 'no-store');
      return reply.send(Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>));
    },
  );
};

export default audioRoutes;
