/**
 * Plan / subscription capability helper.
 *
 * Single source of truth for "what can this salon do?" Every plan
 * check in the app — sidebar visibility, feature gates, limit
 * checks before adding staff, upgrade prompts — should go through
 * one of the functions here, not scattered inline conditionals.
 *
 * Mirrors the columns added in migration-033-subscription.sql.
 */

// ============================================================
// Types — match the DB CHECK constraints exactly.
// ============================================================

export type Plan = "solo" | "team" | "multi_team";
export type BillingPeriod = "monthly" | "annual";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

// ============================================================
// Static data
// ============================================================

/**
 * What each plan unlocks. Adding a new capability? Add it here
 * and the gate functions below pick it up everywhere.
 */
export const PLAN_LIMITS: Record<
  Plan,
  {
    /** Hard cap on active staff members (including the owner). Infinity = unlimited. */
    maxStaff: number;
    /** Hard cap on branches / teams the salon can run. */
    maxBranches: number;
    /** Can collect customer reviews via the public /r/[token] page. */
    reviews: boolean;
    /** Can see per-staff performance breakdowns in Reports. */
    perStaffReports: boolean;
    /** Can pivot reports across multiple branches in Reports. */
    crossTeamReports: boolean;
  }
> = {
  solo: {
    maxStaff: 1, // just the owner
    maxBranches: 1,
    reviews: false,
    perStaffReports: false,
    crossTeamReports: false,
  },
  team: {
    maxStaff: 5,
    maxBranches: 1,
    reviews: true,
    perStaffReports: true,
    crossTeamReports: false,
  },
  multi_team: {
    maxStaff: Infinity,
    maxBranches: Infinity,
    reviews: true,
    perStaffReports: true,
    crossTeamReports: true,
  },
};

/**
 * Price points shown on the landing page and used to seed Stripe
 * prices. Keep in sync with Stripe products (env vars hold the
 * Stripe price IDs). The `annual` field is the *per-month equivalent*
 * displayed in the UI when annual is selected — the full annual
 * charge is `annualTotal`.
 */
export const PLAN_PRICING: Record<
  Plan,
  { monthly: number; annual: number; annualTotal: number }
> = {
  solo: { monthly: 95, annual: 79, annualTotal: 948 },
  team: { monthly: 149, annual: 124, annualTotal: 1488 },
  multi_team: { monthly: 299, annual: 249, annualTotal: 2988 },
};

/** Human label for a plan. Used in UI copy. */
export const PLAN_LABELS: Record<Plan, string> = {
  solo: "Solo",
  team: "Team",
  multi_team: "Multi-Team",
};

/** Short tagline per plan — same as the pricing-page taglines. */
export const PLAN_TAGLINES: Record<Plan, string> = {
  solo: "For freelancers.",
  team: "For small teams.",
  multi_team: "For multi-team businesses.",
};

// ============================================================
// Capability checks — gate features by plan.
// ============================================================

/** True if the salon can add one more staff member at their current plan. */
export function canAddStaff(plan: Plan, currentStaffCount: number): boolean {
  return currentStaffCount < PLAN_LIMITS[plan].maxStaff;
}

/** Max staff allowed (Infinity for unlimited). */
export function maxStaff(plan: Plan): number {
  return PLAN_LIMITS[plan].maxStaff;
}

/** True if reviews collection (public /r/[token] flow) is available. */
export function canUseReviews(plan: Plan): boolean {
  return PLAN_LIMITS[plan].reviews;
}

/** True if per-staff performance breakdowns are unlocked in Reports. */
export function canUsePerStaffReports(plan: Plan): boolean {
  return PLAN_LIMITS[plan].perStaffReports;
}

/** True if cross-team / cross-branch reporting is unlocked. */
export function canUseCrossTeamReports(plan: Plan): boolean {
  return PLAN_LIMITS[plan].crossTeamReports;
}

/** True if the salon can operate multiple branches. */
export function canUseMultipleBranches(plan: Plan): boolean {
  return PLAN_LIMITS[plan].maxBranches > 1;
}

// ============================================================
// Pricing helpers
// ============================================================

/** Per-month price for a plan at the selected billing period. */
export function priceForPlan(plan: Plan, period: BillingPeriod): number {
  return period === "annual" ? PLAN_PRICING[plan].annual : PLAN_PRICING[plan].monthly;
}

/** Full annual amount the salon will be charged at signup if they pick annual. */
export function annualTotal(plan: Plan): number {
  return PLAN_PRICING[plan].annualTotal;
}

// ============================================================
// Subscription-status reasoning
// ============================================================

/**
 * Does the salon currently have legitimate access to the app?
 * - Active subscription: yes
 * - Trialing AND trial not yet ended: yes
 * - Anything else (past_due, canceled, incomplete, trial expired): no
 *
 * Hard-block decision (per the product spec): expired trials and
 * delinquent subscriptions get the blocking modal — they can't use
 * the app until they fix billing.
 */
export function hasAppAccess(
  status: SubscriptionStatus,
  trialEndsAt: string | Date | null
): boolean {
  if (status === "active") return true;
  if (status === "trialing") {
    if (!trialEndsAt) return true; // grandfathered: pre-trial-system salons
    return new Date(trialEndsAt).getTime() > Date.now();
  }
  return false;
}

/**
 * Days remaining on a trial (rounded up). Returns 0 if expired or
 * no trial date set. The dashboard uses this for the TrialBanner.
 */
export function trialDaysLeft(trialEndsAt: string | Date | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/**
 * True if the salon is in an expired-trial-without-card state — the
 * single signal that should trigger the blocking-modal upgrade flow.
 */
export function isHardBlocked(
  status: SubscriptionStatus,
  trialEndsAt: string | Date | null
): boolean {
  return !hasAppAccess(status, trialEndsAt);
}
