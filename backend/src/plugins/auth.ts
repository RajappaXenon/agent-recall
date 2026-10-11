import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { ObjectId } from 'mongodb';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

export interface AuthContext {
  orgId: ObjectId;
  userId: ObjectId;
}

interface TokenPayload {
  sub: string;
  org: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Demo auth (AUTH_MODE=demo): a signed JWT identifies the demo user and org.
 * Not production-secure; the UI says so.
 */
export default fp(async (app) => {
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: '12h' } });

  app.decorateRequest('auth', null as unknown as AuthContext);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    let payload: TokenPayload;
    try {
      payload = await req.jwtVerify<TokenPayload>();
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Sign in again: the session is missing or expired.');
    }
    if (!ObjectId.isValid(payload.org) || !ObjectId.isValid(payload.sub)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid session token.');
    }
    req.auth = { orgId: new ObjectId(payload.org), userId: new ObjectId(payload.sub) };
  });
});
