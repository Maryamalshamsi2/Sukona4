/**
 * Ateeq Spa historical import runner (v3 file format).
 *
 * See earlier commit for context. This version handles the real
 * data shape: bundles, quantity prefixes ("x2 Basic Mani & Pedi"),
 * multi-staff strings ("AICA & MARIPEL"), a mapping table for
 * naming variants ("Blow Dry (medium)" → "Blow Dry - Medium Hair"),
 * and split-payment normalization ("card / cash" → "card").
 *
 * Usage:
 *   npm run import:ateeq -- \
 *     --salon-id <uuid> \
 *     --file path/to/ateeq.xlsx \
 *     [--dry-run]
 */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

// ============================================================
// Types
// ============================================================

/** One line item parsed from the semicolon-separated services list. */
interface LineItem {
  name: string;    // stripped of quantity prefix
  quantity: number;
}

interface RawRow {
  rowNum: number;
  date: string;
  startTime: string;
  clientName: string;
  clientPhone: string;
  address: string | null;
  services: LineItem[];
  staffNames: string[]; // split from "AICA & MARIPEL"
  total: number;
  method: "cash" | "card" | "other" | null;
}

// ============================================================
// Manual mapping — Ateeq's free-text service names → canonical
// Sukona name (either an active service OR an active bundle).
// Keys are lowercase + whitespace-collapsed for a case-insensitive
// match. Value must EXACTLY match a Sukona row's `name`.
// ============================================================

