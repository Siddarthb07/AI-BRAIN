# LLM Council Review — AI-BRAIN Upgrade Plan

**Date:** 2026-05-24  
**Subject:** [UPGRADE_PLAN.md](./UPGRADE_PLAN.md) v2026-05-24  
**Method:** 5-member simulated council (distinct expert personas), 2 debate rounds, moderator synthesis  
**Output:** [UPGRADE_PLAN_v2.md](./UPGRADE_PLAN_v2.md) (revised plan)

---

## Council roster

| # | Persona | Lens |
|---|---------|------|
| 1 | **Atlas** — Product Strategist | Scope, sequencing, user value, timeline |
| 2 | **Nova** — Staff Engineer | Architecture, deps, 16 GB constraints, testability |
| 3 | **Mira** — UX Lead | Work-mode UI, Claude/Obsidian parity, cut list |
| 4 | **Cipher** — Security & DevOps | CI, secrets, CORS, release gates |
| 5 | **Rex** — Skeptic / Portfolio Advisor | Focus, rebrand, kill features, interview story |

---

## Round 1 — Individual ratings

### Member 1: Atlas (Product Strategist)

| Dimension | Score | Note |
|-----------|-------|------|
| Vision clarity | **9/10** | Vault-first + honest gaps is correct north star |
| Scope realism | **4/10** | 12 weeks × solo dev × this surface area = fantasy |
| Sequencing | **7/10** | Phase 0 before vault is right; Phase 1 is overloaded |
| User value | **8/10** | Save-to-vault + RAG over *your* notes = real product |
| Portfolio value | **6/10** | JARVIS branding undermines “measurable local RAG tool” story |
| **Overall** | **6.2/10** | Great diagnosis, too much prescription |

**Top strengths:** Honest gap analysis · Vault as source of truth · Kill fake data · Success metrics table · UI §13 identifies real problem (3D-first)

**Top flaws:** Phase 1 bundles 4 products · Hybrid FTS + tool-calling too early · recall@0.7 before baseline exists · Voice/studio still in roadmap noise · 12-week calendar not credible

**Must keep:** Vault save · Vault sync → RAG v1 · Persistent chat · Work-mode default UI · Zero silent fallbacks

**Must cut (for now):** Hybrid BM25+vector (Phase 2+) · Tool-calling agent loop · Wikilinks/backlinks · Light theme · YouTube ingest · Weekly review automation

**Timeline vote:** **18–22 weeks** solo; Phase 1 alone = **4–5 weeks**

---

### Member 2: Nova (Staff Engineer)

| Dimension | Score | Note |
|-----------|-------|------|
| Architecture | **7/10** | Vault → Qdrant cache is sound; Tasks runner premature |
| Technical debt | **8/10** | `.gitignore`, fallbacks, MD5 IDs correctly flagged |
| RAG approach | **5/10** | Hybrid FTS + Qdrant + watch mode = 3 indexing systems at once |
| LLM stack | **7/10** | Token limits + honest offline good; model router early |
| Testability | **4/10** | Tests listed P1 but no release gate |
| Phase 0 adequacy | **6/10** | Missing pytest in Phase 0 explicitly |
| **Overall** | **6.0/10** | Right direction, wrong parallelism |

**Position:** Ship **Qdrant-only vault sync first**. Add SQLite FTS in v2.2 only if eval shows recall gaps. Tool-calling only after manual “save + search + cite” loop works for 2 weeks of dogfooding.

**Split Phase 1:**
- **1a** (week 2): Vault write path + API + jail tests  
- **1b** (week 3): Vault sync → Qdrant + cite in chat  
- **1c** (week 4–5): SQLite chat + minimal Work UI + save button  

**Disagrees with Atlas:** Don’t defer **all** design tokens — ship `tokens.css` + 5 primitives in Phase 1 or every panel refactor doubles work.

**Disagrees with Mira:** Full 4-column AppShell not required for v2.0.0 — **2-column Work mode** (sidebar + main) is enough.

---

### Member 3: Mira (UX Lead)

| Dimension | Score | Note |
|-----------|-------|------|
| IA / layout | **8/10** | Work mode default is non-negotiable |
| Design system | **6/10** | §13.4 is right but too many components for v2 |
| Chat UX spec | **8/10** | Thread sidebar + save + streaming = core |
| Vault UX spec | **7/10** | Full tree + backlinks is v2.2, not v2.0 |
| A11y targets | **6/10** | Lighthouse 92 is Phase 4, not Phase 2 |
| Phase alignment | **5/10** | Too much UI deferred to Phase 2 that defines “real product” |
| **Overall** | **6.7/10** | Vision strong, scope bloated |

