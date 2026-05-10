/**
 * Currency formatting + the picker list shown in Settings + onboarding.
 *
 * Currencies are stored as ISO 4217 codes on the salons row
 * (migration 030). The code itself is the display label — we don't
 * map to symbols ($, €, د.إ etc.) because the codes are unambiguous
 * and salons across regions sometimes prefer the international notation
 * anyway. "AED 100" reads cleanly to anyone.
 */

/**
 * Curated picker list — common currencies for the salon market.
 * Roughly ordered by region: GCC first (where the app started),
 * then MENA, then EU, then global.
 */
export const SUPPORTED_CURRENCIES: { code: string; name: string }[] = [
  // GCC
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "OMR", name: "Omani Rial" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "BHD", name: "Bahraini Dinar" },
  // MENA
  { code: "EGP", name: "Egyptian Pound" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "TND", name: "Tunisian Dinar" },
  // Western
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  // South Asia
  { code: "INR", name: "Indian Rupee" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  // Other
  { code: "TRY", name: "Turkish Lira" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CNY", name: "Chinese Yuan" },
];

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code);
}

/**
 * Format an amount with the salon's currency code as the prefix.
 * Examples:
 *   formatCurrency(100, "AED")              → "AED 100"
 *   formatCurrency(100.5, "SAR", { decimals: 2 }) → "SAR 100.50"
 *   formatCurrency("89.95", "USD")          → "USD 90"
 *
 * Decimals default to 0 (most appointment / line-item prices in the
 * app are whole numbers). Pass `{ decimals: 2 }` for petty cash and
 * receipt lines that need cents.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string,
  opts?: { decimals?: number },
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  if (!isFinite(num)) return `${currency} 0`;
  const decimals = opts?.decimals ?? 0;
  return `${currency} ${num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
