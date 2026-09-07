> ## Documentation Index
> Fetch the complete documentation index at: https://docs.terminal3.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Using AI Coding Assistants

> A ready-to-use skill file that teaches Claude Code, Codex, Cursor, and other AI coding tools how to build with the T3N ADK.

If you're building your integration with an AI coding assistant, you don't need to paste this whole documentation site into your context window. Drop the skill file below into your project and the assistant will follow the same order this documentation does: scaffold the project correctly, get a basic authenticated connection working before touching contract code, and check a known-pitfalls table before guessing at a fix.

## Install it

<Tabs>
  <Tab title="Claude Code">
    Save the file below as `.claude/skills/t3n-adk-quickstart/SKILL.md` in your project (or your global `~/.claude/skills/` directory), then invoke it with `/t3n-adk-quickstart` or just describe what you're building — Claude Code will pick it up automatically based on the skill's description.
  </Tab>

  <Tab title="Codex">
    Save everything below the frontmatter (the `---` block at the top) as `AGENTS.md` in your project root — Codex CLI and Codex cloud agents read this automatically at the start of a session.
  </Tab>

  <Tab title="Cursor">
    Save everything below the frontmatter (the `---` block at the top) as `.cursorrules` in your project root.
  </Tab>

  <Tab title="Windsurf / other">
    Paste the body of the file (below the frontmatter) as a system-context or rules file, using whatever mechanism your tool supports for persistent project instructions.
  </Tab>
</Tabs>

