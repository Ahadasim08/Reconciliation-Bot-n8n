"""Single source of truth for the seeded dataset (PLAN.md section 6, Phase 2).

seed.py reads this module and creates real Stripe + HubSpot records from it.
teardown.py only needs the batch tag, not this file.

Design note — Stripe cannot backdate `created` on a charge; it is set by
Stripe to the actual API-call time. So this module does NOT hardcode a fixed
calendar date. Everything is expressed as an offset in minutes from an
`anchor` (the datetime seed.py is run) and resolved to real datetimes at
build time. HubSpot deal closedate has no such restriction and is set
directly from the resolved offset.
"""

import random
from datetime import datetime, timedelta, timezone

SEED = 42
CLEAN_COUNT = 36  # -> payments_expected 46, deals_expected 45 (see build_dataset)

FIRST_NAMES = [
    "Aiden", "Bianca", "Carlos", "Delphine", "Ewan", "Farah", "Gideon", "Hana",
    "Ivo", "Jasmine", "Kenji", "Lior", "Maya", "Nikolai", "Odalys", "Pieter",
    "Quinn", "Rosa", "Soren", "Talia", "Ulric", "Vera", "Wyatt", "Ximena",
    "Yara", "Zane", "Amara", "Boaz", "Celine", "Dmitri", "Esme", "Finn",
    "Greta", "Hugo", "Inès", "Jasper",
]

COMPANIES = [
    ("Acme Freight", "acmefreight.com"),
    ("Brightline Studio", "brightlinestudio.com"),
    ("Cedar & Co", "cedarandco.com"),
    ("Driftwood Labs", "driftwoodlabs.io"),
    ("Everline Media", "everlinemedia.com"),
    ("Fjord Systems", "fjordsystems.com"),
    ("Glasswing Group", "glasswinggroup.com"),
    ("Harborlane", "harborlane.com"),
    ("Ironclad Supply", "ironcladsupply.com"),
    ("Juniper Works", "juniperworks.io"),
    ("Kestrel Analytics", "kestrelanalytics.com"),
    ("Lattice Partners", "latticepartners.com"),
    ("Meridian Foods", "meridianfoods.com"),
    ("Northwind Trading", "northwindtrading.io"),
    ("Omnicrest", "omnicrest.com"),
    ("Palmetto Roasters", "palmettoroasters.com"),
    ("Quarrystone", "quarrystone.com"),
    ("Riverside Dental", "riversidedental.com"),
    ("Sable & Finch", "sableandfinch.com"),
    ("Tidewater Logistics", "tidewaterlogistics.com"),
    ("Underline Design", "underlinedesign.io"),
    ("Vantek", "vantek.com"),
    ("Westgate Realty", "westgaterealty.com"),
    ("Xylo Robotics", "xylorobotics.com"),
    ("Yellowbrick Media", "yellowbrickmedia.com"),
    ("Zenith Capital", "zenithcapital.com"),
    ("Alderpoint Legal", "alderpointlegal.com"),
    ("Brookline Interiors", "brooklineinteriors.com"),
    ("Cypress Health", "cypresshealth.com"),
    ("Dunmore Energy", "dunmoreenergy.com"),
    ("Elmcourt Realty", "elmcourtrealty.com"),
    ("Foxglove Farms", "foxglovefarms.com"),
    ("Graystone Capital", "graystonecapital.com"),
    ("Hollow Creek Goods", "hollowcreekgoods.com"),
    ("Ironhide Fitness", "ironhidefitness.com"),
    ("Jaspervale", "jaspervale.com"),
]


def _rng():
    return random.Random(SEED)


def _email(first, last, domain):
    return f"{first.lower()}.{last.lower()}@{domain}"


def clean_scenarios(n=CLEAN_COUNT):
    """N customers, each one charge + one matching closedwon deal.

    Amounts $250-$5000. Timestamps spread across the anchor day, deal
    closedate lagging the charge by 0-72h (normal CRM lag, not an exception —
    see PLAN.md 7.3).
    """
    rng = _rng()
    last_names = list(FIRST_NAMES)
    rng.shuffle(last_names)
    scenarios = []
    for i in range(n):
        first = FIRST_NAMES[i % len(FIRST_NAMES)]
        last = last_names[i % len(last_names)]
        company, domain = COMPANIES[i % len(COMPANIES)]
        amount = round(rng.uniform(250, 5000), 2)
        charge_offset_min = rng.randint(0, 23 * 60 + 59)
        deal_lag_min = rng.randint(0, 72 * 60)
        scenarios.append({
            "key": f"clean_{i + 1:02d}",
            "kind": "clean",
            "name": f"{first} {last}",
            "email": _email(first, last, domain),
            "amount": amount,
            "charge_offset_min": charge_offset_min,
            "deal_offset_min": charge_offset_min + deal_lag_min,
            "stage": "closedwon",
        })
    return scenarios


