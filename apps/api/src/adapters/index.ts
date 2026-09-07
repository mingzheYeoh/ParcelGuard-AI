import type { AddressSummary, Evidence, IntegrationMode, Order } from '@parcelguard/contracts';
import { config } from '../config.js';
import { createAzureModelAdapter } from './azureModelAdapter.js';

/**
 * Adapter boundaries shipped by Task 5 so Tasks 7 (Azure) and 8 (Terminal 3)
 * can be built independently against a stable interface (TASKS.md §4.2).
 * Task 7 adds `adapters/azure*.ts`, Task 8 adds `adapters/terminal3*.ts`;
 * neither needs to edit this file beyond exporting a factory of the same shape.
 */

// ---------------------------------------------------------------------------
// Model — PLAN.md §8.2: exactly two tools, customer injected from the session
// ---------------------------------------------------------------------------

export type ToolCall =
  | { name: 'get_order'; args: { order_id: string } }
  | { name: 'propose_address_change'; args: { order_id: string; address_ref: string } };

export type ToolResult =
  | { name: 'get_order'; ok: true; order: Order }
  | { name: 'get_order'; ok: false; reason: string }
  | { name: 'propose_address_change'; ok: true; summary: string }
  | { name: 'propose_address_change'; ok: false; reason: string };

export type ModelDecision =
  | { kind: 'tool_call'; call: ToolCall }
  /**
   * `refusal` marks a decline, not a clarifying question — PLAN.md §3
   * journey E records the former as an `agent_refusal` action and the latter
   * as nothing at all. Adapters that cannot tell them apart leave it unset.
   */
  | { kind: 'message'; content: string; refusal?: boolean };

export interface ModelInput {
  /** The user's latest message. Prior turns are not replayed in P0. */
  readonly userMessage: string;
  /** Only the current customer's saved addresses (PLAN.md §8.2). */
  readonly addresses: readonly AddressSummary[];
  /** Results of tool calls already made in this turn, oldest first. */
  readonly toolResults: readonly ToolResult[];
}

export interface ModelAdapter {
  mode(): IntegrationMode;
  provider(): string | null;
  deployment(): string | null;
  decide(input: ModelInput): Promise<ModelDecision>;
}

const ORDER_ID = /\bORD-\d{3,}\b/i;
// `send` is in the list because Design.md §5.4's suggested chip is
// "Send ORD-1002 to my office instead." — the demo's own copy must work.
const CHANGE_INTENT = /\b(change|update|move|switch|send|redirect|deliver)\b/i;
const ADDRESS_WORD = /\b(address|deliver|shipping)\b/i;

/**
 * Deterministic stand-in for the Azure agent (Task 7). It parses intent with
 * regexes instead of a model, but runs through the *same* tool gateway and
 * policy checks, so denials it produces are real policy denials rather than
 * canned text. `mode()` reports "mock" so the UI never labels it live.
 */
export function createMockModelAdapter(): ModelAdapter {
  return {
    mode: () => 'mock',
    provider: () => (config.modelProvider() === 'mock' ? null : config.modelProvider()),
    deployment: () => null,

    async decide({ userMessage, addresses, toolResults }: ModelInput): Promise<ModelDecision> {
      const last = toolResults[toolResults.length - 1];
      if (last) {
        // One tool call per turn is enough for every P0 journey; summarise it.
        if (last.name === 'get_order') {
          return {
            kind: 'message',
            content: last.ok
              ? `Here are the details for ${last.order.id}.`
              : last.reason,
          };
        }
        return { kind: 'message', content: last.ok ? last.summary : last.reason };
      }

      const orderId = userMessage.match(ORDER_ID)?.[0]?.toUpperCase();
      // Plain substring match, not a RegExp: a label is data (it could contain
      // regex metacharacters) and `\b` inside a template literal is a
      // backspace character, not a word boundary.
      const haystack = userMessage.toLowerCase();
      const target = addresses.find((address) => haystack.includes(address.label.toLowerCase()));
      // Naming a saved address ("to my office") is an address signal on its
      // own; requiring the literal word "address" rejected natural phrasing.
      const wantsChange =
        CHANGE_INTENT.test(userMessage) && (ADDRESS_WORD.test(userMessage) || target !== undefined);

      if (wantsChange) {
        if (!orderId) {
          return {
            kind: 'message',
            content:
              'Which order should I update? Tell me the order number, for example ORD-1002.',
          };
        }
        if (!target) {
          const labels = addresses.map((address) => address.label).join(' or ');
          return {
            kind: 'message',
            content: `Which saved address should ${orderId} go to — ${labels}?`,
          };
        }
        return {
          kind: 'tool_call',
          call: {
            name: 'propose_address_change',
            args: { order_id: orderId, address_ref: target.id },
          },
        };
      }

      if (orderId) {
        return { kind: 'tool_call', call: { name: 'get_order', args: { order_id: orderId } } };
      }

      return {
        kind: 'message',
        content:
          'I can look up an order or move it to one of your saved addresses. Which order number?',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Terminal 3 — PLAN.md §10 / §7.5. Task 8 replaces this with the real SDK.
// ---------------------------------------------------------------------------

export interface Terminal3Adapter {
  mode(): IntegrationMode;
  agentDid(): string | null;
  identityVerified(): boolean;
  /**
   * Authorize a protected action. Returns the evidence to store on the audit
   * record. Never fabricate a DID, signature, or verification result
   * (PLAN.md §7.5).
   */
  authorize(input: { orderId: string; addressRef: string }): Promise<Evidence>;
}

/**
 * Local stand-in used until Task 8. It performs no external call, so the
 * evidence it returns says exactly that: source "local", nothing verified.
 */
export function createLocalTerminal3Adapter(): Terminal3Adapter {
  return {
    mode: () => (config.terminal3Mode() === 'live' ? 'unavailable' : 'mock'),
    agentDid: () => null,
    identityVerified: () => false,
    async authorize(): Promise<Evidence> {
      return { source: 'local', agent_did: null, provider_reference: null, verified: false };
    },
  };
}

/**
 * Picks the model adapter from MODEL_PROVIDER. Anything other than
 * `azure_openai` gets the deterministic mock, which reports mode "mock" — the
 * UI must never label a stand-in as live (TASKS.md §2 rule 5).
 *
 * azureModelAdapter.ts imports only *types* from this module, so referencing
 * it here creates no runtime cycle.
 */
export function createModelAdapter(): ModelAdapter {
  return config.modelProvider() === 'azure_openai'
    ? createAzureModelAdapter()
    : createMockModelAdapter();
}
