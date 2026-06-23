# MapleAgent — launch tweet thread (draft)

> NOTE: link to the technical breakdown points to **blog.vellum.network/posts/permissioned-pulls/** (the published deep-dive). If you'd rather point at fieldguide.claude.do, swap the URL in tweet 2.

---

**1/**
We've been going deep on Solana's new native **Subscriptions & Allowances** — a standalone, audited on-chain program that lets you grant a *bounded, revocable* right to pull funds.

Sign once. Capped forever after. It's a genuinely new authorization layer, and it's very cool. 🧵

---

**2/**
If you want to actually understand it — the three account types, the full pull gate-sequence, the scary-looking `u64::MAX` approval and why it's safe — we wrote what we think is the best technical breakdown on the internet:

👉 https://blog.vellum.network/posts/permissioned-pulls/

---

**3/**
But reading about new tech only gets you so far.

So we got our hands dirty and built a demo app to put it through its paces.

Meet **MapleAgent**. 🍁

---

**4/**
The pitch: **give an AI agent a budget, not your wallet.**

You set a capped, expiring allowance → the agent autonomously pays for tools → every spend is receipted → you revoke anytime → and any post-revoke spend is *blocked by the program itself*.

Exactly the fixed-delegation pattern.

---

**5/**
Why it matters: agentic commerce needs **bounded autonomy**. Not your keys in a bot. Not a custodian. A cap the chain enforces.

Live demo 👉 https://maple.vellum.network
Code 👉 https://github.com/chaintail/maple-agent

Built on @solana. 🍁

---

## Notes for posting
- Thread is 5 tweets; each is under ~280 chars.
- Tweet 3 is the pivot ("got our hands dirty") — keep it short for punch.
- Optional: attach the hero image to tweet 1 or tweet 4.
- Optional 6th tweet for credits: "Built by Liam C., Mikail R., and Claude-do for Superteam Canada."
