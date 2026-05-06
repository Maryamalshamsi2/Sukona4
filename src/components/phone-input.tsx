"use client";

import { useState, useRef, useEffect } from "react";

// Comprehensive country code list
const COUNTRY_CODES = [
  { code: "+971", country: "AE", name: "UAE" },
  { code: "+966", country: "SA", name: "Saudi Arabia" },
  { code: "+968", country: "OM", name: "Oman" },
  { code: "+973", country: "BH", name: "Bahrain" },
  { code: "+974", country: "QA", name: "Qatar" },
  { code: "+965", country: "KW", name: "Kuwait" },
  { code: "+962", country: "JO", name: "Jordan" },
  { code: "+961", country: "LB", name: "Lebanon" },
  { code: "+964", country: "IQ", name: "Iraq" },
  { code: "+20", country: "EG", name: "Egypt" },
  { code: "+212", country: "MA", name: "Morocco" },
  { code: "+216", country: "TN", name: "Tunisia" },
  { code: "+213", country: "DZ", name: "Algeria" },
  { code: "+249", country: "SD", name: "Sudan" },
  { code: "+218", country: "LY", name: "Libya" },
  { code: "+967", country: "YE", name: "Yemen" },
  { code: "+963", country: "SY", name: "Syria" },
  { code: "+970", country: "PS", name: "Palestine" },
  { code: "+1", country: "US", name: "United States" },
  { code: "+1", country: "CA", name: "Canada" },
  { code: "+44", country: "GB", name: "United Kingdom" },
  { code: "+33", country: "FR", name: "France" },
  { code: "+49", country: "DE", name: "Germany" },
  { code: "+39", country: "IT", name: "Italy" },
  { code: "+34", country: "ES", name: "Spain" },
  { code: "+31", country: "NL", name: "Netherlands" },
  { code: "+32", country: "BE", name: "Belgium" },
  { code: "+41", country: "CH", name: "Switzerland" },
  { code: "+43", country: "AT", name: "Austria" },
  { code: "+46", country: "SE", name: "Sweden" },
  { code: "+47", country: "NO", name: "Norway" },
  { code: "+45", country: "DK", name: "Denmark" },
  { code: "+358", country: "FI", name: "Finland" },
  { code: "+48", country: "PL", name: "Poland" },
  { code: "+351", country: "PT", name: "Portugal" },
  { code: "+353", country: "IE", name: "Ireland" },
  { code: "+30", country: "GR", name: "Greece" },
  { code: "+36", country: "HU", name: "Hungary" },
  { code: "+420", country: "CZ", name: "Czech Republic" },
  { code: "+40", country: "RO", name: "Romania" },
  { code: "+380", country: "UA", name: "Ukraine" },
  { code: "+7", country: "RU", name: "Russia" },
  { code: "+90", country: "TR", name: "Turkey" },
  { code: "+91", country: "IN", name: "India" },
  { code: "+92", country: "PK", name: "Pakistan" },
  { code: "+880", country: "BD", name: "Bangladesh" },
  { code: "+94", country: "LK", name: "Sri Lanka" },
  { code: "+977", country: "NP", name: "Nepal" },
  { code: "+93", country: "AF", name: "Afghanistan" },
  { code: "+98", country: "IR", name: "Iran" },
  { code: "+86", country: "CN", name: "China" },
  { code: "+81", country: "JP", name: "Japan" },
  { code: "+82", country: "KR", name: "South Korea" },
  { code: "+66", country: "TH", name: "Thailand" },
  { code: "+84", country: "VN", name: "Vietnam" },
  { code: "+60", country: "MY", name: "Malaysia" },
  { code: "+65", country: "SG", name: "Singapore" },
  { code: "+62", country: "ID", name: "Indonesia" },
  { code: "+63", country: "PH", name: "Philippines" },
  { code: "+61", country: "AU", name: "Australia" },
  { code: "+64", country: "NZ", name: "New Zealand" },
  { code: "+27", country: "ZA", name: "South Africa" },
  { code: "+234", country: "NG", name: "Nigeria" },
  { code: "+254", country: "KE", name: "Kenya" },
  { code: "+233", country: "GH", name: "Ghana" },
  { code: "+251", country: "ET", name: "Ethiopia" },
  { code: "+255", country: "TZ", name: "Tanzania" },
  { code: "+256", country: "UG", name: "Uganda" },
  { code: "+52", country: "MX", name: "Mexico" },
  { code: "+55", country: "BR", name: "Brazil" },
  { code: "+54", country: "AR", name: "Argentina" },
  { code: "+57", country: "CO", name: "Colombia" },
  { code: "+56", country: "CL", name: "Chile" },
  { code: "+51", country: "PE", name: "Peru" },
  { code: "+58", country: "VE", name: "Venezuela" },
];

