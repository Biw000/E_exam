/**
 * Server timestamps are UTC, but the API serializes them without a timezone
 * marker (e.g. "2026-09-02T09:31:00" rather than "...Z"). `new Date()` reads a
 * string in that shape as *local* time, which silently shifted every displayed
 * time — and the exam countdown — by the browser's UTC offset. In Thailand
 * that is seven hours, so a 30-minute exam could appear to have expired before
 * it opened.
 *
 * These helpers attach the missing UTC marker before parsing. Every place that
 * turns an API timestamp into a Date should go through here.
 */

const HAS_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = HAS_TIMEZONE.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Localized date + time, or a dash when the value is missing or unparseable. */
export function formatDateTime(
  value: string | null | undefined,
  locale = "th-TH"
): string {
  const date = parseServerDate(value);
  return date ? date.toLocaleString(locale) : "-";
}

/**
 * Convert the value of an `<input type="datetime-local">` (local wall clock,
 * no timezone) into the UTC ISO string the API expects.
 */
export function localInputToUtcIso(value: string): string {
  return new Date(value).toISOString();
}

/**
 * Inverse of the above: render a UTC timestamp into the `YYYY-MM-DDTHH:mm`
 * shape a `datetime-local` input needs, in the viewer's own timezone.
 */
export function utcIsoToLocalInput(value: string | null | undefined): string {
  const date = parseServerDate(value);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
