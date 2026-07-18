export function normalizeEmail(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex);
  const plusIndex = local.indexOf('+');
  const cleanLocal = plusIndex === -1 ? local : local.slice(0, plusIndex);
  return cleanLocal + domain;
}

export function normalizeAmount(raw, source) {
  if (raw == null) return null;
  const dollars = source === 'stripe' ? Number(raw) / 100 : Number(raw);
  return Math.round(dollars * 100) / 100;
}

export function normalizeTimestamp(raw, source) {
  if (raw == null) return null;
  const ms = source === 'stripe' ? Number(raw) * 1000 : Number(raw);
  return new Date(ms).toISOString();
}
