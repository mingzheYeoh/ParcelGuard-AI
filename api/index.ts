import type { IncomingMessage, ServerResponse } from 'node:http';
// The *built* output, not src/: apps/api compiles with NodeNext and writes
// ".js" specifiers on its relative imports, which the function bundler can
// only resolve against real .js files. `pnpm build` (the buildCommand) emits
// apps/api/dist before functions are bundled.
import { buildApp } from '../apps/api/dist/app.js';

/**
 * Vercel Function wrapper around the same buildApp() used by
 * apps/api/src/server.ts locally (TASKS.md §1.2 rule 8).
 *
 * Zero-config Fastify detection does not apply here: this project also ships a
 * static Vite build, so the Fastify app is mounted as a single function behind
 * the /api/v1 rewrite in vercel.json rather than owning the whole project.
 *
 * The instance is created at module scope so a warm instance reuses it — and
 * with it the database pool — instead of rebuilding per request.
 */
const app = buildApp({ logger: false });
const ready = app.ready();

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await ready;
  // Hand the raw request to Fastify's HTTP server. No listen() is involved:
  // the platform owns the socket, Fastify only routes.
  app.server.emit('request', request, response);
}
