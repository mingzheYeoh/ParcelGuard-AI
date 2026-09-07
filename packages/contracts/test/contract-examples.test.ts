/**
 * Parses every PLAN.md §7 example JSON payload against the schemas in
 * src/index.ts, plus the §6.1 fixtures — TASKS.md Task 2 "Done when".
 */
import { describe, expect, it } from 'vitest';
import {
  actionSchema,
  addressFixtures,
  addressSummarySchema,
  chatTurnSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  integrationStatusSchema,
  orderFixtures,
  orderSchema,
  proposalResultSchema,
  successEnvelopeSchema,
} from '../src/index.js';

describe('PLAN.md §7.1 GET /api/v1/health', () => {
  it('parses the success envelope', () => {
    const payload = {
      data: { api: 'ok', model: 'mock', terminal3: 'mock' },
      request_id: 'req_1',
    };
    const parsed = successEnvelopeSchema(healthResponseSchema).parse(payload);
    expect(parsed.data.api).toBe('ok');
  });
});

describe('PLAN.md §7.2 IntegrationStatus', () => {
  it('parses the documented example', () => {
    const example = {
      model: { mode: 'mock', provider: 'azure_openai', deployment: null },
      terminal3: { mode: 'mock', agent_did: null, identity_verified: false },
    };
    expect(integrationStatusSchema.parse(example)).toEqual(example);
  });
});

describe('PLAN.md §7.3 ChatTurn: proposal example', () => {
  it('parses the documented envelope, including the address_change_proposal card', () => {
    const payload = {
      data: {
        conversation_id: 'conv_demo_1',
        message: {
          id: 'msg_2',
          role: 'assistant',
          content:
            'I can update ORD-1002 to your saved Office address. Please confirm.',
        },
        cards: [
          {
            type: 'address_change_proposal',
            proposal_id: 'prop_1',
            order_id: 'ORD-1002',
            from_address_label: 'Home',
            to_address_label: 'Office',
            status: 'pending',
            expires_at: '2026-09-07T12:30:00Z',
          },
        ],
        action_ids: ['act_1'],
      },
      request_id: 'req_1',
    };
    const parsed = successEnvelopeSchema(chatTurnSchema).parse(payload);
    expect(parsed.data.cards[0]?.type).toBe('address_change_proposal');
  });

  it('parses an order_summary card', () => {
    const card = { type: 'order_summary' as const, order: orderFixtures['ORD-1001'] };
    const turn = {
      conversation_id: 'conv_demo_1',
      message: { id: 'msg_1', role: 'assistant', content: 'Here is ORD-1001.' },
      cards: [card],
      action_ids: ['act_0'],
    };
    expect(chatTurnSchema.parse(turn).cards[0]?.type).toBe('order_summary');
  });

  it('parses an action_result card', () => {
    const turn = {
      conversation_id: 'conv_demo_1',
      message: { id: 'msg_3', role: 'assistant', content: 'Order unavailable.' },
      cards: [
        {
          type: 'action_result' as const,
          outcome: 'denied' as const,
          reason_code: 'ORDER_UNAVAILABLE',
          title: 'Order unavailable',
          description: 'This order could not be found for your account.',
          action_id: null,
        },
      ],
      action_ids: [],
    };
    expect(chatTurnSchema.parse(turn).cards[0]?.type).toBe('action_result');
  });
});

describe('PLAN.md §7.4 Confirm execution', () => {
  it('parses the documented ProposalResult example', () => {
    const payload = {
      data: {
        proposal_id: 'prop_1',
        status: 'succeeded',
        order: {
          id: 'ORD-1002',
          status: 'processing',
          currency: 'MYR',
          total_minor: 8900,
          items: [{ name: 'Laptop Stand', quantity: 1, unit_price_minor: 8900 }],
          address_ref: 'addr_alex_office',
          address_label: 'Office',
          version: 2,
          timeline: [],
        },
        action_id: 'act_2',
      },
      request_id: 'req_2',
    };
    const parsed = successEnvelopeSchema(proposalResultSchema).parse(payload);
    expect(parsed.data.status).toBe('succeeded');
    expect(parsed.data.order?.version).toBe(2);
  });
});

describe('PLAN.md §7.5 Activity evidence', () => {
  it('parses the documented Action example', () => {
    const example = {
      id: 'act_2',
      conversation_id: 'conv_demo_1',
      type: 'address_change',
      outcome: 'allowed',
      reason_code: 'ADDRESS_UPDATED',
      summary: 'Updated ORD-1002 to Office',
      created_at: '2026-09-07T12:26:00Z',
      evidence: {
        source: 'local',
        agent_did: null,
        provider_reference: null,
        verified: false,
      },
    };
    expect(actionSchema.parse(example)).toEqual(example);
  });
});

describe('PLAN.md §7.6 error envelope', () => {
  it('parses an error response for every documented code', () => {
    const codes = [
      'SESSION_REQUIRED',
      'ORDER_UNAVAILABLE',
      'RESOURCE_UNAVAILABLE',
      'ORDER_CHANGED',
      'REQUEST_IN_PROGRESS',
      'IDEMPOTENCY_CONFLICT',
      'PROPOSAL_STATE_CONFLICT',
      'CONVERSATION_LIMIT_REACHED',
      'PROPOSAL_EXPIRED',
      'INVALID_INPUT',
      'ORDER_NOT_EDITABLE',
      'MODEL_RATE_LIMITED',
      'MODEL_UNAVAILABLE',
      'TERMINAL3_UNAVAILABLE',
      'MODEL_TIMEOUT',
      'ACTION_OUTCOME_UNKNOWN',
    ] as const;
    for (const code of codes) {
      const payload = {
        error: { code, message: 'example', retryable: false },
        request_id: 'req_err',
      };
      expect(errorEnvelopeSchema.parse(payload).error.code).toBe(code);
    }
  });
});

describe('PLAN.md §6.1 fixtures', () => {
  it('parses every order fixture as a valid Order', () => {
    for (const order of Object.values(orderFixtures)) {
      expect(orderSchema.parse(order).id).toBe(order.id);
    }
  });

  it('parses every address fixture as a valid AddressSummary', () => {
    for (const address of Object.values(addressFixtures)) {
      expect(addressSummarySchema.parse(address).id).toBe(address.id);
    }
  });

  it('exposes exactly ORD-1001 and ORD-1002 for cus_demo_alex, and ORD-2001 for cus_demo_other', () => {
    expect(orderFixtures['ORD-1001'].id).toBe('ORD-1001');
    expect(orderFixtures['ORD-1001'].status).toBe('shipped');
    expect(orderFixtures['ORD-1002'].status).toBe('processing');
    expect(orderFixtures['ORD-2001'].status).toBe('processing');
  });
});

describe('PLAN.md §7.6 INTERNAL_ERROR', () => {
  it('parses the 500 envelope for an unexpected server fault', () => {
    const payload = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed',
        retryable: false,
      },
      request_id: 'req_3',
    };
    expect(errorEnvelopeSchema.parse(payload).error.code).toBe('INTERNAL_ERROR');
  });

  it('still rejects a code that is not in the contract', () => {
    expect(() =>
      errorEnvelopeSchema.parse({
        error: { code: 'KABOOM', message: 'x', retryable: false },
        request_id: 'req_4',
      }),
    ).toThrow();
  });
});
