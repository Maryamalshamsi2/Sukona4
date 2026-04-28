"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Also check if already in a session (user clicked link and session is set)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
  }, [supabase.auth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        window.location.replace("/");
      }, 2000);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
      <div className="w-full max-w-sm rounded-3xl border border-white/60 bg-white/70 px-6 py-8 shadow-xl backdrop-blur-xl sm:px-8 sm:py-10">
        <div className="mb-8 text-center">
          <img src="/logo-dark.png" alt="Sukona" className="mx-auto h-12" />
          <h1 className="mt-4 text-title-page font-bold tracking-tight text-text-primary">
            {success ? "Password updated!" : "Set new password"}
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            {success ? "Redirecting you to the dashboard..." : "Enter your new password below"}
          </p>
        </div>

        {success ? (
          <div className="flex justify-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
        ) : !ready ? (
          <p className="text-center text-body-sm text-text-tertiary">Verifying reset link...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-body-sm font-semibold text-text-primary">
                New Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-body-sm font-semibold text-text-primary">
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-body-sm text-error-700">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-text-inverse font-semibold tracking-tight hover:bg-neutral-800 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:opacity-50 sm:py-2.5"
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
