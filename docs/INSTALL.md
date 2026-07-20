# Install

20-minute setup on a machine that has never seen this repo. Follow in order.

**Status note:** this doc is written against the finished Phase 5 assembly.
As of this draft, Phase 5 is still in progress (nodes 1-6 built, nodes 7-14
being wired). Steps 1-4 below are already accurate and testable today; steps
5-7 assume the full `workflow/workflow.json` exists.

---

## 1. Prerequisites

- Docker Desktop (or Docker Engine + Compose) installed and running
- A Stripe account (test mode is fine — this is what the seeder uses)
- A HubSpot account (free tier works)
- A Slack workspace you can add an incoming webhook to
- A Google account with access to Google Cloud Console

## 2. Clone and start the stack

```bash
git clone https://github.com/Ahadasim08/Reconciliation-Bot-n8n.git
cd Reconciliation-Bot-n8n
docker compose up -d
```

Wait for both containers to report healthy:

```bash
docker compose ps
```

n8n is now at [http://localhost:5678](http://localhost:5678). First visit
prompts you to create an owner account — do that.

## 3. Load the database schema

The `runs` / `exceptions` / `matches` tables aren't created automatically.
Load them once:

```bash
docker compose exec -T postgres psql -U n8n -d n8n < db/schema.sql
```

Re-running this is safe — the schema uses `CREATE TABLE IF NOT EXISTS`.

## 4. Get the four credentials

Copy `.env.example` to `.env` and fill in real values as you obtain them.
**`.env` is a reference checklist only** — the actual credentials go into
n8n's own credential store in step 5, never into this file for real use.

| Credential | Where to get it | Scopes needed |
|---|---|---|
| Stripe secret key | Dashboard → Developers → API keys → Secret key (test mode) | none — key alone is scoped |
| HubSpot private-app token | Settings → Integrations → Private Apps | `crm.objects.contacts.read`, `crm.objects.deals.read` (add `.write` variants too if you'll run the seeder) |
| Slack incoming webhook URL | api.slack.com → your app → Incoming Webhooks → Add New Webhook to Workspace | — |
| Google service-account JSON key | Cloud Console → IAM → Service Accounts → Keys → Create key (JSON). Enable the Sheets API. Share your target Sheet with the service account's `client_email` as Editor. | Sheets API enabled on the project |

## 5. Store credentials in n8n

In the n8n UI: **Credentials → Add Credential**, once per service:

- **Stripe API** — paste the secret key
- **HubSpot** — paste the private-app token
- **Google Sheets** — upload the service-account JSON, or paste its fields
- **Postgres** — for the workflow's Postgres node (writes `runs`/`exceptions`/
  `matches`). This is the *same* database n8n itself runs on, not a separate
  service — use the values from `docker-compose.yml`: host `postgres`, port
  `5432`, database `n8n`, user `n8n`, password `n8n`. n8n's own
  `DB_POSTGRESDB_*` env vars only cover n8n's internal storage; the Postgres
  node in the canvas needs its own credential entry pointing at the same DB.
- Slack does **not** get a stored credential — the webhook URL is used
  directly in the HTTP Request node that posts to Slack

## 6. Import the workflow

**Workflows → Import from File** → select `workflow/workflow.json` from
this repo (not `workflow.template.json` — that one has empty Code nodes).

Open the imported workflow and re-select the credential for each node that
needs one (Stripe node, HubSpot nodes, Google Sheets node, Postgres node) —
imports don't carry credential bindings across n8n instances, only the
credential *name* reference.

## 7. Activate and test

1. Click **Execute Workflow** once manually to confirm every node runs
   green, no red error badges
2. Toggle **Active** in the top right — this arms the Schedule Trigger
   (2am daily by default)
3. To test without waiting for 2am: use **Execute Workflow** again, or
   temporarily edit the Schedule Trigger's cron expression, run once, then
   change it back

If a node errors, the credential from step 6 is the most common cause —
re-check it's actually selected on that specific node, not just present in
the credential store.

**Error branches:** the fetch nodes (Stripe, HubSpot deals, contact join) and
the write nodes (Postgres, Sheets) each have an error output wired to a
shared "run failed" chain — a Postgres `runs` insert with `status='failed'`
plus a Slack alert. To confirm this actually works, temporarily break a
credential (wrong key) on one fetch node, execute, and check: the run errors
out cleanly, `runs` gets a `failed` row, and Slack posts the alert. Undo the
credential change after.

## 8. Seed a test dataset (optional, for demo/dev only)

Not required for a real install — only for generating fake data to watch
the bot catch exceptions.

```bash
cd seeder
pip install -r requirements.txt
python seed.py
```

Writes `expected.json` — the scorecard of what the workflow should report
back exactly. Run `python teardown.py` afterward to clean up the tagged
Stripe/HubSpot records.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| n8n container won't start | Postgres not healthy yet — `docker compose ps`, wait, or check `docker compose logs postgres` |
| Node shows a credential error | Re-select the credential on that node after import (step 6) |
| HubSpot node returns 403 | Token scopes too narrow — see the scopes column in step 4 |
| Sheets node fails to write | Sheet not shared with the service account's `client_email`, or Sheets API not enabled on the GCP project |
| Seeder Stripe calls fail | Using a live key instead of a test key, or the key was revoked |
| Postgres node errors, n8n itself works fine | Postgres node needs its own credential (step 5) — n8n's own `DB_POSTGRESDB_*` env vars don't cover it |
