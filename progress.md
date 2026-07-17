# Progress

**Last updated:** 2026-07-17 by Ahad, session 4
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
Phase 0 CLOSED — all 12 checks passed. Phase 1 nearly closed. Murad's half done
(session 3): `package.json` + Vitest (`npm test` green, 3 tests),
`test/fixtures/clean.json` (7 charges / 6 deals, David Reyes `ch_007` deliberately
unmatched), `src/matcher.js` stub (`match(payments, deals, config)` → empty
four-bucket shape), `build/inject.js` (`injectCode(workflow, mappings)`, proven
against the real Phase 0 export at `test/fixtures/n8n-code-node-export.json`).
Ahad's half done (session 4): `db/schema.sql` (runs/exceptions/matches with the
UNIQUE idempotency key + CHECK constraints on the 5 exception types), `.env.example`
(all 4 creds documented), and `docs/CONTRACT.md` (the frozen data-shape agreement,
transcribed from PLAN.md §2, matched to clean.json + matcher.js). `spike/` deleted.
`npm test` still green (3/3).

Three things remain to fully close Phase 1, all needing the live n8n environment
(Docker is NOT installed on Ahad's machine — Murad has the container env): (a) load
`db/schema.sql` into the running Postgres; (b) store the 4 API credentials in n8n's
credential store via the UI; (c) both sign off on `docs/CONTRACT.md` (checkboxes
still unchecked). Until those close, DO NOT start Phase 2 (seeder).

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
- [x] docker-compose.yml committed (Murad; was Ahad's PLAN.md item)
- [x] db/schema.sql — runs/exceptions/matches, UNIQUE idempotency key, type CHECKs
- [x] .env.example — all 4 credentials documented
- [x] docs/CONTRACT.md — written, transcribed from PLAN.md §2 (sign-off pending)
- [x] spike/ deleted (Phase 0 throwaway)
- [ ] Load db/schema.sql into running Postgres (needs Docker/n8n up)
- [ ] 4 credentials stored in n8n credential store (manual UI, needs n8n up)
- [ ] docs/CONTRACT.md signed off by BOTH (Phase 1 exit criterion)

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

### Session 4 — 2026-07-17 (Ahad)
- Deleted throwaway `spike/` (Phase 0 closed and confirmed).
- Wrote `db/schema.sql`: `runs` / `exceptions` / `matches` per PLAN.md §6, plus
  CHECK constraints enforcing the 5 exception types and the `status` enum, and
  indexes on run_id / resolved / email. Could NOT live-load it — Docker isn't
  installed on Ahad's machine.
- Wrote `.env.example`: Postgres (mirrors compose) + the 4 API creds, with a note
  that the API creds go into n8n's credential store, not this file.
- Wrote `docs/CONTRACT.md`: payment/deal input shapes, matcher output shape, the 5
  exception types, contract rules, and a sign-off block (both boxes still unchecked).
- Verified `npm test` green (3/3). Discarded an incidental `package-lock.json`
  mutation from `npm install` (it pruned cross-platform optional deps) to keep
  Murad's lockfile intact.
- Committed + pushed (12fe273). Repo pushed to github.com/Ahadasim08/Reconciliation-Bot-n8n.

## Problems solved (never re-solve these)
| Problem | Cause | Fix |
|---|---|---|
| `git push` → 403 "denied to ai-and-beyond" | Windows credential manager cached a different GitHub account | Push via gh's helper: `git -c credential.helper= -c credential.https://github.com.helper='!gh auth git-credential' push`. Long-term: clear the stale cred from Windows Credential Manager. |
| `npm install` rewrites package-lock.json | npm prunes other-platform optional native deps on install | Don't commit that diff — `git checkout -- package-lock.json`. Lockfile stays cross-platform. |

## Blockers
| Blocker | Owner | Since | Needs |
|---|---|---|---|
| Can't load schema / store n8n creds / run n8n locally | Ahad | S4 | Docker Desktop on Ahad's machine, OR do these on Murad's n8n instance |
| CONTRACT.md not signed off | Both | S4 | Murad reads it, confirms downstream consumes these exact shapes |

## Next session — start here
1. Finish closing Phase 1 (needs live n8n — Murad's box or install Docker on Ahad's):
   - Load `db/schema.sql` into the running Postgres.
   - Store the 4 API credentials (Stripe / HubSpot / Slack / Sheets) in n8n's
     credential store via the UI. Never in the repo.
   - Murad reviews `docs/CONTRACT.md` and both check the sign-off boxes. This is
     the Phase 1 exit criterion.
2. Minor: reconcile the package.json (0.1.0) vs package-lock.json (1.0.0) version
   mismatch (Murad's files).
3. ONLY after all of the above: begin Phase 2 (seeder — Ahad) / Phase 3 (matcher —
   Murad). One phase per session. Do NOT start Phase 2 while Phase 1 sign-off is open.

## Ideas parked (NOT doing, do not start)
- Web dashboard — README extensions only
- Multi-currency — v2
- GHL adapter — only if a paying client asks

## Decisions log
| Date | Decision | Reason |
|---|---|---|
| 2026-07-17 | Keep HubSpot as the CRM | Phase 0 checks 5 & 6 passed — free tier filters deals by date server-side and the contact→deal email join works. No need for the Pipedrive fallback (PLAN.md §8). |
| 2026-07-17 | API creds live in n8n's credential store, not `.env` | `.env.example` is the operator checklist; secrets never touch the repo. |
| 2026-07-17 | schema.sql adds CHECK constraints on exception_type/status | Enforces the documented enums at the DB layer without changing the PLAN.md §6 column shape. |
