/**
 * Sukona historical-data import runner.
 *
 * Usage (from project root, with .env.local containing
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *
 *   npm run import:run -- \
 *     --salon-id <uuid> \
 *     --file path/to/filled-template.xlsx \
 *     [--dry-run]
 *
 * The script:
 *   1. Reads the four data tabs (Clients / Services / Staff / Appointments).
 *   2. Validates every row (phone format, dates, times, references).
 *   3. Matches clients to existing Sukona records by phone (dedup within
 *      file too — one row per unique phone). Auto-adds missing clients
 *      as new rows.
 *   4. Confirms services + staff already exist in the target salon;
 *      unknown ones cause the whole import to abort so the owner can
 *      add them via /catalog and /team first.
 *   5. Prints a preview summary and — unless --dry-run — inserts
 *      everything under the given salon_id, setting each appointment's
 *      `created_at` to its historical date so Reports timelines
 *      show correct historical revenue.
 *
 * Uses the service-role key to bypass RLS — this script is meant to
 * be run by ops, not exposed to end users.
 */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import readline from "node:readline";

// ============================================================
// Types
// ============================================================

interface ClientRow {
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  _rowNum: number;
}

interface ServiceRow {
  name: string;
  price: number;
  duration: number;
  category: string | null;
  _rowNum: number;
}

interface StaffRow {
  name: string;
  phone: string | null;
  role: "owner" | "admin" | "staff";
  _rowNum: number;
}

interface AppointmentRow {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  clientPhone: string;
  services: string[]; // parsed from comma-separated
  staffName: string;
  total: number;
  method: "cash" | "card" | "other" | null;
  status: "paid" | "completed" | "cancelled" | "no_show";
  _rowNum: number;
}

type PaymentMethod = "cash" | "card" | "other";
type AppointmentStatus = "paid" | "completed" | "cancelled" | "no_show";

// ============================================================
// Args
// ============================================================

interface Args {
  salonId: string;
  file: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const salonIdIdx = argv.indexOf("--salon-id");
  const fileIdx = argv.indexOf("--file");
  const dryRun = argv.includes("--dry-run");
  if (salonIdIdx === -1 || fileIdx === -1) {
    console.error("Usage: npm run import:run -- --salon-id <uuid> --file <path> [--dry-run]");
    process.exit(2);
  }
  return {
    salonId: argv[salonIdIdx + 1],
    file: path.resolve(argv[fileIdx + 1]),
    dryRun,
  };
}

// ============================================================
// Utils
// ============================================================

/** Strip all whitespace + non-digit-non-plus from a phone. */
function normalizePhone(raw: unknown): string {
  return String(raw ?? "").replace(/[^\d+]/g, "");
}

/** Bail with a red message + exit code 1. */
function die(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true; // Non-interactive → assume yes.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} (y/n) `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "y");
    });
  });
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}
function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// ============================================================
// Read + validate workbook
// ============================================================

async function loadWorkbook(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const need = ["Clients", "Services", "Staff", "Appointments"];
  for (const n of need) {
    if (!wb.getWorksheet(n)) die(`Workbook is missing the "${n}" tab.`);
  }
  return wb;
}

function readClients(wb: ExcelJS.Workbook): ClientRow[] {
  const ws = wb.getWorksheet("Clients");
  if (!ws) die("Missing Clients tab.");
  const out: ClientRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // header
    const name = String(row.getCell(1).value ?? "").trim();
    const phone = normalizePhone(row.getCell(2).value);
    const address = String(row.getCell(3).value ?? "").trim() || null;
    const notes = String(row.getCell(4).value ?? "").trim() || null;
    if (!name && !phone && !address && !notes) return; // blank row
    if (!name) die(`Clients row ${rowNum}: name is required.`);
    if (!phone) die(`Clients row ${rowNum}: phone is required.`);
    out.push({ name, phone, address, notes, _rowNum: rowNum });
  });
  return out;
}

function readServices(wb: ExcelJS.Workbook): ServiceRow[] {
  const ws = wb.getWorksheet("Services");
  if (!ws) die("Missing Services tab.");
  const out: ServiceRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const name = String(row.getCell(1).value ?? "").trim();
    const priceRaw = row.getCell(2).value;
    const durationRaw = row.getCell(3).value;
    const category = String(row.getCell(4).value ?? "").trim() || null;
    if (!name && !priceRaw && !durationRaw && !category) return;
    if (!name) die(`Services row ${rowNum}: name is required.`);
    const price = Number(priceRaw);
    const duration = Number(durationRaw);
    if (!Number.isFinite(price) || price < 0) die(`Services row ${rowNum}: price must be a non-negative number.`);
    if (!Number.isFinite(duration) || duration <= 0) die(`Services row ${rowNum}: duration must be a positive number.`);
    out.push({ name, price, duration, category, _rowNum: rowNum });
  });
  return out;
}

