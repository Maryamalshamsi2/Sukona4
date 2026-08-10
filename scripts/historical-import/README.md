# Historical Data Import

Two scripts that let you white-glove import a new salon's pre-Sukona data
(clients, past appointments, past payments) so their Reports show revenue
from before they signed up.

## Ops flow

1. **Generate the empty template**
   ```bash
   npm run import:template
   ```
   Writes `sukona-import-template.xlsx` in the project root.

2. **Send it to the salon owner.** They fill in the four data tabs
   (Clients, Services, Staff, Appointments) and email it back. The
   Instructions tab in the file has all the rules they need.

3. **Owner sets up their team in Sukona.** Every staff name that will
   appear in the Appointments tab must exist in `/team` first (the
   full_name matches by case-insensitive equality). The import bails
   with a clear error listing anyone missing so the owner can add
   them and re-run.

4. **Run the import**
   ```bash
   npm run import:run -- --salon-id <uuid> --file path/to/filled.xlsx
   ```

   Or dry-run first to preview counts without writing anything:
   ```bash
   npm run import:run -- --salon-id <uuid> --file ... --dry-run
   ```

## What the import does

- **Reads all four tabs** and validates every row (phone format, dates,
  times, service and staff references).
- **Dedupes clients within the file by phone** — same number in two
  rows collapses to one client. This also gracefully handles when the
  owner listed a client twice by mistake.
- **Matches clients to existing Sukona records by phone.** If a phone
  already belongs to a client in the salon, the import attaches new
  appointments to that same client instead of creating a duplicate.
  (This is enforced by migration-055's `(salon_id, phone)` unique
  index — the script's behavior mirrors what the app enforces.)
- **Creates any services the appointments reference that don't yet
  exist in the salon.** Missing services from the appointments tab
  that aren't in the Services tab either → import aborts with a
  fixable error.
- **Sets historical `created_at`** on every appointment + payment
  so Reports timelines show revenue back to the appointment's actual
  date. Otherwise everything would look like "today's revenue" —
  useless for continuity.
- **Payments** get one row per appointment where `status = paid` and
  a `Payment method` is set. Cancelled / no_show / completed-but-not-
  paid rows don't create payment rows.

## Requirements

- **Node 20+** (for `--env-file` support in the `import:run` script).
- **`.env.local`** at the project root with:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  ```
  The service-role key bypasses RLS — this script writes across
  tenant boundaries and shouldn't be exposed to end users.

## What it does NOT do

- **Doesn't create staff auth users.** Owners add staff via `/team`
  first, then re-run. Reasoning: creating auth users has side
  effects (email/phone verification, potentially unwanted invites)
  and every staff member needs salary/commission/target set anyway,
  which is easier in-app.
- **Doesn't mint receipt / review tokens** on historical
  appointments. Customers aren't going to review a service from
  6 months ago; no need for that machinery.
- **Doesn't back-populate WhatsApp send logs** — the whole point
  of the historical import is that these events already happened
  outside Sukona, no notifications needed.
