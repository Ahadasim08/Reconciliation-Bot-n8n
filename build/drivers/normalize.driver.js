// Driver for the "Normalize" Code node. Appended after src/normalize.js's
// (export-stripped) functions by inject.js. Reads raw Stripe/HubSpot shapes
// straight off named upstream nodes -- not off Merge1's combined input --
// so it doesn't depend on Merge1's combine mode being correct.
//
// Stripe charge object: https://docs.stripe.com/api/charges/object
// HubSpot deal/contact: legacy v1 shape, properties nested as {value, ...}
// (confirmed against this workflow's Filter1 condition and live execution
// data -- see the Split Out screenshot from this session).

const rawCharges = $('Filter').all().map((i) => i.json);
const rawDeals = $('Filter1').all().map((i) => i.json);
const rawContacts = $('Get a contact').all().map((i) => i.json);

// PLAN.md §7.2: zero-amount charges are Stripe card-validation artifacts,
// ignore entirely. §7.4: declined charges never moved money, ignore too.
const payments = rawCharges
  .filter((c) => c.status === 'succeeded' && c.amount > 0)
  .map((c) => ({
    source: 'stripe',
    id: c.id,
    email: normalizeEmail(c.billing_details?.email || c.receipt_email || null),
    name: c.billing_details?.name || null,
    amount: normalizeAmount(c.amount, 'stripe'),
    currency: c.currency,
    timestamp: normalizeTimestamp(c.created, 'stripe'),
    refunded: Boolean(c.refunded),
    refundedAmount: normalizeAmount(c.amount_refunded || 0, 'stripe'),
    // Charge object has no subscription field without expanding `invoice`,
    // which "Get many charges" doesn't do yet -- Ahad's fetch-node follow-up
    // (see progress.md "Next session"). Always null until that lands.
    subscriptionId: null,
    url: `https://dashboard.stripe.com/test/payments/${c.id}`,
  }));

const deals = rawDeals.map((d, i) => {
  const contact = rawContacts[i] || {};
  const props = d.properties || {};
  const cprops = contact.properties || {};
  const firstname = cprops.firstname?.value || '';
  const lastname = cprops.lastname?.value || '';
  const name = firstname || lastname ? `${firstname} ${lastname}`.trim() : null;

  return {
    source: 'hubspot',
    id: String(d.dealId),
    email: normalizeEmail(cprops.email?.value || null),
    name,
    amount: normalizeAmount(props.amount?.value ?? null, 'hubspot'),
    currency: 'usd',
    timestamp: normalizeTimestamp(props.closedate?.value ?? null, 'hubspot'),
    stage: props.dealstage?.value || null,
    url: `https://app.hubspot.com/contacts/${d.portalId}/deal/${d.dealId}`,
  };
});

return [{ json: { payments, deals } }];
