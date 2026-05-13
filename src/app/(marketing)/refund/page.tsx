import type { Metadata } from "next";
import { LegalHeader, H2, Section, Email, LegalFooter } from "../terms/page";

export const metadata: Metadata = {
  title: "Refund Policy — Sukona",
  description: "When you can request a refund from Sukona, and how.",
};

/**
 * Sukona refund policy. Per the product spec: 3-day window after
 * a renewal, no questions asked. Trial cancellation never charges.
 * Annual subscriptions get the same 3-day window after the renewal
 * charge (not 3 days after the start of the year).
 */
export default function RefundPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <LegalHeader title="Refund Policy" effective="12 May 2026" />

      <Section>
        <p>
          We want Sukona to be a calm, no-friction part of your business —
          and that includes how you leave. Here&rsquo;s how refunds work.
        </p>
      </Section>

      <H2>1. The 3-day window</H2>
      <Section>
        <p>
          You can request a full refund within{" "}
          <strong>3 days of any charge</strong>, for any reason. No questions
          asked, no need to justify it.
        </p>
        <p>
          This applies to:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Your <strong>first charge</strong> at the end of the 7-day free
            trial, if you decide Sukona isn&rsquo;t for you.
          </li>
          <li>
            Any <strong>monthly renewal</strong> within 3 days of being charged.
          </li>
          <li>
            Any <strong>annual renewal</strong> within 3 days of being charged.
          </li>
        </ul>
      </Section>

      <H2>2. The free trial is always free</H2>
      <Section>
        <p>
          The 7-day free trial does not charge anything. If you cancel before
          the trial ends, no payment is taken — there&rsquo;s nothing to refund.
        </p>
      </Section>

      <H2>3. How to request a refund</H2>
      <Section>
        <p>Two ways:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>From the dashboard</strong>: Settings → Plan &amp; Billing
            → Manage billing → Cancel subscription. Then email <Email /> with
            your account email and we&rsquo;ll process the refund.
          </li>
          <li>
            <strong>By email</strong>: send a message to <Email /> from your
            account email with &ldquo;Refund&rdquo; in the subject. Include
            the date of the charge you want refunded.
          </li>
        </ul>
      </Section>

      <H2>4. How long refunds take</H2>
      <Section>
        <p>
          Refunds are issued to your original payment method via Stripe. Once
          processed, the funds typically reach your account within{" "}
          <strong>5–10 business days</strong>, depending on your bank.
        </p>
        <p>
          You&rsquo;ll receive an email confirmation from Stripe when the
          refund is issued.
        </p>
      </Section>

      <H2>5. Outside the 3-day window</H2>
      <Section>
        <p>
          After the 3-day window, refunds are at our discretion and considered
          case-by-case. We&rsquo;ll always be reasonable — if Sukona had
          significant downtime or failed in a way that affected your business,
          email us and we&rsquo;ll make it right.
        </p>
      </Section>

      <H2>6. Cancellation vs. refund</H2>
      <Section>
        <p>
          <strong>Cancellation</strong> stops future renewals — you keep access
          until the end of your current billing period, but aren&rsquo;t
          charged again.
        </p>
        <p>
          <strong>Refund</strong> returns money already paid. The two are
          separate actions: you can cancel without requesting a refund (you
          finish out your period), or request both.
        </p>
      </Section>

      <H2>7. Contact</H2>
      <Section>
        <p>
          Questions or refund requests: <Email />.
        </p>
      </Section>

      <LegalFooter />
    </main>
  );
}
