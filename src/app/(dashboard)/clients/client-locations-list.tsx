"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientLocation } from "@/types";
import {
  listClientLocations,
  addClientLocation,
  updateClientLocation,
  setDefaultLocation,
  deleteClientLocation,
} from "./client-locations-actions";

/**
 * Locations sub-form for the Edit Client modal. Self-contained:
 * fetches the client's locations on mount, calls server actions
 * directly for add/update/mark-default/remove, and re-fetches after
 * each mutation. Each action commits immediately — the parent Save
 * button only handles name/phone/notes.
 *
 * UI shape per row:
 *   ┌──────────────────────────────────┐
 *   │ Home               [Default]     │
 *   │ Dubai, Marina, Tower 5           │
 *   │ ↗ google.com/...                 │
 *   │ Edit · Make default · Delete     │
 *   └──────────────────────────────────┘
 *
 * Clicking Edit replaces the row content with the LocationForm
 * inline. + Add new location at the bottom toggles the same form
 * for a fresh row.
 */
export default function ClientLocationsList({
  clientId,
}: {
  clientId: string;
}) {
  const [locations, setLocations] = useState<ClientLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listClientLocations(clientId);
      setLocations(data as unknown as ClientLocation[]);
    } catch (err) {
      console.error("listClientLocations failed:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAdd(p: { label: string; address: string; mapLink: string }) {
    setError(null);
    const res = await addClientLocation({
      clientId,
      label: p.label,
      address: p.address || null,
      mapLink: p.mapLink || null,
      isDefault: false,
    });
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    setAddingOpen(false);
    await reload();
  }

  async function handleUpdate(
    id: string,
    p: { label: string; address: string; mapLink: string },
  ) {
    setError(null);
    const res = await updateClientLocation(id, {
      label: p.label,
      address: p.address || null,
      mapLink: p.mapLink || null,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id: string, isDefault: boolean) {
    const confirmMsg = isDefault
      ? "Delete the default location? The next one will become default."
      : "Delete this location?";
    if (!confirm(confirmMsg)) return;
    setBusyId(id);
    const res = await deleteClientLocation(id);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  }

  async function handleMakeDefault(id: string) {
    setBusyId(id);
    const res = await setDefaultLocation(clientId, id);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    await reload();
  }

  return (
    <div>
      <label className="block text-body-sm font-semibold text-text-primary mb-1.5">
        Locations
      </label>

      {loading ? (
        <p className="text-body-sm text-text-tertiary">Loading…</p>
      ) : (
        <div className="space-y-2">
          {locations.length === 0 && !addingOpen && (
            <p className="text-body-sm text-text-tertiary">
              No saved locations yet.
            </p>
          )}

          {locations.map((loc) => {
            const isEditing = editingId === loc.id;
            const isBusy = busyId === loc.id;
            return (
              <div
                key={loc.id}
                className="rounded-xl border border-border bg-surface-hover p-3"
              >
                {isEditing ? (
                  <LocationForm
                    initial={loc}
                    submitting={isBusy}
                    onSave={(data) => handleUpdate(loc.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <LocationRow
                    location={loc}
                    busy={isBusy}
                    onEdit={() => setEditingId(loc.id)}
                    onMakeDefault={() => handleMakeDefault(loc.id)}
                    onDelete={() => handleDelete(loc.id, loc.is_default)}
                  />
                )}
              </div>
            );
          })}

          {addingOpen && (
            <div className="rounded-xl border border-border bg-surface-hover p-3">
              <LocationForm
                submitting={false}
                onSave={handleAdd}
                onCancel={() => setAddingOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-body-sm text-error-700">{error}</p>
      )}

      {!addingOpen && !editingId && !loading && (
        <button
          type="button"
          onClick={() => setAddingOpen(true)}
          className="mt-2 text-body-sm font-semibold text-text-secondary hover:text-text-primary"
        >
          + Add new location
        </button>
      )}
    </div>
  );
}

// ============================================================
// Row (read mode) — shows label, address, map link, actions
// ============================================================

function LocationRow({
  location,
  busy,
  onEdit,
  onMakeDefault,
  onDelete,
}: {
  location: ClientLocation;
  busy: boolean;
  onEdit: () => void;
  onMakeDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-sm font-semibold text-text-primary">
          {location.label || location.address || "Location"}
        </p>
        {location.is_default && (
          <span className="rounded-full bg-[#F0FAF2] px-2 py-0.5 text-caption font-semibold text-[#1B8736]">
            Default
          </span>
        )}
      </div>
      {location.address && location.address !== location.label && (
        <p className="mt-0.5 text-caption text-text-secondary">
          {location.address}
        </p>
      )}
      {location.map_link && (
        <a
          href={location.map_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-block text-caption text-primary-600 hover:text-primary-700"
        >
          ↗ Map link
        </a>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="text-caption font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Edit
        </button>
        {!location.is_default && (
          <button
            type="button"
            onClick={onMakeDefault}
            disabled={busy}
            className="text-caption font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Make default
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-caption font-semibold text-error-700 hover:text-error-800 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Form (add + edit) — label, address, map link
// ============================================================

function LocationForm({
  initial,
  submitting,
  onSave,
  onCancel,
}: {
  initial?: { label: string; address: string | null; map_link: string | null };
  submitting: boolean;
  onSave: (p: { label: string; address: string; mapLink: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [mapLink, setMapLink] = useState(initial?.map_link ?? "");

  const canSave = label.trim().length > 0 || address.trim().length > 0;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-caption font-semibold text-text-secondary mb-0.5">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Home, Office, Mom's place"
          className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100"
        />
      </div>
      <div>
        <label className="block text-caption font-semibold text-text-secondary mb-0.5">
          Address
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Area, Street, Villa/Apt"
          className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100"
        />
      </div>
      <div>
        <label className="block text-caption font-semibold text-text-secondary mb-0.5">
          Map link <span className="font-normal text-text-tertiary">(optional)</span>
        </label>
        <input
          type="url"
          value={mapLink}
          onChange={(e) => setMapLink(e.target.value)}
          placeholder="https://maps.google.com/..."
          className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg px-3 py-1.5 text-body-sm font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onSave({ label, address, mapLink })}
          disabled={!canSave || submitting}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