const SERVICE_ALIASES: Record<string, string> = {
  // Bundles that Ateeq wrote as free text in a slightly different form.
  "french polish (hands+feet)": "French Polish (Hands & Feet)",
  "french polish (hands & feet)": "French Polish (Hands & Feet)",
  "kid's mani & pedi": "Kids Mani & Pedi",
  "kids mani & pedi": "Kids Mani & Pedi",
  "men - basic mani & pedi": "Men Basic Mani & Pedi",
  "mani & pedi": "Basic Mani & Pedi",

  // Blow dry — Ateeq wrote length as parenthetical; Sukona uses
  // hyphenated "- Medium Hair" form.
  "blow dry (medium)": "Blow Dry - Medium Hair",
  "blow dry (long)": "Blow Dry - Long Hair",
  "blow dry (short)": "Blow Dry - Short Hair",
  "blow dry (m)": "Blow Dry - Medium Hair",

  // Curly/wavy blow dry — same pattern.
  "curly/wavy (medium)": "Curly/Wavy - Medium Hair",
  "curly/wavy (long)": "Wavy/Curly - Long Hair",
  "curly/wavy (short)": "Wavy/Curly - Short Hair",
  "curly/wavy blow dry (medium)": "Curly/Wavy - Medium Hair",
  "curly/wavy blow dry (long)": "Wavy/Curly - Long Hair",
  "curly/wavy blow dry (short)": "Wavy/Curly - Short Hair",

  // Product application: Ateeq's "Full Hair (medium/short)" maps to
  // Sukona's "- Medium Hair" / "- Short Hair" naming.
  "product application - full hair (medium)": "Product Application - Medium Hair",
  "product application - full hair (short)": "Product Application - Short Hair",
  "product application - full hair (long)": "Product Application - Long Hair",

  // Foot & leg massage — Ateeq's "and" / "/" variants.
  "foot and leg massage (15min)": "Foot & Leg Massage (15min)",
  "foot and leg massage (30min)": "Foot & Leg Massage (30min)",
  "foot and leg massage (60min)": "Foot & Leg Massage (60min)",
  "foot and leg massage (90min)": "Foot & Leg Massage (90min)",
  "foot and leg massage(90min)": "Foot & Leg Massage (90min)",
  "foot/leg massage (15min)": "Foot & Leg Massage (15min)",
  "foot/leg massage (30min)": "Foot & Leg Massage (30min)",

  // Arm & hand massage — Sukona pluralizes "Hands".
  "arm & hand massage (15min)": "Arm & Hands Massage (15min)",
  "arm & hand massage (30min)": "Arm & Hands Massage (30min)",
  "arm & hand massage (60min)": "Arms & Hands Massage (60min) ",
  "arm & hand massage (90min)": "Arm & Hands Massage (90min)",
  "arm and hand massage (15min)": "Arm & Hands Massage (15min)",
  "arm and hand massage (30min)": "Arm & Hands Massage (30min)",

  // Shoulder — Ateeq wrote "Shoulder massage"; Sukona's is
  // "Shoulder, Neck & Head Massage".
  "shoulder massage (15min)": "Shoulder, Neck & Head Massage (15min)",
  "shoulder massage (30min)": "Shoulder, Neck & Head Massage (30min)",
  "shoulder massage (60min)": "Shoulder, Neck & Head Massage (60min)",
  "shoulder massage (90min)": "Shoulder, Neck & Head Massage (90min)",

  // Threading naming variants.
  "eyebrow threading": "Eyebrows threading",
  "full face threading": "Full face threading ",

  // Cut & file — Ateeq's parenthetical variants collapse to one row.
  "cut & file (hands or feet)": "Cut & File",
  "kid's cut & file (feet)": "Kid’s Cut & File",
  "kid's cut & file (hands)": "Kid’s Cut & File",
  "kids cut & file (hands and feet)": "Kid’s Cut & File", // quantity handled separately

  // Polish change / kid nail color.
  "polish change (hands or feet)": "Polish Change ",
  "polish change (hands + feet)": "Polish Change ",
  "polish chang": "Polish Change ",
  "polish change/fix": "Polish Change ",
  "kids polish change": "Kid Nail Color ",
  "kid french tip": "Kid Nail Color ",

  // Kids.
  "kids manicure": "Kid’s Manicure",
  "kid's manicure": "Kid’s Manicure",
  "kids pedicure": "Kid’s Pedicure",
  "kid's pedicure": "Kid’s Pedicure",

  // French polish add-on — Ateeq's "add-on" is a per-hand or per-foot
  // top-up. Map to Sukona's "French polish (Hands)" as the default;
  // owner can adjust individual rows in the app if needed.
  "french polish add-on": "French polish (Hands)",
  "french polish (hands or feet)": "French polish (Hands)",
  "french (hand or feet)": "French polish (Hands)",
  "french (hands or feet)": "French polish (Hands)",

  // Fake nails.
  "fake nail application": "Fake Nails Extension - Normal Polish",
  "fake nail application = 50": "Fake nails (add-on)",
  "fake nail (per piece)": "Fake nails (add-on)",
  "fake nail (pieces)": "Fake nails (add-on)",
  "full set extension (normal polish)": "Fake Nails Extension - Normal Polish",

  // Others.
  "detox scalp treatment": "Detox Hair Treatment",
  "post natal massage (60min)": "Postnatal Massage (60min)",
  "chrome color": "Chrome",
  "quick refresh": "Quick Refresh (Hands)", // ambiguous — default hands
  "basic mani": "Basic Manicure",
  "pedicure (tier unspecified)": "Basic Pedicure",
  "manicure (tier unspecified)": "Basic Manicure",

  // Extra variants found in the v3 dry-run.
  "gel removal": "Gel Removal (Hands or Feet)",
  "blow dry curly/wavy (medium)": "Curly/Wavy - Medium Hair",
  "blow dry curly/wavy (long)": "Wavy/Curly - Long Hair",
  "blow dry curly/wavy (short)": "Wavy/Curly - Short Hair",

  // Owner-decided mappings from the v3 dry-run round-trip.
  "mani & pedi (tier unspecified)": "Basic Mani & Pedi",
  "french tip (hands & feet)": "French Polish (Hands & Feet)",
  "blow dry kid (short)": "Kids Blow Dry - Short Hair",
  "blow dry kid (medium)": "Kids Blow Dry - Medium Hair",
  "blow dry kid (long)": "Kids Blow Dry - Long Hair",
};