function readStaff(wb: ExcelJS.Workbook): StaffRow[] {
  const ws = wb.getWorksheet("Staff");
  if (!ws) die("Missing Staff tab.");
  const out: StaffRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const name = String(row.getCell(1).value ?? "").trim();
    const phone = normalizePhone(row.getCell(2).value) || null;
    const roleRaw = String(row.getCell(3).value ?? "").trim().toLowerCase();
    if (!name && !phone && !roleRaw) return;
    if (!name) die(`Staff row ${rowNum}: name is required.`);
    const role = (roleRaw || "staff") as StaffRow["role"];
    if (!["owner", "admin", "staff"].includes(role)) die(`Staff row ${rowNum}: role must be owner / admin / staff.`);
    out.push({ name, phone, role, _rowNum: rowNum });
  });
  return out;
}

function readAppointments(wb: ExcelJS.Workbook): AppointmentRow[] {
  const ws = wb.getWorksheet("Appointments");
  if (!ws) die("Missing Appointments tab.");
  const out: AppointmentRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const cell = (i: number) => String(row.getCell(i).value ?? "").trim();
    const date = cell(1);
    const time = cell(2);
    const clientPhone = normalizePhone(row.getCell(3).value);
    const servicesRaw = cell(4);
    const staffName = cell(5);
    const totalRaw = row.getCell(6).value;
    const methodRaw = cell(7).toLowerCase() as PaymentMethod | "";
    const status = cell(8).toLowerCase() as AppointmentStatus;
    if (!date && !time && !clientPhone && !servicesRaw && !staffName && !totalRaw && !methodRaw && !status) return;
    if (!isValidDate(date)) die(`Appointments row ${rowNum}: date "${date}" must be YYYY-MM-DD.`);
    if (!isValidTime(time)) die(`Appointments row ${rowNum}: time "${time}" must be HH:MM (24-hour).`);
    if (!clientPhone) die(`Appointments row ${rowNum}: client phone is required.`);
    if (!servicesRaw) die(`Appointments row ${rowNum}: services list is required.`);
    if (!staffName) die(`Appointments row ${rowNum}: staff name is required.`);
    const total = Number(totalRaw);
    if (!Number.isFinite(total) || total < 0) die(`Appointments row ${rowNum}: total must be a non-negative number.`);
    if (methodRaw && !["cash", "card", "other"].includes(methodRaw)) {
      die(`Appointments row ${rowNum}: payment method "${methodRaw}" must be cash / card / other or blank.`);
    }
    if (!["paid", "completed", "cancelled", "no_show"].includes(status)) {
      die(`Appointments row ${rowNum}: status "${status}" must be paid / completed / cancelled / no_show.`);
    }
    const services = servicesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (services.length === 0) die(`Appointments row ${rowNum}: services must contain at least one entry.`);
    out.push({
      date, time, clientPhone,
      services, staffName, total,
      method: (methodRaw || null) as PaymentMethod | null,
      status,
      _rowNum: rowNum,
    });
  });
  return out;
}

// ============================================================
// Main
// ============================================================

type Supa = ReturnType<typeof createClient>;

interface ClientResolved { id: string; name: string; phone: string; isNew: boolean }
interface ServiceResolved { id: string; name: string; }

