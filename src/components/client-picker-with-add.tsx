"use client";

import { useState } from "react";
import PhoneInput from "@/components/phone-input";
import { addClientQuick } from "@/app/(dashboard)/calendar/actions";

/**
 * Client picker with an inline "Add new client" form — same pattern
 * as the appointment form (calendar-shared.tsx), but factored out
 * so /sales' three sell modals (Retail / Gift card / Package) can
 * share it without duplicating ~80 lines of state and JSX per modal.
 *
 * Two modes:
 *   - existing: dropdown of clients, plus a small "Add new client"
 *     toggle in the label row.
 *   - new: full inline form (Name, Phone, Address, Map link, Notes)
 *     ending in a Save Client button. Same field set as the
 *     appointment form so a client added from /sales is shaped
 *     identically to one added from /calendar.
 *
 * On save: the new client is appended to the parent's list via
 * onClientAdded, automatically selected via onChange, the form
 * resets, and the picker flips back to "existing" mode.
 *
 * No appointment-form coupling — that flow still uses its own
 * inline implementation in calendar-shared.tsx. A future cleanup
 * could migrate it to use this component too.
 */

export interface ClientOption {
  id: string;
  name: string;
  phone?: string | null;
}

export default function ClientPickerWithAdd({
  label,
  value,
  onChange,
  clients,
  onClientAdded,
  required = false,
  emptyOptionLabel,
}: {
  /** Label text — varies by surface ("Client", "Buyer", "Recipient"). */
  label: string;
  /** Currently selected client id, "" when none. */
  value: string;
  /** Called with the picked client id (or "" for none). */
  onChange: (clientId: string) => void;
  /** Current client list — typically lifted in the parent so a new
   *  client added here is visible across other pickers / modals. */
  clients: ClientOption[];
  /** Called after a new client is saved. Parent should append to its
   *  clients state so the picker (and any sibling pickers) re-render
   *  with the newcomer included. */
  onClientAdded: (client: ClientOption) => void;
  required?: boolean;
  /** Custom text for the empty option. Defaults to "Select a client".
   *  Pass e.g. "Walk-in / no client" for optional fields. */
  emptyOptionLabel?: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");

  // Inline-form state. Reset after a successful save.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    const result = await addClientQuick(name, phone, address, mapLink, notes);
    setSaving(false);
    if (result.error || !result.client) {
      setError(result.error ?? "Failed to add client");
      return;
    }
    const created: ClientOption = {
      id: result.client.id,
      name: result.client.name,
      phone: result.client.phone,
    };
    onClientAdded(created);
    onChange(created.id);
    // Reset and flip back to "existing" so the new client is shown
    // selected in the dropdown immediately.
    setName("");
    setPhone("");
    setAddress("");
    setMapLink("");
    setNotes("");
    setMode("existing");
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-body-sm font-semibold text-text-primary">
          {label}
          {required && " *"}
        </label>
        <button
          type="button"
          onClick={() => setMode(mode === "existing" ? "new" : "existing")}
          className="text-caption text-text-secondary hover:text-text-primary"
        >
          {mode === "existing" ? "Add new client" : "Select existing"}
        </button>
      </div>

      {mode === "existing" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="block w-full appearance-none box-border rounded-xl border-[1.5px] border-neutral-200 bg-white px-4 py-3 sm:py-2.5 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          <option value="">{emptyOptionLabel ?? "Select a client"}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` — ${c.phone}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-surface-hover p-4">
          <div>
            <label className="block text-body-sm font-semibold text-text-primary">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary">Phone *</label>
            <div className="mt-1">
              <PhoneInput value={phone} onChange={setPhone} required size="small" />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary">
              Location <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <div className="mt-1 space-y-2 rounded-xl bg-white p-2.5 ring-1 ring-border">
              <div>
                <label className="mb-0.5 block text-caption text-text-secondary">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Skip for walk-in / in-store"
                  className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-caption text-text-secondary">Pin location</label>
                <input
                  type="url"
                  value={mapLink}
                  onChange={(e) => setMapLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2 text-body-sm transition focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          {error && <p className="text-body-sm text-error-700">{error}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !phone.trim()}
            className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Client"}
          </button>
        </div>
      )}
    </div>
  );
}
