"""Creates the Phase 2 dataset in real Stripe test mode + real HubSpot.

Reads seeder/scenarios.py (the single source of truth), creates matching
Stripe charges and HubSpot contact+deal pairs, tags every record so
teardown.py can find them, and writes seeder/expected.json — the scorecard
the matcher's output gets checked against later.

Usage:
  python seed.py --dry-run     # print what would be created, no network calls
  python seed.py               # create it for real
  python seed.py --force       # skip the "existing seed batch found" guard

Requires STRIPE_SECRET_KEY and HUBSPOT_TOKEN in the environment (.env).
The HubSpot token needs write scopes: crm.objects.contacts.write,
crm.objects.deals.write (read scopes alone are not enough — this script
creates records, Phase 5's fetch nodes are what only need read).
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
import stripe
from dotenv import load_dotenv

import scenarios as sc

HUBSPOT_BASE = "https://api.hubapi.com"
SEED_TAG_PREFIX = "seed:batch-"
HERE = Path(__file__).parent


def hubspot_request(token, method, path, **kwargs):
    """HubSpot call with 429 backoff, max 3 retries (PLAN.md Phase 2)."""
    url = f"{HUBSPOT_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    headers.update(kwargs.pop("headers", {}))
    for attempt in range(4):
        resp = requests.request(method, url, headers=headers, **kwargs)
        if resp.status_code == 429:
            if attempt == 3:
                resp.raise_for_status()
            time.sleep(2 ** attempt)
            continue
        resp.raise_for_status()
        return resp.json() if resp.content else None
    raise RuntimeError("unreachable")


def find_existing_batch(token):
    """Idempotency guard: any deal whose name carries our tag prefix."""
    body = {
        "filterGroups": [{
            "filters": [{
                "propertyName": "dealname",
                "operator": "CONTAINS_TOKEN",
                "value": SEED_TAG_PREFIX,
            }]
        }],
        "properties": ["dealname"],
        "limit": 1,
    }
    result = hubspot_request(token, "POST", "/crm/v3/objects/deals/search", json=body)
    results = result.get("results", [])
    if not results:
        return None
    return results[0]["properties"]["dealname"]


def create_hubspot_contact(token, batch, name, email):
    first, _, last = name.partition(" ")
    props = {
        "email": email,
        "firstname": first,
        "lastname": last,
        "jobtitle": batch,  # repurposed as the seed tag; see module docstring
    }
    result = hubspot_request(token, "POST", "/crm/v3/objects/contacts", json={"properties": props})
    return result["id"]


def create_hubspot_deal(token, batch, name, amount, close_dt, stage, contact_id):
    props = {
        "dealname": f"[{batch}] {name}",
        "amount": str(amount),
        "dealstage": stage,
        "closedate": int(close_dt.timestamp() * 1000),
    }
    result = hubspot_request(token, "POST", "/crm/v3/objects/deals", json={"properties": props})
    deal_id = result["id"]
    hubspot_request(
        token, "PUT",
        f"/crm/v3/objects/deals/{deal_id}/associations/contacts/{contact_id}/deal_to_contact",
    )
    return deal_id


def create_stripe_charge(batch, key, name, email, amount, token="tok_visa"):
    charge = stripe.Charge.create(
        amount=int(round(amount * 100)),
        currency="usd",
        source=token,
        description=name,
        receipt_email=email,
        metadata={"seed": batch, "key": key},
    )
    return charge


def seed_deal_and_contact(hs_token, batch, anchor, name, stripe_email, hubspot_email, amount, deal_offset_min, stage, dry_run):
    close_dt = sc.resolve_time(anchor, deal_offset_min)
    if dry_run:
        print(f"  [dry-run] HubSpot contact+deal: {name} <{hubspot_email}> ${amount} closedate={close_dt.isoformat()}")
        return None, None
    contact_id = create_hubspot_contact(hs_token, batch, name, hubspot_email)
    deal_id = create_hubspot_deal(hs_token, batch, name, amount, close_dt, stage, contact_id)
    return contact_id, deal_id


def seed_charge(batch, anchor, key, name, stripe_email, amount, charge_offset_min, dry_run, token="tok_visa", refund=False):
    charge_dt = sc.resolve_time(anchor, charge_offset_min)
    if dry_run:
        note = " (declined)" if token != "tok_visa" else " (refunded)" if refund else ""
        print(f"  [dry-run] Stripe charge{note}: {name} <{stripe_email}> ${amount} intended_time={charge_dt.isoformat()}")
        return None
    try:
        charge = create_stripe_charge(batch, key, name, stripe_email, amount, token)
    except stripe.error.CardError as e:
        print(f"  Stripe charge declined as expected for {name}: {e.user_message}")
        return None
    if refund:
        stripe.Refund.create(charge=charge.id)
    return charge


def run(dry_run, force):
    load_dotenv(HERE.parent / ".env")
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
    hs_token = os.environ.get("HUBSPOT_TOKEN")
    if not dry_run and not (stripe.api_key and hs_token):
        sys.exit("STRIPE_SECRET_KEY and HUBSPOT_TOKEN must be set (see .env.example)")

    if not dry_run:
        existing = find_existing_batch(hs_token)
        if existing and not force:
            sys.exit(
                f"existing seed data found ({existing}). "
                "Run teardown.py first, or pass --force to seed alongside it."
            )

    anchor = datetime.now(timezone.utc)
    batch = f"{SEED_TAG_PREFIX}{int(anchor.timestamp())}"
    dataset = sc.build_dataset(anchor)

    print(f"batch: {batch}")
    print(f"clean: {len(dataset['clean'])}  exceptions: {len(dataset['exceptions'])}  "
          f"hostile: {len(dataset['hostile'])}  declined: 1")

    expected_exceptions = []
    must_match_keys = []

    for s in dataset["clean"]:
        seed_charge(batch, anchor, s["key"], s["name"], s["email"], s["amount"], s["charge_offset_min"], dry_run)
        seed_deal_and_contact(hs_token, batch, anchor, s["name"], s["email"], s["email"], s["amount"], s["deal_offset_min"], s["stage"], dry_run)

    for s in dataset["exceptions"]:
        if s["charge_offset_min"] is not None:
            seed_charge(batch, anchor, s["key"], s["name"], s["email"], s["amount"], s["charge_offset_min"], dry_run, refund=s.get("refund", False))
        if s.get("second_charge_offset_min") is not None:
            seed_charge(batch, anchor, s["key"] + "_2", s["name"], s["email"], s["amount"], s["second_charge_offset_min"], dry_run)
        if s["deal_offset_min"] is not None:
            deal_amount = s.get("deal_amount", s["amount"])
            seed_deal_and_contact(hs_token, batch, anchor, s["name"], s["email"], s["email"], deal_amount, s["deal_offset_min"], s["stage"], dry_run)
        expected_exceptions.append({"type": s["kind"], "key": s["key"], "amount": s["amount"]})

    for s in dataset["hostile"]:
        seed_charge(batch, anchor, s["key"], s["name"], s["stripe_email"], s["amount"], s["charge_offset_min"], dry_run)
        seed_deal_and_contact(hs_token, batch, anchor, s["name"], s["stripe_email"], s["hubspot_email"], s["amount"], s["deal_offset_min"], s["stage"], dry_run)
        must_match_keys.append(s["key"])

    d = dataset["declined"]
    seed_charge(batch, anchor, d["key"], d["name"], d["email"], d["amount"], d["charge_offset_min"], dry_run, token=d["stripe_token"])

    expected = {
        "batch": batch,
        "window_start": anchor.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
        "window_end": anchor.replace(hour=23, minute=59, second=59, microsecond=0).isoformat(),
        "payments_expected": dataset["payments_expected"],
        "deals_expected": dataset["deals_expected"],
        "exceptions_expected": len(expected_exceptions),
        "exceptions": expected_exceptions,
        "must_match_not_flag": must_match_keys,
        "note": "declined charge (tok_chargeDeclined) intentionally excluded from payments_expected",
    }

    if dry_run:
        print("\n[dry-run] expected.json would be:")
        print(json.dumps(expected, indent=2))
        return

    with open(HERE / "expected.json", "w") as f:
        json.dump(expected, f, indent=2)
    print(f"\nwrote {HERE / 'expected.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    run(args.dry_run, args.force)