async function main() {
  const args = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the env.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Reading ${args.file} …`);
  const wb = await loadWorkbook(args.file);
  const clientsIn = readClients(wb);
  const servicesIn = readServices(wb);
  const staffIn = readStaff(wb);
  const apptsIn = readAppointments(wb);

  console.log(`  Clients tab:      ${clientsIn.length} rows`);
  console.log(`  Services tab:     ${servicesIn.length} rows`);
  console.log(`  Staff tab:        ${staffIn.length} rows`);
  console.log(`  Appointments tab: ${apptsIn.length} rows`);

  // ---- Verify target salon ----
  const { data: salon, error: salonErr } = await supabase
    .from("salons")
    .select("id, name")
    .eq("id", args.salonId)
    .maybeSingle();
  if (salonErr || !salon) die(`Salon ${args.salonId} not found: ${salonErr?.message ?? "no row"}`);
  console.log(`\nTarget salon: ${salon.name} (${args.salonId})`);

  // ---- Dedup within-file clients (by phone) ----
  const clientByPhone = new Map<string, ClientRow>();
  for (const c of clientsIn) {
    const existing = clientByPhone.get(c.phone);
    if (!existing) {
      clientByPhone.set(c.phone, c);
    } else {
      // Merge: keep the first row's name/address; append notes if new.
      if (c.notes && c.notes !== existing.notes) {
        existing.notes = existing.notes ? `${existing.notes} | ${c.notes}` : c.notes;
      }
      if (!existing.address && c.address) existing.address = c.address;
    }
  }

  // Also add clients referenced only in the Appointments tab (auto-create).
  for (const a of apptsIn) {
    if (!clientByPhone.has(a.clientPhone)) {
      clientByPhone.set(a.clientPhone, {
        name: `Client ${a.clientPhone}`, // placeholder — owner can edit later
        phone: a.clientPhone,
        address: null,
        notes: null,
        _rowNum: a._rowNum,
      });
    }
  }

  // ---- Match clients against existing Sukona rows by phone ----
  const phoneList = [...clientByPhone.keys()];
  const { data: existingClients } = await supabase
    .from("clients")
    .select("id, name, phone")
    .eq("salon_id", args.salonId)
    .in("phone", phoneList);
  const existingByPhone = new Map<string, { id: string; name: string; phone: string }>(
    (existingClients ?? []).map((c) => [String(c.phone), { id: String(c.id), name: String(c.name), phone: String(c.phone) }]),
  );
  const resolvedClients = new Map<string, ClientResolved>();
  for (const [phone, row] of clientByPhone) {
    const existing = existingByPhone.get(phone);
    if (existing) {
      resolvedClients.set(phone, { id: existing.id, name: existing.name, phone, isNew: false });
    } else {
      resolvedClients.set(phone, { id: "", name: row.name, phone, isNew: true });
    }
  }
  const newClientCount = [...resolvedClients.values()].filter((c) => c.isNew).length;
  const matchedClientCount = resolvedClients.size - newClientCount;

  // ---- Verify services exist in the salon ----
  const { data: existingServices } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .eq("salon_id", args.salonId);
  const svcByName = new Map<string, ServiceResolved>(
    (existingServices ?? []).map((s) => [String(s.name).toLowerCase(), { id: String(s.id), name: String(s.name) }]),
  );
  // Services present in the Services tab but not yet in Sukona → we'll create them.
  const svcNamesFromApps = new Set(apptsIn.flatMap((a) => a.services.map((n) => n.toLowerCase())));
  const svcMissing: ServiceRow[] = [];
  for (const svc of servicesIn) {
    if (!svcByName.has(svc.name.toLowerCase())) svcMissing.push(svc);
  }
  // But — any service the appointments reference that's NOT in either
  // Sukona or the Services tab is an error (nothing to insert).
  const svcInSheetByName = new Map(servicesIn.map((s) => [s.name.toLowerCase(), s]));
  const svcNotAnywhere = [...svcNamesFromApps].filter(
    (n) => !svcByName.has(n) && !svcInSheetByName.has(n),
  );
  if (svcNotAnywhere.length > 0) {
    die(
      `Appointments reference services that aren't in the Services tab or in Sukona:\n  - ${svcNotAnywhere.join("\n  - ")}\nAdd them to the Services tab and re-run.`,
    );
  }

  // ---- Verify staff exist in the salon (match by name, case-insensitive) ----
  const { data: existingStaff } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("salon_id", args.salonId);
  const staffByName = new Map<string, { id: string; name: string }>(
    (existingStaff ?? []).map((p) => [String(p.full_name ?? "").toLowerCase(), { id: String(p.id), name: String(p.full_name) }]),
  );
  const staffNamesFromApps = new Set(apptsIn.map((a) => a.staffName.toLowerCase()));
  const staffMissing = [...staffNamesFromApps].filter((n) => !staffByName.has(n));
  if (staffMissing.length > 0) {
    die(
      `Appointments reference staff who aren't in Sukona yet:\n  - ${staffMissing.join("\n  - ")}\nAdd them via /team (their full_name must match exactly) and re-run.`,
    );
  }

  // ---- Preview ----
  console.log(`\nPreview:`);
  console.log(`  Clients:     ${matchedClientCount} matched to existing · ${newClientCount} new to create`);
  console.log(`  Services:    ${svcMissing.length} new to create · ${servicesIn.length - svcMissing.length} already in Sukona`);
  console.log(`  Appointments: ${apptsIn.length} to insert`);
  const paidCount = apptsIn.filter((a) => a.status === "paid" && a.method).length;
  console.log(`  Payments:    ${paidCount} rows (one per paid appointment with a method)`);
  if (args.dryRun) {
    console.log(`\n(dry run — no writes performed)`);
    return;
  }
  const ok = await confirm(`\nProceed with import?`);
  if (!ok) die("Aborted by user.");

  // ============================================================
  // WRITE
  // ============================================================

  // 1. Create missing services.
  console.log(`\nInserting services…`);
  if (svcMissing.length > 0) {
    const svcRows = svcMissing.map((s) => ({
      salon_id: args.salonId,
      name: s.name,
      price: s.price,
      duration_minutes: s.duration,
      is_active: true,
    }));
    const { data: inserted, error: svcErr } = await supabase
      .from("services")
      .insert(svcRows)
      .select("id, name");
    if (svcErr) die(`Failed to insert services: ${svcErr.message}`);
    for (const s of inserted ?? []) svcByName.set(String(s.name).toLowerCase(), { id: String(s.id), name: String(s.name) });
  }
  console.log(`  ✔ ${svcByName.size} services in the salon now`);

  // 2. Create missing clients.
  console.log(`Inserting clients…`);
  const newClientRows: Array<{ salon_id: string; name: string; phone: string; address: string | null; notes: string | null }> = [];
  for (const [phone, resolved] of resolvedClients) {
    if (!resolved.isNew) continue;
    const src = clientByPhone.get(phone)!;
    newClientRows.push({
      salon_id: args.salonId,
      name: src.name,
      phone: src.phone,
      address: src.address,
      notes: src.notes,
    });
  }
  if (newClientRows.length > 0) {
    const { data: insertedClients, error: cliErr } = await supabase
      .from("clients")
      .insert(newClientRows)
      .select("id, phone");
    if (cliErr) die(`Failed to insert clients: ${cliErr.message}`);
    for (const c of insertedClients ?? []) {
      const rec = resolvedClients.get(String(c.phone))!;
      rec.id = String(c.id);
    }
  }
  console.log(`  ✔ ${newClientRows.length} new · ${matchedClientCount} matched to existing`);

  // 3. Insert appointments + appointment_services + appointment_staff + payments.
  console.log(`Inserting appointments…`);
  let appointmentsInserted = 0;
  let paymentsInserted = 0;
  for (const a of apptsIn) {
    const client = resolvedClients.get(a.clientPhone);
    if (!client) die(`Bug: unresolved client phone ${a.clientPhone} at appointments row ${a._rowNum}`);
    const staff = staffByName.get(a.staffName.toLowerCase());
    if (!staff) die(`Bug: unresolved staff ${a.staffName} at appointments row ${a._rowNum}`);
    // Historical timestamp — pin created_at to the appointment date at
    // its wall-clock time so Reports timelines line up.
    const historicalTs = new Date(`${a.date}T${a.time}:00+04:00`).toISOString();

    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .insert({
        salon_id: args.salonId,
        client_id: client.id,
        service_id: null,
        date: a.date,
        time: `${a.time}:00`,
        status: a.status,
        created_at: historicalTs,
      })
      .select("id")
      .single();
    if (apptErr) die(`Failed to insert appointment row ${a._rowNum}: ${apptErr.message}`);

    // appointment_services (one row per service in the comma-separated list)
    const svcRows = a.services.map((name, i) => {
      const svc = svcByName.get(name.toLowerCase());
      if (!svc) die(`Bug: unresolved service ${name} at appointments row ${a._rowNum}`);
      return {
        salon_id: args.salonId,
        appointment_id: appt.id,
        service_id: svc.id,
        staff_id: staff.id,
        is_parallel: false,
        sort_order: i,
      };
    });
    const { error: svcErr } = await supabase.from("appointment_services").insert(svcRows);
    if (svcErr) die(`Failed to insert appointment_services for row ${a._rowNum}: ${svcErr.message}`);

    // appointment_staff (one row per unique staff — historical always single)
    const { error: staffErr } = await supabase
      .from("appointment_staff")
      .insert({ salon_id: args.salonId, appointment_id: appt.id, staff_id: staff.id });
    if (staffErr) die(`Failed to insert appointment_staff for row ${a._rowNum}: ${staffErr.message}`);

    // payment (only when paid + method given)
    if (a.status === "paid" && a.method) {
      const { error: payErr } = await supabase.from("payments").insert({
        salon_id: args.salonId,
        appointment_id: appt.id,
        amount: a.total,
        method: a.method,
        created_at: historicalTs,
      });
      if (payErr) die(`Failed to insert payment for row ${a._rowNum}: ${payErr.message}`);
      paymentsInserted++;
    }
    appointmentsInserted++;
  }
  console.log(`  ✔ ${appointmentsInserted} appointments · ${paymentsInserted} payments`);

  console.log(`\n✔ Historical import complete for ${salon.name}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
