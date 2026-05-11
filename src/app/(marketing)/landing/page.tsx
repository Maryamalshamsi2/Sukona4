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
  // Staff names and header layout mirror the real dashboard
  // calendar (see (dashboard)/calendar/calendar-view.tsx). The
  // Today pill / arrows / date / filter / + button row matches
  // the desktop reference layout. Appointment blocks carry the
  // four-line content the real app shows: client name, location,
  // time range, service.
  const staff = ["Sara", "Mia", "Yara"];
  const hours = ["11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM"];
  const HOUR_PX = 60;
  const HEAD_PX = 48;
  const TIME_COL_PX = 56;

  type Status = "scheduled" | "arrived" | "paid" | "on_the_way";
  const apps: Array<{
    col: number;
    top: number;
    dur: number;
    name: string;
    loc: string;
    time: string;
    svc: string;
    status: Status;
  }> = [
    { col: 0, top: 0.5, dur: 1.5, name: "Hala",   loc: "Al Khawaneej 2",    time: "11:30 AM – 1 PM",  svc: "Signature Manicure", status: "scheduled" },
    { col: 0, top: 3,   dur: 1,   name: "Nadia",  loc: "Dubai Hills",       time: "2 PM – 3 PM",      svc: "Hair color",         status: "arrived" },
    { col: 0, top: 4.5, dur: 1,   name: "Rana",   loc: "JBR Marina",        time: "3:30 – 4:30 PM",   svc: "Cut & blow",         status: "paid" },
    { col: 1, top: 0,   dur: 2,   name: "Dana",   loc: "Sharjah, Al Majaz", time: "11 AM – 1 PM",     svc: "Color treatment",    status: "scheduled" },
    { col: 1, top: 3,   dur: 1.5, name: "Salma",  loc: "Marina, Dubai",     time: "2 PM – 3:30 PM",   svc: "Manicure",           status: "on_the_way" },
    { col: 2, top: 1,   dur: 1,   name: "Lina",   loc: "Khalifa City",      time: "12 PM – 1 PM",     svc: "Brows tint",         status: "scheduled" },
    { col: 2, top: 2.5, dur: 2,   name: "Maya",   loc: "Yas Island",        time: "1:30 PM – 3:30 PM", svc: "Aromatherapy",      status: "scheduled" },
  ];

  const statusStyles: Record<Status, string> = {
    scheduled:  "bg-[#FFF8F0] text-[#CC7700] border-[#F4DDB7]",
    on_the_way: "bg-[#F0FAF2] text-[#1B8736] border-[#C7E8D2]",
    arrived:    "bg-[#F0F7FF] text-[#0062CC] border-[#C7DCF5]",
    paid:       "bg-[#F5F5F7] text-[#48484A] border-[#E5E5E7]",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white shadow-[0_40px_100px_-40px_rgba(0,0,0,0.28)]">
      {/* Top bar — Today pill, prev/next arrows, date label, filter
          icon, + FAB. Matches the real calendar-view top bar. */}
      <div className="flex items-center justify-between border-b border-[#EAEAEA] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="rounded-full bg-surface-active px-3 py-1.5 text-caption font-medium text-text-primary sm:text-body-sm">
            Today
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="text-body-sm font-semibold text-text-primary sm:text-title-section">
            Tue 12 May
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Filter (sliders) */}
          <button className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.5h12M19 6.5h2M3 12h2M9 12h12M3 17.5h12M19 17.5h2" />
              <circle cx="17" cy="6.5" r="1.75" fill="currentColor" stroke="none" />
              <circle cx="7" cy="12" r="1.75" fill="currentColor" stroke="none" />
              <circle cx="17" cy="17.5" r="1.75" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {/* + FAB */}
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-text-inverse transition active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
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
                  className="border-b border-r border-[#EAEAEA] px-2 pt-1 text-right text-[10px] text-text-tertiary"
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
                className={`absolute overflow-hidden rounded-lg border px-2 py-1.5 ${statusStyles[a.status]}`}
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
                <div className="mt-0.5 truncate text-[10px] leading-tight opacity-75">
                  {a.loc}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold leading-tight">
                  {a.time}
                </div>
                <div className="truncate text-[10px] leading-tight opacity-75">
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
          Your schedule,
          <br />
          <span className="text-text-secondary">at a glance.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          See your full day, every appointment, every location.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-5xl justify-center px-5 sm:mt-20 sm:px-8">
        <PhoneMock />
      </div>
    </section>
  );
}

