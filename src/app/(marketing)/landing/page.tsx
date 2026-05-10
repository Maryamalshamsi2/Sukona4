"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

/**
 * Sukona landing page (v3 — Apple-strict).
 *
 * Design notes:
 *   - Flat surfaces. No gradient washes, no decorative blobs. White is
 *     the canvas; whitespace and type carry the page.
 *   - Display type runs large (lg:text-7xl–8xl) at font-semibold with
 *     tight tracking — the rhythm Apple uses on iPhone / Watch pages.
 *   - One idea per section. Each section is full-width, has a single
 *     statement, a single visual, optionally a single CTA.
 *   - Product visuals are inline-rendered UI, not skeletons. The hero
 *     mock is a multi-staff calendar grid; subsequent sections show a
 *     phone view, a payment confirmation, and a revenue stat.
 *   - Color is monochrome with the existing peach accent (`primary-*`)
 *     used sparingly — the "today" cell, a CTA arrow, a "+ New" link.
 *
 * Routing: anon → here (rewrite from /), authed → bounced to dashboard
 * by middleware.
 */
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <MobileSection />
        <PaymentsSection />
        <ReportsSection />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ============================================================
// Nav — flat horizontal bar, centered links
// ============================================================

function Nav() {
  // Subtle backdrop blur once the user scrolls past the hero so the
  // bar lifts off the content beneath. Stays bg-white at the top so
  // the hero feels seamless with the chrome.
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
      className={`sticky top-0 z-50 transition-colors ${
        scrolled
          ? "border-b border-black/[0.06] bg-white/85 backdrop-blur-xl"
          : "border-b border-transparent bg-white"
      }`}
    >
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-5 sm:h-16 sm:px-8">
        {/* Logo (left) */}
        <Link href="/" aria-label="Sukona — home" className="justify-self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt="Sukona" className="h-7 w-auto sm:h-8" />
        </Link>

        {/* Center links — desktop */}
        <nav className="hidden items-center gap-9 md:flex">
          <NavLink href="#about">About</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#contact">Contact</NavLink>
        </nav>

        {/* Sign in (right) — text link, not a button. Apple uses these. */}
        <div className="hidden justify-self-end md:block">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-body-sm font-medium text-text-primary transition hover:text-primary-600"
          >
            Sign in <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex h-9 w-9 items-center justify-center justify-self-end text-text-primary md:hidden"
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

      {mobileOpen && (
        <div className="border-t border-black/[0.06] bg-white md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-2">
            <MobileNavLink href="#about" onClick={() => setMobileOpen(false)}>About</MobileNavLink>
            <MobileNavLink href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</MobileNavLink>
            <MobileNavLink href="#contact" onClick={() => setMobileOpen(false)}>Contact</MobileNavLink>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-3 text-body font-medium text-text-primary"
            >
              Sign in →
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
      className="text-body-sm font-medium text-text-primary transition-colors hover:text-primary-600"
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
      className="px-3 py-3 text-body font-medium text-text-primary"
    >
      {children}
    </a>
  );
}

// ============================================================
// Hero — big type, then a big multi-staff calendar surface
// ============================================================

function Hero() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-5xl px-5 pt-20 text-center sm:px-8 sm:pt-28 lg:pt-36">
        <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tighter text-text-primary leading-[1.02] sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
          Your salon.
          <br />
          From your phone.
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg text-text-secondary sm:mt-8 sm:text-xl">
          Calendar, payments, and team. One quiet app, designed for the way
          you actually work.
        </p>

        <div className="mt-10 flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-text-primary px-7 py-3.5 text-body-sm font-medium text-text-inverse transition hover:opacity-90 active:scale-[0.98]"
          >
            Start free trial
          </Link>
          <a
            href="#about"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-primary-600 transition hover:text-primary-700"
          >
            See how it works <span aria-hidden>→</span>
          </a>
        </div>
      </div>

      {/* Big calendar mock */}
      <div className="mx-auto mt-16 max-w-6xl px-5 pb-20 sm:mt-20 sm:px-8 sm:pb-28 lg:mt-24 lg:pb-36">
        <CalendarMock />
      </div>
    </section>
  );
}