/**
 * Names that should be booked as N×base — the parenthetical
 * "(hands and feet)" reads as two sides (hands + feet) rather than
 * a bundle. Only for services that Sukona sells per side.
 */
const MULTIPLIER_ALIASES: Record<string, { name: string; multiplier: number }> = {
  "kid's cut & file (hands and feet)": { name: "Kid’s Cut & File", multiplier: 2 },
};

/** Strip trailing "= 145" style price notes on service names. */
function stripPriceNote(s: string): string {
  return s.replace(/\s*=\s*\d+\s*$/, "").trim();
}

/**
 * Split on " + " at depth 0 (outside parentheses). Ateeq's data
 * has both: "Signature Mani & Pedi + Quick refresh (hands)" is
 * two services joined by a plus, while "Polish Change (Hands +
 * Feet)" is one service with a plus inside its parenthetical —
 * splitting blindly would break the second case.
 */
function splitOnUnnestedPlus(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (depth === 0 && c === "+" && s[i - 1] === " " && s[i + 1] === " ") {
      out.push(buf.trim());
      buf = "";
      i += 2; // skip "+ "
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [s];
}

// ============================================================
// Args
// ============================================================

interface Args { salonId: string; file: string; dryRun: boolean }
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const salonIdIdx = argv.indexOf("--salon-id");
  const fileIdx = argv.indexOf("--file");
  const dryRun = argv.includes("--dry-run");
  if (salonIdIdx === -1 || fileIdx === -1) {
    console.error("Usage: npm run import:ateeq -- --salon-id <uuid> --file <path> [--dry-run]");
    process.exit(2);
  }
  return { salonId: argv[salonIdIdx + 1], file: path.resolve(argv[fileIdx + 1]), dryRun };
}

// ============================================================
// Utils
// ============================================================