function PhoneMock() {
  // Mirrors the real mobile home view from
  // (dashboard)/home-view.tsx: app top bar (Sukona wordmark + bell +
  // avatar), "Today" appointments card, "Activity" feed card with
  // Today/30-days toggle, and the four-tab bottom nav (Home,
  // Calendar, Expenses, More). Proportions are a real iPhone
  // 1:2.05 aspect ratio.
  type Status = "scheduled" | "on_the_way" | "arrived" | "paid";
  const today: Array<{ time: string; dur: string; name: string; loc: string; status: Status; label: string }> = [
    { time: "3 PM – 3:15 PM",    dur: "15 min", name: "Hala",         loc: "Al Khawaneej 2, Villa", status: "scheduled",  label: "Scheduled" },
    { time: "4 PM – 5 PM",       dur: "1 hour", name: "Nadia Khoury", loc: "Dubai Hills",           status: "arrived",    label: "Arrived" },
    { time: "5:30 PM – 6:30 PM", dur: "1 hour", name: "Dana Saleh",   loc: "Sharjah, Al Majaz",     status: "on_the_way", label: "On the way" },
  ];

  const activity: Array<{ dot: string; title: string; sub?: string; time: string }> = [
    { dot: "bg-emerald-500", title: "New appointment · Hala",           sub: "Sara",  time: "just now" },
    { dot: "bg-sky-500",     title: "Status · Nadia Khoury → paid",     sub: "Yara",  time: "17h ago" },
    { dot: "bg-sky-500",     title: "Status · Nadia Khoury → arrived",  sub: "Sara",  time: "18h ago" },
    { dot: "bg-amber-500",   title: "Updated · Nadia's appointment",    sub: "Sara",  time: "19h ago" },
  ];

  const statusStyles: Record<Status, string> = {
    scheduled:  "bg-[#FFF8F0] text-[#CC7700]",
    on_the_way: "bg-[#F0FAF2] text-[#1B8736]",
    arrived:    "bg-[#F0F7FF] text-[#0062CC]",
    paid:       "bg-[#F5F5F7] text-[#48484A]",
  };

  return (
    <div className="relative">
      {/* iPhone bezel — slim 3px frame, 1:2.05 aspect. Bumped up
          from 300/340 to 320/360 to give the inner content more
          room to breathe and the type a more legible scale than
          a strict scale-to-real-iPhone would dictate. */}
      <div
        className="relative w-[320px] rounded-[2.75rem] bg-neutral-900 p-[3px] shadow-[0_50px_120px_-30px_rgba(0,0,0,0.5)] sm:w-[360px]"
        style={{ aspectRatio: "320 / 656" }}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[2.625rem] bg-[#F5F5F7]">
          {/* Dynamic Island */}
          <div
            className="absolute left-1/2 top-2 z-10 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-neutral-900"
            aria-hidden
          />

          {/* iOS status bar */}
          <div className="relative flex shrink-0 items-center justify-between px-6 pt-2.5 pb-1 text-[11px] font-semibold text-text-primary">
            <span className="z-20">9:41</span>
            <span className="z-20 flex items-center gap-1">
              <svg className="h-2.5 w-3.5" viewBox="0 0 18 12" fill="currentColor">
                <rect x="0"  y="9" width="2.5" height="3" rx="0.4" />
                <rect x="4"  y="6" width="2.5" height="6" rx="0.4" />
                <rect x="8"  y="3" width="2.5" height="9" rx="0.4" />
                <rect x="12" y="0" width="2.5" height="12" rx="0.4" />
              </svg>
              <svg className="h-2.5 w-3.5" viewBox="0 0 16 12" fill="currentColor">
                <path d="M8 11.5c.7 0 1.3-.6 1.3-1.3 0-.7-.6-1.3-1.3-1.3-.7 0-1.3.6-1.3 1.3 0 .7.6 1.3 1.3 1.3zm-3.5-3.5l1 1A3.5 3.5 0 018 7.5c.95 0 1.85.4 2.5 1l1-1A5 5 0 008 6.5a5 5 0 00-3.5 1.5zM2 5.5l1 1A6.5 6.5 0 018 4.5c1.75 0 3.4.7 4.6 1.85l1-1A8 8 0 008 3a8 8 0 00-6 2.5z" />
              </svg>
              <span className="ml-0.5 inline-flex items-center">
                <span className="relative h-3 w-6 rounded-[3px] border border-text-primary/80">
                  <span className="absolute inset-y-0.5 left-0.5 right-1 rounded-[1.5px] bg-text-primary" />
                </span>
                <span className="ml-0.5 h-1 w-0.5 rounded-r-[1px] bg-text-primary/80" />
              </span>
            </span>
          </div>

          {/* App top bar — Sukona wordmark, bell, avatar. Slightly
              more top padding so the chrome above the logo/bell/
              avatar reads as deliberate breathing room. */}
          <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Sukona" className="h-8 w-auto" />
            <div className="flex items-center gap-2.5">
              {/* Bell with red "4" unread badge — matches the real
                  NotificationBell component in the dashboard. */}
              <button className="relative flex h-9 w-9 items-center justify-center text-text-secondary">
                <svg className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                <span className="absolute right-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-[#F5F5F7]">
                  4
                </span>
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-text-inverse">
                MA
              </div>
            </div>
          </div>

          {/* Today card */}
          <div className="shrink-0 px-3">
            <div className="overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="text-[17px] font-bold text-text-primary">Today</div>
                <div className="rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[12px] font-medium text-text-secondary">
                  {today.length}
                </div>
              </div>
              <div className="divide-y divide-gray-100/80 border-t border-gray-100/80">
                {today.map((it) => {
                  // Split the time range so start and end stack on
                  // their own lines — the full range ("5:30 PM – 6:30
                  // PM") is too wide for a single line at this scale
                  // without pushing the name/location column too far.
                  const [startTime, endTime] = it.time.split(" – ");
                  return (
                    <div key={it.name} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="w-[68px] shrink-0">
                        <div className="text-[11px] font-semibold leading-tight text-text-primary">
                          {startTime} –
                        </div>
                        <div className="text-[11px] font-semibold leading-tight text-text-primary">
                          {endTime}
                        </div>
                        <div className="mt-1 text-[11px] leading-tight text-text-tertiary">
                          {it.dur}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold leading-tight text-text-primary">
                          {it.name}
                        </div>
                        <div className="mt-1 truncate text-[11px] leading-tight text-text-tertiary">
                          {it.loc}
                        </div>
                      </div>
                      <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[it.status]}`}>
                        {it.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Activity card */}
          <div className="shrink-0 px-3 pt-3">
            <div className="overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="text-[15px] font-bold text-text-primary">Activity</div>
                <div className="flex items-center rounded-full bg-[#F5F5F7] p-[2px]">
                  <span className="px-2.5 py-1 text-[11px] font-medium text-text-secondary">Today</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-text-primary shadow-sm">
                    30 Days
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100/80 border-t border-gray-100/80">
                {activity.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-4 py-2">
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ev.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium leading-tight text-text-primary">
                        {ev.title}
                      </div>
                      {ev.sub && (
                        <div className="mt-0.5 truncate text-[11px] leading-tight text-text-tertiary">
                          {ev.sub}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-[11px] text-text-tertiary">{ev.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Spacer pushes the tab bar to the bottom */}
          <div className="flex-1" />

          {/* Bottom tab bar — icons only (Home active, Calendar,
              Expenses, More). Labels removed and icons centered
              vertically in the white tab area for a cleaner look. */}
          <div className="shrink-0 border-t border-[#EAEAEA] bg-white">
            <div className="flex items-center justify-around px-2 py-4">
              <div className="text-text-primary">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.25 12L11.2 3.05a1.13 1.13 0 011.6 0L21.75 12M4.5 9.75v9.75a1.5 1.5 0 001.5 1.5h3.75v-6h4.5v6h3.75a1.5 1.5 0 001.5-1.5V9.75" />
                </svg>
              </div>
              <div className="text-text-tertiary">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div className="text-text-tertiary">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 6h.008v.008h-.008V15zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
              <div className="text-text-tertiary">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </div>
            </div>

            {/* iOS home indicator pill */}
            <div className="pb-2">
              <div className="mx-auto h-[5px] w-[120px] rounded-full bg-text-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Clients — single composite card showing the full client lifecycle:
// profile header → notification → receipt → review.
// One unified surface (not a stack of feature cards) so the visual
// itself reinforces "everything about this client, in one place."
// ============================================================

function PaymentsSection() {
  return (
    <section className="bg-white py-24 sm:py-32 lg:py-40">
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
        <h2 className="mx-auto max-w-3xl text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05] lg:text-6xl">
          Happy clients,
          <br />
          <span className="text-text-secondary">every time.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Notify them, share receipts, collect reviews, remember every detail.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl justify-center px-5 sm:mt-20 sm:px-8">
        <ClientLifecycleMock />
      </div>
    </section>
  );
}

function ClientLifecycleMock() {
  // Star icon path (Heroicons solid star) — reused for the reviewer row.
  const star = (
    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  );

  return (
    <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_40px_100px_-40px_rgba(0,0,0,0.22)] ring-1 ring-[#EAEAEA]">
      {/* Client header */}
      <div className="flex items-center gap-3 border-b border-[#EAEAEA] px-5 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-base font-semibold text-primary-700">
          HS
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-text-primary">Hala Saeed</div>
          <div className="text-caption text-text-tertiary">
            12 visits · last seen 2 weeks ago
          </div>
        </div>
        <button className="hidden rounded-full bg-surface-active px-3 py-1.5 text-caption font-medium text-text-secondary sm:inline-flex">
          View profile
        </button>
      </div>

      <div className="divide-y divide-[#EAEAEA]">
        {/* WhatsApp / status notification */}
        <div className="flex items-start gap-3 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7F8EE] text-[#1B8736]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-body-sm font-semibold text-text-primary">
                Sara is on the way
              </div>
              <div className="shrink-0 text-caption text-text-tertiary">just now</div>
            </div>
            <div className="mt-0.5 text-caption text-text-secondary">
              WhatsApp sent automatically
            </div>
          </div>
        </div>

        {/* Receipt */}
        <div className="flex items-start gap-3 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-body-sm font-semibold text-text-primary">
                Receipt sent
              </div>
              <div className="shrink-0 text-caption text-text-tertiary">17h ago</div>
            </div>
            <div className="mt-0.5 text-caption text-text-secondary">
              AED 240 · Card ending 4242
            </div>
          </div>
        </div>

        {/* Review */}
        <div className="flex items-start gap-3 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              {star}
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5 text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    {star}
                  </svg>
                ))}
              </div>
              <div className="shrink-0 text-caption text-text-tertiary">today</div>
            </div>
            <div className="mt-1 text-body-sm italic leading-snug text-text-primary">
              &ldquo;Sara is amazing — best manicure I&rsquo;ve had in years.&rdquo;
            </div>
          </div>
        </div>
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
        <h2 className="mx-auto max-w-3xl text-3xl font-medium tracking-tight text-text-primary leading-[1.1] sm:text-5xl sm:leading-[1.05] lg:text-6xl">
          See what&rsquo;s
          <br />
          <span className="text-text-secondary">actually working.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-lg text-text-secondary sm:text-xl">
          Track what grows your business.
          <br />
          Revenue, expenses, inventory, team.
        </p>
      </div>

      <div className="mx-auto mt-16 flex max-w-3xl justify-center px-5 sm:mt-20 sm:px-8">
        <RevenueMock />
      </div>
    </section>
  );
}

function RevenueMock() {
  // Three financial KPIs (top row), two operational snapshots
  // (middle row: inventory + team performance), and a 30-day
  // trend chart at the bottom. Together they cover the section's
  // promise — "Revenue, expenses, inventory, team" — in a single
  // dashboard surface. Uses the same StatCard styling tokens as
  // (dashboard)/reports/reports-view.tsx.
  const kpis = [
    { label: "Revenue",  value: "AED 12,500", sub: "vs AED 10,600", color: "text-green-700", accent: "↑ 18%" },
    { label: "Expenses", value: "AED 3,200",  sub: "vs AED 3,400",  color: "text-red-600",   accent: "↓ 6%" },
    { label: "Profit",   value: "AED 9,300",  sub: "vs AED 7,200",  color: "text-green-700", accent: "↑ 29%" },
  ];

  const lowStock = [
    { name: "Hair color, level 6", left: 2 },
    { name: "Argan shampoo",       left: 1 },
    { name: "Hand lotion",         left: 3 },
  ];

  const team = [
    { name: "Sara", appts: 42 },
    { name: "Mia",  appts: 38 },
    { name: "Yara", appts: 31 },
  ];

  // Sparkline values shaped to climb toward the end.
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
      {/* Row 1 — three financial KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((c) => (
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

      {/* Row 2 — inventory + team snapshots */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Inventory — low stock list */}
        <div className="rounded-2xl bg-white p-5 ring-1 ring-[#EAEAEA] sm:p-6">
          <div className="flex items-center justify-between">
            <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
              Inventory
            </div>
            <div className="rounded-full bg-amber-50 px-2 py-0.5 text-caption font-semibold text-amber-700">
              Low stock · 3
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {lowStock.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-body-sm">
                <span className="truncate text-text-primary">{item.name}</span>
                <span className="shrink-0 font-semibold text-amber-700">
                  {item.left} left
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Team — appointments per staff this month */}
        <div className="rounded-2xl bg-white p-5 ring-1 ring-[#EAEAEA] sm:p-6">
          <div className="flex items-center justify-between">
            <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
              Team
            </div>
            <div className="text-caption text-text-tertiary">This month</div>
          </div>
          <div className="mt-4 space-y-2.5">
            {team.map((member, i) => (
              <div key={member.name} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${
                    i === 0
                      ? "bg-primary-100 text-primary-700"
                      : "bg-surface-active text-text-secondary"
                  }`}
                >
                  {member.name[0]}
                </span>
                <span className="flex-1 text-body-sm text-text-primary">
                  {member.name}
                </span>
                <span className="text-caption font-semibold text-text-secondary">
                  {member.appts} appts
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — 30-day trend chart */}
      <div className="rounded-2xl bg-white p-5 ring-1 ring-[#EAEAEA] sm:p-6">
        <div className="flex items-center justify-between">
          <div className="text-caption font-semibold uppercase tracking-wider text-text-tertiary">
            Last 30 days
          </div>
          <div className="text-caption text-text-tertiary">128 bookings</div>
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
  // Monthly / annual toggle. Annual is billed up-front at ~17% off
  // (the classic "pay for 10 months, get 12" framing) — the per-
  // month price displayed when annual is selected reflects that
  // discount, with "Billed annually" called out below.
  const [annual, setAnnual] = useState(false);

  const plans = [
    {
      name: "Solo",
      monthlyPrice: 95,
      annualPrice: 79,
      tagline: "For freelancers.",
      features: [
        "Unlimited appointments & clients",
        "Calendar with locations",
        "Payments, receipts, WhatsApp notifications",
        "Expenses & inventory tracking",
        "Revenue, expenses, profit reports",
      ],
      featured: false,
    },
    {
      name: "Team",
      monthlyPrice: 149,
      annualPrice: 124,
      tagline: "For small teams.",
      features: [
        "Everything in Solo",
        "Up to 5 team members",
        "Per-staff schedules & coordination",
        "Collect client reviews",
        "Per-staff performance reports",
      ],
      featured: true,
    },
    {
      name: "Multi-Team",
      monthlyPrice: 299,
      annualPrice: 249,
      tagline: "For multi-team businesses.",
      features: [
        "Everything in Team",
        "Unlimited team members",
        "Multiple branches",
        "Cross-team reporting",
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

          {/* Monthly / Annual toggle */}
          <div className="mt-8 flex justify-center">
            <div
              role="tablist"
              aria-label="Billing period"
              className="inline-flex items-center rounded-full bg-[#F5F5F7] p-1"
            >
              <button
                role="tab"
                aria-selected={!annual}
                onClick={() => setAnnual(false)}
                className={`rounded-full px-5 py-2 text-body-sm font-medium transition ${
                  !annual
                    ? "bg-white text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Monthly
              </button>
              <button
                role="tab"
                aria-selected={annual}
                onClick={() => setAnnual(true)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-body-sm font-medium transition ${
                  annual
                    ? "bg-white text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Annual
                <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                  Save 17%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Extra top margin on lg+ so the featured card's lg:-mt-4
            lift doesn't pull it tight against the section header. */}
        <div className="mt-12 grid gap-5 sm:mt-16 lg:mt-20 lg:grid-cols-3 lg:gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-3xl p-7 sm:p-8 ${
                p.featured
                  ? // Three subtle moves stacked on the featured card to
                    // earn a real "lift": soft peach gradient at the
                    // top, an explicit -16px lift on desktop so it
                    // floats above its siblings, and a wider, warmer
                    // peach shadow underneath.
                    "bg-gradient-to-b from-primary-50/70 to-white ring-2 ring-primary-500 shadow-[0_40px_80px_-30px_rgba(240,140,45,0.5)] lg:-mt-4"
                  : "bg-white ring-1 ring-black/[0.06]"
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-3.5 py-1 text-caption font-semibold text-text-inverse shadow-[0_8px_20px_-4px_rgba(240,140,45,0.5)]">
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
                  {annual ? p.annualPrice : p.monthlyPrice}
                </span>
                <span className="ml-2 text-body-sm text-text-secondary">
                  AED / month
                </span>
              </div>
              {/* Billing-period subtitle — always rendered (in both
                  modes) so the card height doesn't jump when toggling. */}
              <div className="mt-1 text-caption text-text-tertiary">
                {annual ? "Billed annually" : "Billed monthly"}
              </div>
              <Link
                href="/signup"
                className={`mt-6 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-body-sm font-medium transition active:scale-[0.98] ${
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

        {/* Universal footer note — applies to every tier, so cleaner
            here than as a bullet inside Solo. */}
        <p className="mx-auto mt-10 max-w-md text-center text-caption text-text-tertiary sm:mt-12">
          All plans support multi-currency, for salons across the GCC and beyond.
        </p>
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
          Grow your business today.
        </h2>
        <div className="mt-10 flex flex-col items-center gap-2">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-text-primary px-7 py-3.5 text-body-sm font-medium text-text-inverse transition hover:opacity-90 active:scale-[0.98]"
          >
            Get started
          </Link>
          <p className="text-caption text-text-tertiary">7 days trial</p>
        </div>
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
