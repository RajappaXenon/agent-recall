import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { MongoServerError } from 'mongodb';
import { scrubSecrets } from '../config.js';
import { AppError } from '../lib/errors.js';

/** Central error handler: every error becomes `{ error: { code, message } }`, no stacks or provider bodies. */
export default fp(async (app) => {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0];
      const path = first?.instancePath?.replace(/^\//, '').replace(/\//g, '.') || err.validationContext || 'request';
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: `${path}: ${first?.message ?? 'invalid input'}` },
      });
    }
    if (err instanceof AppError) {
      if (err.statusCode >= 500) req.log.warn({ code: err.code }, scrubSecrets(err.message));
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ issues: err.cause.issues }, 'Response did not match schema');
      return reply.status(500).send({ error: { code: 'RESPONSE_SCHEMA', message: 'The server produced an invalid response.' } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a moment and retry.' } });
    }
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: (err as { code?: string }).code ?? 'BAD_REQUEST', message: err.message } });
    }
    const mongoErr: unknown = err;
    if (mongoErr instanceof MongoServerError && mongoErr.code === 11000) {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: 'A record with the same key already exists.' } });
    }
    req.log.error({ err: { name: err.name, message: scrubSecrets(err.message) } }, 'Unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found` } });
  });
});
