# Progress

**Last updated:** 2026-07-17 by Murad, session 2
**Current phase:** 0 — spike
**Days elapsed:** 1 / 21

## Status
Phase 0 CLOSED — all 12 checks pass. Ahad's 8 upstream checks pass, including
the two make-or-break ones (HubSpot filters deals by date server-side, and the
contact↔deal email join works). HubSpot stays; no CRM switch needed. Murad's 4
downstream checks pass too: `docker-compose.yml` up, n8n reachable at
localhost:5678, postgres healthy, Code node ran `{hello:"world"}`, exported to
`test-workflow.json` (confirmed Code node JS is a plain string in the JSON —
the fact the build step depends on), re-imported into n8n and confirmed it
still runs. Spike code lives in `spike/` (uncommitted, throwaway) and gets
deleted now that both halves are proven.

## Done
- [x] Phase 0 — spike (12/12 — all checks pass)

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

## Problems solved (never re-solve these)
| Problem | Cause | Fix |
|---|---|---|

## Blockers
| Blocker | Owner | Since | Needs |
|---|---|---|---|

## Next session — start here
1. Phase 0 closed (12/12). Delete `test-workflow.json` / `spike/` (throwaway,
   not in repo layout), bump "Current phase" to 1.
2. Start Phase 1 (Murad's side): `package.json` + Vitest setup,
   `test/fixtures/clean.json` (7 charges / 6 deals worked example, contract shape),
   `src/matcher.js` stub (correct signature, returns empty, one passing test),
   `build/inject.js` proven against the Phase 0 exported workflow.

## Ideas parked (NOT doing, do not start)
- Web dashboard — README extensions only
- Multi-currency — v2
- GHL adapter — only if a paying client asks

## Decisions log
| Date | Decision | Reason |
|---|---|---|