// ============================================================
// CalendarMock — wide multi-staff grid, the hero's anchor
// ============================================================

function CalendarMock() {
  const staff = ["Layla", "Aisha", "Maya"];
  const hours = ["9", "10", "11", "12", "1", "2", "3", "4"];
  const HOUR_PX = 56;
  const HEAD_PX = 56;
  const TIME_COL_PX = 60;

  // [staffColumn, hourOffsetFromStart, durationHours, label, tone]
  const apps: Array<{
    col: number;
    top: number;
    dur: number;
    label: string;
    sub: string;
    tone: "peach" | "sky" | "neutral";
  }> = [
    { col: 0, top: 0,    dur: 1.5, label: "Highlights",  sub: "Sara M.",   tone: "peach" },
    { col: 0, top: 2.5,  dur: 1,   label: "Cut & blow",  sub: "Noor",      tone: "neutral" },
    { col: 1, top: 0.5,  dur: 2,   label: "Color",       sub: "Layla S.",  tone: "sky" },
    { col: 1, top: 3.5,  dur: 1,   label: "Manicure",    sub: "Reem",      tone: "peach" },
    { col: 2, top: 1,    dur: 1,   label: "Brows",       sub: "Lina",      tone: "neutral" },
    { col: 2, top: 2.5,  dur: 2,   label: "Treatment",   sub: "Mariam",    tone: "sky" },
  ];

  const tones = {
    peach: "bg-primary-50 text-primary-800 ring-primary-100",
    sky: "bg-sky-50 text-sky-900 ring-sky-100",
    neutral: "bg-neutral-100 text-text-primary ring-neutral-200",
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-white shadow-[0_40px_100px_-40px_rgba(0,0,0,0.28)] ring-1 ring-black/[0.06]">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-5 py-3.5 sm:px-7 sm:py-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
          <div className="h-2.5 w-2.5 rounded-full bg-neutral-200" />
        </div>
        <div className="text-body-sm font-semibold text-text-primary">
          Friday, May 10
        </div>
        <div className="text-body-sm font-medium text-primary-600">+ New</div>
      </div>

      {/* Body */}
      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: 640 }}>
          {/* Staff header row */}
          <div
            className="grid border-b border-black/[0.06]"
            style={{
              gridTemplateColumns: `${TIME_COL_PX}px repeat(3, 1fr)`,
              height: HEAD_PX,
            }}
          >
            <div />
            {staff.map((s, i) => (
              <div
                key={s}
                className={`flex items-center px-4 text-body-sm font-semibold text-text-primary ${
                  i < staff.length - 1 ? "border-r border-black/[0.04]" : ""
                }`}
              >
                {s}
              </div>
            ))}
          </div>

          {/* Time grid + appointment chips */}
          <div
            className="relative grid"
            style={{ gridTemplateColumns: `${TIME_COL_PX}px repeat(3, 1fr)` }}
          >
            {hours.map((h) => (
              <Fragment key={h}>
                <div
                  className="border-b border-r border-black/[0.04] px-3 pt-1.5 text-right text-caption text-text-tertiary"
                  style={{ height: HOUR_PX }}
                >
                  {h}
                </div>
                {staff.map((_, i) => (
                  <div
                    key={i}
                    className={`border-b border-black/[0.04] ${
                      i < staff.length - 1 ? "border-r" : ""
                    }`}
                    style={{ height: HOUR_PX }}
                  />
                ))}
              </Fragment>
            ))}

            {apps.map((a, i) => (
              <div
                key={i}
                className={`absolute flex flex-col rounded-lg px-3 py-1.5 ring-1 ${tones[a.tone]}`}
                style={{
                  left: `calc(${TIME_COL_PX}px + ${a.col} * ((100% - ${TIME_COL_PX}px) / 3) + 6px)`,
                  width: `calc((100% - ${TIME_COL_PX}px) / 3 - 12px)`,
                  top: a.top * HOUR_PX + 3,
                  height: a.dur * HOUR_PX - 6,
                }}
              >
                <div className="text-caption font-semibold leading-tight">
                  {a.label}
                </div>
                <div className="text-[11px] opacity-70 leading-tight">
                  {a.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MobileSection — phone-in-hand value prop with a phone mock
// ============================================================

function MobileSection() {
  return (
    <section id="about" className="bg-[#F5F5F7] py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
        <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tighter text-text-primary leading-[1.05] sm:text-5xl lg:text-6xl">
          Designed for your phone.
          <br />
          <span className="text-text-secondary">Not a desk.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Tap to create, drag to reschedule. Multiple staff, side by side.
          Everything within thumb&rsquo;s reach.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-5xl justify-center px-5 sm:mt-20 sm:px-8">
        <PhoneMock />
      </div>
    </section>
  );
}

function PhoneMock() {
  const items = [
    { time: "9:00",  name: "Highlights", who: "Sara M.",  tone: "peach" as const },
    { time: "11:30", name: "Color",      who: "Layla S.", tone: "sky" as const },
    { time: "14:00", name: "Manicure",   who: "Reem",     tone: "peach" as const },
    { time: "16:30", name: "Brows",      who: "Lina",     tone: "neutral" as const },
  ];

  const tones = {
    peach: "bg-primary-50 text-primary-800 ring-primary-100",
    sky: "bg-sky-50 text-sky-900 ring-sky-100",
    neutral: "bg-neutral-100 text-text-primary ring-neutral-200",
  };

  return (
    <div className="relative">
      {/* Phone bezel */}
      <div className="relative w-[280px] rounded-[2.5rem] bg-neutral-900 p-2 shadow-[0_50px_100px_-30px_rgba(0,0,0,0.45)] sm:w-[320px]">
        <div className="overflow-hidden rounded-[2rem] bg-white">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3.5 pb-1 text-[11px] font-semibold text-text-primary">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a4 4 0 014-4h8a4 4 0 014 4v8a4 4 0 01-4 4H6a4 4 0 01-4-4V6z" opacity=".3" />
                <path d="M2 6a4 4 0 014-4h2v16H6a4 4 0 01-4-4V6z" />
              </svg>
            </div>
          </div>

          {/* Header */}
          <div className="px-6 pt-4 pb-5">
            <div className="text-caption font-medium text-text-tertiary">Friday, May 10</div>
            <div className="mt-0.5 text-2xl font-semibold tracking-tight text-text-primary">
              Today
            </div>
          </div>

          {/* Appointments */}
          <div className="space-y-2 px-4 pb-6">
            {items.map((it) => (
              <div
                key={it.time}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 ring-1 ${tones[it.tone]}`}
              >
                <div className="flex flex-col">
                  <span className="text-caption opacity-70">{it.time}</span>
                  <span className="text-body-sm font-semibold leading-tight">
                    {it.name}
                  </span>
                </div>
                <span className="text-caption font-medium opacity-80">{it.who}</span>
              </div>
            ))}
          </div>

          {/* Tab bar hint */}
          <div className="flex items-center justify-around border-t border-black/[0.06] px-4 py-3">
            <div className="flex flex-col items-center gap-0.5 text-primary-600">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <rect x="3" y="4" width="14" height="14" rx="3" />
              </svg>
              <span className="text-[10px] font-semibold">Calendar</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 text-text-tertiary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 20 20">
                <circle cx="10" cy="6" r="3" />
                <path d="M3 17a7 7 0 0114 0" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-medium">Team</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 text-text-tertiary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 20 20">
                <path d="M3 10h14M3 6h14M3 14h8" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] font-medium">Reports</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Payments — confirmation card
// ============================================================

function PaymentsSection() {
  return (
    <section className="bg-white py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
        <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tighter text-text-primary leading-[1.05] sm:text-5xl lg:text-6xl">
          One tap. Paid.
          <br />
          <span className="text-text-secondary">Receipt sent.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Cash, card, anything. Snap the receipt. WhatsApp it to your client
          before they reach the door.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl justify-center px-5 sm:mt-20 sm:px-8">
        <PaymentMock />
      </div>
    </section>
  );
}

function PaymentMock() {
  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.06] sm:p-8">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <div className="text-caption font-medium text-text-tertiary">
              Payment received
            </div>
            <div className="text-body-sm font-semibold text-text-primary">
              Sara M. · Highlights
            </div>
          </div>
        </div>
        <span className="text-caption font-medium text-emerald-700">Paid</span>
      </div>

      <div className="mt-6 border-t border-black/[0.06] pt-5">
        <div className="text-caption font-medium text-text-tertiary">Total</div>
        <div className="mt-1 text-4xl font-semibold tracking-tight text-text-primary">
          AED 240
        </div>
        <div className="mt-1 text-caption text-text-secondary">
          Visa ending 4242
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl bg-[#F5F5F7] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10c1.85 0 3.58-.5 5.06-1.39L20 20l-1.39-4.94A9.96 9.96 0 0020 10c0-5.52-4.48-10-10-10z" />
          </svg>
        </div>
        <div className="flex-1 text-caption font-medium text-text-secondary">
          Receipt sent on WhatsApp
        </div>
        <div className="text-caption text-text-tertiary">Just now</div>
      </div>
    </div>
  );
}

// ============================================================
// Reports — revenue stat + sparkline
// ============================================================

function ReportsSection() {
  return (
    <section className="bg-[#F5F5F7] py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
        <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tighter text-text-primary leading-[1.05] sm:text-5xl lg:text-6xl">
          See what&rsquo;s
          <br />
          <span className="text-text-secondary">actually working.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Revenue, expenses, profit. Per day, week, or month. The numbers you
          actually need — no spreadsheets.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl justify-center px-5 sm:mt-20 sm:px-8">
        <RevenueMock />
      </div>
    </section>
  );
}

function RevenueMock() {
  // Sparkline points — fake values, smoothed shape that ends on a high
  const points = [40, 38, 45, 42, 50, 48, 56, 54, 62, 58, 68, 72];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const W = 320;
  const H = 80;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((v - min) / (max - min)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L${W},${H} L0,${H} Z`;

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.06] sm:p-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-caption font-medium text-text-tertiary">
            Revenue · This month
          </div>
          <div className="mt-1 text-5xl font-semibold tracking-tighter text-text-primary">
            AED 28,400
          </div>
        </div>
        <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-caption font-semibold text-emerald-700">
          ↑ 17%
        </div>
      </div>

      {/* Sparkline */}
      <div className="mt-6">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F08C2D" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#F08C2D" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#sparkfill)" />
          <path
            d={path}
            fill="none"
            stroke="#F08C2D"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-black/[0.06] pt-5">
        <div>
          <div className="text-caption text-text-tertiary">Last month</div>
          <div className="mt-0.5 text-body font-semibold text-text-primary">
            AED 24,200
          </div>
        </div>
        <div>
          <div className="text-caption text-text-tertiary">Bookings</div>
          <div className="mt-0.5 text-body font-semibold text-text-primary">
            142
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Pricing — typographic, three tiers
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
      featured: false,
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
      featured: true,
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
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="bg-white py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-semibold tracking-tighter text-text-primary leading-[1.05] sm:text-5xl lg:text-6xl">
            Simple pricing.
            <br />
            <span className="text-text-secondary">Cancel anytime.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg text-text-secondary sm:text-xl">
            Every plan starts with a 7-day free trial. No card required.
          </p>
        </div>

        <div className="mt-16 grid gap-5 sm:mt-20 lg:grid-cols-3 lg:gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-3xl bg-white p-7 sm:p-8 ${
                p.featured
                  ? "ring-2 ring-primary-500 shadow-[0_30px_60px_-30px_rgba(240,140,45,0.35)]"
                  : "ring-1 ring-black/[0.06]"
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-3 py-1 text-caption font-semibold text-text-inverse">
                  Most popular
                </span>
              )}
              <div className="text-body font-semibold text-text-primary">
                {p.name}
              </div>
              <div className="mt-1 text-caption text-text-secondary">
                {p.tagline}
              </div>
              <div className="mt-7 flex items-baseline">
                <span className="text-5xl font-semibold tracking-tighter text-text-primary">
                  {p.price}
                </span>
                <span className="ml-2 text-body-sm text-text-secondary">
                  AED / month
                </span>
              </div>
              <Link
                href="/signup"
                className={`mt-7 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-body-sm font-medium transition active:scale-[0.98] ${
                  p.featured
                    ? "bg-primary-500 text-text-inverse hover:bg-primary-600"
                    : "bg-text-primary text-text-inverse hover:opacity-90"
                }`}
              >
                Start free trial
              </Link>
              <ul className="mt-7 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        p.featured ? "text-primary-500" : "text-text-tertiary"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-body-sm text-text-secondary">{f}</span>
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
// FAQ — quiet, condensed
// ============================================================

function FAQ() {
  const faqs = [
    {
      q: "Do I need a credit card to start?",
      a: "No. Sign up, use Sukona for 7 days, decide if it works for you.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No contracts, no notice period. If you stop, your data stays exportable for 30 days.",
    },
    {
      q: "Is my data safe?",
      a: "Your data is yours. Encrypted at rest. We never share or sell anything.",
    },
    {
      q: "Does it work outside the UAE?",
      a: "Yes. Sukona works across the GCC and beyond, with multi-currency support.",
    },
  ];

  return (
    <section className="bg-[#F5F5F7] py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <h2 className="text-center text-4xl font-semibold tracking-tighter text-text-primary leading-[1.05] sm:text-5xl">
          Common questions.
        </h2>
        <div className="mt-14 divide-y divide-black/[0.06] sm:mt-16">
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
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition sm:py-6"
      >
        <span className="text-body font-semibold text-text-primary sm:text-lg">{q}</span>
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
        <div className="pb-5 text-body-sm text-text-secondary leading-relaxed sm:pb-6 sm:text-body">
          {a}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Final CTA — single statement, single button
// ============================================================

function FinalCTA() {
  return (
    <section className="bg-white py-24 text-center sm:py-32 lg:py-40">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <h2 className="text-4xl font-semibold tracking-tighter text-text-primary leading-[1.02] sm:text-5xl lg:text-6xl">
          Try Sukona free for
          <br />
          <span className="text-primary-600">seven days.</span>
        </h2>
        <Link
          href="/signup"
          className="mt-10 inline-flex items-center justify-center rounded-full bg-text-primary px-7 py-3.5 text-body-sm font-medium text-text-inverse transition hover:opacity-90 active:scale-[0.98]"
        >
          Get started
        </Link>
      </div>
    </section>
  );
}

// ============================================================
// Footer — minimal
// ============================================================

function Footer() {
  return (
    <footer id="contact" className="border-t border-black/[0.06] bg-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Sukona" className="h-8 w-auto sm:h-9" />
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
                <li><a href="#about" className="text-text-secondary transition hover:text-text-primary">About</a></li>
                <li><a href="#pricing" className="text-text-secondary transition hover:text-text-primary">Pricing</a></li>
                <li><Link href="/login" className="text-text-secondary transition hover:text-text-primary">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
                Contact
              </h4>
              <ul className="mt-4 space-y-2.5 text-body-sm">
                <li>
                  <a href="mailto:hellosukona@gmail.com" className="text-text-secondary transition hover:text-text-primary">
                    hellosukona@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://instagram.com/wearesukona"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-secondary transition hover:text-text-primary"
                  >
                    @wearesukona
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-black/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
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