<Accordion title="Full skill file — t3n-adk-quickstart/SKILL.md">
  ```markdown theme={null}
  ---
  name: t3n-adk-quickstart
  description: Scaffold and debug a Terminal 3 (T3N) ADK integration — use when the user wants to "build with Terminal 3", "use the T3N SDK", or "add a TEE contract" to their app.
  ---

  # Building with Terminal 3 ADK

  You are helping a developer — possibly a first-timer, possibly vibe-coding — integrate the Terminal 3 Agent Developer Kit. Follow this order. Do not jump to contract code or advanced features before step 3 actually works. Do the scaffolding yourself — don't just print code and tell the user to run it.

  ## Step 1: Confirm the basics before writing any contract code

  Ask the user (don't assume):
  1. Do they already have a T3N API key and test credits? If not, point them to the claim page linked from `/developers/adk/get-started/prerequisites/request-test-tokens` on the Terminal 3 docs — it's self-serve, no approval wait.
  2. Are they building an agent that will call the contract (as opposed to just their own tenant code)? If so, the agent needs its **own** separate key and its **own** test credits — an agent DID's balance is separate from the tenant's and starts at zero. Get it a second key from the same claim page (revisiting it mints a fresh key+credits each time) rather than reusing the tenant's `T3N_API_KEY` — see `/developers/agents/register-agent`. Reusing the tenant key or skipping this is the most common cause of `InsufficientCreditError` on agent calls.
  3. Is this a Next.js/Vite/Webpack project? If so, be ready for possible WASM-loading friction — see the troubleshooting note in `/developers/adk/get-started/quickstart`.

  ## Step 2: Scaffold the project BEFORE writing the connection code

  A blank folder needs this before the SDK's `await`-based sample code will even parse:

  \`\`\`bash
  mkdir -p my-t3n-app && cd my-t3n-app
  npm init -y
  npm pkg set type=module        # required — the sample code uses top-level await
  npm install @terminal3/t3n-sdk tsx
  \`\`\`

  Then get the user's `T3N_API_KEY` (from the claim page) and export it into the shell you'll run scripts from — don't write it into a file:

  \`\`\`bash
  export T3N_API_KEY="<their key>"
  \`\`\`

  ## Step 3: Get a basic authenticated connection working FIRST

  Save this as `quickstart.ts` in the project you just scaffolded, and actually run it — don't just write it:

  \`\`\`typescript
  import {
    T3nClient,
    setEnvironment,
    loadWasmComponent,
    eth_get_address,
    metamask_sign,
    createEthAuthInput,
    fetchTrustedManifest,
  } from "@terminal3/t3n-sdk";

  setEnvironment("testnet"); // the public SDK defaults to testnet — set it explicitly so your target cluster is unambiguous

  const T3N_API_KEY = process.env.T3N_API_KEY!;
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);

  const t3n = new T3nClient({
    trustAnchor: await fetchTrustedManifest("testnet"),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value; // did:t3n:... — keep this variable, reuse it in every later step
  console.log("Connected as:", tenantDid);
  \`\`\`

  Run with `npx tsx quickstart.ts`. Do not proceed to contract code until this prints a `did:t3n:...` value.

  **Keep building in this same file.** `t3n` and `tenantDid` are plain JS variables scoped to this one running script. Later snippets (`TenantClient` construction, contract registration, invocation) all assume `t3n`/`tenantDid`/`tenant` are already in scope — append new code to the bottom of `quickstart.ts` rather than starting fresh files, unless you deliberately repeat the connect-and-authenticate block at the top of a new one.

  ## Step 4: Contract code lives in a SEPARATE project

  The Rust/WASM contract is not part of the Node project above — it's its own crate. Clone the reference implementation instead of hand-typing it, as a sibling folder (not nested inside your Node project):

  \`\`\`bash
  cd ..
  git clone https://github.com/Terminal-3/z-tenant-flight.git
  cd z-tenant-flight
  rustup target add wasm32-wasip2   # install rustup first via https://rustup.rs if `rustup`/`cargo` aren't found
  cargo build --target wasm32-wasip2 --release
  \`\`\`

  This produces `target/wasm32-wasip2/release/z_tenant_flight.wasm`. Back in `my-t3n-app/quickstart.ts` for the registration step, point `WASM_PATH` across the two folders, e.g. `../z-tenant-flight/target/wasm32-wasip2/release/z_tenant_flight.wasm`.

  ## Step 5: Known pitfalls — check these BEFORE assuming it's your bug

  | Symptom | Likely cause | Fix |
  |---|---|---|
  | `Top-level await is currently not supported with the "cjs" output format` | No `package.json`, or missing `"type": "module"` | `npm pkg set type=module` (see Step 2) |
  | `Invalid Ethereum private key` from `eth_get_address` | `T3N_API_KEY` was never exported into the shell running the script | `export T3N_API_KEY="..."` before running (see Step 2) |
  | `ReferenceError: tenant is not defined` / `tenantDid is not defined` in a later snippet | Each doc page's code sample assumes earlier variables are still in scope — they aren't, across separate files | Append new code to the same running file instead of starting a new one (see Step 3) |
  | `ENOENT` reading a `.wasm` file | `WASM_PATH` is relative to the wrong project — the contract lives in its own cloned repo, not the Node project | Point `WASM_PATH` across folders, e.g. `../z-tenant-flight/target/...` (see Step 4) |
  | WASM/module parse error, works with `tsx` but not `node`/webpack | Bundler compatibility | Try a plain Node script or server-only route first to isolate the bundler from the SDK |
  | Generic `HTTP 500` with no detail | Could be egress not authorized, wrong action name, or a real platform issue — not necessarily your code | Check the outbound-HTTP-grant requirement below before assuming it's a bug; if it's consistent and reproducible, it may be platform-side |
  | Contract can't reach an external API even though the code looks right | Outbound HTTP is authorized by the **calling user's grant**, not the contract itself | Confirm a user (or self-grant, for direct calls) actually authorized that host via `agent-auth-update` |
  | `tenant not found` | The DID was derived/hardcoded instead of read from the session | Always read `tenantDid`/`did.value` from the authenticated session, never construct it |
  | `AccessDenied` reading your own contract's secret | KV map ACLs default to deny | Explicitly set `readers`/`writers` when creating the map |
  | Map path looks right but reads/writes silently miss | `tenant_did()` returns raw bytes and must be hex-encoded once when building the `z:<tid>:` map path | Build the path with `hex::encode(&tenant_did())` — a missing OR double hex-encode both produce a path that matches nothing |
  | Re-registering a contract breaks old pinned-version calls | Registering a newer version can reroute calls that pin an older one | Re-verify any version-pinned calls after any re-registration |
  | Agent can authenticate but its calls fail with `host/http.egress_denied` | The agent is authenticated but no one has authorized it yet — those are two different steps | The **user (data owner)**, not the agent, must sign an `agent-auth-update` grant naming the agent's DID before it can do anything with outbound HTTP |

  ## Step 6: Where to look things up

  - Full onboarding walkthrough, starting point: `/developers/adk/get-started/quickstart`
  - Every confirmed SDK method, host interface, and REST tag: `/developers/adk/reference`
  - Common errors reference: `/developers/adk/tips/common-errors`
  - Conceptual map of the whole ADK: `/developers/adk/overview/adk-tour`

  ## Step 7: When something seems broken and isn't in this list

  Say so plainly to the user rather than guessing. Some rough edges are real platform issues with no clean workaround, not something you can code around. Don't fabricate a fix — point them at the developer Telegram (`https://t.me/terminal3developer`) or `devrel@terminal3.io`.

  ---
  *Compatibility: this file uses Claude Code's Skill frontmatter (`name`/`description`). For Codex, save everything below the frontmatter as `AGENTS.md` in your project root — Codex reads it automatically. For Cursor, save everything below the frontmatter as `.cursorrules`. For Windsurf or any other tool that accepts a plain system-context file, paste the body as-is.*
  ```
</Accordion>

## This documentation is agent-readable too

Every page on this site is available as plain Markdown by appending `.md` to its URL, and a machine-readable index of every page lives at [`/llms.txt`](/llms.txt) — point an agent there if you want it to explore the docs directly instead of relying on the skill file above.

<Card title="SDK & API Reference" icon="book" href="/developers/adk/reference">
  If you're pasting context manually instead of using the skill file, this single page is the highest-value one to include — every confirmed method, host interface, and API tag in one place.
</Card>
