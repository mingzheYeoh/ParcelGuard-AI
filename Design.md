# ParcelGuard AI — Design System & Frontend Implementation Specification

> **Status: built.** This document is the specification the code was written
> against, and the code still cites its section numbers — keep it. Passages
> that instruct an agent to produce `docs/handoffs/…` or to read
> `design-reference/` describe the original build process; both are gone
> (see the note at the top of TASKS.md). For how to run and demo what was
> built, see [README.md](README.md) and [docs/DEMO.md](docs/DEMO.md).

> Version 1.1 · Research date: 2026-09-07 · Language: English
> Target implementer: Claude Code
> Companion: PLAN.md
> Scope: frontend design, interaction, HTTP mocks, and API readiness. This document does not claim or require live cloud integration during the frontend stage.

## 1. Instructions for Claude Code

Read applicable AGENTS.md instructions, then PLAN.md and this file in full. Implement the P0 frontend as a polished, interactive AI order-support workspace.

- Use React, TypeScript, Vite, Tailwind, shadcn/ui, Lucide, TanStack Query, and MSW.
- Use shadcn/ui as the only component foundation. Keep one primitive family throughout the project.
- For a new project, prefer the Radix variant. Preserve an existing project's chosen primitive family. Inspect installed source and matching official documentation before assuming component props.
- Use the project's **light theme, teal accent, Inter font, and three-column workspace**. These explicit choices override generic dashboard presets or default dark themes.
- PLAN.md controls business behavior, scope, and API contracts. Design.md controls visual details and elaborates interaction without changing those contracts.
- Complete the HTTP-mocked frontend without waiting for Azure or Terminal 3 credentials.
- Do not create a marketing landing page, an admin suite, or nonfunctional navigation.
- Do not call cloud providers, expose keys, or fabricate verified outcomes in this stage.
- Run and inspect the app in a browser. A successful build or static screenshot alone is insufficient.

### Supplied prototype

Inspect design-reference/ParcelGuard Workspace.dc.html with its neighboring support.js. Use its composition and interaction as a visual reference, then implement ordinary React components.

The prototype's custom tags and expressions are not React source. Do not rename it to index.html, embed it as the final product in an iframe, or ship support.js as the application runtime. Preserve the prototype files. The root English documents control requirements if prototype behavior conflicts with them.

## 2. Design-system research and selection

Official capabilities are linked below. Suitability and selection are project judgments, not provider ratings.

