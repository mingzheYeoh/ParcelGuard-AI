// Task 0 preflight: one plain request + one forced tool call against the Azure deployment.
// Usage: node scripts/preflight/azure-smoke.mjs   (reads apps/api/.env; prints no secrets)
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../apps/api/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const base = env.AZURE_OPENAI_BASE_URL?.replace(/\/?$/, '/');
const key = env.AZURE_OPENAI_API_KEY;
const model = env.AZURE_OPENAI_DEPLOYMENT;
if (!base || !key || key.startsWith('<') || !model) {
  console.error('Fill AZURE_OPENAI_BASE_URL / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT in apps/api/.env first.');
  process.exit(2);
}

async function call(body) {
  const t = Date.now();
  const res = await fetch(base + 'responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, store: false, max_output_tokens: 120, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - t, json };
}

// 1. plain text
const a = await call({ input: 'Reply with a short greeting for an order support assistant.' });
const text = a.json.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text;
console.log(`[1] text     status=${a.status} ${a.ms}ms ->`, text ?? JSON.stringify(a.json).slice(0, 300));

// 2. forced tool call
const b = await call({
  input: 'Where is order ORD-1001?',
  tools: [{
    type: 'function', name: 'get_order', description: 'Look up an order by id',
    parameters: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'], additionalProperties: false },
    strict: true,
  }],
  tool_choice: 'required',
});
const tool = b.json.output?.find((o) => o.type === 'function_call');
console.log(`[2] toolcall status=${b.status} ${b.ms}ms ->`, tool ? `${tool.name}(${tool.arguments})` : JSON.stringify(b.json).slice(0, 300));

const ok = a.status === 200 && !!text && b.status === 200 && tool?.name === 'get_order';
console.log(ok ? 'AZURE PREFLIGHT: PASS' : 'AZURE PREFLIGHT: FAIL');
process.exit(ok ? 0 : 1);
