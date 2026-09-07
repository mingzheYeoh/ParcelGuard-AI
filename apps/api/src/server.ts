// Local entry point only: load apps/api/.env before anything reads config.
// Deployed environments inject their own variables, so app.ts must never
// depend on dotenv being present.
import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

const app = buildApp();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
