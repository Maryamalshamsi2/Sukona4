"use client";

import { useEffect, useState, useCallback } from "react";
import { signOut } from "@/app/(dashboard)/actions";
import {
  getProfile,
  updateProfile,
  updatePassword,
  getSalon,
  updateSalon,
} from "./actions";
import PhoneInput from "@/components/phone-input";
import { useCurrentUser } from "@/lib/user-context";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  role: string;
}

interface SalonSettings {
  id: string;
  name: string;
  slug: string | null;
  brand_color: string | null;
  contact_phone: string | null;
  public_review_url: string | null;
  signoff: string | null;
  default_language: string;
  vat_percent: number;
  vat_trn: string | null;
  is_onboarded: boolean;
}

type SettingsTab = "profile" | "salon" | "security";

export default function SettingsPage() {
  const currentUser = useCurrentUser();
  const isOwner = currentUser?.role === "owner";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [salon, setSalon] = useState<SalonSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SettingsTab>("profile");

  const loadData = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([getProfile(), getSalon()]);
      setProfile(p as Profile | null);
      setSalon(s as SalonSettings | null);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="mt-8 text-center text-text-secondary">Loading...</p>;

  // Salon tab is owner-only — staff/admin don't see it.
  const TABS: { key: SettingsTab; label: string }[] = [
    { key: "profile", label: "Profile" },
    ...(isOwner ? ([{ key: "salon", label: "Salon" }] as const) : []),
    { key: "security", label: "Security" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-title-page font-bold tracking-tight text-text-primary">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-active p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-caption font-semibold transition-colors sm:text-body-sm ${
              tab === t.key
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && profile && (
        <ProfileSection profile={profile} onUpdate={loadData} />
      )}

      {tab === "salon" && isOwner && salon && (
        <SalonSection salon={salon} onUpdate={loadData} />
      )}

      {tab === "security" && (
        <SecuritySection />
      )}

      {/* Sign out */}
      <div className="rounded-2xl ring-1 ring-border bg-white p-6">
        <h3 className="text-body-sm font-semibold text-text-primary">Sign Out</h3>
        <p className="mt-1 text-caption text-text-secondary">Sign out of your account on this device.</p>
        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="rounded-xl border border-red-200 px-4 py-2 text-body-sm font-semibold text-red-600 hover:bg-red-50 active:scale-[0.98] transition-all"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

// ---- Profile Section ----

function ProfileSection({ profile, onUpdate }: { profile: Profile; onUpdate: () => void }) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [jobTitle, setJobTitle] = useState(profile.job_title || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const hasChanges =
    fullName !== (profile.full_name || "") ||
    phone !== (profile.phone || "") ||
    jobTitle !== (profile.job_title || "");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const result = await updateProfile(fullName.trim(), phone.trim(), jobTitle.trim());

    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Profile updated" });
      onUpdate();
    }
    setSaving(false);
  }

  return (
    <div className="rounded-2xl ring-1 ring-border bg-white">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-body-sm font-semibold text-text-primary">Profile Information</h3>
        <p className="mt-0.5 text-caption text-text-secondary">Update your personal details.</p>
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-6">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            required
          />
        </div>

        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">Email</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full rounded-xl border-[1.5px] border-gray-200 bg-neutral-50 px-4 py-3 sm:py-2.5 text-body-sm text-text-secondary"
          />
          <p className="mt-1 text-caption text-text-tertiary">Email cannot be changed.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+971 XX XXX XXXX"
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1">Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Nail Technician"
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">Role</label>
          <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 text-caption font-medium text-text-primary capitalize">
            {profile.role}
          </span>
        </div>

        {message && (
          <p className={`text-body-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Security Section ----

function SecuritySection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSaving(true);
    setMessage(null);

    const result = await updatePassword(newPassword);

    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Password updated successfully" });
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  }

  return (
    <div className="rounded-2xl ring-1 ring-border bg-white">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-body-sm font-semibold text-text-primary">Change Password</h3>
        <p className="mt-0.5 text-caption text-text-secondary">Update your password to keep your account secure.</p>
      </div>

      <form onSubmit={handleChangePassword} className="p-6 space-y-6">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">New Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 pr-10 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">Confirm Password</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
            placeholder="••••••••"
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        {message && (
          <p className={`text-body-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !newPassword || !confirmPassword}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? "Updating..." : "Update Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Salon Section (owner only) ----

const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
];

function SalonSection({
  salon,
  onUpdate,
}: {
  salon: SalonSettings;
  onUpdate: () => void;
}) {
  const [name, setName] = useState(salon.name);
  const [brandColor, setBrandColor] = useState(salon.brand_color || "#0A0A0A");
  const [contactPhone, setContactPhone] = useState(salon.contact_phone || "");
  const [reviewUrl, setReviewUrl] = useState(salon.public_review_url || "");
  const [signoff, setSignoff] = useState(salon.signoff || "");
  const [language, setLanguage] = useState(salon.default_language || "en");
  // VAT is stored as a string in the input so we can show "" instead of "0"
  // when the salon hasn't set anything (cleaner UX). Coerced on submit.
  const [vatPercent, setVatPercent] = useState(
    salon.vat_percent ? String(salon.vat_percent) : ""
  );
  const [vatTrn, setVatTrn] = useState(salon.vat_trn || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const vatNum = Number(vatPercent || 0);
  const vatActive = vatNum > 0;

  const hasChanges =
    name !== salon.name ||
    brandColor !== (salon.brand_color || "#0A0A0A") ||
    contactPhone !== (salon.contact_phone || "") ||
    reviewUrl !== (salon.public_review_url || "") ||
    signoff !== (salon.signoff || "") ||
    language !== (salon.default_language || "en") ||
    vatNum !== (salon.vat_percent || 0) ||
    vatTrn.trim() !== (salon.vat_trn || "");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!name.trim()) {
      setMessage({ type: "error", text: "Salon name is required" });
      return;
    }
    // Light URL validation — only if a value was entered.
    if (reviewUrl.trim() && !/^https?:\/\//i.test(reviewUrl.trim())) {
      setMessage({
        type: "error",
        text: "Review URL must start with http:// or https://",
      });
      return;
    }
    // VAT bounds + TRN-required-if-charging.
    if (!Number.isFinite(vatNum) || vatNum < 0 || vatNum > 100) {
      setMessage({ type: "error", text: "VAT must be between 0 and 100" });
      return;
    }
    if (vatNum > 0 && !vatTrn.trim()) {
      setMessage({ type: "error", text: "TRN is required when VAT is charged" });
      return;
    }

    setSaving(true);
    const result = await updateSalon({
      name: name.trim(),
      brand_color: brandColor,
      contact_phone: contactPhone.trim() || null,
      public_review_url: reviewUrl.trim() || null,
      signoff: signoff.trim() || null,
      default_language: language,
      vat_percent: vatNum,
      vat_trn: vatTrn.trim() || null,
    });

    if (result.error) {
      setMessage({ type: "error", text: result.error });
    } else {
      setMessage({ type: "success", text: "Salon settings updated" });
      onUpdate();
    }
    setSaving(false);
  }

  return (
    <div className="rounded-2xl ring-1 ring-border bg-white">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-body-sm font-semibold text-text-primary">Salon Information</h3>
        <p className="mt-0.5 text-caption text-text-secondary">
          This is what your team and clients see in messages, receipts, and reviews.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-6">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">
            Salon Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            placeholder="e.g. Ateeq Spa"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1">
              Brand Color
            </label>
            <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-gray-200 px-3 py-2 sm:py-1.5">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-gray-200 bg-transparent p-0"
                aria-label="Pick brand color"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                className="flex-1 bg-transparent text-body-sm focus:outline-none"
                placeholder="#0A0A0A"
              />
            </div>
            <p className="mt-1 text-caption text-text-tertiary">
              Used in receipts and notifications.
            </p>
          </div>

          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1">
              Default Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-gray-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-caption text-text-tertiary">
              Used for client-facing messages.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">
            Contact Phone
          </label>
          <PhoneInput value={contactPhone} onChange={setContactPhone} />
          <p className="mt-1 text-caption text-text-tertiary">
            Shown on receipts and client messages so they can reach you.
          </p>
        </div>

        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">
            Public Review URL
          </label>
          <input
            type="url"
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            placeholder="https://g.page/your-salon/review"
          />
          <p className="mt-1 text-caption text-text-tertiary">
            Where 4–5 star reviews are sent. Google Business or Instagram works best.
          </p>
        </div>

        <div>
          <label className="block text-body-sm font-semibold text-text-primary mb-1">
            Sign-off
          </label>
          <input
            type="text"
            value={signoff}
            onChange={(e) => setSignoff(e.target.value)}
            maxLength={120}
            className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            placeholder={`— ${name || "Ateeq Spa"} team`}
          />
          <p className="mt-1 text-caption text-text-tertiary">
            Appears at the end of every notification message.
          </p>
        </div>

        {/* Tax — VAT% + TRN. TRN field only renders when VAT > 0 to keep
            the form quiet for salons (like Ateeq) that don't charge VAT. */}
        <div className="rounded-xl bg-neutral-50 ring-1 ring-border p-4">
          <p className="text-body-sm font-semibold text-text-primary">Tax</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            Set VAT % to 0 if you don&apos;t charge VAT. Receipts will skip the VAT line entirely.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <div>
              <label className="block text-body-sm font-semibold text-text-primary mb-1">
                VAT %
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  value={vatPercent}
                  onChange={(e) => setVatPercent(e.target.value)}
                  className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 pr-9 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="0"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body-sm text-text-tertiary">
                  %
                </span>
              </div>
            </div>

            {vatActive && (
              <div>
                <label className="block text-body-sm font-semibold text-text-primary mb-1">
                  TRN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={vatTrn}
                  onChange={(e) => setVatTrn(e.target.value)}
                  maxLength={32}
                  className="w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="100123456700003"
                />
                <p className="mt-1 text-caption text-text-tertiary">
                  Tax Registration Number — required when VAT is charged. Shown on receipts.
                </p>
              </div>
            )}
          </div>
        </div>

        {message && (
          <p className={`text-body-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
