> ## Documentation Index
> Fetch the complete documentation index at: https://docs.terminal3.io/llms.txt
> Use this file to discover all available pages before exploring further.

# SDK & API Reference

> Every confirmed ADK method, WIT host interface, and API surface in one place.

This page collects everything scattered across the walkthrough and tips pages into one lookup table. If you already know the name of what you're looking for, start here before searching the guides.

<Note>
  Every row below is confirmed against this documentation or the OpenAPI spec. Anything only seen in community code (not in official docs) is called out separately in the last section, with a warning — not stated as fact.
</Note>

## ADK client SDK (`@terminal3/t3n-sdk`)

| Symbol                                                        | What it does                                                                                                    | Where it's covered                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `T3nClient`                                                   | Low-level client — handles the encrypted session, SIWE auth, and `execute` transport.                           | [Set Up Development Environment](/developers/adk/get-started/prerequisites/set-up-dev-env) |
| `TenantClient`                                                | Tenant-scoped client, built around your authenticated `tenantDid`.                                              | [Set Up Development Environment](/developers/adk/get-started/prerequisites/set-up-dev-env) |
| `setEnvironment("testnet" \| "production")`                   | Selects which T3N cluster every client resolves its node URL from. Defaults to `"testnet"` in the public build. | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `loadWasmComponent()`                                         | Loads the WASM component all client-side crypto runs inside.                                                    | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `eth_get_address(key)`                                        | Derives an Ethereum address from a key for SIWE-style auth.                                                     | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `metamask_sign(address, _, key)`                              | `EthSign` handler — signs the login challenge.                                                                  | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `createEthAuthInput(address)`                                 | Builds the input for `authenticate()`.                                                                          | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `client.handshake()`                                          | Opens the encrypted session. Must be called before `authenticate()`.                                            | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `client.authenticate(input)`                                  | Authenticates and returns your DID — always read `did.value` rather than constructing it yourself.              | [Quickstart](/developers/adk/get-started/quickstart)                                       |
| `tenant.tenant.me()`                                          | Returns the authenticated tenant's session info, including `tenantDid`.                                         | [Set Up Development Environment](/developers/adk/get-started/prerequisites/set-up-dev-env) |
| `tenant.maps.create({ tail, visibility, readers, writers })`  | Creates a tenant KV map. `readers`/`writers` default to deny — set explicitly.                                  | [Create Tenant KV Maps](/developers/adk/tips/create-kv-maps)                               |
| `tenant.maps.update(...)`                                     | Updates an existing map's ACL (e.g. to add a `contractId`).                                                     | [Common Errors](/developers/adk/tips/common-errors)                                        |
| `map-entry-set` (control-plane call)                          | Seeds a value (e.g. an API key) into a KV map from outside a contract.                                          | [Seed API key into secrets map](/developers/adk/tips/seed-api-key)                         |
| `tenant.contracts.register({ tail, version, wasm })`          | Registers a compiled WASM contract under a tenant-local name.                                                   | [Register your TEE contract](/developers/adk/get-started/walkthrough/register-contract)    |
| `tenant.contracts.execute(...)` / `executeAndDecode(...)`     | Invokes a registered contract.                                                                                  | [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract)            |
| `agent-auth-update` (contract call, signed by the data owner) | Grants an agent access to specific functions on a specific contract, scoped to specific hosts.                  | [Agent Auth](/developers/adk/overview/agent-auth-adk)                                      |
| `getNodeUrl()`                                                | Returns the active cluster URL for the current environment.                                                     | [Set Up Development Environment](/developers/adk/get-started/prerequisites/set-up-dev-env) |
| `getContractVersion(nodeUrl, contractId)`                     | Looks up the currently registered version of a contract.                                                        | [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract)            |

## Naming conventions

| Pattern                 | Meaning                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `z:<tid>:<tail>`        | Tenant-owned KV map or contract, namespaced under your tenant ID. Never include `z:<tid>:` yourself — pass only the local `tail`.                     |
| `z:<tid>:public:<tail>` | Public (world-readable) tenant map. Never put PII here.                                                                                               |
| `{{profile.<field>}}`   | Placeholder marker resolved server-side inside the enclave — the literal string is what your contract sends; the real value never enters WASM memory. |
| `did:t3n:<40 hex>`      | An opaque, platform-assigned tenant or agent DID. Always read it back from the authenticated session — never construct or derive it.                  |

## WIT host interfaces (contract-side capabilities)

