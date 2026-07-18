"""Deletes everything seed.py created, found via the seed:batch-* tag.

HubSpot contacts and deals are truly deleted via the API. Stripe test-mode
charges are NOT deletable through the API (Stripe limitation, not a gap in
this script) — the best available cleanup is refunding any that aren't
already refunded, so re-running the demo doesn't leave a growing pile of
live-looking test charges. This is fine: they're test-mode, cost nothing,
and Stripe's own dashboard lets you clear test data manually if it bothers
you.

Usage:
  python teardown.py --dry-run
  python teardown.py
"""

import argparse
import os
import sys
from pathlib import Path

import requests
import stripe
from dotenv import load_dotenv

from seed import HUBSPOT_BASE, SEED_TAG_PREFIX, hubspot_request

HERE = Path(__file__).parent


def find_seed_deals(token):
    deals = []
    after = None
    while True:
        body = {
            "filterGroups": [{
                "filters": [{
                    "propertyName": "dealname",
                    "operator": "CONTAINS_TOKEN",
                    "value": SEED_TAG_PREFIX,
                }]
            }],
            "properties": ["dealname"],
            "limit": 100,
        }
        if after:
            body["after"] = after
        result = hubspot_request(token, "POST", "/crm/v3/objects/deals/search", json=body)
        deals.extend(result.get("results", []))
        after = result.get("paging", {}).get("next", {}).get("after")
        if not after:
            break
    return deals


def find_seed_contacts(token):
    contacts = []
    after = None
    while True:
        body = {
            "filterGroups": [{
                "filters": [{
                    "propertyName": "jobtitle",
                    "operator": "CONTAINS_TOKEN",
                    "value": SEED_TAG_PREFIX,
                }]
            }],
            "properties": ["email"],
            "limit": 100,
        }
        if after:
            body["after"] = after
        result = hubspot_request(token, "POST", "/crm/v3/objects/contacts/search", json=body)
        contacts.extend(result.get("results", []))
        after = result.get("paging", {}).get("next", {}).get("after")
        if not after:
            break
    return contacts


def find_seed_charges():
    charges = []
    for charge in stripe.Charge.list(limit=100).auto_paging_iter():
        if charge.metadata.get("seed", "").startswith(SEED_TAG_PREFIX.rstrip("-")):
            charges.append(charge)
    return charges


def run(dry_run):
    load_dotenv(HERE.parent / ".env")
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
    hs_token = os.environ.get("HUBSPOT_TOKEN")
    if not (stripe.api_key and hs_token):
        sys.exit("STRIPE_SECRET_KEY and HUBSPOT_TOKEN must be set (see .env.example)")

    deals = find_seed_deals(hs_token)
    contacts = find_seed_contacts(hs_token)
    charges = find_seed_charges()

    print(f"found: {len(deals)} deals, {len(contacts)} contacts, {len(charges)} Stripe charges")

    if dry_run:
        print("[dry-run] nothing deleted")
        return

    for d in deals:
        hubspot_request(hs_token, "DELETE", f"/crm/v3/objects/deals/{d['id']}")
    for c in contacts:
        hubspot_request(hs_token, "DELETE", f"/crm/v3/objects/contacts/{c['id']}")
    for charge in charges:
        if not charge.refunded:
            stripe.Refund.create(charge=charge.id)

    print(f"deleted {len(deals)} deals, {len(contacts)} contacts; refunded unrefunded seed charges")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(args.dry_run)
