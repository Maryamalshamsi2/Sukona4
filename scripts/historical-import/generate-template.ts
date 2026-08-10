/**
 * Generates an empty Sukona historical-data import template.
 *
 * Usage:
 *   npm run import:template
 *   → writes ./sukona-import-template.xlsx in the project root
 *
 * The salon owner fills in the four data tabs, emails the file back,
 * then someone (you, or an internal ops person) runs the companion
 * import.ts script to load it into a specific salon_id.
 */

import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_FILE = "sukona-import-template.xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sukona";
  wb.created = new Date();

  // ---- Instructions ----
  const s0 = wb.addWorksheet("Instructions", { properties: { tabColor: { argb: "FF171717" } } });
  s0.columns = [{ width: 90 }];
  const rows: Array<[string]> = [
    ["Sukona — Historical Data Import Template"],
    [""],
    ["Fill in the four data tabs below (Clients, Services, Staff, Appointments)."],
    ["Email the completed file back and we'll load it into your Sukona account."],
    [""],
    ["Rules:"],
    ["  • Never rename the tabs or change column headers."],
    ["  • Every appointment row needs a Client phone that also appears on the Clients tab (or we'll auto-add the client from that row)."],
    ["  • Every appointment row needs a Service name that also appears on the Services tab."],
    ["  • Every appointment row needs a Staff name that also appears on the Staff tab."],
    ["  • Phone numbers should be in international format: +971501234567. Spaces are stripped automatically."],
    ["  • Dates: YYYY-MM-DD (e.g. 2024-11-30)."],
    ["  • Times: 24-hour HH:MM (e.g. 14:30)."],
    ["  • Status: one of paid / completed / cancelled / no_show."],
    ["  • Payment method: cash / card / other. Leave blank if the appointment wasn't paid."],
    [""],
    ["What happens when we import:"],
    ["  • Clients are matched by phone. If a phone matches an existing Sukona client, the historical appointments attach to that client."],
    ["  • Duplicates within the file (same phone, different name) are auto-merged into a single client."],
    ["  • Historical appointments show in Reports at their original dates — your revenue timeline goes back to when you actually opened."],
    [""],
    ["Questions? Reply to whoever sent you this file."],
  ];
  rows.forEach((r) => s0.addRow(r));
  s0.getRow(1).font = { bold: true, size: 16 };
  s0.getRow(6).font = { bold: true };
  s0.getRow(17).font = { bold: true };

  // ---- Clients ----
  const s1 = wb.addWorksheet("Clients", { properties: { tabColor: { argb: "FFDD6B20" } } });
  s1.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Phone", key: "phone", width: 20 },
    { header: "Address", key: "address", width: 40 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  styleHeader(s1);
  // Example row (gray, so users know it's a sample):
  const exRow = s1.addRow(["Alia Khoury", "+971501234567", "Dubai Marina, Tower 5, Villa 12", "Prefers evenings"]);
  exRow.font = { italic: true, color: { argb: "FF888888" } };

  // ---- Services ----
  const s2 = wb.addWorksheet("Services", { properties: { tabColor: { argb: "FFDD6B20" } } });
  s2.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Price (AED)", key: "price", width: 14 },
    { header: "Duration (min)", key: "duration", width: 14 },
    { header: "Category", key: "category", width: 20 },
  ];
  styleHeader(s2);
  const svcEx = s2.addRow(["Signature Manicure", 150, 60, "Nails"]);
  svcEx.font = { italic: true, color: { argb: "FF888888" } };

  // ---- Staff ----
  const s3 = wb.addWorksheet("Staff", { properties: { tabColor: { argb: "FFDD6B20" } } });
  s3.columns = [
    { header: "Full Name", key: "name", width: 24 },
    { header: "Phone", key: "phone", width: 20 },
    { header: "Role", key: "role", width: 14 },
  ];
  styleHeader(s3);
  const stfEx = s3.addRow(["Sara Ahmed", "+971509999999", "staff"]);
  stfEx.font = { italic: true, color: { argb: "FF888888" } };

  // ---- Appointments ----
  const s4 = wb.addWorksheet("Appointments", { properties: { tabColor: { argb: "FFDD6B20" } } });
  s4.columns = [
    { header: "Date (YYYY-MM-DD)", key: "date", width: 18 },
    { header: "Time (HH:MM)", key: "time", width: 12 },
    { header: "Client phone", key: "clientPhone", width: 18 },
    { header: "Services (comma-separated)", key: "services", width: 40 },
    { header: "Staff name", key: "staff", width: 20 },
    { header: "Total (AED)", key: "total", width: 12 },
    { header: "Payment method", key: "method", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];
  styleHeader(s4);
  const apptEx = s4.addRow([
    "2024-11-30", "14:30", "+971501234567",
    "Signature Manicure", "Sara Ahmed", 150, "cash", "paid",
  ]);
  apptEx.font = { italic: true, color: { argb: "FF888888" } };

  // Write
  const outPath = path.resolve(process.cwd(), OUTPUT_FILE);
  await wb.xlsx.writeFile(outPath);
  console.log(`✔ Template written to ${outPath}`);
  console.log(`  Send this file to salon owners. When they return it filled in, run:`);
  console.log(`    npm run import:run -- --salon-id <uuid> --file <path/to/filled.xlsx>`);
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF171717" },
  };
  header.height = 22;
  header.alignment = { vertical: "middle", horizontal: "left" };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Prevent "unused import" warning if this file is analyzed by tsc
// without executing — path/fileURLToPath are here in case we ever
// want to derive locations relative to this script's own dir.
void path;
void fileURLToPath;
