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
import concurrent.futures
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
import stripe
from dotenv import load_dotenv

import scenarios as sc

HUBSPOT_BASE = "https://api.hubapi.com"
SEED_TAG_PREFIX = "seed:batch-"
HERE = Path(__file__).parent


def hubspot_request(token: str, method: str, path: str, **kwargs: Any) -> Any:
    """Send an HTTP request to HubSpot API with 429 rate-limit backoff retries.

    Data Transfer Steps:
    1. Build full target URL using HUBSPOT_BASE and path.
    2. Inject Bearer authentication token and JSON header parameters.
    3. Execute network HTTP request using requests library.
    4. Handle status code 429 with exponential backoff up to 3 retries.
    5. Return parsed JSON payload or None for empty responses.
    """
    url = f"{HUBSPOT_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    headers.update(kwargs.pop("headers", {}))
    for attempt in range(4):
        try:
            resp = requests.request(method, url, headers=headers, **kwargs)
            if resp.status_code == 429:
                if attempt == 3:
                    resp.raise_for_status()
                time.sleep(2 ** attempt)
                continue
            resp.raise_for_status()
            return resp.json() if resp.content else None
        except requests.RequestException as e:
            if attempt == 3 or (isinstance(e, requests.HTTPError) and e.response is not None and e.response.status_code != 429):
                raise RuntimeError(f"HubSpot API request failed for {method} {path}: {str(e)}") from e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Unreachable state reached during HubSpot request to {path}")


def find_existing_batch(token: str) -> Optional[str]:
    """Search HubSpot for any existing deal tagged with the seed batch prefix.

    Data Verification Steps:
    1. Construct search payload targeting dealname containing SEED_TAG_PREFIX.
    2. Post search request to HubSpot deals search endpoint.
    3. Extract existing deal properties from search results.
    4. Return deal name if found, or None if no existing batch data exists.
    """
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
    try:
        result = hubspot_request(token, "POST", "/crm/v3/objects/deals/search", json=body)
        results = result.get("results", [])
        if not results:
            return None
        return str(results[0]["properties"]["dealname"])
    except Exception as e:
        raise RuntimeError(f"Failed to query existing HubSpot batch: {str(e)}") from e


def create_hubspot_contact(token: str, batch: str, name: str, email: str) -> str:
    """Create a contact object in HubSpot tagged with the seed batch identifier.

    Data Creation Steps:
    1. Partition first and last name from full name string.
    2. Formulate contact properties mapping email, firstname, lastname, and jobtitle tag.
    3. Send POST request to HubSpot contacts API endpoint.
    4. Parse response JSON and return created contact ID string.
    """
    first, _, last = name.partition(" ")
    props = {
        "email": email,
        "firstname": first,
        "lastname": last,
        "jobtitle": batch,
    }
    try:
        result = hubspot_request(token, "POST", "/crm/v3/objects/contacts", json={"properties": props})
        return str(result["id"])
    except Exception as e:
        raise RuntimeError(f"Failed to create HubSpot contact for {email}: {str(e)}") from e


def create_hubspot_deal(token: str, batch: str, name: str, amount: float, close_dt: datetime, stage: str, contact_id: str) -> str:
    """Create a deal in HubSpot and link it to the corresponding contact record.

    Data Linkage Steps:
    1. Build deal property payload with formatted name, amount, stage, and closedate timestamp.
    2. Issue POST request to HubSpot deals endpoint to instantiate deal object.
    3. Issue PUT request associating created deal ID with contact ID.
    4. Return created deal ID string.
    """
    props = {
        "dealname": f"[{batch}] {name}",
        "amount": str(amount),
        "dealstage": stage,
        "closedate": int(close_dt.timestamp() * 1000),
    }
    try:
        result = hubspot_request(token, "POST", "/crm/v3/objects/deals", json={"properties": props})
        deal_id = str(result["id"])
        hubspot_request(
            token, "PUT",
            f"/crm/v3/objects/deals/{deal_id}/associations/contacts/{contact_id}/deal_to_contact",
        )
        return deal_id
    except Exception as e:
        raise RuntimeError(f"Failed to create and associate HubSpot deal for {name}: {str(e)}") from e


