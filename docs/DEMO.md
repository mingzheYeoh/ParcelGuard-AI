# 3-minute recording script

**https://parcel-guard-ai.vercel.app**

---

## 录制前（必做，约 1 分钟）

```powershell
cd "C:\Users\Yeoh Ming Zhe\Documents\ParcelGuard-AI"
$env:DATABASE_URL = (Select-String -Path .vercel\.env.production.local -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line -replace '^DATABASE_URL=','' -replace '^"|"$',''
cd apps\api; pnpm db:seed; Remove-Item Env:\DATABASE_URL
```

第一行必须是 `Seeding ep-…neon.tech`。显示 `localhost` 说明刷错库了。

**预热**（不预热第一次确认要 6.6 秒，预热后 0.9 秒）：

```bash
node scripts/testcases.mjs https://parcel-guard-ai.vercel.app
```

跑完**再 seed 一次**（它改过数据），打开浏览器，**关掉 Demo details 面板**。开录。

---

## 00:00 — 介绍

不操作。

> "This is ParcelGuard — an AI assistant for order support. It can look up your orders and re-route a delivery. The interesting part isn't what it can do. It's what it can't do, and how you check afterwards."

---

## 00:20 — 第一步：查订单

**Type:**

```
Where is my order ORD-1002?
```

卡片出现后：

> "Every fact on that card came from a tool call against the database. The model can't state an order fact it didn't read — no invented tracking numbers, no guessed delivery dates."

---

## 00:45 — 第二步：请求改地址

**Type:**

```
Please change the address of ORD-1002 to Office
```

提案卡出现后：

> "Notice it hasn't changed anything. It's proposing. Nothing is written until a person clicks Confirm. That's the boundary — the assistant can ask, it can't act."

---

## 01:20 — 第三步：确认

**Click:** `Confirm change`

变绿后：

> "Now it's applied. Two rows appeared in Recent actions — the proposal, and the change."

---

## 01:45 — 第四步：试改一个已发货的订单

**Type:**

```
Change the address of ORD-1001 to Office
```

拒绝卡出现后：

> "That order already shipped. It doesn't apologise and try a different route — it's refused, and the refusal is recorded as a denial with a reason code. The same rule is enforced a second time inside a trusted enclave."

---

## 02:15 — 第五步：打开证据

**Click:** Recent actions 里的 `Updated ORD-1002 to Office` → 展开 `Technical evidence`

指着那四行：

> "Source: Terminal 3. This DID is the assistant's own identity — not the operator's. The provider reference is the contract id and sequence number Terminal 3 assigned to that execution; both came back from them, we didn't build the string.
>
> And it's verified — the session is pinned to Terminal 3's signed trust manifest. That pin covers RTMR3, the weaker of their two measurements. RTMR1 isn't published on testnet yet. So: attested, not fully attested."

---

## 02:50 — 收尾

不操作。

> "An authenticated agent identity authorised that change, inside an enclave we pinned against a signed manifest. Everything you saw is real, and RTMR1 is the one thing we can't claim yet."

---

## 录坏了怎么办

| 情况 | 处理 |
|---|---|
| 助手回 "already your Office address" | ORD-1002 被上一条消耗了 → 重新 seed，或改用 **ORD-1004** 并说 "to Home" |
| 确认超过 5 秒 | 冷启动 → 停录，跑一次 testcases 预热，重新 seed，重录 |
| Demo details 显示 Not connected | 正常，冷实例尚未证明过 → 先聊一句再开面板 |

---

## 不要说的话

- ❌ "TEE-verified" — 只锚定了 RTMR3，要说 "attested against the signed manifest"
- ❌ "Terminal 3 enforces the agent's permissions" — 实测未授权也能调用；约束来自应用层和 enclave 规则
- ❌ "the enclave verifies the order" — enclave 看不到数据库，只对给它的事实执行规则
