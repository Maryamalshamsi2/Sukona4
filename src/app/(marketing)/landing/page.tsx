"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sukona landing page (v2 — bento + peach palette).
 *
 * Visual direction:
 *   - Floating pill nav (logo left, links centered, Sign In right) like
 *     Popcorn / BookingLedger.
 *   - Warm cream → peach palette that matches the auth pages
 *     (`from-violet-50` is remapped to `#FFF8F1` in globals.css; ditto
 *     `violet-100` → `#FEEAD2`). The "violet" tokens are intentional —
 *     they're reused throughout the dashboard for the warm accent.
 *   - Less copy, more visuals. A bento grid replaces the old 4-card row,
 *     and the hero anchors itself to a real-looking calendar mock instead
 *     of an empty preview frame.
 *
 * In-page anchors: #about · #pricing · #contact (smooth-scroll is enabled
 * by the marketing layout).
 */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="overflow-hidden">
        <Hero />
        <Bento />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ============================================================
// Nav  — pill-shaped, floats over the page
// ============================================================

function Nav() {
  // Slight surface lift once the user scrolls past the hero so the nav
  // pill stays legible against denser content below.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full px-4 pt-4 sm:px-6 sm:pt-5">
      <div
        className={`mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full px-3 py-2 transition-all sm:px-4 sm:py-2.5 ${
          scrolled
            ? "bg-white/90 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-md"
            : "bg-white/70 ring-1 ring-black/[0.04] backdrop-blur"
        }`}
      >
        {/* Logo (left) */}
        <Link
          href="/"
          aria-label="Sukona — home"
          className="flex shrink-0 items-center pl-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="Sukona" className="h-8 w-auto sm:h-9" />
        </Link>

        {/* Center links — desktop */}
        <nav className="hidden items-center gap-1 md:flex">
          <NavLink href="#about">About</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#contact">Contact</NavLink>
        </nav>

        {/* Sign in (right) — desktop */}
        <div className="hidden md:block">
          <Link
            href="/login"
            className="inline-flex items-center rounded-full bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            Sign in
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-primary md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer — drops out of the pill */}
      {mobileOpen && (
        <div className="mx-auto mt-2 max-w-5xl rounded-2xl bg-white/95 p-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur md:hidden">
          <nav className="flex flex-col">
            <MobileNavLink href="#about" onClick={() => setMobileOpen(false)}>About</MobileNavLink>
            <MobileNavLink href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</MobileNavLink>
            <MobileNavLink href="#contact" onClick={() => setMobileOpen(false)}>Contact</MobileNavLink>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-1 rounded-xl bg-neutral-900 px-4 py-3 text-center text-body-sm font-semibold text-text-inverse"
            >
              Sign in
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
      className="rounded-full px-4 py-2 text-body-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
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
      className="rounded-xl px-4 py-3 text-body font-medium text-text-primary hover:bg-surface-hover"
    >
      {children}
    </a>
  );
}

// ============================================================
// Hero — peach gradient backdrop + calendar mock anchor
// ============================================================

function Hero() {
  return (
    <section className="relative isolate -mt-[72px] pt-[72px] sm:-mt-[84px] sm:pt-[84px]">
      {/* Soft peach radial blobs behind the hero — match the auth-page
          gradient feel without the hard linear-gradient seam. */}
      <BackgroundBlobs />

      <div className="mx-auto max-w-5xl px-5 pt-12 pb-16 text-center sm:px-8 sm:pt-16 sm:pb-20 lg:pt-24 lg:pb-24">
        {/* Trust pill */}
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/70 px-3.5 py-1.5 text-caption font-medium text-text-secondary shadow-sm ring-1 ring-black/[0.04] backdrop-blur">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" />
          7-day free trial · No credit card
        </div>

        <h1 className="mx-auto mt-6 max-w-3xl text-[2.5rem] font-bold tracking-tight text-text-primary leading-[1.05] sm:text-5xl lg:text-6xl">
          Run your salon from
          <br className="hidden sm:block" />{" "}
          <span className="text-primary-600">one calm app.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-body text-text-secondary sm:text-lg">
          Calendar, payments, and team — designed for the way you actually
          work. On your phone, between appointments.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98] sm:w-auto"
          >
            Start free trial
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <a
            href="#about"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white/70 px-6 py-3.5 text-body-sm font-semibold text-text-primary ring-1 ring-black/[0.04] backdrop-blur transition hover:bg-white sm:w-auto"
          >
            See how it works
          </a>
        </div>

        {/* Calendar mock — anchors the hero. Real-feeling micro UI like
            the orange Sun–Sat reference. */}
        <div className="mx-auto mt-14 max-w-3xl sm:mt-20">
          <CalendarMock />
        </div>
      </div>
    </section>
  );
}

function BackgroundBlobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Top peach wash */}
      <div className="absolute -top-32 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-[#FEEAD2] opacity-60 blur-3xl" />
      {/* Lower-right warm accent */}
      <div className="absolute right-[-8%] top-[18%] h-[420px] w-[420px] rounded-full bg-[#FBB97A] opacity-30 blur-3xl" />
      {/* Lower-left soft cream */}
      <div className="absolute -left-32 top-[45%] h-[420px] w-[420px] rounded-full bg-[#FFF8F1] opacity-90 blur-3xl" />
    </div>
  );
}

// ============================================================
// Calendar mock — an inline UI snapshot used as the hero's visual.
// Designed to feel like a real Sukona calendar surface, not a skeleton.
// ============================================================

function CalendarMock() {
  const days = [
    { d: "Sun", n: 1 },
    { d: "Mon", n: 2 },
    { d: "Tue", n: 3, today: true },
    { d: "Wed", n: 4 },
    { d: "Thu", n: 5 },
    { d: "Fri", n: 6 },
    { d: "Sat", n: 7 },
  ];

  return (
    <div className="mx-auto rounded-3xl bg-white/80 p-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.04] backdrop-blur sm:p-4">
      {/* Day strip */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.04] sm:p-5">
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((day) => (
            <div key={day.d} className="flex flex-col items-center gap-2 py-1">
              <div
                className={`text-caption font-medium ${
                  day.today ? "text-primary-600" : "text-text-tertiary"
                }`}
              >
                {day.d}
              </div>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-body-sm font-semibold sm:h-10 sm:w-10 ${
                  day.today
                    ? "bg-primary-100 text-primary-700"
                    : "text-text-primary"
                }`}
              >
                {day.n}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Appointment row */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-black/[0.04] sm:px-5 sm:py-4">
        <div className="flex items-center gap-3 text-left">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v4.5l3 1.5" />
            </svg>
          </div>
          <div>
            <div className="text-body font-semibold text-text-primary">5:30 pm</div>
            <div className="text-caption text-text-tertiary">Brooklyn — Hair color</div>
          </div>
        </div>
        <button
          type="button"
          className="rounded-full bg-neutral-900 px-4 py-2 text-caption font-semibold text-text-inverse"
        >
          Book now
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Bento — feature grid with mixed sizes/visuals
// ============================================================

function Bento() {
  return (
    <section id="about" className="relative bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-semibold uppercase tracking-wider text-primary-600">
            Why Sukona
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Built for the way you actually work.
          </h2>
        </div>

        {/*
          Bento grid:
          - Tile 1: Calendar (large, feature)         span 2 cols, 2 rows
          - Tile 2: Payments (top-right)              span 2 cols
          - Tile 3: WhatsApp (bottom-right)           span 1 col
          - Tile 4: Reports stat (bottom-mid)         span 1 col
        */}
        <div className="mt-12 grid gap-4 sm:mt-16 sm:gap-5 lg:grid-cols-4 lg:grid-rows-2">
          <BentoCalendar />
          <BentoPayments />
          <BentoStat />
          <BentoWhatsApp />
        </div>
      </div>
    </section>
  );
}

function BentoCalendar() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-50 to-white p-7 ring-1 ring-black/[0.04] sm:p-8 lg:col-span-2 lg:row-span-2">
      <div className="text-caption font-semibold uppercase tracking-wider text-primary-600">
        Calendar
      </div>
      <h3 className="mt-2 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
        A calendar that
        <br />
        fits in your hand.
      </h3>
      <p className="mt-3 max-w-sm text-body-sm text-text-secondary">
        Tap to create. Drag to reschedule. Multiple staff, side by side.
        Designed for a 5-inch screen.
      </p>

      {/* Mini week strip — same visual language as the hero mock */}
      <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-black/[0.04]">
        <div className="grid grid-cols-7 gap-1 text-center text-caption">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-text-tertiary">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`flex h-9 items-center justify-center rounded-lg text-caption font-semibold ${
                i === 2
                  ? "bg-primary-100 text-primary-700"
                  : "text-text-primary"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 rounded-lg bg-primary-50/60 px-3 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            <div className="text-caption font-medium text-text-primary">
              10:00 — Layla, Highlights
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            <div className="text-caption font-medium text-text-primary">
              14:30 — Aisha, Manicure
            </div>
          </div>
        </div>
      </div>

      {/* Decorative blob */}
      <div
        aria-hidden
        className="absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-primary-200/40 blur-2xl"
      />
    </div>
  );
}

function BentoPayments() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-neutral-900 p-7 text-text-inverse sm:p-8 lg:col-span-2">
      <div className="text-caption font-semibold uppercase tracking-wider text-primary-300">
        Payments
      </div>
      <h3 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
        One tap. Paid. Receipt sent.
      </h3>
      <p className="mt-2 max-w-md text-body-sm text-white/70">
        Cash, card, anything. Snap the receipt. WhatsApp it to your client
        without leaving the appointment.
      </p>

      {/* Mock receipt chip */}
      <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-white/10 backdrop-blur">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/90 text-white">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <div className="text-caption text-white/60">Paid · Visa ending 4242</div>
          <div className="text-body-sm font-semibold">AED 240.00</div>
        </div>
      </div>
    </div>
  );
}

function BentoStat() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FEEAD2] to-[#FFF8F1] p-7 ring-1 ring-black/[0.04] sm:p-8">
      <div className="text-caption font-semibold uppercase tracking-wider text-primary-700">
        Reports
      </div>
      <div className="mt-4 text-5xl font-bold tracking-tight text-text-primary sm:text-6xl">
        95%
      </div>
      <p className="mt-2 text-body-sm text-text-secondary">
        of owners say Sukona shows them numbers they couldn&apos;t see before.
      </p>
    </div>
  );
}