Capabilities are determined entirely by which of these you import in `world.wit` — there's no separate manifest. See [Capabilities come from your WIT imports](/developers/adk/tips/capabilities-from-wit-import).

| Interface                                                                                                                                                                                        | Purpose                                                                                                           | Status                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `http`                                                                                                                                                                                           | Synchronous outbound HTTP. No PII allowed inline.                                                                 | Available                                                                                      |
| `http-with-placeholders`                                                                                                                                                                         | Outbound HTTP with server-resolved PII substitution.                                                              | Available                                                                                      |
| `kv-store`                                                                                                                                                                                       | Read/write tenant KV maps.                                                                                        | Available                                                                                      |
| `tenant` (`tenant-context`)                                                                                                                                                                      | Tenant context, e.g. `tenant_did()`. Returns raw bytes (`list<u8>`) — hex-encode before use in a `z:<tid>:` path. | Available                                                                                      |
| `logging`                                                                                                                                                                                        | In-enclave logging.                                                                                               | Available                                                                                      |
| `did-registry`, `agent-auth`, `user-profile`, `user-removal`, `contracts-call`, `authorisation`, `otp`, `config/read`, `provider-config`, `time/clock`, `node-config`, `stash`, `agent-registry` | Various — see [Host API](/t3n/how-t3n-works/host-api) for the full table.                                         | Confirmed to exist — verify current maturity before relying on one, several are still evolving |
| `signing`, `outbox`, `vp`                                                                                                                                                                        | Cryptographic signing / async notifications / verifiable-presentation helpers.                                    | Listed as **coming soon** as of the last docs review                                           |

## REST API

The full REST surface is documented via OpenAPI — see the [API Reference](/api-reference) tab for live, browsable endpoints generated directly from the spec (so it can't drift out of sync with this page). Verified directly by parsing `terminal-3-openapi.yml` (21 paths, 24 operations, OpenAPI 3.0.3):

| Tag                             | Endpoints                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DID V1                          | `GET /v1/did`, `POST /v1/did/register`                                                                                                                                                        |
| OpenID Connect V1               | `GET /v1/openidc/authorize`, `GET /v1/openidc/credentials`, `GET /v1/openidc/user`, `GET /v1/openidc/user/social_connections`, `POST /v1/openidc/credentials/proof`, `POST /v1/openidc/token` |
| OpenID Connect V2               | `GET /v2/openidc/user`, `POST /v2/openidc/token`                                                                                                                                              |
| Sub Client V1                   | `GET /v1/sub_client`, `GET /v1/sub_client/{subclient_id}`, `POST /v1/sub_client`, `PUT /v1/sub_client/{subclient_id}`, `DELETE /v1/sub_client/{subclient_id}`                                 |
| Transactional Email Template V1 | `POST /v1/transactional_email_template`, `POST /v1/transactional_email_template/send`, `PUT /v1/transactional_email_template/:transactional_email_template_id`                                |
| User V1                         | `POST /v1/user/create`, `GET /v1/user/{user_id}/social_data`, `GET /v1/user/{user_id}/wallet_addresses`                                                                                       |
| VC V1                           | `GET /v1/vc/issuer/credentials`, `POST /v1/vc/issuer/credentials/proof`, `POST /v1/vc/issuer/store`                                                                                           |

Auth: `bearerAuth` by default, with an `x-api-token` header required on specific endpoints (e.g. user creation). Server: `https://staging.terminal3.io`.

## ⚠️ Observed in community code only — not confirmed against official docs

<Warning>
  The items below were reported by hackathon participants as present in the SDK's TypeScript type definitions, but are not confirmed anywhere in this documentation. Treat the names as leads to verify against your installed SDK version's actual types — not as a guaranteed API.
</Warning>

| Symbol                                                                                                                              | Where reported             | Note                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildDelegationCredential()`, `canonicaliseCredential()`, `signCredential()`, `buildInvocationPreimage()`, `signAgentInvocation()` | Multiple independent teams | Reported as a standalone delegation-credential flow, separate from the `agent-auth-update` grant documented in [Agent Auth](/developers/adk/overview/agent-auth-adk). If you need this, ask in the [developer Telegram](https://t.me/terminal3developer) rather than guessing at signatures. |
| `DelegationCustodialClient`                                                                                                         | One team                   | Reported present but unused in their integration — may be unfinished or internal.                                                                                                                                                                                                            |
| `getAuditEvents()`                                                                                                                  | One team                   | Reported to exist but undocumented.                                                                                                                                                                                                                                                          |
