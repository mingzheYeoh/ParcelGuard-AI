import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

/**
 * Vercel Function wrapper around the same buildApp() that
 * apps/api/src/server.ts uses locally (TASKS.md §1.2 rule 8).
 *
 * Zero-config Fastify entrypoint detection does not apply here: this project
 * also ships a static Vite build, so the Fastify app is mounted as one
 * function behind the /api/v1 rewrite in vercel.json rather than owning the
 * whole project.
 *
 * Two constraints shape the import below:
 *
 * 1. It targets `apps/api/dist`, not `src` — the api workspace compiles with
 *    NodeNext and emits ".js" specifiers on relative imports, which the
 *    function bundler resolves only against real .js files. `pnpm build`
 *    produces dist before functions are bundled.
 * 2. It is a *dynamic* import. The repository root has no `"type": "module"`,
 *    so Vercel compiles this entry to CommonJS; a static import would become
 *    `require()` of an ESM package whose dependencies publish only an
 *    `import` condition. `import()` works from CommonJS and resolves with ESM
 *    conditions. `.mts` is not an option — Vercel does not recognise it as a
 *    function inside `api/`.
 *
 * The promise is created at module scope, so a warm instance reuses one
 * Fastify instance and one database pool instead of rebuilding per request.
 */
const appPromise: Promise<FastifyInstance> = import('../apps/api/dist/app.js').then(
  async ({ buildApp }) => {
    const app = buildApp({ logger: false });
    await app.ready();
    return app;
  },
);

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const app = await appPromise;
  // Hand the raw request to Fastify's HTTP server. No listen() is involved:
  // the platform owns the socket, Fastify only routes.
  app.server.emit('request', request, response);
}