function BentoWhatsApp() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white p-7 ring-1 ring-black/[0.04] sm:p-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      </div>
      <h3 className="mt-5 text-body font-semibold text-text-primary">
        WhatsApp built-in.
      </h3>
      <p className="mt-2 text-body-sm text-text-secondary leading-relaxed">
        Reminders, receipts, and confirmations in the channel your clients
        already use.
      </p>
    </div>
  );
}

// ============================================================
// Pricing — soften with peach accents
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
        "WhatsApp receipts",
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
        "Per-staff reports",
      ],
      popular: true,
    },
    {
      name: "Multi-Team",
      price: 299,
      tagline: "For multi-branch operations.",
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
    <section
      id="pricing"
      className="relative bg-gradient-to-b from-[#FFF8F1] via-white to-white py-20 sm:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-caption font-semibold uppercase tracking-wider text-primary-600">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Simple, monthly.
          </h2>
          <p className="mt-4 text-body text-text-secondary">
            Every plan starts with a 7-day free trial. No card needed.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:mt-16 lg:grid-cols-3 lg:gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-3xl p-7 sm:p-8 ${
                p.popular
                  ? "bg-neutral-900 text-text-inverse shadow-[0_24px_60px_-30px_rgba(0,0,0,0.4)]"
                  : "bg-white ring-1 ring-black/[0.04]"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-100 px-3 py-1 text-caption font-semibold text-primary-700 ring-1 ring-primary-200/60">
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
              <div className="mt-7 flex items-baseline">
                <span
                  className={`text-5xl font-bold tracking-tight ${
                    p.popular ? "text-text-inverse" : "text-text-primary"
                  }`}
                >
                  {p.price}
                </span>
                <span
                  className={`ml-2 text-body-sm ${
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
                        p.popular ? "text-primary-300" : "text-primary-500"
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
      </div>
    </section>
  );
}

// ============================================================
// FAQ — light, condensed
// ============================================================

function FAQ() {
  const faqs = [
    {
      q: "Do I need a credit card to start?",
      a: "No. Sign up, use Sukona for 7 days, decide if it works for you. No card up front.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No contracts, no notice period. If you stop paying, your data stays exportable for 30 days.",
    },
    {
      q: "Is my data safe?",
      a: "Your data is yours. Encrypted at rest. We don't share or sell anything to anyone, ever.",
    },
    {
      q: "Does it work outside the UAE?",
      a: "Yes. Sukona supports salons across the GCC and beyond, with multi-currency support.",
    },
  ];

  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-caption font-semibold uppercase tracking-wider text-primary-600">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Common questions.
          </h2>
        </div>
        <div className="mt-12 divide-y divide-black/5 rounded-3xl bg-[#FAFAFA] ring-1 ring-black/[0.04] sm:mt-16">
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
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-white/60 sm:px-7"
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
// Final CTA — peach gradient panel
// ============================================================

function FinalCTA() {
  return (
    <section className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#FEEAD2] via-[#FFF8F1] to-white px-7 py-16 text-center ring-1 ring-black/[0.04] sm:px-12 sm:py-20">
        {/* Soft decorative blob */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-primary-200/50 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-12 h-72 w-72 rounded-full bg-[#FBB97A]/30 blur-3xl"
        />

        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
            Try Sukona free for 7 days.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-body text-text-secondary">
            Set up in minutes. No card. Cancel anytime.
          </p>
          <Link
            href="/signup"
            className="group mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 active:scale-[0.98]"
          >
            Get started
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
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