| System | Official reference | Project relevance | Decision |
|---|---|---|---|
| **shadcn/ui** | Customizable open component source; [Introduction](https://ui.shadcn.com/docs) | Fits React/Tailwind and lets Claude Code inspect and modify components directly | **Sole implementation foundation** |
| **Atlassian Design System** | Tokens and visual foundations; [Foundations](https://atlassian.design/foundations) | Useful spacing discipline and business-interface hierarchy | Reference only; do not install Atlaskit |
| **IBM Carbon** | IBM's open-source design system; [Home](https://carbondesignsystem.com/) | Enterprise interface alternative; replacing the existing choice adds work | Alternative only; do not install Carbon React |
| **Microsoft Fluent 2** | Design and development resources; [Home](https://fluent2.microsoft.design/) | Could suit a future Microsoft-oriented enterprise product | Alternative only; do not install Fluent UI |

The hackathon needs controlled customization and rapid reuse. shadcn supplies component source; this document supplies ParcelGuard's product-specific design system. Using Azure for inference does not require Fluent UI.

### Adopted reference principles

1. Semantic theme variables and composition from [shadcn theming](https://ui.shadcn.com/docs/theming).
2. An 8px-based spacing rhythm with supporting 4/12/20px steps from [Atlassian spacing](https://atlassian.design/foundations/spacing).
3. Keyboard, focus, and semantic foundations from [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility), followed by real page-level verification.

The colors, dimensions, copy, and layouts below are custom ParcelGuard decisions, not copied brand tokens.

## 3. Visual concept

**Calm, capable, accountable.** The interface should make three things immediately clear: which orders belong to the customer, what they can ask the assistant, and what just happened.

- Chat is the primary visual focus; orders and actions provide context.
- Teal emphasizes primary actions, selection, and small brand details.
- Polish comes from alignment, spacing, typography, structured outcomes, and restrained motion.

### Brand and assets

- Product: ParcelGuard. Page label: Support workspace.
- Mark: 32px teal rounded tile containing a white package outline; wordmark 18px/600.
- Assistant: ParcelGuard Assistant.
- Customer: Alex, with an A avatar fallback.
- Products: local Keyboard, Laptop, or Package vector icons in 48px pale tiles.
- No remote-image dependency, logo collage, large 3D artwork, or background video.
- P0 is light-theme only. Do not add an inactive theme switch.

## 4. Design tokens

### 4.1 Colors

| Token | Value | Role |
|---|---|---|
| background | #F6F7F9 | Page canvas |
| foreground | #17232B | Main text |
| card / popover | #FFFFFF | Panels and overlays |
| card-foreground / popover-foreground | #17232B | Surface text |
| primary | #0F766E | Primary actions and selection |
| primary-foreground | #FFFFFF | Text on primary |
| primary-hover | #115E59 | Primary hover |
| secondary / muted | #F0F3F5 | Secondary surfaces |
| secondary-foreground | #17232B | Secondary button text |
| muted-foreground | #5C6975 | Supporting text and timestamps |
| accent | #E7F4F1 | Selected rows and chip hover |
| accent-foreground | #115E59 | Text on accent |
| border | #DFE5E9 | Decorative borders and separators |
| input | #87949E | Recognizable input boundary |
| ring | #0F766E | Focus indicator |
| success / success-surface | #166534 / #ECFDF3 | Successful action |
| warning / warning-surface | #9A3412 / #FFF4E8 | Denial, expiry, uncertain outcome |
| destructive / error-surface | #B42318 / #FEF3F2 | Service or submission failure |

Input boundaries are intentionally stronger than decorative borders. Do not rely on a faint container border as the sole affordance for an interactive control. Check rendered icon and focus contrast as well.

### 4.2 Theme implementation

The following Tailwind v4-style fragment belongs in the existing theme file. Preserve necessary imports, base component styles, and animation setup. For v3, implement equivalent configuration without upgrading the entire project solely for this fragment.

```css
:root {
  color-scheme: light;
  --background: #f6f7f9;
  --foreground: #17232b;
  --card: #ffffff;
  --card-foreground: #17232b;
  --popover: #ffffff;
  --popover-foreground: #17232b;
  --primary: #0f766e;
  --primary-foreground: #ffffff;
  --primary-hover: #115e59;
  --secondary: #f0f3f5;
  --secondary-foreground: #17232b;
  --muted: #f0f3f5;
  --muted-foreground: #5c6975;
  --accent: #e7f4f1;
  --accent-foreground: #115e59;
  --border: #dfe5e9;
  --input: #87949e;
  --ring: #0f766e;
  --destructive: #b42318;
  --destructive-foreground: #ffffff;
  --success: #166534;
  --success-surface: #ecfdf3;
  --warning: #9a3412;
  --warning-surface: #fff4e8;
  --error-surface: #fef3f2;
  --radius: 0.75rem;
  --pg-radius-control: 12px;
  --pg-radius-card: 16px;
  --pg-radius-sheet: 20px;
  --pg-shadow-overlay: 0 12px 36px rgb(23 35 43 / 12%);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-surface: var(--success-surface);
  --color-warning: var(--warning);
  --color-warning-surface: var(--warning-surface);
  --color-error-surface: var(--error-surface);
  --font-sans: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;
  --radius-control: var(--pg-radius-control);
  --radius-card: var(--pg-radius-card);
  --radius-panel: var(--pg-radius-sheet);
}
```

Use semantic utilities such as bg-card, text-muted-foreground, and rounded-card. Keep color values centralized rather than scattered across TSX files. Fall back immediately to system fonts if Inter is unavailable; avoid large complete CJK font downloads.

### 4.3 Typography, spacing, and geometry

| Element | Specification |
|---|---|
| Welcome heading | 28px / 36px, 600, -0.02em tracking |
| Workspace heading | 24px / 32px, 600 |
| Section title | 14px / 20px, 600 |
| Chat text | 15px / 24px, 400 |
| Standard UI | 14px / 22px, 400–500 |
| Supporting text | 12px / 18px, 400 |
| IDs / amounts | Monospace IDs and tabular numerals; normal body text stays proportional |
| Spacing scale | 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48px |
| Buttons | 44px tall, 16px horizontal padding, 8px icon gap |
| Cards | 16px radius, 16–20px padding, 1px border |
| Messages | 24px between groups, 8px within a group |
| Icons | 16–20px with consistent stroke weight |

Use one primary button per task region. Static badges do not need a 44px height; clickable chips and icon controls need an adequate hit target.

## 5. Workspace composition

### 5.1 Desktop: 1440 × 900

Header: 64px. Main container: 24px padding and max-width 1600px. At 1440px, inner width is 1392px: 264px left + 788px chat + 300px right + two 20px gaps.

```css
.workspace {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr) 300px;
  gap: 20px;
  max-width: 1600px;
  margin-inline: auto;
  padding: 24px;
  height: calc(100dvh - 64px);
}
.workspace > * { min-width: 0; min-height: 0; }
.chat-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.message-list { flex: 1; min-height: 0; overflow-y: auto; }
.composer { flex: none; }
```

Apply box-sizing:border-box globally. Implement the responsive overrides in section 6. Long content must wrap within its container. Do not hide overflow globally to conceal layout defects.

### 5.2 Header

Left: brand. Nearby: Support workspace in supporting text. Right: Synthetic orders badge, Demo details button, and Alex avatar.

Demo details opens the integration panel with separate model and Terminal 3 modes. The main customer view should not be filled with framework versions, database names, or implementation details. Never display credentials.

### 5.3 Left column: My orders

Title plus actual authorized-order count. All / Processing / Shipped filters operate locally on the fetched list and require no new API parameters.

Each order card contains:

1. 48px product icon, product name, and quantity.
2. Order ID and MYR amount.
3. Status badge and a detail arrow.

Default: white surface and fine border. Hover: subtle background. Selected: accent background and primary border. Make the entire row a single accessible button, without nested buttons.

Initially show only ORD-1001 and ORD-1002. ORD-2001 must never appear in the customer list. Do not invent an order date missing from the API.

### 5.4 Center: conversation

Panel header: 64px with small assistant mark, ParcelGuard Assistant, Order support, and a working New conversation action.

Initial welcome state:

- 48px package illustration.
- “How can I help with your order?”
- “Track a delivery or update a saved address before your order ships.”
- Working chips: Track my order / Update delivery address / What can you help with?

Suggested deterministic chip messages:

- Track my order → “Where is order ORD-1001?”
- Update delivery address → “Send ORD-1002 to my office instead.”
- What can you help with? → “What can you help with?”

Do not preload fabricated completed conversations or activity. For screenshots, trigger actual mock interactions.

After the first message, remove the large welcome block. Assistant content is left-aligned, max-width 92%; user bubbles are right-aligned on the pale teal surface, max-width 80%. Use cards for structured results, not every paragraph.

Composer: white background, top separator, 16px padding; textarea height 56–144px, auto-growing; 44px Send action. Hint: “Enter to send · Shift + Enter for a new line”. Do not send Enter while an IME composition is active. Disable whitespace-only submission and show the 2000-character limit accessibly when approached.

Preserve scroll position when reading older messages. Autoscroll only near the bottom; otherwise show a keyboard-accessible New messages button.

### 5.5 Right column: Recent actions

Heading and “What happened in this conversation”. Rows show outcome icon, action title, timestamp, and short result. Click for details.

Empty copy: “Your order actions will appear here.” No fictional KPIs, success rates, or activity counts.

Action details prioritize the understandable outcome. Put technical evidence in a secondary collapsible region. A missing reference displays Not available; it does not get a verified checkmark.

## 6. Responsive behavior

| Viewport | Layout | Behavior |
|---|---|---|
| ≥1280px | Three columns | Orders and actions remain visible |
| 900–1279px | 244px orders + chat | Activity opens a right Sheet |
| <900px | Chat with 12px side padding | Orders and Activity buttons open panels |
| 390px acceptance target | Full available chat width | Wrapping actions; no fixed minimum card width |

Reduce welcome spacing on mobile. Sheet width is min(420px,100vw), with independently scrolling content. Prevent background scroll while a modal sheet is open. Keep the composer reachable when the mobile keyboard appears.

## 7. Component mapping and documentation

Use the installed primitive family's documentation. Generic links may redirect to a Base UI variant; switch to Radix when that is the configured family. Do not mix render/asChild APIs from different variants.

| Product component | Foundation | Implementation note |
|---|---|---|
| Primary/secondary action | [Button](https://ui.shadcn.com/docs/components/button) | default / outline / ghost; consistent height |
| Order/proposal card | [Card](https://ui.shadcn.com/docs/components/card) | Custom business contents, restrained nesting |
| Status | [Badge](https://ui.shadcn.com/docs/components/badge) | Add semantic variants; do not assume built-in success |
| Composer | [Textarea](https://ui.shadcn.com/docs/components/textarea) | Auto-height, IME support, length validation |
| Detail panel | [Sheet](https://ui.shadcn.com/docs/components/sheet) | Title, description, focus restoration |
| Outcome/failure | [Alert](https://ui.shadcn.com/docs/components/alert) | Persistent, readable, appropriate recovery |
| Content separation | [Separator](https://ui.shadcn.com/docs/components/separator) | Avoid boxing every field |
| Account menu | [Dropdown Menu](https://ui.shadcn.com/docs/components/dropdown-menu) | Only working actions |
| Identity mark | [Avatar](https://ui.shadcn.com/docs/components/avatar) | Letter fallback; size through classes |
| Loading | [Skeleton](https://ui.shadcn.com/docs/components/skeleton) | Match final component dimensions |
| Extra explanation | [Tooltip](https://ui.shadcn.com/docs/components/tooltip) | Never the only place for essential information |

ChatMessage, OrderSummaryCard, AddressChangeProposalCard, ActionResultCard, and RecentActionItem are application components; do not assume the registry includes them.

Install only needed components, not --all. Use semantic header/main/aside and CSS Grid for the shell; a Sidebar primitive is optional and must not introduce irrelevant navigation.

## 8. Core interactions

### 8.1 OrderSummaryCard

Header: order ID and status. Body: items and amount. Footer: supplied timeline only. Hide unavailable ETA rather than inventing one.

Use an ordered list for shipping events with dots, connectors, and readable labels. Highlight the current status with primary color; keep completed events quieter. Do not fabricate future timestamps.

View order details opens the authorized detail sheet. A new query preserves previous messages rather than blanking the chat.

### 8.2 AddressChangeProposalCard

White surface, fine border, small MapPin, and “Confirm address change”. Show ORD-1002, Home → Office, and “This change applies to your saved address.” Do not add free-form street entry.

Confirm change is primary; Cancel is outline; 12px gap. Stack full-width actions on narrow screens when necessary.

| State | Presentation | Actions |
|---|---|---|
| pending | Awaiting confirmation; expiry shown | Confirm / Cancel |
| executing | Updating address… and spinner | Disable both actions |
| succeeded | Green Address updated result | No active confirmation |
| cancelled | Neutral Cancelled | No confirmation |
| expired | Amber Proposal expired | Ask again through composer |
| denied | Amber Cannot update this order | Explain business reason |
| failed | Red Could not update address | Retry only if response says retryable |
| outcome_unknown | Amber Update status not confirmed | No duplicate-write Retry button |

The card is the explicit confirmation surface; do not add a redundant second modal. UI disabling is a usability measure, not authorization.

Expire pending cards using the current clock. Handle API errors through the defined error presenter; do not require new response fields. Unknown outcomes may refresh existing activity records, but must not invent a provider lookup endpoint or imply resolution.

### 8.3 ActionResultCard

- Success: CheckCircle and success tokens; concise result and updated order.
- Permission denial: Shield/Lock and warning tokens; “This order isn’t available in your account.”
- Shipped denial: Package and warning tokens; “Shipped orders can’t be updated.”
- Service failure: AlertCircle and destructive tokens; explanation and safe recovery.
- Model refusal without a tool call: do not label it a backend interception or invent an action ID.

Give denial cards the same polish as success cards. Avoid a full-screen red failure for an expected permission boundary.

### 8.4 New conversation

Disable while a message or confirmation is executing. Call POST /conversations and switch only on success. Reset displayed chat/activity for the new conversation, not repository order data. Do not claim to delete history. Old asynchronous responses must not be appended to the new conversation.

## 9. Loading, empty, and error copy

| Situation | Copy | Behavior |
|---|---|---|
| Initial orders load | Skeletons | Do not flash 0 orders |
| Filter empty | No orders match this filter. | Clear filter |
| Order query failure | We couldn’t load your orders. | Retry |
| Model processing | Checking your request… | Subtle dots; static for reduced motion |
| Model timeout | The assistant took too long to respond. | Reuse client_message_id when retrying |
| Expired proposal | This request expired. Please ask again. | Disable original proposal |
| No actions | Your order actions will appear here. | No invented events |
| Mock mode | Demo mode · Simulated responses | Persistent, restrained badge |
| Terminal 3 disconnected | Not connected | Integration panel |
| Evidence absent | Not available | No verified icon |
| Conversation limit | Start a new conversation to continue. | New conversation |

Critical outcomes stay visible in cards. Preserve failed user messages and allow recovery without retyping. Do not expose stack traces as user copy.

## 10. Motion and accessibility

- Hover: 150ms. Card entry: 180ms opacity + translateY(4px). Sheets: primitive default or 220ms.
- No whole-page spring animation, scanning beams, or fake typewriter streaming.
- Disable positional and endless animations under prefers-reduced-motion.
- Use a visible 2px focus ring with 2px offset. Never remove outlines without an alternative.
- Target at least 4.5:1 for ordinary text and 3:1 for meaningful controls/nontext indicators; inspect actual rendering before claiming conformance.
- Use role=log or an appropriate live region without announcing every dot or character.
- Give sheets titles/descriptions, Escape handling, focus containment, and focus restoration.
- Give icon-only controls aria-labels. Chips must work with a keyboard.
- Wrap long IDs, errors, and mixed-language text without widening the page.
- A disabled control must have an understandable explanation when the cause is not obvious.

## 11. API and mock boundaries

PLAN.md section 7 is authoritative. Do not invent incompatible endpoints or fields.

| UI behavior | API |
|---|---|
| Initialize demo | POST /api/v1/demo/session |
| Address labels/integration | GET /api/v1/bootstrap |
| Order list | GET /api/v1/orders |
| Order detail | GET /api/v1/orders/:id |
| New conversation | POST /api/v1/conversations |
| Message | POST /api/v1/conversations/:id/messages |
| Confirm | POST /api/v1/proposals/:id/confirm + Idempotency-Key |
| Cancel | POST /api/v1/proposals/:id/cancel |
| Activity | GET /api/v1/actions?conversation_id=... |
| Action detail | GET /api/v1/actions/:id |

- UI imports apiClient, never fixtures.
- MSW and live use identical envelopes, enum values, and tagged cards.
- Delay mocks approximately 400–800ms, configurable; never impose long artificial waits for polish.
- Maintain state: successful confirmation updates address/version; cancellation does not; new conversation does not reset orders.
- Alex sees two orders with RM129.00 and RM89.00, stored as minor units.
- Browser fixtures are synthetic and are not private. MSW simulates sessions and cannot set a real server HttpOnly boundary.
- Do not claim frontend denial logic proves backend enforcement.
- Status cards come from response state, not hardcoded success.
- Separate model, Terminal 3, and synthetic-order labels; never combine them into one misleading Live badge.
- Derive UI state through a presenter without changing backend enum meanings.

### Initialization and recovery order

In mock mode, await MSW startup before the first request. Initialize the demo session, fetch bootstrap/orders, create a conversation, then enable Send. On initialization failure, show a retryable setup error instead of a broken composer. Make initialization idempotent under development rendering so it does not create duplicate active conversations.

Use TanStack Query keys scoped to conversation IDs for actions and messages. Invalidate order and current-action queries after a successful confirmation. Reuse idempotency/client-message IDs on retries. Clear local conversation view state only after a successful new-conversation response.

Provide explicit development scenarios for success, denied access, shipped-order denial, expiry, timeout, and unknown outcome. These may be controlled by test setup or a development-only selector; do not add fictional production endpoints.

## 12. Claude Code implementation order

### Step 1 — Inspect

Read applicable instructions, PLAN.md, Design.md, package.json, existing styles/components, and the supplied prototype. Preserve existing user files and compatible structure. Do not upgrade all dependencies blindly.

### Step 2 — Foundation

Configure theme, typography, controls, and shared Card/Button/Badge/Alert/Sheet components. Use the existing project primitive family. Build the actual workspace, not an unnecessary component-gallery page.

### Step 3 — Composition

Implement header, orders, chat, and recent actions using realistic synthetic text. The initial conversation must be empty, not a pre-rendered fake success story.

### Step 4 — Stateful HTTP mocks

Implement P0 requests and query hooks. Complete lookup, proposal, confirm/cancel, and denial. Refresh order/activity data after mutations.

### Step 5 — Complete states

Implement pending/executing/expired/failed/outcome_unknown, loading, empty/filter-empty, retry, New conversation, detail sheets, and mobile behavior.

### Step 6 — Browser verification

Run the application. Walk lookup → address change → unauthorized lookup. Inspect 1440×900, 1024×768, and 390×844. Fix clipping, overflow, scrolling, focus, and broken actions, then capture screenshots.

### Step 7 — Handoff

Provide exact run commands, completed requirements, remaining integration points, screenshots, and actual verification outcomes. Clearly label the result a mock frontend. Do not claim Azure, backend authorization, or Terminal 3 completion. Do not deploy in this stage; Vercel deployment belongs to TASKS.md Tasks 6–11. Write the handoff to docs/handoffs/task-3.md using the TASKS.md template.

### Execution discipline

Continue through routine fixes until the frontend acceptance criteria are met. Do not stop at scaffolding or ask the user to make routine choices already resolved here. If tooling or access truly blocks a check, complete the remaining work, record the exact limitation, and provide a concrete next action. Never replace verification with a blanket assurance.

## 13. Acceptance checklist

### Composition

- [ ] Chat is the largest visual region; context panels remain readable.
- [ ] No large meaningless blank areas or excessive card nesting.
- [ ] Text baselines, icons, controls, and spacing are consistent.
- [ ] Actual rendered components use the light/teal theme.
- [ ] Three columns fit at 1440px; no horizontal page overflow at 390px.

### Interaction

- [ ] Owned-order lookup returns the correct structured card.
- [ ] Proposal does not mutate before confirmation; success synchronizes the UI.
- [ ] Cancel, expiry, and duplicate confirmation behave correctly.
- [ ] Unauthorized input never displays another customer's order data.
- [ ] New conversation preserves order state and excludes old asynchronous replies.
- [ ] Keyboard, IME input, mobile panels, and focus restoration work.
- [ ] Failures preserve user text and offer appropriate recovery.
- [ ] Unknown outcomes never invite an unsafe duplicate write.

### Truthfulness and quality

- [ ] Mock labels are visible; no fake evidence or statistics.
- [ ] No console errors, type errors, or unresolved material warnings.
- [ ] Actual project typecheck/build commands pass.
- [ ] Four real screenshots exist: desktop-idle, desktop-proposal, desktop-denied, mobile-workspace.
- [ ] Screenshots come from the running app, not generated imagery.
- [ ] The README records commands, checks run, and remaining blockers.

## 14. Disallowed design drift

Do not add hero/pricing/testimonials/KPI charts. Do not turn the product into a neon security center. Do not introduce a second full UI library, paid-template dependency, or required proprietary font. Do not add attachments, arbitrary address entry, payments, or voice. Do not display inactive controls. Do not change API meaning or invent business outcomes for appearance.

## 15. Ready-to-use Claude Code instruction

Place the English PLAN.md and Design.md at the repository root, with the prototype pair under design-reference/. Then use:

```text
Read applicable AGENTS.md instructions, then read PLAN.md and Design.md completely.
Inspect design-reference/ParcelGuard Workspace.dc.html and its support.js as visual
and interaction references. Check the existing repository before modifying files.

Implement the ParcelGuard AI P0 frontend now. PLAN.md controls business rules and
API contracts; Design.md controls the visual and interaction specification.
Recreate the supplied prototype as normal React + TypeScript components with Vite,
Tailwind and shadcn/ui, preserving the existing compatible project structure.
Do not ship the prototype runtime, rename the prototype into an application entry
point, or embed it as the finished app.

Build the polished light-theme teal support workspace: orders on the left, chat in
the center, recent actions on the right, with responsive sheets on smaller screens.
Use one shadcn primitive family and implement all meaningful states and controls.

Route all data through the shared API client and stateful MSW handlers conforming
to PLAN.md. Complete lookup, address-change proposals, explicit confirm/cancel,
denial, loading, failure, expiry, and unknown-outcome states. Keep mock status
visible. Do not call Azure or Terminal 3 during this frontend stage.

Continue through implementation and routine fixes. Run typecheck/build, exercise
the core flows in a browser, inspect desktop/tablet/mobile layouts, repair defects,
and capture the screenshots required by Design.md. Do not stop at a scaffold,
static mockup, or description of intended work.

Finish with exact run commands, verification results, screenshot locations, and
remaining backend integration points. If a check is blocked by unavailable tooling,
state exactly what was not verified and provide the next action; never claim an
unrun check passed. Do not deploy in this stage (deployment is TASKS.md Task 6+) or
overwrite unrelated user work. Stay within the file ownership in TASKS.md §4.2.
```

## 16. Official references

Research date: 2026-09-07. Component documentation evolves; use the installed version's matching API.

1. [shadcn Introduction](https://ui.shadcn.com/docs) — selection and open code.
2. [shadcn Theming](https://ui.shadcn.com/docs/theming) — semantic variables.
3. [shadcn Components](https://ui.shadcn.com/docs/components) — component/variant lookup.
4. [shadcn Sheet](https://ui.shadcn.com/docs/components/sheet) — detail panels.
5. [shadcn Alert](https://ui.shadcn.com/docs/components/alert) — persistent feedback.
6. [Atlassian Foundations](https://atlassian.design/foundations) — design foundations.
7. [Atlassian Spacing](https://atlassian.design/foundations/spacing) — spacing reference.
8. [Radix Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) — primitive interaction foundations.
9. [IBM Carbon](https://carbondesignsystem.com/) — evaluated alternative.
10. [Microsoft Fluent 2](https://fluent2.microsoft.design/) — evaluated alternative.
