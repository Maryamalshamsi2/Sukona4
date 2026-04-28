"use client";

import { useState, useEffect } from "react";
import PhoneInput from "@/components/phone-input";

// ---- Types ----

export interface StaffMember {
  id: string;
  full_name: string;
  job_title: string | null;
}

export interface ClientItem {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  map_link: string | null;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  category_id: string | null;
  service_categories: { name: string } | { name: string }[] | null;
}

export interface BundleItemForBooking {
  id: string;
  service_id: string;
  sort_order: number;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
}

export interface BundleForBooking {
  id: string;
  name: string;
  discount_type: "percentage" | "fixed";
  discount_percentage: number | null;
  fixed_price: number | null;
  duration_override: number | null;
  service_bundle_items: BundleItemForBooking[];
}

export interface AppointmentServiceData {
  id: string;
  service_id: string;
  staff_id: string;
  is_parallel: boolean;
  sort_order: number;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
}

export interface AppointmentData {
  id: string;
  client_id: string;
  service_id: string | null;
  date: string;
  time: string;
  status: string;
  notes: string | null;
  duration_override: number | null;
  clients: { id: string; name: string; phone: string | null; address: string | null; map_link: string | null } | null;
  appointment_services: AppointmentServiceData[];
}

export interface ServiceEntry {
  service_id: string;
  staff_id: string;
  is_parallel: boolean;
  bundle_id?: string;
  bundle_name?: string;
}

// ---- Constants ----

export const STATUS_FLOW = [
  { value: "scheduled", label: "Scheduled", color: "bg-[#FFF8F0] text-[#CC7700]" },
  { value: "on_the_way", label: "On the Way", color: "bg-[#F0FAF2] text-[#1B8736]" },
  { value: "arrived", label: "Arrived", color: "bg-[#F0F7FF] text-[#0062CC]" },
  { value: "paid", label: "Paid", color: "bg-[#F5F5F7] text-[#48484A]" },
];

// ---- Helpers ----

