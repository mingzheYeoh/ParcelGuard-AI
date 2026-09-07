import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { API_BASE_PATH, type HealthResponse } from '@parcelguard/contracts';

let requestCounter = 0;

function nextRequestId(): string {
  requestCounter += 1;
  return `req_${Date.now().toString(36)}_${requestCounter.toString(36)}`;
}

/**
 * buildApp() registers plugins and routes but never calls listen().
 * - Local development: src/server.ts calls buildApp().listen({ port: 3001 }).
 * - Vercel: api/index.ts (Task 6) wraps this same instance in a Function handler.
 */
export function buildApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    ...options,
  });

  // Placeholder health route (Task 1). Real IntegrationStatus wiring lands in
  // Task 5 (backend core) / Task 7 / Task 8; modes stay honest ("unavailable")
  // until an adapter is actually configured.
  app.get(`${API_BASE_PATH}/health`, async () => {
    const data: HealthResponse = {
      api: 'ok',
      model: 'unavailable',
      terminal3: 'unavailable',
    };
    return { data, request_id: nextRequestId() };
  });

  return app;
}
