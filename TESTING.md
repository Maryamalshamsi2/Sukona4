# Sukona — Pre-launch Testing Checklist

Manual test plan to run before any release that touches user-facing
flows. Tick items as you go. Save a copy with notes per run if you
hit anything weird.

> **Setup tip**: don't test as your `is_exempt` founder account. It
> bypasses plan gates and billing — that hides bugs. Make a clean
> test account per plan. The Gmail `+suffix` trick lets you reuse
> one inbox:
>
> - `mrymsh9+solo@gmail.com` — Solo plan, normal trial
> - `mrymsh9+team@gmail.com` — Team plan, normal trial
> - `mrymsh9+multi@gmail.com` — Multi-Team plan, normal trial
>
> Use Stripe **test mode** (card `4242 4242 4242 4242`, any future
> date, any CVC) for the billing flows. No real money moves.

---

## A — Auth & onboarding

- [ ] Signup with email + password works (separate window, incognito)
- [ ] Confirmation email arrives from `hello@sukona.com` (not the
      Resend sandbox)
- [ ] Welcome email arrives within ~10s of finishing the wizard
- [ ] Reset-password flow works end-to-end
- [ ] Google OAuth signup works (only if /api/auth/google is enabled)
- [ ] First paint after login isn't blank — no flash of
      unauthenticated content

## B — Core operations (run as owner, admin, AND staff)

- [ ] Add a client → save → reload — persists
- [ ] Add a service → save → reload — persists
- [ ] Add a team member (invite) → invite email arrives → they can
      sign in with the credentials
- [ ] Book an appointment with 1 service, 1 staff
- [ ] Book an appointment with 2 parallel services (different staff)
- [ ] Book an appointment using a bundle — verify the bundle's
      discounted price is what's stored (not the sum of catalog prices)
- [ ] Drag-move an appointment by less than 30 min → applies directly
- [ ] Drag-move by more than 30 min → confirm modal appears, can cancel
- [ ] Mark an appointment paid — tip field appears
- [ ] Tip selector ("Tip to") appears when 2+ staff did the appointment
- [ ] Edit the payment later — tip stays attached
- [ ] Add a bonus on `/payroll` → activity log fires (check the bell)
- [ ] Edit the bonus → activity log fires
- [ ] Delete a bonus → activity log fires
- [ ] Delete an appointment → disappears from home / calendar / reports

## C — Billing (Stripe test mode)

- [ ] Solo account hits staff cap at 1 → upgrade modal shows
- [ ] Team account hits cap at 5 → upgrade modal shows
- [ ] Solo account hits team-group cap at 1 → upgrade modal shows
- [ ] Solo account opens `/payroll` → UpgradeBlock renders, not the table
- [ ] Click "Upgrade to Team" → Stripe checkout opens
- [ ] Complete checkout with test card `4242 4242 4242 4242` →
      redirected back → plan is `team` (verify by reloading
      `/settings/billing`)
- [ ] Stripe webhook fires (check Vercel logs for
      `customer.subscription.created`)
- [ ] Cancel subscription via Customer Portal → after current period
      end, account hits the `/paused` page

## D — Permission boundaries (data leaks here are existential)

- [ ] Staff account: no /team, /reports, /payroll in sidebar
- [ ] Staff account: typing `/team` directly into URL redirects to home
- [ ] Admin account: can manage appointments, can't see /payroll page
- [ ] Scoped admin (admin role + `group_id` set):
  - [ ] Calendar only shows their team's staff columns
  - [ ] /team page only lists their team's members
  - [ ] /home Today list excludes other teams' appointments
  - [ ] Per-client appointment history scoped to their team
- [ ] Cross-salon test: log into a *different* salon's owner account,
      verify you see zero rows from the first salon

## E — Trial & email flow

- [ ] Manually set a test salon's `trial_ends_at` to 3 days from now
      in Supabase. Trigger the cron (see "How to test the cron" below)
      → 3-day-left email arrives
- [ ] Same with 1 day from now → 1-day-left email arrives
- [ ] Same with yesterday's date → trial-ended email arrives
- [ ] Trial expires → `/paused` page renders for staff/admin
- [ ] Owner with expired trial → blocking modal appears

## F — Mobile

Test these on an actual phone (or Chrome devtools mobile emulator at iPhone 14 size):

- [ ] Every page: doesn't horizontally scroll
- [ ] Every page with an FAB: button is reachable above the safe-area
- [ ] Calendar: drag-to-move works on touch
- [ ] Filter dropdowns: tap outside dismisses
- [ ] Modal drawers: full-screen sheet on mobile, drawer on desktop

## G — Edge cases (the embarrassing ones)

- [ ] Client with no phone number — notify flow doesn't crash
- [ ] Appointment 6 months in the future — visible when you navigate
- [ ] Bundle with a 0-priced service — no divide-by-zero in payroll
- [ ] Adjustment of 0.01 — accepted (or rejected with clear message)
- [ ] Long staff name (40+ chars) — no UI overflow
- [ ] Currency: a salon set to SAR — every price renders with SAR
- [ ] Delete a staff member with appointments — appointments survive
      with NULL staff_id (migration-041)
- [ ] Sign in from two tabs simultaneously — no weird state

---

## How to test the email cron without waiting

The cron fires daily at 14:00 UTC. To test now, hit the endpoint
manually with your `CRON_SECRET` env var:

```bash
# Replace YOUR_CRON_SECRET with the value from Vercel env vars
curl -X GET "https://sukona.com/api/email/cron" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response shape:

```json
{
  "ok": true,
  "scanned": 5,
  "sent": { "trial_3d": 1, "trial_1d": 0, "trial_ended": 0 },
  "skipped": 4,
  "failed": 0,
  "errors": []
}
```

`skipped` is high because the partial unique index on `email_send_log`
short-circuits already-sent emails — re-running the cron is safe.

---

## After the checklist passes

Recruit 2-3 friendly salon owners. Free Sukona for 6 months in exchange
for honest feedback. Watch them set up their salon over a 30-min call.
Take notes. Don't fix anything during the call — fix the patterns
the following week. Three users surface 80% of the real-world issues
a checklist can't catch.
