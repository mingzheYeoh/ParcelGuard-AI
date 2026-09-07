import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { Action, ActionOutcome, ActionType, Evidence } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { actions, conversations } from '../db/schema.js';
import { MAX_ACTIONS_RETURNED } from '../config.js';
import { notFound } from '../http/errors.js';

/**
 * Redacted audit trail (PLAN.md §8.1). Records what was attempted and what the
 * system decided — never prompts, model reasoning, or credentials. Evidence is
 * stored exactly as the adapter reported it; nothing here upgrades an
 * unverified action into a verified one (§7.5).
 */

const toAction = (row: typeof actions.$inferSelect): Action => ({
  id: row.id,
  conversation_id: row.conversationId,
  type: row.type,
  outcome: row.outcome,
  reason_code: row.reasonCode ?? 'UNSPECIFIED',
  summary: row.summary,
  created_at: new Date(row.createdAt).toISOString(),
  evidence: row.evidence as Evidence,
});

export async function recordAction(
  db: Database,
  input: {
    conversationId: string;
    type: ActionType;
    outcome: ActionOutcome;
    reasonCode: string;
    summary: string;
    evidence: Evidence;
  },
): Promise<Action> {
  const rows = await db
    .insert(actions)
    .values({
      id: `act_${randomUUID()}`,
      conversationId: input.conversationId,
      type: input.type,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      summary: input.summary,
      evidence: input.evidence,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Failed to record action');
  return toAction(row);
}

/** Newest first, id as tie-breaker, capped at 100 (PLAN.md §7.1). */
export async function listActions(
  db: Database,
  conversationId: string,
  customerId: string,
): Promise<Action[]> {
  await requireOwnedConversation(db, conversationId, customerId);
  const rows = await db
    .select()
    .from(actions)
    .where(eq(actions.conversationId, conversationId))
    .orderBy(desc(actions.createdAt), desc(actions.id))
    .limit(MAX_ACTIONS_RETURNED);
  return rows.map(toAction);
}

/** 404 for an action in another session's conversation (PLAN.md §7.1). */
export async function getAction(
  db: Database,
  actionId: string,
  customerId: string,
): Promise<Action> {
  const rows = await db
    .select({ action: actions })
    .from(actions)
    .innerJoin(conversations, eq(actions.conversationId, conversations.id))
    .where(and(eq(actions.id, actionId), eq(conversations.customerId, customerId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('resource');
  return toAction(row.action);
}

export async function requireOwnedConversation(
  db: Database,
  conversationId: string,
  customerId: string,
): Promise<void> {
  const rows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.customerId, customerId)))
    .limit(1);
  if (!rows[0]) throw notFound('resource');
}
