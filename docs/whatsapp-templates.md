# WhatsApp Cloud API — Template Submission Sheet

This is the copy-paste sheet for submitting v1 templates to **Meta Business Suite → WhatsApp Manager → Message Templates → New Template**.

All six templates use:

- **Category:** UTILITY (these are appointment/transaction notifications, not marketing)
- **Language:** English (en)

The variable placeholders `{{1}}`, `{{2}}`, ... must match the order below — the app sends them positionally.

---

## 1. `appointment_confirmation`

**Name:** `appointment_confirmation`
**Category:** Utility
**Language:** English

**Body:**

```
Hello {{2}}! Your appointment with {{1}} is confirmed for {{3}} at {{4}}.

Service: 
{{5}}

Need to change anything? Contact us at {{6}}.
```

**Sample variables (for Meta's review):**

| Var | Sample |
|-----|--------|
| `{{1}}` | Ateeq Spa |
| `{{2}}` | Sara |
| `{{3}}` | Wednesday, 29 Apr 2026 |
| `{{4}}` | 10:30 AM |
| `{{5}}` | Haircut, Beard trim |
| `{{6}}` | +971 50 123 4567 |

---

## 2. `appointment_updated`

**Name:** `appointment_updated`
**Category:** Utility
**Language:** English

**Body:**

```
Hello {{2}}, your appointment with {{1}} has been updated.

Time: {{3}} at {{4}}
Service: 
{{5}}

Need to change anything? Contact us at {{6}}.
```

**Sample variables:** Same as `appointment_confirmation`.

---

## 3. `appointment_cancelled`

**Name:** `appointment_cancelled`
**Category:** Utility
**Language:** English

**Body:**

```
Hello {{2}}, your appointment with {{1}} on {{3}} at {{4}} has been cancelled.

To reschedule, please contact us at {{5}}.
```

**Sample variables:**

| Var | Sample |
|-----|--------|
| `{{1}}` | Ateeq Spa |
| `{{2}}` | Sara |
| `{{3}}` | Wednesday, 29 Apr 2026 |
| `{{4}}` | 10:30 AM |
| `{{5}}` | +971 50 123 4567 |

---

## 4. `staff_on_the_way`

**Name:** `staff_on_the_way`
**Category:** Utility
**Language:** English

**Body:**

```
Hello {{1}}! The staff from {{2}} is on the way and will arrive shortly. See you soon!
```

**Sample variables:**

| Var | Sample |
|-----|--------|
| `{{1}}` | Sara |
| `{{2}}` | Ateeq Spa |

---

## 5. `staff_arrived`

**Name:** `staff_arrived`
**Category:** Utility
**Language:** English

**Body:**

```
Hello {{1}}! The staff from {{2}} have arrived.
```

**Sample variables:**

| Var | Sample |
|-----|--------|
| `{{1}}` | Sara |
| `{{2}}` | Ateeq Spa |

---

## 6. `payment_paid`

**Name:** `payment_paid`
**Category:** Utility
**Language:** English

**Body:**

```
Thank you, {{1}}! We hope you enjoyed your service with {{2}}.

We'd love your feedback: https://sukona.com/r/{{4}}

Receipt: https://sukona.com/receipt/{{3}}
```

**Sample variables:**

| Var | Sample |
|-----|--------|
| `{{1}}` | Sara |
| `{{2}}` | Ateeq Spa |
| `{{3}}` | abc123XYZ_456 |
| `{{4}}` | qwertyuiop1234 |

> **Domain note:** the URLs in the template body must be the exact public URL the customer visits. The Sukona app uses `https://sukona.com/...`. If you self-host the app on a different domain, change both URLs in the template **before** submitting and update `NEXT_PUBLIC_APP_URL` in your environment to match.

---

## After approval

1. Open Sukona → **Settings → WhatsApp**.
2. Paste in:
   - **Phone Number ID** (from Meta Business → WhatsApp → API Setup)
   - **Business Account ID**
   - **Access Token** — use a **permanent system-user token**, not the temporary 24-hour one shown by default.
3. Save.
4. Hit **Send Test** with your own phone — you should receive an `appointment_confirmation` message within seconds.
5. Recent sends will appear in the audit log below the test panel.

If a real send fails (Meta is down, customer's number is invalid, etc.), the row appears as **failed** with a **Retry** button.