def create_stripe_charge(batch: str, key: str, name: str, email: str, amount: float, token: str = "tok_visa") -> Any:
    """Create a charge in Stripe test mode attached with metadata tag.

    Data Processing Steps:
    1. Convert dollar amount to integer cents.
    2. Build charge creation payload with metadata tags and description.
    3. Invoke stripe.Charge.create API call.
    4. Return created Stripe charge object.
    """
    try:
        charge = stripe.Charge.create(
            amount=int(round(amount * 100)),
            currency="usd",
            source=token,
            description=name,
            receipt_email=email,
            metadata={"seed": batch, "key": key},
        )
        return charge
    except stripe.error.StripeError as e:
        raise e


def seed_deal_and_contact(
    hs_token: str,
    batch: str,
    anchor: datetime,
    name: str,
    stripe_email: str,
    hubspot_email: str,
    amount: float,
    deal_offset_min: Optional[int],
    stage: Optional[str],
    dry_run: bool
) -> Tuple[Optional[str], Optional[str]]:
    """Helper method to construct HubSpot contact and deal records for a scenario.

    Execution Steps:
    1. Resolve absolute close datetime using scenario minute offset.
    2. If dry-run mode is enabled, output formatted log and skip network calls.
    3. Create HubSpot contact record and extract contact ID.
    4. Create HubSpot deal record associated with created contact ID.
    """
    close_dt = sc.resolve_time(anchor, deal_offset_min)
    if close_dt is None or stage is None:
        return None, None
    if dry_run:
        print(f"  [dry-run] HubSpot contact+deal: {name} <{hubspot_email}> ${amount} closedate={close_dt.isoformat()}")
        return None, None
    contact_id = create_hubspot_contact(hs_token, batch, name, hubspot_email)
    deal_id = create_hubspot_deal(hs_token, batch, name, amount, close_dt, stage, contact_id)
    return contact_id, deal_id


def seed_charge(
    batch: str,
    anchor: datetime,
    key: str,
    name: str,
    stripe_email: str,
    amount: float,
    charge_offset_min: Optional[int],
    dry_run: bool,
    token: str = "tok_visa",
    refund: bool = False
) -> Any:
    """Helper method to construct Stripe charge records for a scenario.

    Execution Steps:
    1. Resolve charge datetime based on offset minutes from anchor.
    2. Log dry-run message if dry-run flag is active.
    3. Execute Stripe charge creation via API.
    4. If refund flag is specified, invoke stripe.Refund.create.
    """
    charge_dt = sc.resolve_time(anchor, charge_offset_min)
    if dry_run:
        note = " (declined)" if token != "tok_visa" else " (refunded)" if refund else ""
        print(f"  [dry-run] Stripe charge{note}: {name} <{stripe_email}> ${amount} intended_time={charge_dt.isoformat() if charge_dt else ''}")
        return None
    try:
        charge = create_stripe_charge(batch, key, name, stripe_email, amount, token)
    except stripe.error.CardError as e:
        print(f"  Stripe charge declined as expected for {name}: {e.user_message}")
        return None
    if refund and charge:
        try:
            stripe.Refund.create(charge=charge.id)
        except Exception as e:
            raise RuntimeError(f"Failed to refund Stripe charge {charge.id}: {str(e)}") from e
    return charge