**MVP UI for v2.0.0 (IN):**
- Work layout: icon rail + context sidebar + main (no 3D default)  
- Chat with **Save to vault** on every assistant message  
- Vault **flat list** + note viewer (not full tree v1)  
- Status bar: Ollama / Qdrant / vault path  
- Settings modal: vault path, model, auto-save toggle  
- Empty states + demo banner  

**Cut from §13 for v2.0:** Command palette · Split preview · `@` mentions · Backlinks · Drag reorder · Storybook · Light theme · Resizable panels

**Argues:** “Engineers can add save button to old layout” **fails** — users still see 60% 3D brain and leave. **Layout flip is Phase 1**, not Phase 2.

**Tech vote:** Tailwind + lucide + Inter; 5 primitives: Button, Input, Badge, Dialog, Toast.

---

### Member 4: Cipher (Security & DevOps)

| Dimension | Score | Note |
|-----------|-------|------|
| Security roadmap | **6/10** | Vault jail + CORS listed but no test gates |
| DevOps / CI | **4/10** | CI in P1; should be Phase 0 |
| Docker strategy | **5/10** | Prod profile Phase 4; dev-mode default dangerous |
| Secrets handling | **5/10** | OAuth encryption correctly listed but undated |
| Production readiness | **4/10** | No release checklist |
| **Overall** | **4.8/10** | Plan knows the gaps, doesn’t block on them |

**Phase 0 must include:** pytest smoke (health, vault jail path traversal, fallback repos disabled when `DEMO_MODE=0`)

**v2.0.0 release blockers:** Fixed `.gitignore` · LICENSE · CORS · vault jail tests · no fake data in API responses

**OAuth encryption:** Can slip to **v2.1** if Calendar panel shows **“Beta — tokens stored plain locally”**

**Studio:** Remove from default `docker-compose.yml`; separate `compose.studio.yml`

**Disagrees with Rex:** Don’t delete BrainGraph code — gate behind `GRAPH_MODE=1` and lazy route

---

### Member 5: Rex (Skeptic / Portfolio Advisor)

| Dimension | Score | Note |
|-----------|-------|------|
| Focus | **4/10** | Plan is 3 products in a trenchcoat |
| Differentiation | **5/10** | “Local Claude over Obsidian vault” is clear; JARVIS isn’t |
| Interview story | **5/10** | “I built JARVIS” vs “I built vault-native RAG with eval” — second wins |
| Maintenance burden | **3/10** | Voice + studio + 3D + calendar + agent loop = unmaintainable solo |
| Honest scope | **6/10** | §8 “what not to build” good; roadmap ignores it |
| **Overall** | **4.6/10** | Best parts buried under feature avalanche |

**90-day MVP — max 5 capabilities:**
1. Save assistant output to Obsidian vault path  
2. Ask questions over vault (Qdrant sync) with file citations  
3. Persistent chat (SQLite)  
4. Work-mode UI (no 3D default, no fake data)  
5. Honest system status (Ollama/Qdrant/vault/sync)

**Everything else:** GitHub ingest UI, voice, studio, calendar, tasks agent, weekly review, hybrid FTS → **backlog or kill**

**Rebrand vote:** Use **VaultMind** in docs/README immediately; keep repo name until v2 tag

**Kill vote:** 3D as default **forever**; archive “Arcade mode” to optional demo route only

---

## Round 2 — Debate highlights

### Debate A: Is Work-mode UI Phase 1 or Phase 2?

| | Argument |
|---|----------|
| **Nova** | Save button on existing layout ships faster; refactor shell later |
| **Mira** | 3D-first layout IS the bug. Users won’t reach save button. Layout flip = Phase 1 |
| **Atlas** | Split difference: Phase 1 week 4–5 UI, not week 1 |
| **Rex** | Mira wins. Demo dies on first impression |

**🏆 Winner: Mira** — Minimal **AppShell + Work layout** is Phase 1, but not full §13 (no command palette, no split preview).

---

### Debate B: Hybrid FTS + Qdrant in Phase 2?

| | Argument |
|---|----------|
| **Atlas** | Defer hybrid to v2.2+; eval first |
| **Nova** | Qdrant-only sufficient for 50–500 notes; FTS adds second index to maintain |
| **Cipher** | SQLite FTS ok if it replaces keyword fallback in `rag.py`, not parallel system |
| **Mira** | Users need *fast* vault filename search in UI — that’s UI filter, not BM25 |

