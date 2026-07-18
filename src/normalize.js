// Raw API shape -> contract shape (docs/CONTRACT.md). No I/O.

export function normalizeEmail(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) return null;
  const at = trimmed.indexOf("@");
  if (at === -1) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plus = local.indexOf("+");
  const cleanLocal = plus === -1 ? local : local.slice(0, plus);
  return `${cleanLocal}@${domain}`;
}

export function normalizeAmount(raw, source) {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  if (Number.isNaN(num)) return null;
  const dollars = source === "stripe" ? num / 100 : num;
  return Math.round(dollars * 100) / 100;
}

export function normalizeTimestamp(raw, source) {
  if (raw == null || raw === "") return null;
  let date;
  if (source === "stripe") {
    // Stripe timestamps are epoch seconds.
    date = new Date(Number(raw) * 1000);
  } else if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    // HubSpot dates come back as epoch milliseconds.
    date = new Date(Number(raw));
  } else {
    date = new Date(raw);
  }
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
