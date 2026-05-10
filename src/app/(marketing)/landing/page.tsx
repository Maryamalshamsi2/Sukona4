"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sukona landing page.
 *
 * Single-page marketing site for home-service salons + freelancers.
 * Sections are anchored (#about, #pricing, #contact) so the nav scrolls
 * smoothly within the page. Sticky nav with a backdrop blur, minimal
 * design system that matches the dashboard's typography tokens.
 *
 * Copy is intentionally first-draft — the user will adjust to taste.
 *
 * Routing: anon visitors hitting "/" are rewritten here by middleware
 * (URL stays "/"). Authed visitors are redirected to the dashboard.
 */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <WhySukona />
        <Features />
        <AppPreview />
        <WhoItsFor />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ============================================================
// Nav
// ============================================================

function Nav() {
  // Add a subtle border + slight shadow once the user scrolls past the
  // hero so the nav lifts off the page; pure cosmetic.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md transition-colors ${
        scrolled
          ? "bg-white/85 border-b border-black/5"
          : "bg-white/60 border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-20 sm:px-8">
        <Link href="/" aria-label="Sukona — home" className="flex shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="Sukona" className="h-9 w-auto sm:h-10" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 md:flex">
          <NavLink href="#about">About</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#contact">Contact</NavLink>
          <Link
            href="/login"
            className="rounded-full bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            Sign In
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-primary md:hidden"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div className="border-t border-black/5 bg-white md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            <MobileNavLink href="#about" onClick={() => setMobileOpen(false)}>About</MobileNavLink>
            <MobileNavLink href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</MobileNavLink>
            <MobileNavLink href="#contact" onClick={() => setMobileOpen(false)}>Contact</MobileNavLink>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-2 rounded-full bg-neutral-900 px-4 py-3 text-center text-body-sm font-semibold text-text-inverse"
            >
              Sign In
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-body-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
    >
      {children}
    </a>
  );
}

function MobileNavLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="rounded-lg px-3 py-3 text-body font-medium text-text-primary hover:bg-surface-hover"
    >
      {children}
    </a>
  );
}

// ============================================================
// Hero
// ============================================================

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-36">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-[2.5rem] font-bold tracking-tight text-text-primary leading-[1.05] sm:text-5xl lg:text-6xl">
          Run your home-service business from one place.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-body text-text-secondary sm:mt-8 sm:text-lg">
          Sukona is the calendar, payments, and team app built for freelancers
          and small salons. Designed for the way you actually work — on your
          phone, between appointments.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/signup"
            className="inline-flex w-full items-center justify-center rounded-full bg-neutral-900 px-7 py-3.5 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98] sm:w-auto"
          >
            Start your 7-day free trial
          </Link>
          <a
            href="#about"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-body-sm font-semibold text-text-primary transition hover:bg-surface-hover sm:w-auto"
          >
            See how it works
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </a>
        </div>
        <p className="mt-5 text-caption text-text-tertiary">
          No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ============================================================
// Trust strip
// ============================================================

function TrustStrip() {
  return (
    <section className="border-y border-black/5 bg-[#FAFAFA] py-6">
      <div className="mx-auto max-w-6xl px-5 text-center sm:px-8">
        <p className="text-caption font-medium uppercase tracking-wider text-text-tertiary">
          Built for home-service salons across the GCC
        </p>
      </div>
    </section>
  );
}

// ============================================================
// Why Sukona
// ============================================================

