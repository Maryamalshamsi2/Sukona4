"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Decide whether the user typed an email or a phone number.
 * - Contains "@" → email.
 * - Otherwise → phone (we expect E.164 format starting with "+", e.g. "+971502015519").
 *
 * Whitespace is trimmed before sending. We don't try to be clever about
 * autocorrecting phones — Supabase will reject malformed values cleanly.
 */
function detectIdentifier(raw: string): { email?: string; phone?: string } {
  const value = raw.trim();
  if (value.includes("@")) {
    return { email: value };
  }
  return { phone: value };
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const identifier = ((formData.get("identifier") as string) || "").trim();
    const password = formData.get("password") as string;

    if (!identifier) {
      setError("Please enter your email or phone");
      setLoading(false);
      return;
    }

    const payload: { password: string; email?: string; phone?: string } = {
      password,
      ...detectIdentifier(identifier),
    };

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
      } else {
        // Force a full page reload to pick up the new cookies
        window.location.replace("/");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-violet-50 via-white to-violet-100/60">
      {/* Header logo */}
      <header className="px-6 pt-12 pb-4 text-center sm:pt-16">
        <img src="/logo-dark.png" alt="Sukona" className="mx-auto h-[46px] w-auto sm:h-[50px]" />
      </header>

      {/* Centered form */}
      <main className="flex flex-1 items-center justify-center px-6 pb-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-8 text-center text-2xl font-semibold tracking-tight text-text-primary">
            {forgotMode ? "Reset password" : "Sign in"}
          </h1>

          {forgotMode ? (
            // Forgot password form
            <div className="space-y-6">
              {forgotSent ? (
                <div className="text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <p className="text-body-sm text-text-primary">
                    If an account exists for <span className="font-normal">{forgotEmail}</span>, you&apos;ll receive a password reset link.
                  </p>
                  <button
                    onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); setError(null); }}
                    className="text-body-sm font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setForgotLoading(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/auth/forgot-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: forgotEmail }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setError(data.error || "Something went wrong");
                      } else {
                        setForgotSent(true);
                      }
                    } catch {
                      setError("Something went wrong. Please try again.");
                    } finally {
                      setForgotLoading(false);
                    }
                  }}
                  className="space-y-6"
                >
                  <div>
                    <label htmlFor="forgot-email" className="block text-body-sm font-semibold text-text-primary mb-1.5">
                      Email
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
                    />
                    <p className="mt-1.5 text-caption text-text-tertiary">
                      Password reset is available for email accounts only. If you sign in with your phone, contact your owner to reset.
                    </p>
                  </div>

                  {error && <p className="text-body-sm text-error-700">{error}</p>}

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-text-inverse font-semibold tracking-tight hover:bg-neutral-800 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:opacity-50 sm:py-2.5"
                  >
                    {forgotLoading ? "Sending..." : "Send reset link"}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setForgotMode(false); setError(null); }}
                    className="w-full text-center text-body-sm font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Back to sign in
                  </button>
                </form>
              )}
            </div>
          ) : (
            // Normal login form
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="identifier" className="block text-body-sm font-semibold text-text-primary mb-1.5">
                  Email/Phone
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-body-sm font-semibold text-text-primary">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setError(null); }}
                    className="text-caption font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    className="block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 pr-10 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 text-body sm:text-body-sm sm:py-2.5"
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

              {error && (
                <p className="text-body-sm text-error-700">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-text-inverse font-semibold tracking-tight hover:bg-neutral-800 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 disabled:opacity-50 sm:py-2.5"
              >
                {loading ? "Signing in..." : "Continue"}
              </button>

              <button
                type="button"
                disabled={googleLoading}
                onClick={async () => {
                  setGoogleLoading(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/auth/google", {
                      method: "POST",
                      credentials: "include",
                    });
                    const data = await res.json();
                    if (data.url) {
                      window.location.href = data.url;
                    } else {
                      setError(data.error || "Failed to start Google sign in");
                      setGoogleLoading(false);
                    }
                  } catch {
                    setError("Something went wrong. Please try again.");
                    setGoogleLoading(false);
                  }
                }}
                className="flex w-full items-center justify-center gap-3 rounded-xl border-[1.5px] border-neutral-200 bg-white/80 px-4 py-3 text-body-sm font-semibold text-text-primary transition-all hover:bg-white hover:shadow-sm active:scale-[0.98] disabled:opacity-50 sm:py-2.5"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleLoading ? "Redirecting..." : "Continue with Google"}
              </button>
            </form>
          )}

          {!forgotMode && (
            <p className="mt-8 text-center text-body-sm text-text-secondary">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary-600 hover:text-primary-700 font-semibold">
                Sign up
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