PLANTED_EXCEPTIONS = [
    {
        "key": "mike_duplicate",
        "kind": "DUPLICATE_CHARGE",
        "name": "Mike Sorensen",
        "email": "mike.sorensen@harborlane.com",
        "amount": 500.00,
        "charge_offset_min": 600,
        "second_charge_offset_min": 610,  # 10 min apart
        "deal_offset_min": 605,
        "stage": "closedwon",
    },
    {
        "key": "david_no_deal",
        "kind": "PAYMENT_NO_DEAL",
        "name": "David Reyes",
        "email": "david.reyes@omnicrest.com",
        "amount": 3000.00,
        "charge_offset_min": 720,
        "deal_offset_min": None,  # no deal created
        "stage": None,
    },
    {
        "key": "priya_no_payment",
        "kind": "DEAL_NO_PAYMENT",
        "name": "Priya Nair",
        "email": "priya.nair@northwind.io",
        "amount": 1200.00,
        "charge_offset_min": None,  # no charge created
        "deal_offset_min": 480,
        "stage": "closedwon",
    },
    {
        "key": "tom_orphan_refund",
        "kind": "ORPHAN_REFUND",
        "name": "Tom Baxter",
        "email": "tom.baxter@fielder.co",
        "amount": 1100.00,
        "charge_offset_min": 300,
        "refund": True,
        "deal_offset_min": 310,
        "stage": "closedwon",
    },
    {
        "key": "jenna_review",
        "kind": "REVIEW",
        "name": "Jenna Ortiz",
        "email": "jenna.ortiz@quarrystone.com",
        "amount": 1940.50,
        "deal_amount": 2000.00,  # 2.98% gap, inside default 3.5% feeTolerance
        "charge_offset_min": 900,
        "deal_offset_min": 905,
        "stage": "closedwon",
    },
]

HOSTILE_CASES = [
    {
        "key": "sarah_casing",
        "kind": "must_match",
        "name": "Sarah Chen",
        "stripe_email": "sarah.chen@acme.com",
        "hubspot_email": "Sarah.Chen@ACME.com",
        "amount": 2000.00,
        "charge_offset_min": 100,
        "deal_offset_min": 110,
        "stage": "closedwon",
    },
    {
        "key": "jenna_plustag",
        "kind": "must_match",
        "name": "Jenna Volkov",
        "stripe_email": "jenna@northstar.io",
        "hubspot_email": "jenna+billing@northstar.io",
        "amount": 850.00,
        "charge_offset_min": 200,
        "deal_offset_min": 208,
        "stage": "closedwon",
    },
    {
        "key": "raj_midnight",
        "kind": "must_match",
        "name": "Raj Malhotra",
        "stripe_email": "raj.malhotra@dunmoreenergy.com",
        "hubspot_email": "raj.malhotra@dunmoreenergy.com",
        "amount": 1750.00,
        # 6 minutes apart, meant to straddle a day boundary in a real
        # midnight-anchored run; see module docstring re: Stripe timestamps.
        "charge_offset_min": 1438,
        "deal_offset_min": 1444,
        "stage": "closedwon",
    },
    {
        "key": "john_smith_a",
        "kind": "must_match",
        "name": "John Smith",
        "stripe_email": "john.smith@graystonecapital.com",
        "hubspot_email": "john.smith@graystonecapital.com",
        "amount": 640.00,
        "charge_offset_min": 330,
        "deal_offset_min": 336,
        "stage": "closedwon",
    },
    {
        "key": "john_smith_b",
        "kind": "must_match",
        "name": "John Smith",
        "stripe_email": "john.smith@ironhidefitness.com",
        "hubspot_email": "john.smith@ironhidefitness.com",
        "amount": 1290.00,
        "charge_offset_min": 640,
        "deal_offset_min": 650,
        "stage": "closedwon",
    },
]

# Not matched against anything — proves the fetch/normalize layer ignores
# failed charges entirely. Stripe still returns it with status=failed; it
# must never reach payments_fetched. See PLAN.md Phase 2 seeder requirements.
DECLINED_CHARGE = {
    "key": "marcus_declined",
    "kind": "declined",
    "name": "Marcus Webb",
    "email": "marcus.webb@fjordsystems.com",
    "amount": 415.00,
    "charge_offset_min": 60,
    "stripe_token": "tok_chargeDeclined",
}


def resolve_time(anchor, offset_min):
    if offset_min is None:
        return None
    return anchor.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=offset_min)


def build_dataset(anchor=None):
    """Resolve every scenario's offsets against `anchor` (default: now, UTC).

    Returns the full scenario list plus the counts seed.py needs for
    expected.json. Does not touch any network.
    """
    anchor = anchor or datetime.now(timezone.utc)

    payments_expected = 0
    deals_expected = 0

    for s in clean_scenarios():
        payments_expected += 1
        deals_expected += 1
    for s in PLANTED_EXCEPTIONS:
        if s["charge_offset_min"] is not None:
            payments_expected += 1
        if s.get("second_charge_offset_min") is not None:
            payments_expected += 1
        if s["deal_offset_min"] is not None:
            deals_expected += 1
    for s in HOSTILE_CASES:
        payments_expected += 1
        deals_expected += 1

    return {
        "anchor": anchor,
        "clean": clean_scenarios(),
        "exceptions": PLANTED_EXCEPTIONS,
        "hostile": HOSTILE_CASES,
        "declined": DECLINED_CHARGE,
        "payments_expected": payments_expected,
        "deals_expected": deals_expected,
    }