**🏆 Winner: Nova + Atlas** — Phase 2 = **Qdrant citations + UI text filter**. Hybrid FTS moved to **v2.2 optional** only if eval `< 0.5` recall@5.

---

### Debate C: Tool-calling agent loop in Phase 3?

| | Argument |
|---|----------|
| **Atlas** | Defer to v3.1 or never for solo dev |
| **Nova** | Manual tools via buttons first: “Search vault”, “Save”, “Sync” |
| **Rex** | Agent loop is resume bait, not user value for v2 |
| **Cipher** | Agent loop increases attack surface without auth |

**🏆 Winner: Rex + Nova** — **No autonomous tool loop in v3.0.** v3.0 = proactive brief + confirmed actions only. Tool-calling → **v3.2 backlog**.

---

### Debate D: 12-week vs 18-week timeline?

| | Argument |
|---|----------|
| **Atlas** | 18–22 weeks realistic |
| **Nova** | 16 weeks if Phase 1 split and cuts honored |
| **Mira** | UI MVP scope reduction saves 2–3 weeks |
| **Rex** | 90-day MVP (5 caps) achievable in **10–12 weeks** if everything else frozen |

**🏆 Winner: Moderator compromise** — **16 weeks** to v3.0 with reduced scope; **6 weeks** to v2.0 MVP milestone.

---

## Council scorecard (aggregate)

| Dimension | Atlas | Nova | Mira | Cipher | Rex | **Avg** |
|-----------|-------|------|------|--------|-----|---------|
| Vision / strategy | 9 | 7 | 8 | 5 | 5 | **6.8** |
| Scope realism | 4 | 5 | 5 | 4 | 4 | **4.4** |
| Technical plan | 7 | 7 | 6 | 5 | 5 | **6.0** |
| UI plan | 7 | 6 | 8 | 5 | 6 | **6.4** |
| Security / DevOps | 6 | 6 | 5 | 5 | 4 | **5.2** |
| Sequencing | 7 | 6 | 5 | 6 | 4 | **5.6** |
| **Overall** | **6.2** | **6.0** | **6.7** | **4.8** | **4.6** | **5.7/10** |

**Council verdict:** Plan v1 is an **excellent diagnosis** and a **over-scoped prescription**. Average **5.7/10** as written; **8.5/10** if reduced to council MVP and timeline extended.

---

## Consensus decisions (10)

1. **Rename in docs** to **VaultMind** (working title); drop JARVIS from system prompt in Phase 0  
2. **Phase 0 adds pytest** — health, vault jail, no fallbacks when `DEMO_MODE=0`  
3. **Phase 1 split** into 1a write / 1b index / 1c UI+chat  
4. **Work-mode layout** ships in Phase 1 (minimal AppShell); 3D hidden by default  
5. **v2.0.0 scope box** — 5 capabilities only (see revised plan)  
6. **Defer hybrid FTS** to v2.2 contingent on eval  
7. **Defer tool-calling agent** to backlog; use explicit UI actions  
8. **Defer voice, studio, calendar** from v2.0/v2.1 critical path — mark Calendar **beta**  
9. **Timeline:** 6 weeks → v2.0 MVP, 16 weeks → v3.0 (reduced), not 12 weeks full plan  
10. **Success metric change:** add **“dogfood 7 days straight”** before v2.0 tag

---

## Dissent logged (minority opinions)

| Member | Wanted | Overruled because |
|--------|--------|-------------------|
| Rex | Delete BrainGraph entirely | Cipher: keep lazy demo route for portfolio video |
| Nova | No Tailwind until Phase 2 | Mira: inline styles already unmaintainable |
| Cipher | OAuth encryption blocks v2.0 | Atlas: calendar beta with disclosure OK for v2.0 |
| Atlas | Wikilinks in v2.1 | Nova: parsing wikilinks adds scope; plain markdown links first |
| Mira | Command palette in v2.1 | Atlas: defer to v2.2; sidebar navigation enough |

---

## Moderator synthesis

The original plan correctly identifies **why v1 fails** (fake data, no vault, 3D demo UI). It fails **scheduling** by treating Claude parity, Obsidian parity, JARVIS agents, and a UI redesign as one 12-week linear project.

**Revised strategy:** One **90-day spine** — *vault write → vault read → chat memory → honest UI* — with everything else explicitly **Tier B (post-v2)** or **Tier C (kill/demo only)**.

See **[UPGRADE_PLAN_v2.md](./UPGRADE_PLAN_v2.md)** for the merged roadmap.
