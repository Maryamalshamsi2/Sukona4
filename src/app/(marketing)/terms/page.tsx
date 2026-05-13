import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Sukona",
  description:
    "The agreement between you and Sukona when you use the app or website.",
};

/**
 * Plain-language Terms of Service for Sukona. Drafted as a sensible
 * default for a UAE-based SaaS selling subscriptions. Worth a legal
 * review before formal launch — these cover the major standard areas
 * but are not a substitute for advice from a lawyer in your
 * jurisdiction.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <LegalHeader title="Terms of Service" effective="12 May 2026" />

      <Section>
        <p>
          These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your
          access to and use of Sukona (the &ldquo;<strong>Service</strong>&rdquo;),
          including the website at <strong>sukona.com</strong> and the
          dashboard application. By creating an account or using the Service,
          you agree to be bound by these Terms.
        </p>
      </Section>

      <H2>1. Who can use the Service</H2>
      <Section>
        <p>
          You must be at least 18 years old and have the legal authority to
          enter into this agreement. If you accept these Terms on behalf of a
          business or other entity, you represent that you have authority to
          bind that entity, and &ldquo;you&rdquo; refers to that entity.
        </p>
      </Section>

      <H2>2. Your account</H2>
      <Section>
        <p>
          You&rsquo;re responsible for keeping your login credentials secure and
          for all activity on your account. Notify us immediately at{" "}
          <Email /> if you suspect unauthorized access.
        </p>
        <p>
          You agree to provide accurate information during signup and to keep it
          up to date.
        </p>
      </Section>

      <H2>3. Subscription, billing, and cancellation</H2>
      <Section>
        <p>
          Sukona is offered on a subscription basis (monthly or annual). All
          new accounts include a <strong>7-day free trial</strong>; no payment
          method is required to start. To continue using the Service after the
          trial, a valid payment method must be added.
        </p>
        <p>
          By providing a payment method, you authorize us (and our payment
          processor, Stripe) to charge the applicable subscription fees,
          including any taxes, at the start of each billing period.
          Subscriptions automatically renew at the end of each period unless
          canceled.
        </p>
        <p>
          You can cancel at any time from{" "}
          <strong>Settings → Plan &amp; Billing → Manage billing</strong>.
          Cancellation takes effect at the end of the current billing period;
          you retain access until that date.
        </p>
        <p>
          Refunds are available for a limited window after a renewal — see our{" "}
          <Link href="/refund" className="text-primary-600 hover:text-primary-700 underline">
            Refund Policy
          </Link>{" "}
          for details.
        </p>
      </Section>

      <H2>4. Acceptable use</H2>
      <Section>
        <p>You agree not to use the Service to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Violate any applicable law or regulation;</li>
          <li>Infringe the intellectual property or privacy rights of others;</li>
          <li>Transmit spam, malware, or harmful content;</li>
          <li>
            Attempt to gain unauthorized access to the Service or its underlying
            systems;
          </li>
          <li>
            Reverse-engineer, copy, or resell any part of the Service without
            our written permission;
          </li>
          <li>
            Use the Service to harass, harm, or discriminate against any person.
          </li>
        </ul>
      </Section>

      <H2>5. Your data and content</H2>
      <Section>
        <p>
          You retain all ownership rights to the data you create or upload to
          the Service (client records, appointments, photos, notes, etc.). You
          grant us a limited, non-exclusive license to host, process, and
          display that data solely to provide the Service to you.
        </p>
        <p>
          We will never sell your data, share it with third parties for their
          marketing, or use it to train AI models. See our{" "}
          <Link href="/privacy" className="text-primary-600 hover:text-primary-700 underline">
            Privacy Policy
          </Link>{" "}
          for the full picture.
        </p>
      </Section>

      <H2>6. Our intellectual property</H2>
      <Section>
        <p>
          The Sukona name, logo, design, and software are our property. These
          Terms don&rsquo;t grant you any rights to use them, except as needed
          to operate the Service for your business.
        </p>
      </Section>

      <H2>7. Service availability and changes</H2>
      <Section>
        <p>
          We work hard to keep Sukona available, but we don&rsquo;t guarantee
          uninterrupted service. Planned maintenance, third-party outages
          (Supabase, Stripe, WhatsApp), or unforeseen issues may cause
          downtime.
        </p>
        <p>
          We may modify, add, or remove features over time. If a change
          materially reduces the functionality you&rsquo;re paying for,
          we&rsquo;ll let you know in advance.
        </p>
      </Section>

      <H2>8. Termination</H2>
      <Section>
        <p>
          You can terminate your account at any time by canceling your
          subscription and emailing <Email /> to request data deletion. Your
          data remains exportable for 30 days after cancellation, then is
          permanently deleted.
        </p>
        <p>
          We may suspend or terminate your account if you breach these Terms or
          if your account poses a security risk. We&rsquo;ll notify you and
          give you a reasonable chance to fix the issue when feasible.
        </p>
      </Section>

      <H2>9. Disclaimers</H2>
      <Section>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available.&rdquo; To the maximum extent permitted by law, we
          disclaim all warranties, express or implied, including fitness for a
          particular purpose, merchantability, and non-infringement.
        </p>
        <p>
          You are responsible for your business decisions and outcomes. Sukona
          is a tool; it does not provide legal, tax, medical, or financial
          advice.
        </p>
      </Section>

      <H2>10. Limitation of liability</H2>
      <Section>
        <p>
          To the maximum extent permitted by law, Sukona&rsquo;s total
          liability to you for any claim arising out of or relating to these
          Terms or the Service is limited to the amount you paid to us in the
          12 months preceding the claim.
        </p>
        <p>
          We are not liable for any indirect, incidental, consequential,
          special, or punitive damages, including lost profits or lost data,
          even if we&rsquo;ve been advised of the possibility.
        </p>
      </Section>

      <H2>11. Indemnification</H2>
      <Section>
        <p>
          You agree to indemnify and hold Sukona harmless from any claim,
          liability, or expense (including reasonable legal fees) arising from
          your use of the Service, your violation of these Terms, or your
          violation of any third-party rights.
        </p>
      </Section>

      <H2>12. Governing law</H2>
      <Section>
        <p>
          These Terms are governed by the laws of the United Arab Emirates.
          Any dispute arising from these Terms or the Service will be resolved
          in the courts of Dubai, UAE.
        </p>
      </Section>

      <H2>13. Changes to these Terms</H2>
      <Section>
        <p>
          We may update these Terms from time to time. If we make material
          changes, we&rsquo;ll notify you by email or via the dashboard at
          least 14 days before the changes take effect. Continued use after
          that date constitutes acceptance.
        </p>
      </Section>

      <H2>14. Contact</H2>
      <Section>
        <p>
          Questions about these Terms? Email <Email />.
        </p>
      </Section>

      <LegalFooter />
    </main>
  );
}

// ============================================================
// Shared layout pieces used by all three legal pages
// ============================================================

export function LegalHeader({
  title,
  effective,
}: {
  title: string;
  effective: string;
}) {
  return (
    <div className="mb-10 border-b border-black/[0.06] pb-8">
      <Link
        href="/landing"
        className="inline-flex items-center gap-1 text-body-sm text-text-secondary transition hover:text-text-primary"
      >
        <span aria-hidden>←</span> Back to Sukona
      </Link>
      <h1 className="mt-6 text-4xl font-medium tracking-tight text-text-primary sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-caption text-text-tertiary">
        Effective {effective}
      </p>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
      {children}
    </h2>
  );
}

export function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-4 text-body text-text-secondary leading-relaxed">
      {children}
    </div>
  );
}

export function Email() {
  return (
    <a
      href="mailto:hellosukona@gmail.com"
      className="text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline"
    >
      hellosukona@gmail.com
    </a>
  );
}

export function LegalFooter() {
  return (
    <div className="mt-16 border-t border-black/[0.06] pt-8 text-caption text-text-tertiary">
      <p>
        © {new Date().getFullYear()} Sukona. The operational system for
        home-service beauty and wellness.
      </p>
    </div>
  );
}
