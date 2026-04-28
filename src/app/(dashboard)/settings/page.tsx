"use client";

import { useEffect, useState, useCallback } from "react";
import { signOut } from "@/app/(dashboard)/actions";
import { getProfile, updateProfile, updatePassword } from "./actions";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  role: string;
}

type SettingsTab = "profile" | "security";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SettingsTab>("profile");

  const loadData = useCallback(async () => {
    try {
      const p = await getProfile();
      setProfile(p as Profile | null);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <p className="mt-8 text-center text-text-secondary">Loading...</p>;

  const TABS: { key: SettingsTab; label: string }[] = [
    { key: "profile", label: "Profile" },
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
