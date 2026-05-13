import type { Metadata } from "next";
import { LegalHeader, H2, Section, Email, LegalFooter } from "../terms/page";

export const metadata: Metadata = {
  title: "Privacy Policy — Sukona",
  description:
    "What data Sukona collects, how we use it, and the rights you have over it.",
};

/**
 * Plain-language Privacy Policy. UAE-based SaaS, GDPR-aware
 * (since we may have European users transit through). Reviewed by
 * a lawyer is recommended before formal launch — this is a sensible
 * default, not legal advice.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <LegalHeader title="Privacy Policy" effective="12 May 2026" />

      <Section>
        <p>
          This Privacy Policy explains what information Sukona collects, how
          we use it, who we share it with, and the rights you have. We&rsquo;re
          committed to being plain about this — no dark patterns, no buried
          clauses.
        </p>
        <p>
          <strong>The short version:</strong> we collect only what we need to
          run the Service, we don&rsquo;t sell your data, we don&rsquo;t use
          it to train AI models, and you can ask us to delete it at any time.
        </p>
      </Section>

      <H2>1. Who we are</H2>
      <Section>
        <p>
          Sukona is operated from the United Arab Emirates. For the purposes
          of data protection law, we are the data controller for the
          information you provide. Contact us at <Email />.
        </p>
      </Section>

      <H2>2. What we collect</H2>
      <Section>
        <p>
          <strong>Account information</strong> you give us when you sign up:
          your name, email, phone, business name, business website (optional),
          country, category, team size, and how you heard about us.
        </p>
        <p>
          <strong>Business operating data</strong> you create using the
          Service: appointments, clients (their names, contact details,
          addresses, visit history), services, staff, payments, expenses,
          inventory, reviews, attached receipt photos, and activity logs.
        </p>
        <p>
          <strong>Payment information</strong> is collected and stored by{" "}
          <strong>Stripe</strong>, our payment processor. We never see or store
          your full card number. We retain only metadata necessary to operate
          your subscription (Stripe customer ID, subscription ID, billing
          period, last 4 digits of card for display).
        </p>
        <p>
          <strong>Technical data</strong> generated when you use the Service:
          IP address, browser type, device type, log timestamps, error reports.
        </p>
      </Section>

      <H2>3. How we use information</H2>
      <Section>
        <p>We use the information we collect to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Provide and maintain the Service;</li>
          <li>Process subscription payments via Stripe;</li>
          <li>
            Send transactional emails (sign-up confirmation, password resets,
            trial reminders, payment receipts, important service notices);
          </li>
          <li>
            Respond to your support requests at{" "}
            <a
              href="mailto:hellosukona@gmail.com"
              className="text-primary-600 underline-offset-2 hover:underline"
            >
              hellosukona@gmail.com
            </a>
            ;
          </li>
          <li>
            Investigate and prevent fraud, abuse, security incidents, or
            violations of our{" "}
            <a
              href="/terms"
              className="text-primary-600 underline-offset-2 hover:underline"
            >
              Terms
            </a>
            ;
          </li>
          <li>
            Improve the Service in aggregate (e.g., understanding which
            features are used). No individual user&rsquo;s data is sold or
            shared for this purpose.
          </li>
        </ul>
        <p>
          <strong>We do not:</strong>
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Sell your data to anyone;</li>
          <li>Share your data with third parties for their marketing;</li>
          <li>Use your client lists or business data to train AI models;</li>
          <li>Run third-party advertising trackers in the dashboard.</li>
        </ul>
      </Section>

      <H2>4. Service providers we use</H2>
      <Section>
        <p>
          We use a small number of trusted services to operate Sukona. Each
          one only sees the data needed for its role:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>Supabase</strong> — database, authentication, and file
            storage. Data is stored in their managed Postgres database.
          </li>
          <li>
            <strong>Stripe</strong> — payment processing for subscriptions.
            Card data lives only with Stripe.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting.
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery (welcome,
            trial reminders, etc.).
          </li>
          <li>
            <strong>WhatsApp</strong> (via Meta) — to send notifications and
            receipts to your clients, when you trigger that action from the
            dashboard.
          </li>
        </ul>
      </Section>

      <H2>5. Data storage and security</H2>
      <Section>
        <p>
          Your data is stored in encrypted databases managed by Supabase. All
          connections to the Service use TLS (HTTPS). We follow industry
          standard security practices and limit access to your data to
          authorized personnel only.
        </p>
        <p>
          No system is 100% secure. If we ever experience a breach affecting
          your data, we&rsquo;ll notify you without unreasonable delay.
        </p>
      </Section>

      <H2>6. Your rights</H2>
      <Section>
        <p>You can, at any time:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>Access</strong> the data you&rsquo;ve created (it&rsquo;s
            all visible in your dashboard);
          </li>
          <li>
            <strong>Correct or update</strong> it from inside the dashboard;
          </li>
          <li>
            <strong>Export</strong> your data (reports include CSV export; we
            can provide a full data export on request);
          </li>
          <li>
            <strong>Delete</strong> your account and all associated data by
            emailing <Email />. We&rsquo;ll process deletion within 30 days.
          </li>
          <li>
            <strong>Opt out</strong> of non-transactional emails by clicking
            the unsubscribe link in any such email.
          </li>
        </ul>
      </Section>

      <H2>7. Data retention</H2>
      <Section>
        <p>
          We keep your data for as long as your account is active. If you
          cancel your subscription, your data remains available and exportable
          for 30 days. After that, we permanently delete it from our active
          systems. Backups containing your data are deleted within 90 days.
        </p>
        <p>
          Some records (invoices, payment receipts) may be retained longer to
          comply with tax and accounting regulations.
        </p>
      </Section>

      <H2>8. International data transfers</H2>
      <Section>
        <p>
          Our service providers may store and process data in countries
          outside the UAE (typically the EU, US, or Singapore depending on
          the provider). All providers we use offer contractual safeguards
          consistent with international data protection standards.
        </p>
      </Section>

      <H2>9. Children</H2>
      <Section>
        <p>
          Sukona is a business tool. The Service is not intended for anyone
          under 18. We do not knowingly collect data from children.
        </p>
      </Section>

      <H2>10. Cookies</H2>
      <Section>
        <p>
          We use essential cookies to keep you signed in and to remember your
          session. We do not use advertising or cross-site tracking cookies.
        </p>
      </Section>

      <H2>11. Changes to this policy</H2>
      <Section>
        <p>
          We may update this policy from time to time. If we make material
          changes, we&rsquo;ll notify you by email or via the dashboard. The
          &ldquo;Effective&rdquo; date at the top of this page always reflects
          the latest version.
        </p>
      </Section>

      <H2>12. Contact</H2>
      <Section>
        <p>
          Questions, requests, or complaints about privacy? Email us at{" "}
          <Email />.
        </p>
      </Section>

      <LegalFooter />
    </main>
  );
}
