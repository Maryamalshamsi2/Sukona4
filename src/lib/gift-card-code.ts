/**
 * Gift card code utilities. Pure functions, safe to import from
 * either server or client. Kept out of `actions.ts` so the client
 * formatter doesn't have to roundtrip through a server action just
 * to add dashes as the user types.
 */

// 31 unambiguous characters — 36 alphanumeric minus 0, O, 1, I, L.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

/** Strip non-alphanumerics, uppercase. The customer might type the
 *  dashed form, paste with extra spaces, or use lowercase. */
export function normalizeCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Format a raw 12-char code as ABCD-EF23-XYZ9 for display.
 *  Tolerates partial inputs (returns whatever's there, dashed
 *  every 4 chars). */
export function formatCode(raw: string): string {
  const norm = normalizeCode(raw);
  if (norm.length <= 4) return norm;
  if (norm.length <= 8) return `${norm.slice(0, 4)}-${norm.slice(4)}`;
  return `${norm.slice(0, 4)}-${norm.slice(4, 8)}-${norm.slice(8, 12)}`;
}

/** Returns true when the input normalizes to exactly CODE_LENGTH. */
export function isCompleteCode(input: string): boolean {
  return normalizeCode(input).length === CODE_LENGTH;
}
