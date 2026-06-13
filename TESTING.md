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

## H — Gift cards (migration-044)

**Setup**: run `supabase/migration-044-gift-cards.sql` in the Supabase
SQL Editor first. Without it, `/gift-cards` will load but every action
will error against missing tables.

Revenue model is **sale-time** — the cash is booked the day the card
is sold, not the day it's redeemed. Redemption days should NOT show
new revenue.

### H1 — Sell a card (run as owner)

- [ ] `/gift-cards` loads, shows empty state "No active gift cards"
- [ ] Tap "+" → sell modal opens
- [ ] Enter amount 100, leave method=cash, no buyer/expiry → submit
- [ ] Success screen shows a 12-char dashed code (e.g. `ABCD-EF23-XYZ9`)
- [ ] Code "Copy" button works (paste anywhere to verify)
- [ ] Press Done → list now shows 1 active card with that code

### H2 — Code formatting + lookup invariants

- [ ] On the sell-modal success screen the code displays as `XXXX-XXXX-XXXX`
- [ ] In MarkPaidModal: type the code lowercase, no dashes — it
      auto-formats with dashes as you type
- [ ] Paste the code with spaces/dashes/mixed case — same auto-format
- [ ] Enter a non-existent code → red error "Gift card not found" after
      the 12th character is entered (auto-lookup)

### H3 — Permission gates (data leaks here are the worst)

- [ ] As **staff**: `/gift-cards` is NOT in sidebar OR mobile More sheet
- [ ] As **staff**: typing `/gift-cards` directly → redirects to home
- [ ] As **staff**: MarkPaidModal "Gift card" method IS available
- [ ] As **staff**: lookup of a valid code in your salon works
- [ ] **Cross-salon**: sign in to a DIFFERENT salon, enter a code from
      the first salon's card → "Gift card not found" (no cross-tenant leak)

### H4 — Full redemption against an appointment

- [ ] Sell a $200 card
- [ ] Book/find a $150 appointment → Mark as Paid → pick "Gift card"
- [ ] Paste the code → balance preview shows "$200"
- [ ] Amount stays $150, no remainder picker appears → submit
- [ ] Appointment flips to "paid"
- [ ] `/gift-cards` → that card now shows balance $50, status Active
- [ ] Detail panel "History" shows: sale $200, redemption $150

### H5 — Partial redemption (split pay)

- [ ] Sell a $50 card
- [ ] On a $200 appointment, Mark as Paid → Gift card → paste code
- [ ] Yellow box appears: "Card covers $50. Remainder of $150 needs
      another method." → pick Cash → submit
- [ ] Appointment status = paid
- [ ] `/payments` lists TWO rows for this appointment: $50 gift_card
      and $150 cash, both with the same client
- [ ] Card status flips to "Redeemed" (balance hit 0)

### H6 — Double-spend race (one card, two browsers)

- [ ] Sell a $100 card
- [ ] Open two browser windows, both on the same appointment's Mark as
      Paid modal, both pasting the same code
- [ ] Submit both within ~1 second of each other
- [ ] One succeeds, the other errors with "Insufficient balance" or
      "Gift card is redeemed" (the SECURITY DEFINER row lock should
      prevent both from going through)

### H7 — Void

- [ ] Sell a $300 card
- [ ] Open the detail panel → "Void card"
- [ ] Confirm → status flips to "Voided", balance still shows $300 (for
      audit) but the card can no longer be redeemed
- [ ] Try to pay an appointment with the voided code → red error "This
      card is voided and can't be used"
- [ ] Reports for the sale month → revenue is UNCHANGED (no rollback —
      the salon kept the cash)

### H7c — Expiry

Expiry is computed (no nightly job — synthesized from `expires_at` vs
today). The DB row stays `status='active'` but the UI promotes it to
"Expired" everywhere it's rendered.

- [ ] Sell a card with `Expires` set to **yesterday's date** (you can
      edit `gift_cards.expires_at` directly in Supabase if needed for
      testing)
- [ ] `/gift-cards` Active filter: card does NOT appear (excluded by
      the server query)
- [ ] Expired filter: card DOES appear, with an amber "Expired" badge
- [ ] All filter: card appears with the "Expired" badge (not "Active")
- [ ] Outstanding-liability summary (when Active filter is selected)
      does NOT include this card's balance
- [ ] Detail panel: status badge is "Expired"; Void button is hidden
      (Delete still available)
- [ ] MarkPaidModal: paste the expired code → balance preview is
      replaced by a red "This card expired on YYYY-MM-DD" warning;
      submit button is disabled
- [ ] If you sell a NEW card with no expiry, all of the above behaves
      identically to "active" (no expiry means never expires)

### H7b — Delete (owner/admin only)

- [ ] As **owner/admin** on any card (Active, Redeemed, or Voided):
      detail panel shows a "Delete card" button alongside Void
- [ ] Click Delete → confirm dialog warns about removing tx history
      (and, for non-void cards, removing the sale revenue from Reports
      for that period)
- [ ] Confirm → card disappears from the list AND its `gift_card_transactions`
      rows are gone (verify in Supabase if curious)
- [ ] Reports for the period the card was sold → revenue drops by the
      original sale amount (expected — hard delete is retroactive)
- [ ] Any `payments` rows from a previously-redeemed card still exist
      (they reference the code in their note text but no longer match
      a real card)
- [ ] As **staff**: even if you reach the detail panel by some route,
      delete attempts hit the owner/admin gate and return "Not authorized"

### H8 — Reports breakdown matches sale-time recognition

Set the period filter to a month where you've sold AND redeemed:

- [ ] Revenue line includes the SOLD total (not redemption)
- [ ] "Services" sub-line does NOT include gift_card-method payments
- [ ] "Gift card sales" sub-line appears with the right total
- [ ] Italic audit line "(gift card balance applied to services: $X)"
      shows when there were redemptions in the window
- [ ] Footer "Outstanding gift card balance" matches the sum of active
      card balances visible on `/gift-cards`
- [ ] Payments tab footer: "Gift card (balance applied)" row appears
      with the sum of gift_card-method payment rows

### H9 — Mobile

- [ ] `/gift-cards` page doesn't horizontally scroll
- [ ] Sell modal works (amount, buyer picker, expiry input all reachable)
- [ ] Detail panel scrolls without trapping (long history)
- [ ] MarkPaidModal Gift card section reachable above the safe-area on
      smaller phones

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