def run(dry_run: bool, force: bool, max_workers: int = 8) -> None:
    """Main runner executing seeder dataset population across Stripe and HubSpot concurrently.

    Execution Pipeline:
    1. Load environment variables from .env file using pathlib Path location.
    2. Check environment credentials and verify idempotency guard against HubSpot.
    3. Construct anchor timestamp and build target scenario dataset.
    4. Dispatch scenario creation tasks to thread pool executor for fast parallel network calls.
    5. Aggregate scorecard statistics and write seeder/expected.json.
    """
    load_dotenv(HERE.parent / ".env")
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
    hs_token = os.environ.get("HUBSPOT_TOKEN")
    if not dry_run and not (stripe.api_key and hs_token):
        sys.exit("STRIPE_SECRET_KEY and HUBSPOT_TOKEN must be set (see .env.example)")

    if not dry_run and hs_token:
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
          f"hostile: {len(dataset['hostile'])}  fee_tolerance_matches: {len(dataset['fee_tolerance_matches'])}  "
          f"declined: 1")

    expected_exceptions: List[Dict[str, Any]] = []
    must_match_keys: List[str] = []

    def process_clean_item(s: Dict[str, Any]) -> None:
        seed_charge(batch, anchor, s["key"], s["name"], s["email"], s["amount"], s["charge_offset_min"], dry_run)
        if hs_token:
            seed_deal_and_contact(hs_token, batch, anchor, s["name"], s["email"], s["email"], s["amount"], s["deal_offset_min"], s["stage"], dry_run)

    def process_exception_item(s: Dict[str, Any]) -> None:
        if s["charge_offset_min"] is not None:
            seed_charge(batch, anchor, s["key"], s["name"], s["email"], s["amount"], s["charge_offset_min"], dry_run, refund=s.get("refund", False))
        if s.get("second_charge_offset_min") is not None:
            seed_charge(batch, anchor, s["key"] + "_2", s["name"], s["email"], s["amount"], s["second_charge_offset_min"], dry_run)
        if s["deal_offset_min"] is not None and hs_token:
            deal_amount = s.get("deal_amount", s["amount"])
            seed_deal_and_contact(hs_token, batch, anchor, s["name"], s["email"], s["email"], deal_amount, s["deal_offset_min"], s["stage"], dry_run)

    def process_hostile_item(s: Dict[str, Any]) -> None:
        seed_charge(batch, anchor, s["key"], s["name"], s["stripe_email"], s["amount"], s["charge_offset_min"], dry_run)
        if hs_token:
            seed_deal_and_contact(hs_token, batch, anchor, s["name"], s["stripe_email"], s["hubspot_email"], s["amount"], s["deal_offset_min"], s["stage"], dry_run)

    # Collect expectation metrics before execution
    for s in dataset["exceptions"]:
        expected_exceptions.append({"type": s["kind"], "key": s["key"], "amount": s["amount"]})
    for s in dataset["hostile"]:
        must_match_keys.append(s["key"])
    for s in dataset["fee_tolerance_matches"]:
        must_match_keys.append(s["key"])

    if dry_run:
        for s in dataset["clean"]:
            process_clean_item(s)
        for s in dataset["exceptions"]:
            process_exception_item(s)
        for s in dataset["hostile"]:
            process_hostile_item(s)
        for s in dataset["fee_tolerance_matches"]:
            process_exception_item(s)
        d = dataset["declined"]
        seed_charge(batch, anchor, d["key"], d["name"], d["email"], d["amount"], d["charge_offset_min"], dry_run, token=d["stripe_token"])
    else:
        # Parallel execution across worker thread pool
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            for s in dataset["clean"]:
                futures.append(executor.submit(process_clean_item, s))
            for s in dataset["exceptions"]:
                futures.append(executor.submit(process_exception_item, s))
            for s in dataset["hostile"]:
                futures.append(executor.submit(process_hostile_item, s))
            for s in dataset["fee_tolerance_matches"]:
                futures.append(executor.submit(process_exception_item, s))

            d = dataset["declined"]
            futures.append(executor.submit(
                seed_charge, batch, anchor, d["key"], d["name"], d["email"], d["amount"], d["charge_offset_min"], dry_run, d["stripe_token"]
            ))

            for future in concurrent.futures.as_completed(futures):
                future.result()

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

    expected_path = HERE / "expected.json"
    try:
        with open(expected_path, "w", encoding="utf-8") as f:
            json.dump(expected, f, indent=2)
        print(f"\nwrote {expected_path}")
    except IOError as e:
        raise RuntimeError(f"Failed to write scorecard to {expected_path}: {str(e)}") from e


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    run(args.dry_run, args.force)

