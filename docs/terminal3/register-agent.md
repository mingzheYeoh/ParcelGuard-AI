> ## Documentation Index
> Fetch the complete documentation index at: https://docs.terminal3.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Register a Public Agent

> Give your agent a T3N identity and publish its agent card — from installing the SDK to verifying the registration.

This guide takes an AI agent from nothing to a publicly resolvable identity on T3N: a `did:t3n` DID plus an agent card that **T3N hosts and serves** for other agents and services to discover — no external storage required. Every step uses the `t3n` CLI that ships with the [`@terminal3/t3n-sdk`](https://www.npmjs.com/package/@terminal3/t3n-sdk) package — no code required.

<Note>
  **Onboarding, not permissions.** This page gives an agent an *identity* and a *card*. It does not grant the agent access to anything — no user data, no contract functions. That's a separate step the data owner performs afterwards: see [Agent Auth](/developers/adk/overview/agent-auth-adk).

  **Two onboarding paths.** This is the one where an agent **registers itself** — public and discoverable. If instead an **organization** provisions and owns the agent (with a card kept **private by default**), see [Register an Organization-owned Agent](/developers/agents/provision-org-agent).
</Note>

The flow is:

1. Download the SDK
2. Get the agent's key
3. Get the agent's DID
4. Scaffold the agent card
5. Host the agent card on T3N
6. Verify the registration

<Info>
  All commands that talk to the network accept `--env testnet|production` (or the `T3N_ENV` environment variable). Use `--env testnet` while you're building — the examples below do.
</Info>

<Steps>
  <Step title="Download the SDK">
    The CLI is part of the TypeScript SDK. You can run it with zero install, or install it globally:

    ```bash theme={null}
    # zero-install — always runs the latest published version
    npx @terminal3/t3n-sdk --help

    # or install globally (Node.js >= 18)
    pnpm add -g @terminal3/t3n-sdk
    t3n --help
    ```

    The rest of this guide uses the global `t3n` form; substitute `npx @terminal3/t3n-sdk` if you skipped the install.
  </Step>

  <Step title="Get the agent's key">
    The agent's identity key is a standard Ethereum-style **secp256k1 private key** (32 bytes, `0x`-prefixed hex). Registration is a write operation that consumes credits, and an agent's credit balance is separate from its tenant's — so get this key from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens), the same self-serve page you used to claim your own key: it issues a fresh key together with metered test credits every time, so you can revisit it once per agent, not just once for yourself. A key generated any other way (there is no `t3n keygen` command, but any tool that generates an Ethereum keypair produces a technically-usable one) starts with **zero** credits and can't pay for this step.

    Put the key in your shell's environment; every signing command reads it from there (or from `--api-key`):

    ```bash theme={null}
    export T3N_API_KEY="0x<the agent's private key>"
    ```

    <Warning>
      The key never leaves your machine — the CLI uses it locally to sign a login challenge. Treat it like any private key: keep it out of source control, and give each agent its **own** key. Never reuse your tenant developer key for an agent (see [Agent Auth](/developers/adk/overview/agent-auth-adk)).
    </Warning>
  </Step>

  <Step title="Get the agent's DID">
    A T3N DID has the form `did:t3n:<40 hex characters>`. The network binds it to your key the first time you authenticate — so you don't compute it yourself, you read it back:

    ```bash theme={null}
    t3n whoami --env testnet
    # did:t3n:1a2b3c...

    export AGENT_DID=$(t3n whoami --env testnet)
    ```

    <Warning>
      **Always read the DID back from `t3n whoami` (or `--json` for `{"did": "..."}`).** Never hard-code a DID or try to derive it from the key locally — the canonical value is the one the network returns for your authenticated session.
    </Warning>
  </Step>

  <Step title="Scaffold the agent card">
    The agent card is a JSON document, following the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) registration format, that describes your agent and lists its service endpoints — including its [A2A](https://a2a-protocol.org/) agent card. Scaffold one with:

    ```bash theme={null}
    t3n agent create-card --did "$AGENT_DID"
    ```

    Run interactively, it walks you through name, description, image, and which services to include (A2A / MCP / DID). In scripts or CI it falls back to flags: `--out <file>` (default `agent-card.json`), `--name`, `--description`, `--image`, `--did`, `--x402`, and `--force` to overwrite an existing file.

    The generated `agent-card.json` looks like this:

    ```json theme={null}
    {
      "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      "name": "My T3N Agent",
      "description": "REPLACE: what your agent does",
      "services": [
        {
          "name": "A2A",
          "endpoint": "https://agent.example/.well-known/agent-card.json",
          "version": "0.3.0"
        },
        {
          "name": "MCP",
          "endpoint": "https://mcp.agent.example/",
          "version": "2025-06-18"
        },
        {
          "name": "DID",
          "endpoint": "did:t3n:REPLACE_WITH_YOUR_DID",
          "version": "v1"
        }
      ],
      "x402Support": false,
      "active": true,
      "registrations": [],
      "supportedTrust": ["tee-attestation"]
    }
    ```

    Before moving on, replace the placeholders: point the `A2A` service endpoint at your agent's real `.well-known/agent-card.json` URL, the `MCP` endpoint at your MCP server (or remove services you don't offer), and make sure the `DID` service endpoint is your `$AGENT_DID` (the `--did` flag fills this in for you). Keep the whole card under **16 KiB** — that's the limit T3N accepts when it hosts the body in the next step.
  </Step>

  <Step title="Host the agent card on T3N">
    T3N hosts the card for you — no external bucket, pinning service, or web server required. One command stores your `agent-card.json` and publishes it to a world-readable endpoint keyed by your DID:

    ```bash theme={null}
    t3n agent host-card --file agent-card.json --env testnet
    # card published: https://<node>/api/agent-card/did:t3n:1a2b3c...
    ```

    That's it — your card is now served, verbatim, at `GET /api/agent-card/<did>`. `host-card` does two things in one transaction: it stores the card **privately** under your DID, then publishes a public copy. Update it any time by editing the JSON and re-running `host-card`; take it down with `t3n agent card-unpublish`.

    <Note>
      T3N validates and serves the card **body** itself: it must be a single JSON object of at most **16 KiB**, and it is served byte-for-byte at `GET /api/agent-card/<did>`. This is the T3N-hosted path — you no longer need to host the JSON anywhere else.
    </Note>

    <Tip>
      **Registering just a URI instead.** If you'd rather keep the card on your own domain (per the ERC-8004 model), `t3n agent set-card --uri "<https url>"` records that URL in your DID document's `AgentService` endpoint. As a convenience it also publishes a minimal **default** T3N card for your DID so you're immediately discoverable — pass `--no-card` to skip that, or run `host-card` afterwards to replace the default with your full card. Existing cards are never overwritten.
    </Tip>

    <Accordion title="Under the Hood: what does host-card actually do?">
      `host-card` opens an authenticated session with your agent key and runs two writes on the built-in `tee:org-data/contracts` TEE contract: it stores the card as ordinary org-data in your **self-owned** `agent-cards` scope (private, keyed by a deterministic entry id for your DID), then `agent-card-publish` copies that body into the world-readable `public:agent_cards` map the endpoint reads. You can only host or publish a card for your **own** DID; an organisation hosting on behalf of its agents uses `--owner`/`--agent` and a consent link (see [Agent Auth](/developers/adk/overview/agent-auth-adk)).
    </Accordion>
  </Step>

  <Step title="Verify the registration">
    Resolution is public — anyone can fetch your card without a key. Hit the endpoint directly:

    ```bash theme={null}
    curl https://<node>/api/agent-card/"$AGENT_DID"
    # → your agent-card.json, served verbatim
    ```

    If you also registered a URI with `set-card`, it appears in your DID document's `AgentService` endpoint, resolvable through the public DID resolver (`GET /api/did/<did>`):

    ```bash theme={null}
    t3n agent registry "$AGENT_DID" --env testnet
    # id:    did:t3n:1a2b3c...
    # agent: https://<node>/api/agent-card/did:t3n:1a2b3c...
    ```

    ```json theme={null}
    {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/secp256k1recovery-2020/v2"
      ],
      "id": "did:t3n:1a2b3c...",
      "verificationMethod": [
        {
          "id": "did:t3n:1a2b3c...#eth-owner",
          "type": "EcdsaSecp256k1RecoveryMethod2020",
          "controller": "did:t3n:1a2b3c...",
          "blockchainAccountId": "eip155:1:0x<owner address>"
        }
      ],
      "authentication": ["did:t3n:1a2b3c...#eth-owner"],
      "service": [
        {
          "id": "did:t3n:1a2b3c...#agent",
          "type": "AgentService",
          "serviceEndpoint": "https://<node>/api/agent-card/did:t3n:1a2b3c..."
        }
      ]
    }
    ```

    Consumers verify ownership through the DID document itself: the `verificationMethod` binds the DID to the owner's key, and the card body is served at the T3N endpoint above. `t3n did get <did>` prints the same view, and `t3n agent registry <did> --full` (authenticated) reads the full registry record directly from the contract.

    If the endpoint returns your card, you're done — your agent is registered and discoverable on T3N.
  </Step>
</Steps>

## What's next

* The agent now has an identity and is discoverable. Next, let it actually *do* something — granting permission to act on users' data and contracts → [Agent Auth](/developers/adk/overview/agent-auth-adk) and [Delegate Access](/t3n/data-owner-guide/delegate-access)
* How DIDs work on T3N → [Decentralized Identifiers](/t3n/how-t3n-works/did)
* Registration writes consume credits → [Tokens](/t3n/how-t3n-works/tokens)
