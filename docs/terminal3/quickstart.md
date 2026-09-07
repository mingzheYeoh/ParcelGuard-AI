> ## Documentation Index
> Fetch the complete documentation index at: https://docs.terminal3.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart

> Get your first authenticated call to Terminal 3 working in under 10 minutes.

This page gets you to one working, authenticated call — nothing else. No Rust, no WASM, no blockchain knowledge required for this part. Once this works, move on to [Write your first TEE contract](/developers/adk/get-started/walkthrough/write-contract) for the real thing.

<Tabs>
  <Tab title="I'll write the code myself">
    <Steps>
      <Step title="Get your API key">
        Go to the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) and sign in. You get an API key and test credits instantly — no approval wait.

        <Warning>
          Your key is shown **once**. Copy it somewhere safe before you navigate away — there's no way to view it again.
        </Warning>
      </Step>

      <Step title="Set up your project">
        Create a fresh project and install the SDK:

        ```bash theme={null}
        mkdir my-t3n-app && cd my-t3n-app
        npm init -y
        npm pkg set type=module        # required — the code below uses top-level await
        npm install @terminal3/t3n-sdk tsx
        ```

        Then put the key from Step 1 into your shell's environment — the code in the next step reads it from there, it isn't written into any file:

        ```bash theme={null}
        export T3N_API_KEY="<the key you copied from the claim page>"
        ```

        <Accordion title="Using Next.js, Vite, or another bundler?">
          A handful of teams have hit WASM-loading errors under Next.js/Turbopack, Vite, and older Webpack setups — the SDK loads a WASM component, and some bundlers try to process it in ways that break it. If you hit a WASM parse or module-loading error later in this guide and you're in a bundled framework, try running the SDK code from a plain Node script or a server-only route first, to confirm your setup works before debugging the bundler. If you're on Next.js specifically, adding your bundler's equivalent of an external-packages/no-bundle exception for `@terminal3/t3n-sdk` is worth trying. We're tracking this as a known rough edge — if you find a config that fixes it, tell us in the [developer Telegram](https://t.me/terminal3developer) and we'll document it here properly.
        </Accordion>
      </Step>

      <Step title="Connect and authenticate">
        Create a file named `quickstart.ts` in your project and paste this in — don't run any of it in a terminal directly, it's TypeScript, not shell commands:

        ```typescript theme={null}
        import {
          T3nClient,
          setEnvironment,
          loadWasmComponent,
          eth_get_address,
          metamask_sign,
          createEthAuthInput,
          fetchTrustedManifest,
        } from "@terminal3/t3n-sdk";

        setEnvironment("testnet"); // the public SDK defaults to testnet — set it explicitly so your target cluster is unambiguous (and switch to "production" when you go live)

        const T3N_API_KEY = process.env.T3N_API_KEY!;
        const wasmComponent = await loadWasmComponent(); // all crypto runs inside this component
        const address = eth_get_address(T3N_API_KEY);

        const t3n = new T3nClient({
          trustAnchor: await fetchTrustedManifest("testnet"), // pins the node's attestation; node URL comes from setEnvironment above
          wasmComponent,
          handlers: {
            EthSign: metamask_sign(address, undefined, T3N_API_KEY),
          },
        });

        await t3n.handshake();
        const did = await t3n.authenticate(createEthAuthInput(address));
        const tenantDid = did.value; // did:t3n:... — you'll reuse this exact variable in every later step

        console.log("Connected as:", tenantDid);
        ```

        <Warning>
          **Never hardcode or derive your tenant DID.** It's not related to your wallet address — it's an opaque ID the platform assigns you the first time you sign in. Always read it back from the authenticated session, like `tenantDid` above — and keep both `t3n` (the client) and `tenantDid` (the value) around, since [Set Up Dev Env](/developers/adk/get-started/prerequisites/set-up-dev-env) and the rest of the walkthrough build directly on top of them.
        </Warning>

        <Note>
          **"Reuse this variable" means literally keep coding in this same file.** `t3n` and `tenantDid` are plain JavaScript variables — they only exist inside this one running script. The code samples on later pages (`TenantClient`, contract registration, invocation) assume `t3n`/`tenantDid`/`tenant` are already in scope, so append each new snippet to the bottom of this same `quickstart.ts` rather than starting a new file, unless you deliberately repeat the connect-and-authenticate block above at the top of it.
        </Note>

        <Accordion title="Under the Hood: what is setEnvironment doing?">
          `setEnvironment("testnet" | "production")` tells the SDK which T3N cluster to resolve a node URL from for every client you create afterward — you never hardcode a node URL yourself. Its public build defaults to `"testnet"`; setting it explicitly keeps your target cluster unambiguous and makes the switch to `"production"` a deliberate one-line change.
        </Accordion>
      </Step>

      <Step title="Run it">
        From the same directory as `quickstart.ts`:

        ```bash theme={null}
        npx tsx quickstart.ts
        # Connected as: did:t3n:9f2a...
        ```

        If you see a `did:t3n:...` value printed, you're connected.
      </Step>
    </Steps>
  </Tab>

  <Tab title="Claude Code">
    1. Get your API key from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) — shown once, copy it somewhere safe.
    2. Save our [skill file](/developers/adk/support/ai-coding-assistants) as `.claude/skills/t3n-adk-quickstart/SKILL.md` in your project.
    3. Describe what you're building. Claude Code scaffolds the project (`package.json`/ESM setup, your API key in the environment), writes and runs the connection code, and checks a known-pitfalls list before guessing at fixes.

    You should still end up with a working `t3n` client and `tenantDid` — the same things the manual path produces — just without typing the steps yourself.
  </Tab>

  <Tab title="Codex">
    1. Get your API key from the [claim page](/developers/adk/get-started/prerequisites/request-test-tokens) — shown once, copy it somewhere safe.
    2. Save the same [skill file](/developers/adk/support/ai-coding-assistants) as `AGENTS.md` in your project root — Codex reads it automatically.
    3. Describe what you're building. It follows the same order as the manual path: working connection first, contract code second.
  </Tab>
</Tabs>

## What's next

You now have two things every later page assumes you already have: an authenticated `t3n` client and its `tenantDid`. Keep both around (same variable names, same file) as you continue:

* Building something that actually runs inside the confidential-compute enclave → [Write your first TEE contract](/developers/adk/get-started/walkthrough/write-contract)
* Letting an AI agent act on a user's behalf → [Agent Auth](/developers/adk/overview/agent-auth-adk). An agent needs its **own** DID and its **own** test credits — separate from yours, and from the same claim page you used in Step 1 — so get it its own key before writing any agent code: [Register a Public Agent](/developers/agents/register-agent)
* The shape of the whole ADK before you dive in further → [ADK Tour](/developers/adk/overview/adk-tour)
* Hit an error? → [Common Errors](/developers/adk/tips/common-errors)
