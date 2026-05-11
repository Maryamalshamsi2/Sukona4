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

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {/* Tap-anywhere-to-close backdrop. Sibling of the header so the
          z-stacking is straightforward: backdrop at z-40, header
          (with its drawer) at z-50, page content at default. */}
      {mobileOpen && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/15 backdrop-blur-[2px] md:hidden"
        />
      )}

      <header
        className={`sticky top-0 z-50 transition-colors ${
          scrolled
            ? "border-b border-black/[0.06] bg-white/85 backdrop-blur-xl"
            : "border-b border-transparent bg-white"
        }`}
      >
        {/* The bar is flex on mobile (logo left, right cluster
            justify-between) and becomes a 3-column grid on md+ so the
            desktop links sit centered between logo and Sign in. Logo
            sized to match the dashboard + auth pages (46/50px), so
            the bar is taller (h-16/h-20) to give it breathing room. */}
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:h-20 sm:px-8 md:grid md:grid-cols-[1fr_auto_1fr]">
          {/* Logo (left) */}
          <Link
            href="/"
            aria-label="Sukona — home"
            className="flex shrink-0 md:justify-self-start"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Sukona" className="h-[46px] w-auto sm:h-[50px]" />
          </Link>

          {/* Center links — desktop only */}
          <nav className="hidden items-center gap-9 md:flex">
            <NavLink href="#about">About</NavLink>
            <NavLink href="#pricing">Pricing</NavLink>
            <NavLink href="#contact">Contact</NavLink>
          </nav>

          {/* Right cluster — Sign in CTA (mobile pill + desktop text
              link) and the mobile burger. Wrapped together so the
              flex layout on mobile groups them at the right edge,
              while md:justify-self-end pins the cluster to col 3 on
              desktop. */}
          <div className="flex items-center gap-2 md:justify-self-end">
            {/* Mobile sign-in pill — visible up to md, lifted out of
                the burger drawer so it's reachable in one tap. */}
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-text-primary px-4 py-2 text-body-sm font-medium text-text-inverse transition active:scale-[0.98] md:hidden"
            >
              Sign in
            </Link>

            {/* Desktop sign-in text link */}
            <Link
              href="/login"
              className="hidden items-center gap-1 text-body-sm font-medium text-text-primary transition hover:text-primary-600 md:inline-flex"
            >
              Sign in <span aria-hidden>→</span>
            </Link>

            {/* Mobile burger — only houses About/Pricing/Contact now */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-primary transition hover:bg-surface-hover active:scale-95 md:hidden"
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
        </div>

        {/* Mobile drawer — slides down from the bar with a smooth
            transition. Renders inside the sticky header so it tracks
            with scroll. Sign in lives in the bar now, so the drawer
            is just three links — shorter max-height. */}
        <div
          className={`overflow-hidden bg-white transition-[max-height,opacity] duration-200 ease-out md:hidden ${
            mobileOpen ? "max-h-64 opacity-100" : "pointer-events-none max-h-0 opacity-0"
          }`}
        >
          <div className="border-t border-black/[0.06] px-5 pb-3 pt-1">
            <nav className="divide-y divide-black/[0.04]">
              <MobileNavLink href="#about" onClick={() => setMobileOpen(false)}>About</MobileNavLink>
              <MobileNavLink href="#pricing" onClick={() => setMobileOpen(false)}>Pricing</MobileNavLink>
              <MobileNavLink href="#contact" onClick={() => setMobileOpen(false)}>Contact</MobileNavLink>
            </nav>
          </div>
        </div>
      </header>
    </>
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
      className="block py-4 text-body font-medium text-text-primary transition active:text-text-secondary"
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
        <h1 className="mx-auto max-w-4xl text-[2.5rem] font-medium tracking-tight text-text-primary leading-[1.05] sm:text-6xl sm:leading-[1.02] lg:text-7xl xl:text-[5.5rem]">
          Less juggling.
          <br />
          More appointments.
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg text-text-secondary sm:mt-8 sm:text-xl">
          Run your home service business in one place.
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
// CalendarMock — mirrors the real dashboard calendar grid.
// Container, borders, status colors, and layout match
// `(dashboard)/calendar/calendar-view.tsx` so this reads as a
// screenshot, not a generic SaaS mock.
// ============================================================

function CalendarMock() {
  const staff = ["Layla", "Aisha", "Maya"];
  const hours = ["9", "10", "11", "12", "1", "2", "3", "4"];
  const HOUR_PX = 56;
  const HEAD_PX = 48;
  // Narrower gutter than the desktop dashboard uses (the real app has
  // w-16 = 64px). At 48px we give phones more room for the staff
  // columns; appointment chips still read at the smaller width.
  const TIME_COL_PX = 48;

  // Status tones lifted from the real app — see calendar-shared.tsx.
  type Status = "scheduled" | "arrived" | "paid" | "on_the_way";
  const apps: Array<{
    col: number;
    top: number;
    dur: number;
    name: string;
    svc: string;
    status: Status;
  }> = [
    { col: 0, top: 0,    dur: 1.5, name: "Sara M.",  svc: "Highlights", status: "paid" },
    { col: 0, top: 2.5,  dur: 1,   name: "Noor K.",  svc: "Cut & blow", status: "scheduled" },
    { col: 1, top: 0.5,  dur: 2,   name: "Layla S.", svc: "Color",      status: "arrived" },
    { col: 1, top: 3.5,  dur: 1,   name: "Reem A.",  svc: "Manicure",   status: "scheduled" },
    { col: 2, top: 1,    dur: 1,   name: "Lina H.",  svc: "Brows",      status: "on_the_way" },
    { col: 2, top: 2.5,  dur: 2,   name: "Mariam Z.", svc: "Treatment", status: "scheduled" },
  ];

  const statusStyles: Record<Status, string> = {
    scheduled:  "bg-[#FFF8F0] text-[#CC7700] border-[#F4DDB7]",
    on_the_way: "bg-[#F0FAF2] text-[#1B8736] border-[#C7E8D2]",
    arrived:    "bg-[#F0F7FF] text-[#0062CC] border-[#C7DCF5]",
    paid:       "bg-[#F5F5F7] text-[#48484A] border-[#E5E5E7]",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white shadow-[0_40px_100px_-40px_rgba(0,0,0,0.28)]">
      {/* Top bar — matches the real calendar-view top bar */}
      <div className="flex items-center justify-between border-b border-[#EAEAEA] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="text-body font-semibold text-text-primary sm:text-title-section">
            Friday, May 10
          </div>
          <div className="rounded-full bg-neutral-900 px-3 py-1 text-caption font-semibold text-text-inverse">
            Today
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grid body — bg-[#FAFAFA] like the real one. No min-width:
          the columns shrink to fit the viewport on mobile so the
          calendar reads as one self-contained surface, not a
          horizontally-scrolling fragment. */}
      <div className="bg-[#FAFAFA]">
        <div className="relative">
          {/* Staff header row */}
          <div
            className="grid border-b border-[#EAEAEA] bg-[#FAFAFA]"
            style={{
              gridTemplateColumns: `${TIME_COL_PX}px repeat(3, 1fr)`,
              height: HEAD_PX,
            }}
          >
            <div className="border-r border-[#EAEAEA]" />
            {staff.map((s, i) => (
              <div
                key={s}
                className={`flex items-center justify-center text-body-sm font-semibold text-text-primary ${
                  i < staff.length - 1 ? "border-r border-[#EAEAEA]" : ""
                }`}
              >
                {s}
              </div>
            ))}
          </div>

          {/* Time grid + appointment blocks */}
          <div
            className="relative grid"
            style={{ gridTemplateColumns: `${TIME_COL_PX}px repeat(3, 1fr)` }}
          >
            {hours.map((h) => (
              <Fragment key={h}>
                <div
                  className="border-b border-r border-[#EAEAEA] px-2 pt-1 text-right text-caption text-text-tertiary"
                  style={{ height: HOUR_PX }}
                >
                  {h}
                </div>
                {staff.map((_, i) => (
                  <div
                    key={i}
                    className={`border-b border-[#EAEAEA] ${
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
                className={`absolute overflow-hidden rounded-lg border px-2 py-1 ${statusStyles[a.status]}`}
                style={{
                  left: `calc(${TIME_COL_PX}px + ${a.col} * ((100% - ${TIME_COL_PX}px) / 3) + 4px)`,
                  width: `calc((100% - ${TIME_COL_PX}px) / 3 - 8px)`,
                  top: a.top * HOUR_PX + 2,
                  height: a.dur * HOUR_PX - 4,
                }}
              >
                <div className="text-[11px] font-semibold leading-tight">
                  {a.name}
                </div>
                <div className="text-[10px] opacity-80 leading-tight">
                  {a.svc}
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
// MobileSection — phone-in-hand value prop with a phone mock.
// Anchors the #about nav link now that the standalone manifesto
// section is gone; "About" jumps the visitor to the first product
// section below the fold.
// ============================================================

function MobileSection() {
  return (
    <section id="about" className="bg-[#F5F5F7] py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
        <h2 className="mx-auto max-w-3xl text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05] lg:text-6xl">
          Manage your business
          <br />
          <span className="text-text-secondary">from anywhere.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Between appointments, on the way to the next, in client&rsquo;s
          location.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-5xl justify-center px-5 sm:mt-20 sm:px-8">
        <PhoneMock />
      </div>
    </section>
  );
}

function PhoneMock() {
  // Mirrors the real "Today" appointment list from
  // (dashboard)/home-view.tsx. Phone proportions match an actual
  // iPhone (1:2.05 aspect ratio) so the device reads as a real
  // device, not a stubby card. Includes the iOS Dynamic Island,
  // status bar, page header, today list, a "this week" stat card,
  // bottom tab bar, and the home-indicator pill.
  type Status = "scheduled" | "on_the_way" | "arrived" | "paid";
  const items: Array<{ time: string; name: string; svc: string; status: Status; label: string }> = [
    { time: "9:00",  name: "Sara M.",  svc: "Highlights",  status: "paid",       label: "Paid" },
    { time: "11:30", name: "Layla S.", svc: "Color",       status: "arrived",    label: "Arrived" },
    { time: "14:00", name: "Reem A.",  svc: "Manicure",    status: "scheduled",  label: "Scheduled" },
    { time: "16:30", name: "Lina H.",  svc: "Brows",       status: "on_the_way", label: "On the way" },
    { time: "18:00", name: "Maya N.",  svc: "Treatment",   status: "scheduled",  label: "Scheduled" },
  ];

  const statusStyles: Record<Status, string> = {
    scheduled:  "bg-[#FFF8F0] text-[#CC7700]",
    on_the_way: "bg-[#F0FAF2] text-[#1B8736]",
    arrived:    "bg-[#F0F7FF] text-[#0062CC]",
    paid:       "bg-[#F5F5F7] text-[#48484A]",
  };

  return (
    <div className="relative">
      {/* iPhone-style bezel — slim 3px frame, proper 1:2.05 ratio */}
      <div
        className="relative w-[300px] rounded-[2.75rem] bg-neutral-900 p-[3px] shadow-[0_50px_120px_-30px_rgba(0,0,0,0.5)] sm:w-[340px]"
        style={{ aspectRatio: "300 / 615" }}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2.625rem] bg-[#F5F5F7]">
          {/* Dynamic Island — sits over the status bar at top center */}
          <div
            className="absolute left-1/2 top-2 z-10 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-neutral-900"
            aria-hidden
          />

          {/* Status bar — 9:41 left, signal/battery right, all hugging
              the dynamic island */}
          <div className="relative flex shrink-0 items-center justify-between px-6 pt-2.5 pb-1 text-[11px] font-semibold text-text-primary">
            <span className="z-20">9:41</span>
            <span className="z-20 flex items-center gap-1">
              {/* Signal */}
              <svg className="h-2.5 w-3.5" viewBox="0 0 18 12" fill="currentColor">
                <rect x="0"  y="9" width="2.5" height="3" rx="0.4" />
                <rect x="4"  y="6" width="2.5" height="6" rx="0.4" />
                <rect x="8"  y="3" width="2.5" height="9" rx="0.4" />
                <rect x="12" y="0" width="2.5" height="12" rx="0.4" />
              </svg>
              {/* Wi-Fi */}
              <svg className="h-2.5 w-3.5" viewBox="0 0 16 12" fill="currentColor">
                <path d="M8 11.5c.7 0 1.3-.6 1.3-1.3 0-.7-.6-1.3-1.3-1.3-.7 0-1.3.6-1.3 1.3 0 .7.6 1.3 1.3 1.3zm-3.5-3.5l1 1A3.5 3.5 0 018 7.5c.95 0 1.85.4 2.5 1l1-1A5 5 0 008 6.5a5 5 0 00-3.5 1.5zM2 5.5l1 1A6.5 6.5 0 018 4.5c1.75 0 3.4.7 4.6 1.85l1-1A8 8 0 008 3a8 8 0 00-6 2.5z" />
              </svg>
              {/* Battery */}
              <span className="ml-0.5 inline-flex items-center">
                <span className="relative h-3 w-6 rounded-[3px] border border-text-primary/80">
                  <span className="absolute inset-y-0.5 left-0.5 right-1 rounded-[1.5px] bg-text-primary" />
                </span>
                <span className="ml-0.5 h-1 w-0.5 rounded-r-[1px] bg-text-primary/80" />
              </span>
            </span>
          </div>

          {/* Page header — date + big "Today" title */}
          <div className="shrink-0 px-5 pt-4 pb-3">
            <div className="text-[11px] font-medium text-text-tertiary">
              Friday, May 10
            </div>
            <div className="mt-0.5 text-[26px] font-semibold tracking-tight text-text-primary leading-tight">
              Today
            </div>
          </div>

          {/* Today card */}
          <div className="shrink-0 px-3">
            <div className="overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-[13px] font-semibold text-text-primary">
                  Today
                </div>
                <div className="rounded-full bg-[#F5F5F7] px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                  {items.length}
                </div>
              </div>
              <div className="divide-y divide-gray-100/80 border-t border-gray-100/80">
                {items.map((it) => (
                  <div
                    key={it.time}
                    className={`flex items-center gap-2.5 px-4 py-2.5 ${
                      it.status === "paid" ? "opacity-50" : ""
                    }`}
                  >
                    <div className="w-10 shrink-0 text-[11px] font-semibold text-text-primary">
                      {it.time}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold leading-tight text-text-primary">
                        {it.name}
                      </div>
                      <div className="truncate text-[10px] leading-tight text-text-tertiary">
                        {it.svc}
                      </div>
                    </div>
                    <div className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${statusStyles[it.status]}`}>
                      {it.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* This week stat card */}
          <div className="shrink-0 px-3 pt-3">
            <div className="rounded-2xl border border-[#EAEAEA] bg-white px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                This week
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[20px] font-semibold tracking-tight text-text-primary">
                  AED 5,400
                </span>
                <span className="text-[10px] font-semibold text-green-700">
                  ↑ 12%
                </span>
              </div>
            </div>
          </div>

          {/* Spacer pushes the tab bar to the bottom */}
          <div className="flex-1" />

          {/* Bottom tab bar */}
          <div className="shrink-0 border-t border-[#EAEAEA] bg-white">
            <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
              <div className="flex flex-col items-center gap-0.5 text-text-primary">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12L11.2 3.05a1.13 1.13 0 011.6 0L21.75 12M4.5 9.75v9.75a1.5 1.5 0 001.5 1.5h3.75v-6h4.5v6h3.75a1.5 1.5 0 001.5-1.5V9.75" />
                </svg>
                <span className="text-[9px] font-medium">Home</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-primary-600">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                <span className="text-[9px] font-semibold">Calendar</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-text-tertiary">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                <span className="text-[9px] font-medium">Payments</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-text-tertiary">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-[9px] font-medium">Reports</span>
              </div>
            </div>

            {/* iOS home indicator pill */}
            <div className="pb-2">
              <div className="mx-auto h-[5px] w-[110px] rounded-full bg-text-primary" />
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
        <h2 className="mx-auto max-w-3xl text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05] lg:text-6xl">
          Get paid.
          <br />
          <span className="text-text-secondary">Send the receipt.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Share receipts. Every payment tracked, automatically.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl justify-center px-5 sm:mt-20 sm:px-8">
        <PaymentMock />
      </div>
    </section>
  );
}

function PaymentMock() {
  // Mirrors a real payment row card from
  // (dashboard)/payments/payments-view.tsx — same outer ring, same
  // method badge color (cash green, card blue), same right-side amount
  // + receipt thumbnail layout.
  type Method = "Cash" | "Card";
  const rows: Array<{ name: string; svc: string; method: Method; amount: string; when: string; thumb: string }> = [
    { name: "Sara M.",  svc: "Highlights · Color",     method: "Card", amount: "AED 240",  when: "Today, 10:30",   thumb: "#FEEAD2" },
    { name: "Reem A.",  svc: "Manicure",                method: "Cash", amount: "AED 120",  when: "Today, 14:05",   thumb: "#F0FAF2" },
    { name: "Layla S.", svc: "Treatment · Blow-dry",    method: "Card", amount: "AED 380",  when: "Today, 16:50",   thumb: "#F0F7FF" },
  ];

  const methodStyles: Record<Method, string> = {
    Cash: "bg-[#F0FAF2] text-[#1B8736]",
    Card: "bg-[#F0F7FF] text-[#0062CC]",
  };

  return (
    <div className="w-full max-w-xl space-y-3 rounded-3xl bg-white p-3 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.04] sm:p-4">
      {rows.map((r) => (
        <div
          key={r.name}
          className="flex items-start justify-between gap-4 rounded-2xl border border-[#EAEAEA] bg-white p-5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-body font-semibold text-text-primary">
                {r.name}
              </div>
              <div className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-medium ${methodStyles[r.method]}`}>
                {r.method}
              </div>
            </div>
            <div className="mt-1 text-body-sm text-text-secondary">{r.when}</div>
            <div className="mt-0.5 truncate text-body-sm text-text-secondary">
              {r.svc}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-lg font-semibold text-text-primary">
                {r.amount}
              </div>
            </div>
            <div
              className="h-14 w-14 shrink-0 rounded-lg ring-1 ring-[#EAEAEA]"
              style={{ background: r.thumb }}
              aria-hidden
            />
          </div>
        </div>
      ))}
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
        <h2 className="mx-auto max-w-3xl text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05] lg:text-6xl">
          See what&rsquo;s
          <br />
          <span className="text-text-secondary">actually working.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          The numbers that run your business.
          <br />
          Revenue, expenses, profit.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl justify-center px-5 sm:mt-20 sm:px-8">
        <RevenueMock />
      </div>
    </section>
  );
}

function RevenueMock() {
  // Mirrors the StatCard layout from
  // (dashboard)/reports/reports-view.tsx — `rounded-2xl bg-white
  // ring-1 ring-border p-6` with a uppercase-tracked label and a
  // big numeric value. Revenue green-700, Expenses red-600, Profit
  // green when positive.
  const cards = [
    { label: "Revenue",   value: "AED 28,400", sub: "vs AED 24,200",   color: "text-green-700",   accent: "↑ 17%" },
    { label: "Expenses",  value: "AED 6,820",  sub: "vs AED 7,140",    color: "text-red-600",     accent: "↓ 4%" },
    { label: "Profit",    value: "AED 21,580", sub: "vs AED 17,060",   color: "text-green-700",   accent: "↑ 27%" },
  ];

  // Sparkline values shaped to climb at the end.
  const points = [40, 38, 45, 42, 50, 48, 56, 54, 62, 58, 68, 72];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const W = 600;
  const H = 90;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((v - min) / (max - min)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L${W},${H} L0,${H} Z`;

  return (
    <div className="w-full max-w-3xl space-y-4 rounded-3xl bg-white p-3 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.04] sm:p-4">
      {/* Three stat cards — same layout as the reports page */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl bg-white p-5 ring-1 ring-[#EAEAEA] sm:p-6"
          >
            <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
              {c.label}
            </div>
            <div className={`mt-2 text-xl font-bold sm:text-2xl ${c.color}`}>
              {c.value}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-caption text-text-tertiary">
              <span className={c.color}>{c.accent}</span>
              <span>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Trend chart card — pairs the stat row with the visual */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-[#EAEAEA] sm:p-6">
        <div className="flex items-center justify-between">
          <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
            Last 30 days
          </div>
          <div className="text-caption text-text-tertiary">142 bookings</div>
        </div>
        <div className="mt-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F08C2D" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#F08C2D" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#sparkfill)" />
            <path
              d={path}
              fill="none"
              stroke="#F08C2D"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
      tagline: "For freelancers.",
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
      tagline: "For small teams.",
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
      tagline: "For multi-team businesses.",
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
          <h2 className="text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05] lg:text-6xl">
            Simple pricing.
            <br />
            <span className="text-text-secondary">Cancel anytime.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg text-text-secondary sm:text-xl">
            7-day free trial. No card required.
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
                <span className="text-5xl font-medium tracking-tight text-text-primary">
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
      q: "Why do I need Sukona?",
      a: "Home-service businesses run on WhatsApp threads, paper notes, and memory. Sukona replaces all of it with one operational system — built specifically for the way you work.",
    },
    {
      q: "Is Sukona only for home-service businesses?",
      a: "Yes. Sukona is built specifically for mobile beauty and wellness — freelancers and small teams who travel to clients. Everything from the booking flow to the team coordination is shaped around how home-service actually works.",
    },
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
        <h2 className="text-center text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05]">
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
        <h2 className="text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.02] lg:text-6xl">
          Try Sukona for free.
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
            {/* Footer uses the icon-only mark (the wordmark already
                anchors the nav at the top). Sized to read as a real
                brand presence, not a tucked-away byline. The negative
                left margin compensates for the PNG's internal
                whitespace so the visible icon edge aligns with the
                tagline text below. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/symbol-dark.png" alt="Sukona" className="-ml-3 h-[72px] w-auto sm:h-[80px]" />
            <p className="mt-4 max-w-xs text-body-sm text-text-secondary">
              The operational system for home-service beauty and wellness.
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
            Made for mobile beauty and wellness.
          </p>
        </div>
      </div>
    </footer>
  );
}
