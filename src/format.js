const DEFAULT_CONFIG = {
  maxExceptionsInMessage: 10,
};

// DUPLICATE_CHARGE and PAYMENT_NO_DEAL first (money is wrong right now),
// REVIEW last. Middle order is our own call: ORPHAN_REFUND (money already
// moved backwards) before AMOUNT_MISMATCH before DEAL_NO_PAYMENT (deal is
// stuck, not urgent-money-wrong). Per PLAN.md section "Phase 4".
const SEVERITY_ORDER = [
  'DUPLICATE_CHARGE',
  'PAYMENT_NO_DEAL',
  'ORPHAN_REFUND',
  'AMOUNT_MISMATCH',
  'DEAL_NO_PAYMENT',
  'REVIEW',
];

function exceptionAmount(exception) {
  if (exception.payment) return exception.payment.amount;
  if (exception.deal) return exception.deal.amount;
  return 0;
}

function exceptionCustomer(exception) {
  return (exception.payment && exception.payment.name) || (exception.deal && exception.deal.name) || null;
}

function exceptionEmail(exception) {
  return (exception.payment && exception.payment.email) || (exception.deal && exception.deal.email) || null;
}

function exceptionLine(exception) {
  const customer = exceptionCustomer(exception) || 'unknown';
  const amount = exceptionAmount(exception);
  const amountStr = amount != null ? `$${amount.toFixed(2)}` : 'unknown amount';
  return `*${exception.type}* — ${customer} — ${amountStr}`;
}

export function summarize(matchResult, exceptions) {
  const totalPayments =
    matchResult.matched.length + matchResult.review.length + matchResult.unmatchedPayments.length;
  const exceptionCount = exceptions.length;
  const cleanCount = totalPayments - exceptionCount;
  const unreconciledAmount = exceptions.reduce((sum, e) => sum + (exceptionAmount(e) || 0), 0);

  return { totalPayments, cleanCount, exceptionCount, unreconciledAmount };
}

export function formatSlackMessage(matchResult, exceptions, config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const summary = summarize(matchResult, exceptions);

  const headline = `${summary.totalPayments} payments · ${summary.cleanCount} clean · ${summary.exceptionCount} exceptions · $${summary.unreconciledAmount.toFixed(2)} unreconciled`;

  const ordered = [...exceptions].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.type) - SEVERITY_ORDER.indexOf(b.type)
  );
  const shown = ordered.slice(0, cfg.maxExceptionsInMessage);
  const remaining = ordered.length - shown.length;

  const lines = shown.map(exceptionLine);
  if (remaining > 0) lines.push(`…and ${remaining} more, see sheet.`);

  return {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${headline}*` } },
      ...lines.map((line) => ({ type: 'section', text: { type: 'mrkdwn', text: line } })),
    ],
  };
}

export function formatSheetRows(exceptions) {
  return exceptions.map((exception) => {
    const record = exception.payment || exception.deal;
    return {
      date: record.timestamp,
      type: exception.type,
      amount: exceptionAmount(exception),
      customer: exceptionCustomer(exception),
      email: exceptionEmail(exception),
      confidence: exception.confidence != null ? exception.confidence : null,
      paymentLink: exception.payment ? exception.payment.url : null,
      dealLink: exception.deal ? exception.deal.url : null,
      resolved: false,
    };
  });
}
