# Progress

**Last updated:** not started yet
**Current phase:** 0 — spike
**Days elapsed:** 0 / 21

## Status
Phase 0 in progress. Ahad's half of the spike is done — all 8 upstream checks pass,
including the two make-or-break ones (HubSpot filters deals by date server-side, and
the contact↔deal email join works). HubSpot stays; no CRM switch needed. Murad's 4
downstream checks (docker/n8n/export/import) are still pending. Phase 0 closes only
when all 12 pass. Spike code lives in `spike/` (uncommitted, throwaway) and gets
deleted once Murad's half is proven.

## Done
- [ ] Phase 0 — spike (8/12 — Ahad done, Murad pending)

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
| 9 | docker compose up: n8n + Postgres at :5678 | Murad | pending | |
| 10 | n8n Code node executes `return [{json:{hello:"world"}}]` | Murad | pending | |
| 11 | Export workflow JSON: Code node JS is a string | Murad | pending | build step depends on this |
| 12 | Re-import the exported JSON: still works | Murad | pending | |

## Session log
(empty — first entry gets added when the first session is closed)

## Problems solved (never re-solve these)
| Problem | Cause | Fix |
|---|---|---|

## Blockers
| Blocker | Owner | Since | Needs |
|---|---|---|---|

## Next session — start here
1. Run Phase 0 (the spike) — see PLAN.md section 6. Ahad proves the Stripe/CRM/Slack/Sheets
   checks, Murad proves the Docker + n8n + Code node export/import checks.
2. Fill in this file's "Session log" and the 12-check table once Phase 0 is done.

## Ideas parked (NOT doing, do not start)
- Web dashboard — README extensions only
- Multi-currency — v2
- GHL adapter — only if a paying client asks

## Decisions log
| Date | Decision | Reason |
|---|---|---|
