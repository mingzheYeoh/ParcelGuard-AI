> ## Documentation Index
> Fetch the complete documentation index at: https://docs.terminal3.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent Auth

> How an AI agent authenticates to T3N, and how it gets permission to act on a contract.

This page covers two separate things that are easy to conflate: an agent **authenticating** to T3N (proving who it is), and an agent being **authorized** to call a specific contract function (proving it's allowed to).

<Info>
  This is about **agents** acting through your contract. If you're looking for how *you*, the tenant developer, authenticate to manage your own deployment, see [Set Up Development Environment](/developers/adk/get-started/prerequisites/set-up-dev-env) instead — that's a different session.

  This page assumes the agent **already has a DID**. Creating that identity in the first place — minting the agent and publishing its agent card — is [Agent Onboarding](/developers/agents/register-agent), which happens before anything on this page.

  That identity also needs its **own** test credits before any metered call on this page will work — an agent DID's balance is separate from its tenant's and starts at zero. Get it a key from the same [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) you used for your own; it comes with credits attached.
</Info>

## 1. An agent authenticates like any other T3N session

An agent has its own identity — its own key pair and its own DID — separate from the tenant that owns the contract it's calling. It authenticates the same way any T3N client does: handshake, then authenticate, then read its own DID back from the session. There's nothing tenant-specific to configure here.

```typescript theme={null}
import {
  T3nClient,
  loadWasmComponent,
  createEthAuthInput,
  eth_get_address,
  metamask_sign,
  fetchTrustedManifest,
} from "@terminal3/t3n-sdk";

const agentKey = process.env.AGENT_KEY!; // a separate key for the agent — never reuse your tenant's T3N_API_KEY
const agentAddress = eth_get_address(agentKey);

const agentClient = new T3nClient({
  trustAnchor: await fetchTrustedManifest("testnet"),
  wasmComponent,
  handlers: {
    EthSign: metamask_sign(agentAddress, undefined, agentKey),
  },
});

await agentClient.handshake();
const agentDid = await agentClient.authenticate(createEthAuthInput(agentAddress));
```

<Warning>
  Never hard-code or derive an agent's DID any more than you would a tenant's — always read it back from the authenticated session, exactly as `agentDid` is read above. And generate `AGENT_KEY` as its own separate credential (the same way you'd generate any Ethereum-style keypair) — don't reuse your tenant's `T3N_API_KEY` for an agent.
</Warning>

## 2. Being authenticated is not being authorized

Authenticating proves the agent's identity. It does **not** grant it permission to call anything. Before an agent can invoke a contract function — especially one that makes an outbound HTTP call — the **user who owns the data** (the "data owner," not the agent, and not you as the tenant developer) has to explicitly grant that agent access:

```typescript theme={null}
// Signed by the user (data owner), not the agent.
await userClient.execute({
  contract_id: "tee:user/contracts",
  contract_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: agentDid,                 // the agent being authorized
      scripts: [{
        scriptName: TENANT_SCRIPT,        // z:<tid>:your-contract-tail
        versionReq: scriptVersion,
        functions: ["search-offers", "book-offer"],   // exactly which functions
        allowedHosts: ["api.duffel.com"], // exactly which external hosts
      }],
    }],
  },
});
```

`userClient` here is the data owner's own authenticated session — built the same way as `t3n`/`agentClient` above, just with the user's own key. See [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract) for the full construction and where `TENANT_SCRIPT`/`scriptVersion` come from.

A grant is scoped three ways at once: which contract, which functions on it, and which external hosts it may reach. An agent with no matching grant can still call the contract — the call just fails at the point it tries to reach the network, with `host/http.egress_denied`.

<Accordion title="Under the Hood: why is it structured this way?">
  Splitting authentication from authorization means a compromised or misbehaving agent key doesn't automatically mean compromised data access — the blast radius of a leaked agent key is exactly whatever scripts, functions, and hosts a user has explicitly granted it, nothing more. It also means a user can revoke an agent's access without the agent's key changing at all — they just stop re-issuing the grant.
</Accordion>

## Direct (self) calls work the same way

If a user is invoking their own contract directly rather than through a separate agent, the same grant mechanism applies — they just grant to their own DID (a self-grant) instead of an agent's.

## Full working example

See [Invoke your contract](/developers/adk/get-started/walkthrough/invoke-contract) for this in context, including the search/book contract call itself. For why the outbound call fails without a grant even when the contract code is correct, see [Outbound HTTP calls are authorized by the user, not the contract](/developers/adk/tips/outbound-http-auth-by-user).

<Note>
  Some SDK type definitions reference a broader delegation-credential API (functions for building and signing standalone delegation credentials, separate from the `agent-auth-update` grant shown above). That surface isn't confirmed or documented yet — if you find it in the SDK's TypeScript types and need it, ask in the [developer Telegram](https://t.me/terminal3developer) rather than guessing at the signatures, and we'll get this page updated once it's verified.
</Note>
