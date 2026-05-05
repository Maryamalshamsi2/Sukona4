/**
 * Formatters for WhatsApp template variables. Kept pure (no I/O) so they
 * can be unit-tested and run in either client or server contexts.
 *
 * Style choices match what the customer sees in their WhatsApp thread:
 *   - Date: "Wednesday, 29 Apr 2026" — friendly, unambiguous, no zero-pad.
 *   - Time: "10:30 AM" — 12-hour with AM/PM.
 *   - Service summary: comma-joined list, fallback "your appointment".
 *   - First name: split on whitespace, take the first token.
 */

export function formatDateLong(dateISO: string): string {
  // Treat the YYYY-MM-DD as a *local* date (not UTC) so timezone
  // doesn't shift the day around the midnight boundary.
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime12(time24: string): string {
  const [h, m] = time24.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

/**
 * Build the {{5}} "service summary" var. Joins service names with commas.
 * The Meta template body is on its own line, so multi-service strings
 * like "Haircut, Beard trim, Manicure" read fine.
 */
export function formatServiceSummary(
  services: Array<{ name: string }>
): string {
  if (!services || services.length === 0) return "your appointment";
  return services.map((s) => s.name).join(", ");
}

/** Take the first whitespace-separated token; titles ("Mr.") aren't likely. */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

/**
 * Strip everything but digits — Cloud API's `to` field expects E.164
 * without the leading "+" and without spaces or dashes.
 */
export function toE164Digits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}