function WhySukona() {
  const points = [
    {
      title: "A calendar that fits in your hand",
      copy: "Drag-to-create. Drag-to-reschedule. Multiple staff in parallel. Designed for a 5-inch screen, not a desktop monitor.",
    },
    {
      title: "Get paid faster, with receipts",
      copy: "Cash, card, anything. Photo your receipts. Automatic WhatsApp confirmations. Total clarity for both sides.",
    },
    {
      title: "See what's actually happening",
      copy: "Revenue, expenses, profit at a glance. Per day, week, or month. No spreadsheets. No accountant gymnastics.",
    },
  ];

  return (
    <section id="about" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-36">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
          Why Sukona
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-[2.75rem]">
          Built for the way you actually work.
        </h2>
        <p className="mt-5 text-body text-text-secondary sm:text-lg">
          Most salon software is built for big places with reception desks.
          Sukona is built for the technician on the road, the freelancer
          between clients, the small team running everything from one phone.
        </p>
      </div>

      <div className="mt-14 grid gap-8 sm:mt-20 sm:grid-cols-3 sm:gap-10">
        {points.map((p) => (
          <div key={p.title}>
            <h3 className="text-body font-semibold text-text-primary">{p.title}</h3>
            <p className="mt-2 text-body-sm text-text-secondary leading-relaxed">{p.copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Features
// ============================================================

function Features() {
  const features = [
    {
      label: "Smart calendar",
      copy: "Tap to create, drag to reschedule. Block time, set staff schedules, see the day at a glance.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      ),
    },
    {
      label: "One-tap payments",
      copy: "Mark as paid in seconds. Multiple receipt photos, edit after. WhatsApp the receipt to your client.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      ),
    },
    {
      label: "Team & schedules",
      copy: "Add staff. Set working hours and days off. Each technician sees only their own appointments.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      ),
    },
    {
      label: "Reports that fit",
      copy: "Revenue, expenses, profit. Cash vs card. Per-staff and per-period. The numbers you actually need.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      ),
    },
  ];

  return (
    <section className="bg-[#FAFAFA] py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
            Everything you need
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Four core tools, one quiet app.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {features.map((f) => (
            <div
              key={f.label}
              className="rounded-2xl bg-white p-6 ring-1 ring-black/5 transition hover:shadow-md sm:p-7"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-text-inverse">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  {f.icon}
                </svg>
              </div>
              <h3 className="mt-5 text-body font-semibold text-text-primary">{f.label}</h3>
              <p className="mt-2 text-body-sm text-text-secondary leading-relaxed">{f.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// App preview (placeholder — swap in real screenshots when ready)
// ============================================================

function AppPreview() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
          See it in action
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
          The dashboard your team will actually use.
        </h2>
      </div>
      {/* Placeholder frame — replace src with /landing/preview-calendar.png
          and /landing/preview-detail.png once we capture real screenshots. */}
      <div className="mt-14 grid gap-6 sm:mt-20 lg:grid-cols-2">
        <PreviewFrame label="Calendar view" />
        <PreviewFrame label="Appointment details" />
      </div>
    </section>
  );
}

function PreviewFrame({ label }: { label: string }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#F5F5F7] to-white p-2 ring-1 ring-black/5">
      <div className="aspect-[16/10] rounded-2xl bg-white ring-1 ring-black/5">
        {/* Until real screenshots are dropped in, render a soft skeleton
            so the preview frame still has visual weight rather than being
            an empty box. */}
        <div className="flex h-full flex-col gap-3 p-5">
          <div className="h-3 w-32 rounded bg-neutral-100" />
          <div className="h-3 w-48 rounded bg-neutral-100" />
          <div className="mt-4 grid flex-1 grid-cols-3 gap-3">
            <div className="rounded-lg bg-neutral-50" />
            <div className="rounded-lg bg-neutral-50" />
            <div className="rounded-lg bg-neutral-50" />
          </div>
        </div>
      </div>
      <p className="px-3 pt-3 pb-1 text-caption font-medium text-text-tertiary">{label}</p>
    </div>
  );
}

// ============================================================
// Who it's for
// ============================================================

function WhoItsFor() {
  const tiers = [
    {
      label: "Solo freelancer",
      copy: "Just you, your clients, and a notebook somewhere. Sukona replaces the notebook.",
    },
    {
      label: "Small team (2–3)",
      copy: "A mini-salon, a husband-and-wife duo, a tight crew. Sukona keeps everyone synced.",
    },
    {
      label: "Multi-team",
      copy: "Multiple salons or teams under one brand. Sukona groups them cleanly with one login.",
    },
  ];

  return (
    <section className="bg-[#FAFAFA] py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
            Who it's for
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            From freelancer to multi-team.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:mt-16 sm:grid-cols-3 sm:gap-6">
          {tiers.map((t) => (
            <div
              key={t.label}
              className="rounded-2xl bg-white p-7 ring-1 ring-black/5"
            >
              <h3 className="text-body font-semibold text-text-primary">{t.label}</h3>
              <p className="mt-2 text-body-sm text-text-secondary leading-relaxed">{t.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Pricing
// ============================================================

function Pricing() {
  const plans = [
    {
      name: "Solo",
      price: 95,
      tagline: "For freelancers running solo.",
      features: [
        "Unlimited appointments",
        "Calendar + payments",
        "Receipts via WhatsApp",
        "Basic reports",
      ],
      popular: false,
    },
    {
      name: "Team",
      price: 149,
      tagline: "For small salons of 2–3 staff.",
      features: [
        "Everything in Solo",
        "Up to 3 team members",
        "Per-staff schedules",
        "Per-staff revenue reports",
      ],
      popular: true,
    },
    {
      name: "Multi-Team",
      price: 299,
      tagline: "For larger or multi-branch operations.",
      features: [
        "Everything in Team",
        "Unlimited team members",
        "Multi-team grouping",
        "Priority support",
      ],
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
          Pricing
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
          Simple, monthly. Cancel anytime.
        </h2>
        <p className="mt-5 text-body text-text-secondary">
          Every plan starts with a 7-day free trial. No credit card required.
        </p>
      </div>

      <div className="mt-14 grid gap-5 sm:mt-20 lg:grid-cols-3 lg:gap-6">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative rounded-3xl p-7 sm:p-8 ${
              p.popular
                ? "bg-neutral-900 text-text-inverse ring-1 ring-neutral-900"
                : "bg-white ring-1 ring-black/5"
            }`}
          >
            {p.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1 text-caption font-semibold text-amber-900">
                Most popular
              </span>
            )}
            <h3
              className={`text-body font-semibold ${
                p.popular ? "text-text-inverse" : "text-text-primary"
              }`}
            >
              {p.name}
            </h3>
            <p
              className={`mt-1 text-caption ${
                p.popular ? "text-white/70" : "text-text-secondary"
              }`}
            >
              {p.tagline}
            </p>
            <div className="mt-7">
              <span
                className={`text-4xl font-bold tracking-tight ${
                  p.popular ? "text-text-inverse" : "text-text-primary"
                }`}
              >
                {p.price}
              </span>
              <span
                className={`ml-1.5 text-body-sm ${
                  p.popular ? "text-white/70" : "text-text-secondary"
                }`}
              >
                AED / month
              </span>
            </div>
            <Link
              href="/signup"
              className={`mt-7 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-body-sm font-semibold transition active:scale-[0.98] ${
                p.popular
                  ? "bg-white text-neutral-900 hover:bg-neutral-100"
                  : "bg-neutral-900 text-text-inverse hover:bg-neutral-800"
              }`}
            >
              Start free trial
            </Link>
            <ul className="mt-7 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <svg
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      p.popular ? "text-white/80" : "text-text-tertiary"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span
                    className={`text-body-sm ${
                      p.popular ? "text-white/90" : "text-text-secondary"
                    }`}
                  >
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// FAQ
// ============================================================

function FAQ() {
  const faqs = [
    {
      q: "Do I need a credit card to start?",
      a: "No. Sign up, use Sukona for 7 days, decide if it works for you. No card needed up front.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No contracts and no notice period. If you stop paying, your data stays exportable for 30 days.",
    },
    {
      q: "Is my data safe?",
      a: "Your data is yours. Encrypted at rest. We don't share or sell anything to anyone, ever.",
    },
    {
      q: "I'm just one person — is the Solo tier enough?",
      a: "Yes. Solo is purpose-built for freelancers. Calendar, payments, receipts, and basic reports — everything you need to run a one-person business.",
    },
    {
      q: "Does it work outside the UAE?",
      a: "Yes. Sukona supports salons across the GCC and beyond, with multi-currency support so prices show in your local denomination.",
    },
  ];

  return (
    <section className="bg-[#FAFAFA] py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Common questions.
          </h2>
        </div>
        <div className="mt-12 divide-y divide-black/5 rounded-2xl bg-white ring-1 ring-black/5 sm:mt-16">
          {faqs.map((f) => (
            <FAQItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-surface-hover sm:px-7"
      >
        <span className="text-body font-semibold text-text-primary">{q}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-5 text-body-sm text-text-secondary leading-relaxed sm:px-7">
          {a}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Final CTA
// ============================================================

function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-36">
      <div className="rounded-3xl bg-neutral-900 px-7 py-14 text-center sm:px-12 sm:py-20">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-text-inverse sm:text-4xl lg:text-5xl">
          Try Sukona free for 7 days.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-body text-white/70">
          No credit card. Set up in minutes. Cancel anytime.
        </p>
        <Link
          href="/signup"
          className="mt-9 inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-body-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 active:scale-[0.98]"
        >
          Get started
        </Link>
      </div>
    </section>
  );
}

// ============================================================
// Footer
// ============================================================

function Footer() {
  return (
    <footer id="contact" className="border-t border-black/5 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Sukona" className="h-9 w-auto sm:h-10" />
            <p className="mt-4 max-w-xs text-body-sm text-text-secondary">
              Run your home-service business from one calm, mobile-first app.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-14">
            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
                Product
              </h4>
              <ul className="mt-4 space-y-2.5 text-body-sm">
                <li><a href="#about" className="text-text-secondary hover:text-text-primary">About</a></li>
                <li><a href="#pricing" className="text-text-secondary hover:text-text-primary">Pricing</a></li>
                <li><Link href="/login" className="text-text-secondary hover:text-text-primary">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
                Contact
              </h4>
              <ul className="mt-4 space-y-2.5 text-body-sm">
                <li>
                  <a href="mailto:hellosukona@gmail.com" className="text-text-secondary hover:text-text-primary">
                    hellosukona@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com/wearesukona"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-secondary hover:text-text-primary"
                  >
                    @wearesukona
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-black/5 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-text-tertiary">
            © {new Date().getFullYear()} Sukona. All rights reserved.
          </p>
          <p className="text-caption text-text-tertiary">
            Made for freelancers and small salons.
          </p>
        </div>
      </div>
    </footer>
  );
}
