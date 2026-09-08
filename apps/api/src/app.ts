import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { ApiError } from './http/errors.js';
import { assertOrigin, registerRoutes } from './routes/index.js';
import {
  createModelAdapter,
  createTerminal3AdapterFromConfig,
  type ModelAdapter,
  type Terminal3Adapter,
} from './adapters/index.js';
import { getDb, type Database } from './db/index.js';

export interface AppDeps {
  /** Injected by tests; production resolves the pooled singleton lazily. */
  db?: Database;
  model?: ModelAdapter;
  terminal3?: Terminal3Adapter;
}

/**
 * buildApp() registers plugins and routes but never calls listen().
 * - Local development: src/server.ts calls buildApp().listen({ port: 3001 }).
 * - Vercel: api/index.ts (Task 6) wraps this same instance in a Function handler.
 */
export function buildApp(
  options: FastifyServerOptions & { deps?: AppDeps } = {},
): FastifyInstance {
  const { deps, ...fastifyOptions } = options;

  const app = Fastify({
    logger: fastifyOptions.logger ?? true,
    // PLAN.md §7: request_id is echoed in every envelope, success or error.
    genReqId: () => `req_${randomUUID()}`,
    ...fastifyOptions,
  });

  app.register(cookie, { secret: config.sessionSecret() });

  app.addHook('preHandler', async (request, reply) => {
    assertOrigin(request, reply);
  });

  registerRoutes(app, {
    // Lazy: a missing DATABASE_URL must not stop GET /health from answering.
    getDb: () => deps?.db ?? getDb(),
    model: deps?.model ?? createModelAdapter(),
    terminal3: deps?.terminal3 ?? createTerminal3AdapterFromConfig(),
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'RESOURCE_UNAVAILABLE', message: 'Resource not available', retryable: false },
      request_id: request.id,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      if (error.retryAfterSeconds !== undefined) {
        reply.header('retry-after', String(error.retryAfterSeconds));
      }
      reply.status(error.status).send({
        error: { code: error.code, message: error.message, retryable: error.retryable },
        request_id: request.id,
      });
      return;
    }

    // Anything unhandled is logged server-side and reported without internals:
    // no stack traces, no driver messages, no other customers' data (PLAN.md §7).
    request.log.error({ err: error }, 'unhandled error');
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed',
        retryable: false,
      },
      request_id: request.id,
    });
  });

  return app;
}
