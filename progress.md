# Progress

**Last updated:** 2026-07-17 by Murad, session 3
**Current phase:** 1 — foundations
**Days elapsed:** 1 / 21

## Phase 0 — 12-check results
Ahad ran the upstream checks 2026-07-17 (Stripe test mode, HubSpot free tier private
app, Slack incoming webhook, Google Sheets via service account).

| # | Check | Owner | Result | Detail |
|---|---|---|---|---|
| 1 | Stripe: create charge (test mode) | Ahad | PASS | test token `tok_visa` |
| 2 | Stripe: list charges by `created` date filter | Ahad | PASS | charge returned in date window |
| 3 | Stripe: create refund | Ahad | PASS | |
| 4 | HubSpot: create contact + deal, associated | Ahad | PASS | free tier private-app token |
| 5 | HubSpot: fetch deals by date range (server-side) | Ahad | PASS | **the big one — createdate GTE/LTE search works** |
| 6 | HubSpot: fetch contact from deal (email join key) | Ahad | PASS | **email lives on contact, join confirmed** |
| 7 | Slack: post via incoming webhook | Ahad | PASS | message appeared |
| 8 | Google Sheets: append row (service account) | Ahad | PASS | shared sheet with SA email as Editor |
| 9 | docker compose up: n8n + Postgres at :5678 | Murad | PASS | |
| 10 | n8n Code node executes `return [{json:{hello:"world"}}]` | Murad | PASS | |
| 11 | Export workflow JSON: Code node JS is a string | Murad | PASS | build step depends on this |
| 12 | Re-import the exported JSON: still works | Murad | PASS | |

## Status
Phase 0 CLOSED — all 12 checks passed (Ahad confirmed his 8; Murad's 4 were
already done session 2). Phase 1 started, Murad's half done: `package.json`
+ Vitest wired (`npm test` green, 3 tests), `test/fixtures/clean.json` (7
charges / 6 deals, contract shape, one intentionally unmatched charge —
David Reyes, `ch_007` — per PLAN.md's stated 7/6 split), `src/matcher.js`
stub (correct `match(payments, deals, config)` signature, returns the
empty four-bucket shape), and `build/inject.js` (generic
`injectCode(workflow, mappings)` — reads a src file verbatim into a named
Code node's `parameters.jsCode`). Proven against the real Phase 0 n8n
export, preserved as `test/fixtures/n8n-code-node-export.json` (root copy
`My workflow.json` deleted — throwaway, not in repo layout, content
survives as this fixture). Ahad's Phase 1 half (schema.sql, .env.example,
credentials in n8n's store) not started yet.

## Done
- [x] docker-compose.yml written (n8n + Postgres)
- [x] Phase 0 checks 1-8 (Ahad — Stripe, CRM, Slack, Sheets) — all passed
- [x] Phase 0 check 9 — `docker compose up` → n8n loads at localhost:5678
- [x] Phase 0 check 10 — Code node `return [{json:{hello:"world"}}]` executes
- [x] Phase 0 check 11 — export workflow JSON, confirm Code node JS is a string
- [x] Phase 0 check 12 — re-import JSON, confirm it works
- [x] Phase 0 — ALL 12 CHECKS PASSED, phase closed
- [x] package.json + Vitest — `npm test` passes (3/3)
- [x] test/fixtures/clean.json — 7 charges, 6 deals, contract shape
- [x] src/matcher.js — stub, correct signature, one passing test
- [x] build/inject.js — proven against real n8n export, 2 passing tests
- [ ] Ahad's Phase 1: docker-compose (done, uncommitted), db/schema.sql, .env.example, 4 credentials in n8n store

## Session log
### Session 1 — 2026-07-17
- Wrote `docker-compose.yml`: n8n + Postgres 16-alpine, healthcheck-gated
  startup, named volumes (`postgres_data`, `n8n_data`)
- `docker compose up -d` — image pull + start confirmed, both containers
  healthy/up
- Next: manual UI steps in n8n (owner account, Code node, export/import)

### Session 2 — 2026-07-17
- Ran Code node `return [{json:{hello:"world"}}]` in n8n UI — executed
- Exported workflow → `test-workflow.json`. Confirmed Code node's `jsCode`
  is a plain JSON string (not nested object) — checks 11
- Re-imported that JSON into n8n, confirmed it still runs — check 12
- Murad's 4 checks (9-12) all done. Ahad's 8 (Stripe/CRM/Slack/Sheets) still
  not started — this is what blocks Phase 0 exit and Phase 1 start
- `test-workflow.json` is throwaway spike output, not part of repo layout
  (see PLAN.md section 4) — delete before Phase 1, or leave until Ahad's
  checks confirm the pattern once more

### Session 3 — 2026-07-17
- Ahad confirmed all 8 spike checks passed → Phase 0 closed, all 12 green
- Started Phase 1 (Murad's half):
  - `npm init`, added Vitest, `npm test` script
  - `test/fixtures/clean.json`: 7 charges / 6 deals, contract shape,
    hand-written (David Reyes charge deliberately has no matching deal,
    per the 7/6 split PLAN.md calls for)
  - `src/matcher.js`: stub with the real signature
    `match(payments, deals, config)`, returns
    `{matched:[], review:[], unmatchedPayments:[], unmatchedDeals:[]}`
  - `build/inject.js`: `injectCode(workflow, mappings)` reads a src file's
    text into a named node's `parameters.jsCode`. Proved against the real
    Phase 0 export (re-exported by Murad as `My workflow.json`, copied into
    `test/fixtures/n8n-code-node-export.json`, root copy deleted after)
  - `npm test` → 3/3 passing
- Ahad's Phase 1 half (schema.sql, .env.example, credentials) not started

## Problems solved (never re-solve these)
| Problem | Cause | Fix |
|---|---|---|

## Blockers
| Blocker | Owner | Since | Needs |
|---|---|---|---|

## Next session — start here
1. Delete `test-workflow.json` / `spike/` (throwaway, not in repo layout) if
   not already gone.
2. Ahad: Phase 1 half — `db/schema.sql` (runs/exceptions/matches tables per
   PLAN.md section 6), `.env.example`, all 4 credentials stored in n8n
   (never in repo). Commit `docker-compose.yml` (currently untracked).
3. Both: write `docs/CONTRACT.md` from PLAN.md section 2, sign off — this
   is a Phase 1 exit criterion and CLAUDE.md step 3 expects it to exist.
4. Do NOT start Phase 2 (seeder) or Phase 3 (real matcher logic) until
   Phase 1 fully closes — one phase per session, and Ahad's half is still open.

## Ideas parked (NOT doing, do not start)
- Web dashboard — README extensions only
- Multi-currency — v2
- GHL adapter — only if a paying client asks

## Decisions log
| Date | Decision | Reason |
|---|---|---|
