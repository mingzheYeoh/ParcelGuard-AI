import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/http/errors.js';
import { createAzureModelAdapter } from '../src/adapters/azureModelAdapter.js';

/**
 * Unit tests for the Azure adapter's request shaping, response parsing and
 * failure mapping. `fetch` is stubbed: these assert how we treat the
 * provider's answers, not that Azure works — that is the five-journey run
 * verified against the deployed function; see docs/DEMO.md.
 */

const ENV = {
  AZURE_OPENAI_BASE_URL: 'https://example.openai.azure.com/openai/v1/',
  AZURE_OPENAI_API_KEY: 'test-key',
  AZURE_OPENAI_DEPLOYMENT: 'chat-small',
};

const input = {
  userMessage: 'Where is ORD-1001?',
  addresses: [{ id: 'addr_alex_home', label: 'Home', city: 'Kuala Lumpur' }],
  toolResults: [],
};

function withEnv() {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  return createAzureModelAdapter();
}

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('request shaping', () => {
  it('sends store:false, a token cap, both tools and the api-key header', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }] }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await withEnv().decide(input);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.openai.azure.com/openai/v1/responses');
    expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.store).toBe(false);
    expect(body.model).toBe('chat-small');
    expect(body.max_output_tokens).toBeGreaterThan(0);
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_order',
      'propose_address_change',
    ]);
    // PLAN.md §8.2: the customer is never a tool parameter.
    expect(JSON.stringify(body.tools)).not.toContain('customer_id');
  });
});

describe('response parsing', () => {
  it('turns a function_call into a validated tool call', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        output: [
          { type: 'function_call', name: 'get_order', arguments: '{"order_id":"ORD-1002"}' },
        ],
      }),
    );
    const decision = await withEnv().decide(input);
    expect(decision).toEqual({
      kind: 'tool_call',
      call: { name: 'get_order', args: { order_id: 'ORD-1002' } },
    });
  });

  it('refuses a tool call whose arguments do not match the schema', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        output: [{ type: 'function_call', name: 'get_order', arguments: '{"wrong":"shape"}' }],
      }),
    );
    const decision = await withEnv().decide(input);
    expect(decision.kind).toBe('message');
  });

  it('rejects a tool that is not on the allowlist', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({
        output: [{ type: 'function_call', name: 'export_customers', arguments: '{}' }],
      }),
    );
    const decision = await withEnv().decide(input);
    expect(decision.kind).toBe('message');
  });

  it('marks a decline as a refusal but a clarifying question as neither', async () => {
    const reply = (text: string) =>
      jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });

    vi.stubGlobal('fetch', async () =>
      reply('Sorry, I can only help with order lookup and saved-address changes.'),
    );
    expect(await withEnv().decide(input)).toMatchObject({ refusal: true });

    vi.stubGlobal('fetch', async () => reply('Which order number should I change?'));
    expect(await withEnv().decide(input)).toMatchObject({ refusal: false });
  });
});

describe('failure mapping (PLAN.md §7.6)', () => {
  it('maps 429 to MODEL_RATE_LIMITED and keeps Retry-After', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response('{}', { status: 429, headers: { 'retry-after': '7' } }),
    );
    const error = await withEnv()
      .decide(input)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('MODEL_RATE_LIMITED');
    expect((error as ApiError).retryAfterSeconds).toBe(7);
  });

  it('maps a server fault to MODEL_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 503 }));
    const error = (await withEnv()
      .decide(input)
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('MODEL_UNAVAILABLE');
  });

  it('maps an aborted request to MODEL_TIMEOUT', async () => {
    vi.stubGlobal('fetch', async () => {
      const timeout = new Error('timed out');
      timeout.name = 'TimeoutError';
      throw timeout;
    });
    const error = (await withEnv()
      .decide(input)
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('MODEL_TIMEOUT');
  });

  it('reports mode "unavailable" until a call has actually succeeded', async () => {
    const adapter = withEnv();
    expect(adapter.mode()).toBe('unavailable');
    expect(adapter.deployment()).toBeNull();

    vi.stubGlobal('fetch', async () =>
      jsonResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }),
    );
    await adapter.decide(input);
    expect(adapter.mode()).toBe('live');
    expect(adapter.deployment()).toBe('chat-small');
  });
});