function die(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} (y/n) `, (ans) => { rl.close(); resolve(ans.trim().toLowerCase() === "y"); });
  });
}

/** UAE phone → E.164. See earlier commit for the rules. */
function normalizePhone(raw: unknown): string {
  const s = String(raw ?? "").replace(/[\s-]/g, "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (s.startsWith("0")) return "+971" + s.slice(1);
  if (s.startsWith("971")) return "+" + s;
  return "+971" + s;
}

/**
 * Lookup key for services: lowercase, collapse whitespace, keep
 * everything else so "Blow Dry - Medium Hair" and "Blow Dry (medium)"
 * are distinct (aliased separately).
 */
function svcKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Split "AICA & MARIPEL & YASIR", "AICA + MARIPEL", "AICA, MARIPEL". */
function splitStaff(raw: string): string[] {
  return raw
    .split(/[&+,]|(?:\band\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extract "x2 " / "X4 " / "x1 " prefix. Returns {qty, rest}. */
function extractQuantity(name: string): { quantity: number; rest: string } {
  const m = name.match(/^\s*x\s*(\d+)\s+(.+)$/i);
  if (!m) return { quantity: 1, rest: name.trim() };
  return { quantity: Number(m[1]), rest: m[2].trim() };
}

/** Range parsing — see earlier commit for the notes. */
function parseTimeRange(raw: string): { start: string; end: string } | null {
  const cleaned = raw.split(/[\n(]/)[0];
  const s = cleaned.trim().toLowerCase().replace(/\s+/g, " ");
  const suffixMatch = s.match(/(am|pm)\s*$/);
  const suffix = suffixMatch ? (suffixMatch[1] as "am" | "pm") : null;
  const body = suffix ? s.slice(0, suffixMatch!.index).trim() : s;
  const parts = body.split(/\s*-\s*/);
  if (parts.length !== 2) return null;
  const t1 = parseTimePart(parts[0]);
  const t2 = parseTimePart(parts[1]);
  if (!t1 || !t2) return null;
  const [h1, m1, s1] = t1;
  const [h2, m2, s2] = t2;
  const suffixedStart = s1 || suffix;
  const suffixedEnd = s2 || suffix;
  if (!suffixedStart || !suffixedEnd) return null;
  let sh = to24(h1, suffixedStart);
  const eh = to24(h2, suffixedEnd);
  if (suffix && !s1 && !s2 && h1 > h2) sh = to24(h1, "am");
  return {
    start: `${String(sh).padStart(2, "0")}:${String(m1).padStart(2, "0")}`,
    end: `${String(eh).padStart(2, "0")}:${String(m2).padStart(2, "0")}`,
  };
}
function parseTimePart(s: string): [number, number, "am" | "pm" | null] | null {
  const t = s.trim().toLowerCase();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const suf = (m[3] as "am" | "pm" | undefined) ?? null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return [h, min, suf];
}
function to24(h: number, suf: "am" | "pm"): number {
  if (suf === "am") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function cellToDate(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}
function cellToNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v && "result" in v) {
    const r = (v as { result: unknown }).result;
    return r == null ? "" : String(r);
  }
  return String(v);
}

// ============================================================
// Read the workbook
// ============================================================

function readAppointmentRows(wb: ExcelJS.Workbook): { rows: RawRow[]; errors: string[] } {
  const ws = wb.getWorksheet("Appointments");
  if (!ws) die(`Workbook is missing the "Appointments" sheet.`);
  const errors: string[] = [];
  const rows: RawRow[] = [];

  ws!.eachRow((row, rowNum) => {
    if (rowNum === 1) return;

    const dateCell = row.getCell(1).value;
    const timeCell = cellToString(row.getCell(2).value).trim();
    const nameCell = cellToString(row.getCell(3).value).trim();
    const phoneCell = row.getCell(4).value;
    const addressCell = cellToString(row.getCell(5).value).trim();
    const servicesCell = cellToString(row.getCell(7).value).trim();
    const staffCell = cellToString(row.getCell(8).value).trim();
    const totalCell = row.getCell(11).value;
    let methodRaw = cellToString(row.getCell(12).value).trim().toLowerCase();

    // Q4 decision: "card / cash" → "card" (Sukona has no split-payment
    // model; owner picks the primary method).
    if (methodRaw === "card / cash") methodRaw = "card";

    if (!dateCell && !timeCell && !nameCell && !servicesCell) return;

    const date = cellToDate(dateCell);
    if (!date) { errors.push(`Row ${rowNum}: date could not be parsed from "${String(dateCell)}"`); return; }

    const range = parseTimeRange(timeCell);
    if (!range) { errors.push(`Row ${rowNum}: time "${timeCell}" could not be parsed`); return; }

    if (!nameCell) { errors.push(`Row ${rowNum}: client name is required`); return; }
    const phone = normalizePhone(phoneCell);
    if (!phone) { errors.push(`Row ${rowNum}: phone is required`); return; }

    // Parse services: split on ";", then on unnested " + " (some
    // rows joined two services with a plus), strip trailing "= <price>"
    // notes, strip quantity prefix, apply multiplier aliases (e.g.
    // "Kid's Cut & File (Hands and feet)" → 2× "Kid's Cut & File"),
    // keep {name, qty}.
    const services: LineItem[] = servicesCell
      .split(";")
      .flatMap((s) => splitOnUnnestedPlus(s.trim()))
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const { quantity, rest } = extractQuantity(s);
        const stripped = stripPriceNote(rest);
        const mult = MULTIPLIER_ALIASES[svcKey(stripped)];
        if (mult) return { name: mult.name, quantity: quantity * mult.multiplier };
        return { name: stripped, quantity };
      });
    if (services.length === 0) { errors.push(`Row ${rowNum}: services list is empty`); return; }

    if (!staffCell) { errors.push(`Row ${rowNum}: staff is required`); return; }
    const staffNames = splitStaff(staffCell);
    if (staffNames.length === 0) { errors.push(`Row ${rowNum}: staff could not be parsed from "${staffCell}"`); return; }

    const total = cellToNumber(totalCell);
    if (total == null || total < 0) { errors.push(`Row ${rowNum}: total "${String(totalCell)}" is not a non-negative number`); return; }

    let method: RawRow["method"] = null;
    if (methodRaw === "cash") method = "cash";
    else if (methodRaw === "card") method = "card";
    else if (methodRaw === "other") method = "other";
    else if (methodRaw) { errors.push(`Row ${rowNum}: payment mode "${methodRaw}" is not cash/card/other`); return; }

    rows.push({
      rowNum,
      date,
      startTime: range.start,
      clientName: nameCell,
      clientPhone: phone,
      address: addressCell || null,
      services,
      staffNames,
      total,
      method,
    });
  });

  return { rows, errors };
}

// ============================================================
// Catalog resolution
// ============================================================

interface BundleWithItems {
  id: string;
  name: string;
  fixed_price: number | null;
  discount_type: string;
  discount_percentage: number | null;
  duration_override: number | null;
  items: Array<{ service_id: string; sort_order: number }>;
}

interface Catalog {
  servicesByKey: Map<string, { id: string; name: string; price: number }>;
  bundlesByKey: Map<string, BundleWithItems>;
  bundleItemServicePrices: Map<string, number>; // service_id → price (for bundle unroll)
  staffByName: Map<string, { id: string; name: string }>;
}

// Resolution: either a bundle instance or a direct service.
type Resolved =
  | { kind: "bundle"; bundle: BundleWithItems; quantity: number }
  | { kind: "service"; id: string; name: string; quantity: number };

function resolveOne(rawName: string, cat: Catalog): { resolved: Resolved | null; sourceName: string } {
  // Normalize once for lookups. Aliases first, then bundles, then services.
  const key = svcKey(rawName);
  const aliased = SERVICE_ALIASES[key];
  const lookupKey = aliased ? svcKey(aliased) : key;

  const bundle = cat.bundlesByKey.get(lookupKey);
  if (bundle) return { resolved: { kind: "bundle", bundle, quantity: 1 }, sourceName: aliased ?? rawName };

  const svc = cat.servicesByKey.get(lookupKey);
  if (svc) return { resolved: { kind: "service", id: svc.id, name: svc.name, quantity: 1 }, sourceName: aliased ?? rawName };

  return { resolved: null, sourceName: rawName };
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the env.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Reading ${args.file} …`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(args.file);
  const { rows, errors } = readAppointmentRows(wb);
  console.log(`  ${rows.length} valid rows · ${errors.length} skipped due to parse errors`);
  if (errors.length > 0) {
    console.log(`\nParse errors:`);
    for (const e of errors) console.log(`  - ${e}`);
  }

  // ---- Verify salon ----
  const { data: salon, error: salonErr } = await supabase
    .from("salons").select("id, name").eq("id", args.salonId).maybeSingle();
  if (salonErr || !salon) die(`Salon ${args.salonId} not found: ${salonErr?.message ?? "no row"}`);
  console.log(`\nTarget salon: ${salon.name} (${args.salonId})`);

  // ---- Load catalog ----
  const [{ data: svcs }, { data: bdls }, { data: bItems }, { data: staff }] = await Promise.all([
    supabase.from("services").select("id, name, price, is_active").eq("salon_id", args.salonId),
    supabase.from("service_bundles").select("id, name, fixed_price, discount_type, discount_percentage, duration_override, is_active"),
    supabase.from("service_bundle_items").select("bundle_id, service_id, sort_order"),
    supabase.from("profiles").select("id, full_name").eq("salon_id", args.salonId),
  ]);
  const servicesByKey = new Map<string, { id: string; name: string; price: number }>();
  const svcPriceById = new Map<string, number>();
  for (const s of svcs ?? []) {
    servicesByKey.set(svcKey(String(s.name)), { id: String(s.id), name: String(s.name), price: Number(s.price) });
    svcPriceById.set(String(s.id), Number(s.price));
  }
  const bundlesByKey = new Map<string, BundleWithItems>();
  for (const b of bdls ?? []) {
    bundlesByKey.set(svcKey(String(b.name)), {
      id: String(b.id),
      name: String(b.name),
      fixed_price: b.fixed_price == null ? null : Number(b.fixed_price),
      discount_type: String(b.discount_type),
      discount_percentage: b.discount_percentage == null ? null : Number(b.discount_percentage),
      duration_override: b.duration_override == null ? null : Number(b.duration_override),
      items: [],
    });
  }
  const bundleById = new Map<string, BundleWithItems>();
  for (const b of bundlesByKey.values()) bundleById.set(b.id, b);
  for (const it of bItems ?? []) {
    const b = bundleById.get(String(it.bundle_id));
    if (b) b.items.push({ service_id: String(it.service_id), sort_order: Number(it.sort_order) });
  }
  for (const b of bundlesByKey.values()) b.items.sort((a, z) => a.sort_order - z.sort_order);
  const staffByName = new Map<string, { id: string; name: string }>();
  for (const p of staff ?? []) staffByName.set(String(p.full_name ?? "").trim().toLowerCase(), { id: String(p.id), name: String(p.full_name) });

  const catalog: Catalog = { servicesByKey, bundlesByKey, bundleItemServicePrices: svcPriceById, staffByName };

  // ---- Resolve services + staff across all rows ----
  const unmatchedServiceCounts = new Map<string, number>();
  const unmatchedStaffCounts = new Map<string, number>();

  // Pre-resolve per row so the write phase can skip if anything's missing.
  interface RowResolved {
    raw: RawRow;
    lineItems: Array<{ line: LineItem; resolved: Resolved | null }>;
    staffIds: string[];
    unmatchedStaff: string[];
    unmatchedServices: string[];
  }
  const resolved: RowResolved[] = rows.map((r) => {
    const li: RowResolved["lineItems"] = r.services.map((s) => {
      const rz = resolveOne(s.name, catalog);
      if (rz.resolved) rz.resolved.quantity = s.quantity;
      return { line: s, resolved: rz.resolved };
    });
    const unmatchedServices: string[] = [];
    for (const it of li) if (!it.resolved) unmatchedServices.push(it.line.name);
    const staffIds: string[] = [];
    const unmatchedStaff: string[] = [];
    for (const s of r.staffNames) {
      const found = staffByName.get(s.toLowerCase());
      if (found) staffIds.push(found.id);
      else unmatchedStaff.push(s);
    }
    return { raw: r, lineItems: li, staffIds, unmatchedStaff, unmatchedServices };
  });

  for (const rr of resolved) {
    for (const s of rr.unmatchedServices) unmatchedServiceCounts.set(s, (unmatchedServiceCounts.get(s) ?? 0) + 1);
    for (const s of rr.unmatchedStaff) unmatchedStaffCounts.set(s, (unmatchedStaffCounts.get(s) ?? 0) + 1);
  }

  // ---- Dedup clients + collect addresses ----
  interface ClientAgg { phone: string; name: string; addresses: string[]; firstRowNum: number }
  const clientByPhone = new Map<string, ClientAgg>();
  for (const r of rows) {
    let agg = clientByPhone.get(r.clientPhone);
    if (!agg) { agg = { phone: r.clientPhone, name: r.clientName, addresses: [], firstRowNum: r.rowNum }; clientByPhone.set(r.clientPhone, agg); }
    if (r.address && !agg.addresses.includes(r.address)) agg.addresses.push(r.address);
  }
  const phoneList = [...clientByPhone.keys()];
  const { data: existingClients } = await supabase
    .from("clients").select("id, name, phone").eq("salon_id", args.salonId).in("phone", phoneList);
  const existingClientByPhone = new Map<string, { id: string; name: string }>(
    (existingClients ?? []).map((c) => [String(c.phone), { id: String(c.id), name: String(c.name) }]),
  );
  const newClientCount = [...clientByPhone.keys()].filter((p) => !existingClientByPhone.has(p)).length;
  const matchedClientCount = clientByPhone.size - newClientCount;
  const totalLocations = [...clientByPhone.values()].reduce((n, c) => n + c.addresses.length, 0);

  // ---- Report ----
  console.log(`\nPreview:`);
  console.log(`  Appointments:  ${rows.length} to insert`);
  console.log(`  Clients:       ${matchedClientCount} matched · ${newClientCount} new`);
  console.log(`  Locations:     ${totalLocations} unique (client × address)`);
  console.log(`  Payments:      ${rows.filter((r) => r.method).length} rows`);

  if (unmatchedServiceCounts.size > 0) {
    console.log(`\n⚠  ${unmatchedServiceCounts.size} service name(s) still unmatched:`);
    const sorted = [...unmatchedServiceCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) console.log(`    ${count.toString().padStart(4)}×  ${name}`);
  }
  if (unmatchedStaffCounts.size > 0) {
    console.log(`\n⚠  ${unmatchedStaffCounts.size} staff name(s) unmatched:`);
    for (const [name, count] of unmatchedStaffCounts.entries()) console.log(`    ${count.toString().padStart(4)}×  ${name}`);
  }

  if (args.dryRun) {
    console.log(`\n(dry run — no writes performed)`);
    return;
  }
  if (unmatchedServiceCounts.size > 0 || unmatchedStaffCounts.size > 0) {
    die(`Cannot proceed with unmatched services or staff.`);
  }
  const ok = await confirm(`\nProceed with import?`);
  if (!ok) die("Aborted by user.");

  // ============================================================
  // WRITE
  // ============================================================

  console.log(`\nInserting clients…`);
  const clientIdByPhone = new Map<string, string>();
  for (const [phone, existing] of existingClientByPhone) clientIdByPhone.set(phone, existing.id);
  const newClientRows: Array<{ salon_id: string; name: string; phone: string; address: string | null }> = [];
  for (const [phone, agg] of clientByPhone) {
    if (existingClientByPhone.has(phone)) continue;
    newClientRows.push({ salon_id: args.salonId, name: agg.name, phone, address: agg.addresses[0] ?? null });
  }
  if (newClientRows.length > 0) {
    const { data: inserted, error: cErr } = await supabase.from("clients").insert(newClientRows).select("id, phone");
    if (cErr) die(`Failed to insert clients: ${cErr.message}`);
    for (const c of inserted ?? []) clientIdByPhone.set(String(c.phone), String(c.id));
  }
  console.log(`  ✔ ${newClientRows.length} new · ${matchedClientCount} matched`);

  console.log(`Inserting client locations…`);
  const clientIdsAll = [...clientIdByPhone.values()];
  const { data: existingLocs } = clientIdsAll.length
    ? await supabase.from("client_locations").select("client_id, address").in("client_id", clientIdsAll)
    : { data: [] as Array<{ client_id: string; address: string | null }> };
  const existingAddrByClient = new Map<string, Set<string>>();
  for (const l of existingLocs ?? []) {
    if (!l.address) continue;
    const s = existingAddrByClient.get(String(l.client_id)) ?? new Set<string>();
    s.add(String(l.address).trim());
    existingAddrByClient.set(String(l.client_id), s);
  }
  const locRowsToInsert: Array<{ salon_id: string; client_id: string; address: string; is_default: boolean }> = [];
  for (const [phone, agg] of clientByPhone) {
    const clientId = clientIdByPhone.get(phone);
    if (!clientId) continue;
    const isNewClient = !existingClientByPhone.has(phone);
    const seen = existingAddrByClient.get(clientId) ?? new Set<string>();
    let first = true;
    for (const addr of agg.addresses) {
      if (seen.has(addr.trim())) continue;
      locRowsToInsert.push({ salon_id: args.salonId, client_id: clientId, address: addr, is_default: isNewClient && first });
      first = false;
    }
  }
  if (locRowsToInsert.length > 0) {
    const { error: lErr } = await supabase.from("client_locations").insert(locRowsToInsert);
    if (lErr) die(`Failed to insert client_locations: ${lErr.message}`);
  }
  console.log(`  ✔ ${locRowsToInsert.length} locations inserted`);

  const { data: allLocs } = await supabase.from("client_locations").select("id, client_id, address").in("client_id", clientIdsAll);
  const locIdByClientAndAddress = new Map<string, string>();
  for (const l of allLocs ?? []) if (l.address) locIdByClientAndAddress.set(`${l.client_id}|${String(l.address).trim()}`, String(l.id));

  console.log(`Inserting appointments…`);
  let apptOk = 0, payOk = 0;
  for (const rr of resolved) {
    const r = rr.raw;
    const clientId = clientIdByPhone.get(r.clientPhone);
    if (!clientId) die(`Bug: no clientId for phone ${r.clientPhone} at row ${r.rowNum}`);
    if (rr.staffIds.length === 0) die(`Bug: no staffIds at row ${r.rowNum}`);
    const primaryStaffId = rr.staffIds[0];
    const locId = r.address ? locIdByClientAndAddress.get(`${clientId}|${r.address.trim()}`) ?? null : null;
    const historicalTs = new Date(`${r.date}T${r.startTime}:00+04:00`).toISOString();

    const { data: appt, error: aErr } = await supabase
      .from("appointments")
      .insert({
        salon_id: args.salonId,
        client_id: clientId,
        service_id: null,
        date: r.date,
        time: `${r.startTime}:00`,
        status: "paid",
        location_id: locId,
        created_at: historicalTs,
      })
      .select("id")
      .single();
    if (aErr) die(`Failed to insert appointment row ${r.rowNum}: ${aErr.message}`);

    // Build appointment_services rows. Each line-item may be a bundle
    // (unrolled to N rows sharing a bundle_instance_id, first carries
    // bundle_total_price) or a plain service. Quantity duplicates the
    // whole unit N times.
    const svcRows: Array<Record<string, unknown>> = [];
    let sortOrder = 0;
    for (const it of rr.lineItems) {
      if (!it.resolved) die(`Bug: unresolved service at row ${r.rowNum}`);
      for (let q = 0; q < it.resolved.quantity; q++) {
        if (it.resolved.kind === "bundle") {
          const b = it.resolved.bundle;
          const instanceId = randomUUID();
          const bundleTotal = b.fixed_price ?? 0;
          b.items.forEach((bi, idx) => {
            svcRows.push({
              salon_id: args.salonId,
              appointment_id: appt.id,
              service_id: bi.service_id,
              staff_id: primaryStaffId,
              bundle_id: b.id,
              bundle_instance_id: instanceId,
              bundle_total_price: idx === 0 ? bundleTotal : 0,
              bundle_name: b.name,
              sort_order: sortOrder++,
            });
          });
        } else {
          svcRows.push({
            salon_id: args.salonId,
            appointment_id: appt.id,
            service_id: it.resolved.id,
            staff_id: primaryStaffId,
            sort_order: sortOrder++,
          });
        }
      }
    }
    if (svcRows.length > 0) {
      const { error: sErr } = await supabase.from("appointment_services").insert(svcRows);
      if (sErr) die(`Failed to insert appointment_services for row ${r.rowNum}: ${sErr.message}`);
    }

    // appointment_staff: one row per unique staff on the appointment.
    const uniqueStaff = [...new Set(rr.staffIds)];
    const staffRows = uniqueStaff.map((sid) => ({ salon_id: args.salonId, appointment_id: appt.id, staff_id: sid }));
    const { error: apStaffErr } = await supabase.from("appointment_staff").insert(staffRows);
    if (apStaffErr) die(`Failed to insert appointment_staff for row ${r.rowNum}: ${apStaffErr.message}`);

    if (r.method) {
      const { error: pErr } = await supabase.from("payments").insert({
        salon_id: args.salonId,
        appointment_id: appt.id,
        amount: r.total,
        method: r.method,
        created_at: historicalTs,
      });
      if (pErr) die(`Failed to insert payment for row ${r.rowNum}: ${pErr.message}`);
      payOk++;
    }
    apptOk++;
  }
  console.log(`  ✔ ${apptOk} appointments · ${payOk} payments`);

  console.log(`\n✔ Ateeq import complete for ${salon.name}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
