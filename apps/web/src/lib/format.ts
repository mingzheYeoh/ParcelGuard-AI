/**
 * Money is stored as integer minor units and timestamps are UTC ISO 8601;
 * both are displayed in Malaysian conventions (PLAN.md §6.2).
 */

const money = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
});

export const formatMinor = (minor: number) => money.format(minor / 100);

const time = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatTimestamp = (iso: string) => time.format(new Date(iso));

const dateOnly = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

/** "in 4 min" / "expired" for a proposal deadline, evaluated against the live clock. */
export function formatCountdown(expiresAt: string, now: number = Date.now()): string {
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return 'expired';
  const minutes = Math.floor(remaining / 60_000);
  if (minutes >= 1) return `in ${minutes} min`;
  return `in ${Math.max(1, Math.ceil(remaining / 1000))} s`;
}
