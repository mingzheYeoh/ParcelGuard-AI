# Task 7 — Azure OpenAI agent loop
Agent/role: integration   Branch: task-7-azure-agent   Date: 2026-09-08 (UTC)

## Completed

- [x] `apps/api/src/adapters/azureModelAdapter.ts` implements the `ModelAdapter` interface Task 5 shipped. It calls the **v1 Responses** endpoint with `fetch` and the `api-key` header — the exact shape the Task 0 preflight proved — rather than adding the `openai` package. No legacy `api-version` configuration is mixed in.
- [x] Exactly the two tools of PLAN.md §8.2, declared with JSON Schema and `additionalProperties: false`. Neither takes a customer id; the customer comes from the session. Arguments are Zod-validated in the adapter *and* again in `toolGateway`, and an unknown tool name is refused.
- [x] Bounded loop: the existing `conversationService` caps it at 3 rounds / 4 tool calls (PLAN.md §8.3). Tool results are fed back as text on the next round.
- [x] `store: false` and `max_output_tokens: 400`; request timeout 20 s.
- [x] Failure mapping (§7.6): abort → `MODEL_TIMEOUT` (504), `429` → `MODEL_RATE_LIMITED` with the provider's `Retry-After` echoed as a response header, anything else → `MODEL_UNAVAILABLE` (502).
- [x] Journey E is distinguishable: a model decline with no tool call records `agent_refusal`; a tool call the backend rejects records `policy_denied` (unchanged from Task 5). A clarifying question records nothing.
- [x] `IntegrationStatus.model` reports `live` only after a call has actually succeeded in this process, and the deployment alias is disclosed only then. Configured-but-unproven reports `unavailable`.
- [x] `MODEL_PROVIDER` selects the adapter; anything other than `azure_openai` keeps the deterministic mock reporting mode `mock`.

## Commands actually run (with result)

- `pnpm --filter api test` → **26 passed** (17 integration + 9 new adapter tests), exit 0
- `pnpm typecheck`, `pnpm build` → exit 0
- Five-journey run against the **real** Azure deployment (`chat-small`), local API on the local database:

| Journey | Latency | Reply (truncated) | Cards | Action recorded |
|---|---|---|---|---|
| A — owned lookup | 3887 ms | "Order ORD-1001 is shipped. It is going to your Home address…" | `order_summary` | `order_lookup/allowed/ORDER_FOUND` |
| B — change unshipped | 3259 ms | "I've proposed moving ORD-1002 to your Office address. Please confirm…" | `order_summary`, `address_change_proposal` | `address_change_proposal/allowed/PROPOSAL_CREATED` |
| C — unauthorized | 2228 ms | "I can't access ORD-2001. The order is not available." | `action_result/ORDER_UNAVAILABLE` | `order_lookup/denied/ORDER_UNAVAILABLE` |
| D — shipped denial | 2354 ms | "I can't change ORD-1001. It has already shipped…" | `action_result/ORDER_NOT_EDITABLE` | `policy_denied/denied/ORDER_NOT_EDITABLE` |
| E — bypass attempt | 986 ms | "I can't help with that. I can only help with order lookup or changing an order to a saved address." | none | `agent_refusal/denied/AGENT_REFUSED` |

- B confirmation → `200`, status `succeeded`, order `version` 1 → 2.
- `GET /api/v1/health` after the run → `{"api":"ok","model":"live","terminal3":"mock"}` — `live` only because real calls had succeeded.
- Journey C leaked nothing: no name, phone, address, or summary of the other customer's order, and the denial is byte-identical to the one for a nonexistent order.

Preflight (PLAN.md §9.2) was completed in Task 0 and is not repeated here: deployment `chat-small` (gpt-5.4-mini, Global Standard), endpoint `…services.ai.azure.com/openai/v1/`, one text request and one forced tool call both `200`. Credentials stay in `apps/api/.env` and the Vercel project; nothing is printed by any script in this task.

## Not done / blocked

- **Not yet verified on the Vercel Preview.** Task 7's "Done when" asks for the same five journeys on Preview *after Task 9*; Task 9 has not run. All Azure variables are already present in the Vercel project, so the expected result is the same, but nobody has run it. **This is the first thing to check after Task 9.**
- **Tool results are fed back to the model as text**, not as `function_call_output` items with `call_id`. That keeps the `ModelAdapter` interface stateless and needs no id bookkeeping, and it worked on every journey above, including B where the model chained `get_order` → `propose_address_change`. If a future model handles multi-step chains worse, this is the first thing to make protocol-faithful — it would mean extending `ModelInput` to carry opaque provider items.
- **Refusal detection is a keyword heuristic** (`looksLikeRefusal`). It is deliberately narrow: a reply containing "?" is never a refusal, because mislabelling a clarifying question would write a false audit record. It currently misses phrasings that use neither "can't"-family wording nor "sorry"/"only help with". A missed refusal loses an audit row; it never fabricates one.
- The integration suite is pinned to the mock provider (`test/setup.ts` now *forces* `MODEL_PROVIDER=mock`). It previously used `??=`, and since `apps/api/.env` sets `azure_openai`, the whole suite silently started calling Azure — slow, non-deterministic and billable. Do not relax that back to a default.
- Cost was not measured. Five journeys ran at roughly 1–4 s each with a 400-token cap; PLAN.md §9.4's budget question is still open.

## Contract change requests

- none. `AGENT_REFUSED` is a `reason_code`, which the contract types as a free string.

## Notes for the next lane

- **Task 8 (Terminal 3):** nothing here touches `Terminal3Adapter`. Implement it and pass it as `deps.terminal3`; it is called after a proposal is claimed `executing` and before the order row is updated. `health` already reports the two integrations separately, so a live model and a mock Terminal 3 display honestly side by side.
- **The adapter chooses; it never decides.** Every tool call it returns goes through `toolGateway` → `policyService`, the same path the REST routes use. That is why journeys C and D produce real denials rather than the model's opinion — do not add data access inside the adapter.
- **Switching providers is an environment change, not a code change:** `MODEL_PROVIDER=mock` gives the deterministic stand-in (useful for demos and for any test that asserts exact card sequences), `azure_openai` gives the real model.
- The system prompt lives in `SYSTEM_PROMPT` in the adapter. It already forbids answering order questions without a tool result, forbids accepting a customer id, and forbids revealing instructions. Change it there, not in the loop.