function parsePhone(fullPhone: string): { countryCode: string; number: string } {
  if (!fullPhone) return { countryCode: "+971", number: "" };
  // Try to match a country code from the list (longest match first)
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const entry of sorted) {
    if (fullPhone.startsWith(entry.code)) {
      return { countryCode: entry.code, number: fullPhone.slice(entry.code.length).trim() };
    }
  }
  return { countryCode: "+971", number: fullPhone };
}

export default function PhoneInput({
  value,
  onChange,
  required,
  className,
  size = "normal",
  variant = "default",
}: {
  value: string;
  onChange: (fullPhone: string) => void;
  required?: boolean;
  className?: string;
  size?: "normal" | "small";
  /** "default" = standalone with own border + bg (used in modals/forms).
   *  "ios" = transparent inner button + input, intended to sit inside
   *  a parent rounded grey container (used on the auth signup page). */
  variant?: "default" | "ios";
}) {
  const parsed = parsePhone(value);
  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [number, setNumber] = useState(parsed.number);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync from parent value
  useEffect(() => {
    const p = parsePhone(value);
    setCountryCode(p.countryCode);
    setNumber(p.number);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (dropdownOpen && searchRef.current) searchRef.current.focus();
  }, [dropdownOpen]);

  function handleCodeChange(code: string) {
    setCountryCode(code);
    setDropdownOpen(false);
    setSearch("");
    onChange(number ? `${code}${number}` : "");
  }

  function handleNumberChange(val: string) {
    // Only allow digits
    const digits = val.replace(/[^\d]/g, "");
    setNumber(digits);
    onChange(digits ? `${countryCode}${digits}` : "");
  }

  const filteredCodes = search
    ? COUNTRY_CODES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search) ||
          c.country.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRY_CODES;

  const isSmall = size === "small";
  const isIos = variant === "ios";
  const inputCls = isSmall
    ? "text-body-sm px-3 py-2"
    : "text-body px-4 py-3 sm:py-2.5";
  // iOS variant strips the standalone field styling so the component
  // can sit flush inside a parent rounded grey container.
  const buttonClass = isIos
    ? `flex items-center gap-1 bg-transparent text-body text-text-primary focus:outline-none ${isSmall ? "min-w-[80px]" : "min-w-[72px]"}`
    : `flex items-center gap-1 rounded-xl border-[1.5px] border-neutral-200 bg-white transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${inputCls} ${isSmall ? "min-w-[80px]" : "min-w-[88px]"}`;
  const inputClass = isIos
    ? "block flex-1 bg-transparent text-body text-text-primary focus:outline-none sm:text-body-sm"
    : `block flex-1 rounded-xl border-[1.5px] border-neutral-200 transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${inputCls}`;
  const wrapperClass = isIos
    ? `flex items-center gap-2 ${className || ""}`
    : `flex gap-2 ${className || ""}`;

  return (
    <div className={wrapperClass}>
      {/* Country code selector */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={buttonClass}
        >
          <span className="font-medium text-text-primary">{countryCode}</span>
          <svg className="h-3.5 w-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-black/[0.06] bg-white shadow-lg">
            <div className="p-2">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="block w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-body-sm focus:border-neutral-400 focus:outline-none"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredCodes.map((c, i) => (
                <button
                  key={`${c.country}-${i}`}
                  type="button"
                  onClick={() => handleCodeChange(c.code)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-body-sm hover:bg-surface-hover ${
                    c.code === countryCode ? "bg-surface-hover font-medium" : ""
                  }`}
                >
                  <span className="text-text-primary">{c.name}</span>
                  <span className="text-text-tertiary">{c.code}</span>
                </button>
              ))}
              {filteredCodes.length === 0 && (
                <p className="px-3 py-2 text-body-sm text-text-tertiary">No results</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Phone number input */}
      <input
        type="tel"
        value={number}
        onChange={(e) => handleNumberChange(e.target.value)}
        required={required}
        placeholder={isIos ? undefined : "Phone number"}
        className={inputClass}
      />
    </div>
  );
}