export function formatTime12(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

export function formatTime12Short(time24: string) {
  const [h, m] = time24.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (m === "00") return `${hour12} ${ampm}`;
  return `${hour12}:${m} ${ampm}`;
}

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h}h ${m}m`;
}

export function getServiceTimings(appt: AppointmentData) {
  const startMin = timeToMinutes(appt.time);
  const sorted = [...appt.appointment_services].sort((a, b) => a.sort_order - b.sort_order);
  const timings: { svc: AppointmentServiceData; startMin: number; endMin: number }[] = [];
  let currentEnd = startMin;

  for (let i = 0; i < sorted.length; i++) {
    const svc = sorted[i];
    const dur = svc.services?.duration_minutes || 30;
    let svcStart: number;
    if (i === 0) {
      svcStart = startMin;
    } else if (svc.is_parallel) {
      svcStart = timings[i - 1].startMin;
    } else {
      svcStart = currentEnd;
    }
    const svcEnd = svcStart + dur;
    timings.push({ svc, startMin: svcStart, endMin: svcEnd });
    if (svcEnd > currentEnd) currentEnd = svcEnd;
  }

  return timings;
}

export function getApptTotalDuration(appt: AppointmentData) {
  if (appt.duration_override) return appt.duration_override;
  const timings = getServiceTimings(appt);
  if (timings.length === 0) return 60;
  const start = timeToMinutes(appt.time);
  const end = Math.max(...timings.map((t) => t.endMin));
  return end - start;
}

export function getApptEndTime(appt: AppointmentData) {
  const startMin = timeToMinutes(appt.time);
  const duration = getApptTotalDuration(appt);
  return minutesToTime(startMin + duration);
}

export function getStaffServiceBlocks(appt: AppointmentData, staffId: string) {
  const timings = getServiceTimings(appt);
  return timings.filter((t) => t.svc.staff_id === staffId);
}

export function getServiceName(s: ServiceItem) {
  const cat = s.service_categories;
  const catName = cat
    ? Array.isArray(cat) ? cat[0]?.name : cat.name
    : null;
  return catName ? `${catName} — ${s.name}` : s.name;
}

// ---- DetailView Component ----

export function DetailView({
  appointment,
  staff,
  onStatusUpdate,
  onEdit,
  onCancel,
  canEdit = true,
}: {
  appointment: AppointmentData;
  staff: StaffMember[];
  onStatusUpdate: (status: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  /** When false, hide both the Cancel and Edit buttons. Staff roles pass false. */
  canEdit?: boolean;
}) {
  const timings = getServiceTimings(appointment);
  const totalDuration = getApptTotalDuration(appointment);
  const endTime = getApptEndTime(appointment);
  const totalPrice = appointment.appointment_services.reduce(
    (sum, as2) => sum + (as2.services?.price || 0), 0
  );

  const currentStatusIdx = STATUS_FLOW.findIndex((s) => s.value === appointment.status);
  const nextStatus = currentStatusIdx >= 0 && currentStatusIdx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStatusIdx + 1]
    : null;
  const isActive = ["scheduled", "on_the_way", "arrived"].includes(appointment.status);

  return (
    <div className="space-y-6">
      {/* ---- Date & Time ---- */}
      <div>
        <h3 className="text-body-sm font-bold text-text-primary mb-2">Date & Time</h3>
        <div className="space-y-1 text-body-sm text-text-secondary">
          <p>{appointment.date}</p>
          <p>{formatTime12(appointment.time)} – {formatTime12(endTime)}</p>
          <p>{formatDuration(totalDuration)} total</p>
        </div>
      </div>

      {/* ---- Client ---- */}
      <div>
        <h3 className="text-body-sm font-bold text-text-primary mb-2">Client</h3>
        <div className="space-y-1 text-body-sm">
          <p className="font-semibold text-text-primary">{appointment.clients?.name || "Unknown"}</p>
          {appointment.clients?.phone && <p className="text-text-secondary">{appointment.clients.phone}</p>}
          {appointment.clients?.address && <p className="text-text-secondary">{appointment.clients.address}</p>}
          {appointment.clients?.map_link && (
            <a href={appointment.clients.map_link} target="_blank" rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Open in Google Maps
            </a>
          )}
        </div>
      </div>

      {/* ---- Services ---- */}
      {timings.length > 0 && (
        <div>
          <h3 className="text-body-sm font-bold text-text-primary mb-2.5">Services</h3>
          <div className="space-y-2.5">
            {timings.map((t, i) => {
              const staffMember = staff.find((s) => s.id === t.svc.staff_id);
              return (
                <div key={t.svc.id || i} className="rounded-lg bg-surface-hover px-3 py-2.5 text-body-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-text-primary">{t.svc.services?.name || "Unknown"}</p>
                    <span className="font-semibold text-text-primary">AED {t.svc.services?.price || 0}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-text-secondary">
                      {formatDuration(t.endMin - t.startMin)}
                      {t.svc.is_parallel && <span className="ml-1">(parallel)</span>}
                    </p>
                    {staffMember && (
                      <span className="rounded-full bg-surface-active px-2 py-0.5 text-caption font-semibold text-text-primary">
                        {staffMember.full_name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-body-sm font-bold text-text-primary">Total</span>
            <span className="text-body-sm font-bold text-text-primary">AED {totalPrice}</span>
          </div>
        </div>
      )}

      {/* ---- Status ---- */}
      <div>
        <h3 className="text-body-sm font-bold text-text-primary mb-2">Status</h3>
        <span className={`inline-block rounded-full px-3 py-1 text-body-sm font-medium ${STATUS_FLOW.find((s) => s.value === appointment.status)?.color || "bg-gray-100 text-text-primary"}`}>
          {STATUS_FLOW.find((s) => s.value === appointment.status)?.label || appointment.status}
        </span>
      </div>

      {/* ---- Notes ---- */}
      {appointment.notes && (
        <div>
          <h3 className="text-body-sm font-bold text-text-primary mb-2">Notes</h3>
          <p className="text-body-sm text-text-secondary">{appointment.notes}</p>
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        {nextStatus && (
          <button onClick={() => onStatusUpdate(nextStatus.value)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-body-sm font-semibold transition-colors ${nextStatus.color} hover:opacity-80`}>
            {nextStatus.label}
          </button>
        )}
        {canEdit && isActive && (
          <button onClick={onCancel}
            className="flex-1 whitespace-nowrap rounded-xl border border-red-200 px-3 py-2.5 text-body-sm font-semibold text-error-700 hover:bg-red-50 transition-colors">
            Cancel Appointment
          </button>
        )}
        {canEdit && (
          <button onClick={onEdit}
            className="flex shrink-0 h-10 w-10 items-center justify-center rounded-xl bg-surface-active text-text-secondary hover:bg-neutral-100 hover:text-text-primary transition-colors"
            title="Edit appointment">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ---- AppointmentForm Component ----

export function AppointmentForm({
  dateStr,
  clients,
  services,
  staff,
  bundles,
  staffSchedules,
  onSubmit,
  onNewClient,
  onCancel,
  submitLabel,
  defaultValues,
  prefillTime,
  prefillStaffId,
}: {
  dateStr: string;
  clients: ClientItem[];
  services: ServiceItem[];
  staff: StaffMember[];
  bundles?: BundleForBooking[];
  staffSchedules?: Map<string, { isOff: boolean; startMin: number; endMin: number }>;
  onSubmit: (clientId: string, date: string, time: string, notes: string, entries: ServiceEntry[]) => Promise<void>;
  onNewClient: (name: string, phone: string, address: string, mapLink: string, notes: string) => Promise<ClientItem | null>;
  onCancel: () => void;
  submitLabel: string;
  defaultValues?: {
    client_id: string;
    date: string;
    time: string;
    notes: string;
    serviceEntries: ServiceEntry[];
  };
  prefillTime?: string | null;
  prefillStaffId?: string | null;
}) {
  const [clientMode, setClientMode] = useState<"existing" | "new">(defaultValues ? "existing" : "existing");
  const [selectedClientId, setSelectedClientId] = useState(defaultValues?.client_id || "");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientMapLink, setNewClientMapLink] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");
  const [date, setDate] = useState(defaultValues?.date || dateStr);
  const [time, setTime] = useState(defaultValues?.time || prefillTime || "09:00");
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>(
    defaultValues?.serviceEntries?.length
      ? defaultValues.serviceEntries
      : [{ service_id: "", staff_id: prefillStaffId || "", is_parallel: false }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savedClients, setSavedClients] = useState<ClientItem[]>([]);

  const allClients = [...clients, ...savedClients];

  async function handleSaveClient() {
    if (!newClientName.trim() || !newClientPhone.trim() || !newClientAddress.trim()) return;
    setSavingClient(true);
    const newClient = await onNewClient(newClientName, newClientPhone, newClientAddress, newClientMapLink, newClientNotes);
    setSavingClient(false);
    if (!newClient) return;
    setSavedClients((prev) => [...prev, newClient]);
    setSelectedClientId(newClient.id);
    setClientMode("existing");
    setNewClientName("");
    setNewClientPhone("");
    setNewClientAddress("");
    setNewClientMapLink("");
    setNewClientNotes("");
  }

  // Sync prefillTime/prefillStaffId when they change (e.g. grid drag-to-create)
  useEffect(() => {
    if (prefillTime) setTime(prefillTime);
  }, [prefillTime]);

  useEffect(() => {
    if (prefillStaffId && !defaultValues) {
      setServiceEntries((prev) =>
        prev.map((e, i) => (i === 0 && !e.staff_id ? { ...e, staff_id: prefillStaffId } : e))
      );
    }
  }, [prefillStaffId, defaultValues]);

  function addServiceEntry() {
    setServiceEntries([...serviceEntries, { service_id: "", staff_id: "", is_parallel: false }]);
  }

  function removeServiceEntry(idx: number) {
    setServiceEntries(serviceEntries.filter((_, i) => i !== idx));
  }

  function handleServiceSelect(idx: number, value: string) {
    if (value.startsWith("bundle:")) {
      const bundleId = value.slice(7);
      const bundle = bundles?.find((b) => b.id === bundleId);
      if (!bundle) return;
      const sorted = [...bundle.service_bundle_items].sort((a, b) => a.sort_order - b.sort_order);
      const bundleEntries: ServiceEntry[] = sorted.map((item) => ({
        service_id: item.service_id,
        staff_id: "",
        is_parallel: false,
        bundle_id: bundle.id,
        bundle_name: bundle.name,
      }));
      // Replace the current entry with the bundle's services
      const before = serviceEntries.slice(0, idx);
      const after = serviceEntries.slice(idx + 1);
      setServiceEntries([...before, ...bundleEntries, ...after]);
    } else {
      updateEntry(idx, "service_id", value);
    }
  }

  function updateEntry(idx: number, field: keyof ServiceEntry, value: string | boolean) {
    const updated = [...serviceEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    // If changing service_id, clear bundle association
    if (field === "service_id") {
      updated[idx] = { ...updated[idx], bundle_id: undefined, bundle_name: undefined };
    }
    setServiceEntries(updated);
  }

  function calcTotalDuration() {
    let currentEnd = 0;
    for (let i = 0; i < serviceEntries.length; i++) {
      const svc = services.find((s) => s.id === serviceEntries[i].service_id);
      const dur = svc?.duration_minutes || 0;
      if (i === 0) {
        currentEnd = dur;
      } else if (serviceEntries[i].is_parallel) {
        const prevStart = i > 0 && serviceEntries[i].is_parallel ? 0 : currentEnd - (services.find((s) => s.id === serviceEntries[i - 1].service_id)?.duration_minutes || 0);
        const parallelEnd = prevStart + dur;
        if (parallelEnd > currentEnd) currentEnd = parallelEnd;
      } else {
        currentEnd += dur;
      }
    }
    return currentEnd;
  }

  const totalDuration = calcTotalDuration();

  // Calculate total price with bundle discounts
  const totalPrice = (() => {
    let total = 0;
    const processedBundles = new Set<string>();
    for (const entry of serviceEntries) {
      if (entry.bundle_id && !processedBundles.has(entry.bundle_id)) {
        processedBundles.add(entry.bundle_id);
        const bundle = bundles?.find((b) => b.id === entry.bundle_id);
        if (bundle) {
          const originalPrice = bundle.service_bundle_items.reduce(
            (sum, item) => sum + (item.services?.price || 0), 0
          );
          const bundlePrice = bundle.discount_type === "fixed" && bundle.fixed_price != null
            ? bundle.fixed_price
            : bundle.discount_percentage != null
              ? originalPrice * (1 - bundle.discount_percentage / 100)
              : originalPrice;
          total += bundlePrice;
        }
      } else if (!entry.bundle_id) {
        const svc = services.find((s) => s.id === entry.service_id);
        total += svc?.price || 0;
      }
    }
    return Math.round(total);
  })();

  const startMin = timeToMinutes(time);
  const endTimeStr = minutesToTime(startMin + totalDuration);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const clientId = selectedClientId;
    if (!clientId) { setSubmitting(false); return; }

    const validEntries = serviceEntries.filter((e) => e.service_id && e.staff_id);
    if (validEntries.length === 0) {
      setSubmitting(false);
      return;
    }

    // Check staff schedules for out-of-hours warnings
    if (staffSchedules && staffSchedules.size > 0) {
      const apptStartMin = timeToMinutes(time);
      // Calculate each service's time span
      let currentEnd = 0; // offset from apptStart
      const svcTimings: { entryIdx: number; startOff: number; endOff: number }[] = [];
      for (let i = 0; i < validEntries.length; i++) {
        const svc = services.find((s) => s.id === validEntries[i].service_id);
        const dur = svc?.duration_minutes || 30;
        const startOff = validEntries[i].is_parallel && i > 0 ? svcTimings[i - 1].startOff : currentEnd;
        const endOff = startOff + dur;
        svcTimings.push({ entryIdx: i, startOff, endOff });
        currentEnd = Math.max(currentEnd, endOff);
      }

      const warnings: string[] = [];
      const checkedStaff = new Set<string>();

      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i];
        const sched = staffSchedules.get(entry.staff_id);
        if (!sched || checkedStaff.has(entry.staff_id)) continue;
        checkedStaff.add(entry.staff_id);

        const staffName = staff.find((s) => s.id === entry.staff_id)?.full_name || "Staff";

        if (sched.isOff) {
          warnings.push(`${staffName} has a day off`);
          continue;
        }

        // Check if any of this staff's services fall outside their work hours
        for (const t of svcTimings) {
          if (validEntries[t.entryIdx].staff_id !== entry.staff_id) continue;
          const svcStart = apptStartMin + t.startOff;
          const svcEnd = apptStartMin + t.endOff;
          if (svcStart < sched.startMin || svcEnd > sched.endMin) {
            warnings.push(`${staffName} works ${formatTime12(minutesToTime(sched.startMin))} – ${formatTime12(minutesToTime(sched.endMin))}`);
            break;
          }
        }
      }

      if (warnings.length > 0) {
        const msg = warnings.join("\n") + "\n\nContinue anyway?";
        if (!window.confirm(msg)) {
          setSubmitting(false);
          return;
        }
      }
    }

    await onSubmit(clientId, date, time, notes, validEntries);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-body-sm font-semibold text-text-primary">Client *</label>
          <button type="button" onClick={() => setClientMode(clientMode === "existing" ? "new" : "existing")}
            className="text-xs text-text-secondary hover:text-text-primary">
            {clientMode === "existing" ? "Add new client" : "Select existing"}
          </button>
        </div>

        {clientMode === "existing" ? (
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} required
            className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
            <option value="">Select a client</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>
            ))}
          </select>
        ) : (
          <div className="space-y-5 rounded-xl border border-border p-4 bg-surface-hover">
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Name *</label>
              <input type="text" value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)} required
                className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Phone *</label>
              <div className="mt-1">
                <PhoneInput value={newClientPhone} onChange={setNewClientPhone} required size="small" />
              </div>
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Location *</label>
              <div className="mt-1 space-y-2 rounded-xl ring-1 ring-border p-2.5 bg-white">
                <div>
                  <label className="block text-caption text-text-secondary mb-0.5">Address *</label>
                  <input type="text" value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)} required
                    placeholder="e.g. Al Reem Island, Tower 3, Floor 12, Apt 1204"
                    className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100" />
                </div>
                <div>
                  <label className="block text-caption text-text-secondary mb-0.5">Pin location</label>
                  <input type="url" value={newClientMapLink}
                    onChange={(e) => setNewClientMapLink(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-body-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-100" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-text-primary">Notes</label>
              <textarea rows={2} value={newClientNotes}
                onChange={(e) => setNewClientNotes(e.target.value)}
                className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
            </div>
            <button type="button" onClick={handleSaveClient}
              disabled={savingClient || !newClientName.trim() || !newClientPhone.trim() || !newClientAddress.trim()}
              className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 disabled:opacity-50 transition-all">
              {savingClient ? "Saving..." : "Save Client"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">Start Time *</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-2">Services *</label>

        <div className="space-y-3">
          {serviceEntries.map((entry, idx) => {
            const selectedService = services.find((s) => s.id === entry.service_id);
            // Show bundle header for the first entry in a bundle group
            const isFirstInBundle = entry.bundle_id && (idx === 0 || serviceEntries[idx - 1].bundle_id !== entry.bundle_id);
            const isInBundle = !!entry.bundle_id;
            // Compute bundle price for header
            let bundlePriceDisplay: number | null = null;
            if (isFirstInBundle && entry.bundle_id) {
              const bundle = bundles?.find((b) => b.id === entry.bundle_id);
              if (bundle) {
                const originalPrice = bundle.service_bundle_items.reduce(
                  (sum, item) => sum + (item.services?.price || 0), 0
                );
                bundlePriceDisplay = bundle.discount_type === "fixed" && bundle.fixed_price != null
                  ? bundle.fixed_price
                  : bundle.discount_percentage != null
                    ? Math.round(originalPrice * (1 - bundle.discount_percentage / 100))
                    : null;
              }
            }

            return (
              <div key={idx}>
                {isFirstInBundle && (
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-primary">{entry.bundle_name}</span>
                      <span className="rounded-full bg-surface-active px-2 py-0.5 text-caption font-medium text-text-secondary">Bundle</span>
                    </div>
                    {bundlePriceDisplay != null && (
                      <span className="text-xs font-normal text-text-secondary">AED {bundlePriceDisplay}</span>
                    )}
                  </div>
                )}
                <div className={`rounded-xl border border-border p-3 bg-surface-hover ${isInBundle && !isFirstInBundle ? "mt-1.5" : ""}`}>
                  {idx > 0 && !isInBundle && (
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-border">
                      <span className="text-caption text-text-secondary">Timing:</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`timing-${idx}`}
                          checked={!entry.is_parallel}
                          onChange={() => updateEntry(idx, "is_parallel", false)}
                          className="text-text-primary focus:ring-gray-400"
                        />
                        <span className="text-caption text-text-primary">After previous</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`timing-${idx}`}
                          checked={entry.is_parallel}
                          onChange={() => updateEntry(idx, "is_parallel", true)}
                          className="text-text-primary focus:ring-gray-400"
                        />
                        <span className="text-caption text-text-primary">Same time</span>
                      </label>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      {isInBundle ? (
                        <div className="rounded-xl border-[1.5px] border-neutral-200 bg-white px-3 py-2 text-body-sm text-text-primary">
                          {selectedService ? getServiceName(selectedService) : "Unknown service"}
                        </div>
                      ) : (
                        <select value={entry.service_id} onChange={(e) => handleServiceSelect(idx, e.target.value)}
                          required
                          className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
                          <option value="">Select service</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.duration_minutes} min, AED {s.price})
                            </option>
                          ))}
                          {bundles && bundles.length > 0 && (
                            <optgroup label="Bundles">
                              {bundles.map((b) => {
                                const originalPrice = b.service_bundle_items.reduce(
                                  (sum, item) => sum + (item.services?.price || 0), 0
                                );
                                const bundlePrice = b.discount_type === "fixed" && b.fixed_price != null
                                  ? b.fixed_price
                                  : b.discount_percentage != null
                                    ? Math.round(originalPrice * (1 - b.discount_percentage / 100))
                                    : originalPrice;
                                return (
                                  <option key={b.id} value={`bundle:${b.id}`}>
                                    {b.name} ({b.service_bundle_items.length} services, AED {bundlePrice})
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </select>
                      )}

                      <select value={entry.staff_id} onChange={(e) => updateEntry(idx, "staff_id", e.target.value)}
                        required
                        className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
                        <option value="">Assign staff *</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {serviceEntries.length > 1 && (
                      <button type="button" onClick={() => {
                        if (isInBundle && entry.bundle_id) {
                          // Remove all entries from this bundle
                          setServiceEntries(serviceEntries.filter((e) => e.bundle_id !== entry.bundle_id));
                        } else {
                          removeServiceEntry(idx);
                        }
                      }}
                        className="mt-1 rounded-lg p-1 text-text-tertiary hover:bg-surface-active hover:text-text-secondary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addServiceEntry}
          className="mt-3 w-full rounded-xl border-[1.5px] border-dashed border-neutral-300 px-3 py-2.5 text-body-sm font-semibold text-text-secondary hover:border-neutral-400 hover:text-text-primary transition-colors">
          + Add service
        </button>

        {totalDuration > 0 && (
          <div className="mt-2 rounded-xl bg-surface-hover px-3 py-2 text-body-sm">
            <div className="flex items-center justify-between text-text-primary">
              <span className="font-semibold">
                {formatTime12Short(time)} - {formatTime12Short(endTimeStr)} ({formatDuration(totalDuration)})
              </span>
              <span className="font-semibold">AED {totalPrice}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary">Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg bg-surface-active px-4 py-2 text-body-sm font-semibold text-text-primary hover:bg-neutral-100">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
