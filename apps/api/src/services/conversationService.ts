import { randomUUID } from 'node:crypto';
import { and, count, eq } from 'drizzle-orm';
import type { ChatTurn, ChatTurnCard } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { conversations, messages } from '../db/schema.js';
import { MAX_TURNS_PER_CONVERSATION } from '../config.js';
import { apiError } from '../http/errors.js';
import type { ModelAdapter, ToolResult } from '../adapters/index.js';
import { listAddresses } from '../repositories/addressRepository.js';
import { executeTool } from './toolGateway.js';
import { recordAction } from './auditService.js';
import { requireOwnedConversation } from './auditService.js';
import type { SessionContext } from './sessionService.js';

/**
 * Conversation turns and the bounded agent loop (PLAN.md §8.3).
 *
 * Concurrency and replay are database facts, not process state: the in-flight
 * flag is a conditional UPDATE and the client_message_id claim is a unique
 * index, so two Vercel Function instances behave the same as one process
 * (TASKS.md §1.2 rules 2-3).
 */

/** PLAN.md §8.3: at most three tool-loop rounds and four total tool calls. */
const MAX_ROUNDS = 3;
const MAX_TOOL_CALLS = 4;

export async function createConversation(
  db: Database,
  session: SessionContext,
): Promise<{ id: string; created_at: string }> {
  const rows = await db
    .insert(conversations)
    .values({ id: `conv_${randomUUID()}`, customerId: session.customerId })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to create conversation');
  return { id: row.id, created_at: new Date(row.createdAt).toISOString() };
}

export async function postMessage(
  db: Database,
  input: {
    conversationId: string;
    session: SessionContext;
    clientMessageId: string;
    content: string;
    model: ModelAdapter;
  },
): Promise<ChatTurn> {
  const { conversationId, session, clientMessageId, content, model } = input;
  await requireOwnedConversation(db, conversationId, session.customerId);

  // Replay: the same client_message_id returns the stored turn; the same id
  // with different text is a client bug, not a retry (PLAN.md §8.3).
  const existing = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.clientMessageId, clientMessageId),
      ),
    )
    .limit(1);
  const previous = existing[0];
  if (previous) {
    if (previous.content !== content) {
      throw apiError(
        'IDEMPOTENCY_CONFLICT',
        'This client_message_id was already used with different content',
      );
    }
    if (previous.turn) return previous.turn as ChatTurn;
    throw apiError('REQUEST_IN_PROGRESS', 'This message is still being processed');
  }

  const [turns] = await db
    .select({ value: count() })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'assistant')));
  if ((turns?.value ?? 0) >= MAX_TURNS_PER_CONVERSATION) {
    throw apiError(
      'CONVERSATION_LIMIT_REACHED',
      'This conversation is full. Start a new conversation to continue.',
    );
  }

  // Atomic in-flight claim (TASKS.md §1.2 rule 2).
  const claimed = await db
    .update(conversations)
    .set({ requestInProgress: true })
    .where(and(eq(conversations.id, conversationId), eq(conversations.requestInProgress, false)))
    .returning();
  if (claimed.length === 0) {
    throw apiError('REQUEST_IN_PROGRESS', 'Another message is still being processed');
  }

  const userMessageId = `msg_${randomUUID()}`;
  try {
    await db.insert(messages).values({
      id: userMessageId,
      conversationId,
      role: 'user',
      content,
      clientMessageId,
    });

    const turn = await runAgentLoop(db, {
      conversationId,
      session,
      content,
      model,
    });

    await db.update(messages).set({ turn }).where(eq(messages.id, userMessageId));
    return turn;
  } finally {
    // Release the flag even when the turn failed, otherwise the conversation
    // would be permanently stuck at 409 (no background work can clear it).
    await db
      .update(conversations)
      .set({ requestInProgress: false })
      .where(eq(conversations.id, conversationId));
  }
}

async function runAgentLoop(
  db: Database,
  input: {
    conversationId: string;
    session: SessionContext;
    content: string;
    model: ModelAdapter;
  },
): Promise<ChatTurn> {
  const { conversationId, session, content, model } = input;
  const addresses = await listAddresses(db, session.customerId);

  const toolResults: ToolResult[] = [];
  const cards: ChatTurnCard[] = [];
  const actionIds: string[] = [];
  let assistantText: string | null = null;
  let toolCalls = 0;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const decision = await model.decide({ userMessage: content, addresses, toolResults });

    if (decision.kind === 'message') {
      assistantText = decision.content;
      // Only a refusal *without* a tool call is an agent_refusal (PLAN.md §3
      // journey E). After a tool ran, the denial belongs to the backend and is
      // already recorded as policy_denied — recording both would credit the
      // model with a decision the policy engine made.
      if (decision.refusal && toolCalls === 0) {
        // PLAN.md §3 journey E: a decline is an auditable event. A clarifying
        // question is not, so adapters only set this for an actual refusal —
        // and nothing here invents an action id for the card (Design.md §8.3).
        const action = await recordAction(db, {
          conversationId,
          type: 'agent_refusal',
          outcome: 'denied',
          reasonCode: 'AGENT_REFUSED',
          summary: 'The assistant declined the request',
          evidence: {
            source: 'local',
            agent_did: null,
            provider_reference: null,
            verified: false,
          },
        });
        actionIds.push(action.id);
      }
      break;
    }
    if (toolCalls >= MAX_TOOL_CALLS) break;

    toolCalls += 1;
    const outcome = await executeTool(db, {
      call: decision.call,
      session,
      conversationId,
    });
    toolResults.push(outcome.result);
    cards.push(...outcome.cards);
    actionIds.push(...outcome.actionIds);
  }

  if (assistantText === null) {
    // Loop budget exhausted. Say so instead of inventing an answer (PLAN.md §8.3).
    assistantText =
      'I could not finish that in one go. Please restate what you need in a single sentence.';
  }

  const assistantId = `msg_${randomUUID()}`;
  await db.insert(messages).values({
    id: assistantId,
    conversationId,
    role: 'assistant',
    content: assistantText,
  });

  return {
    conversation_id: conversationId,
    message: { id: assistantId, role: 'assistant', content: assistantText },
    cards,
    action_ids: actionIds,
  };
}
