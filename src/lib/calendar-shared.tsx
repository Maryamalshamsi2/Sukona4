"use client";

import { useState, useEffect } from "react";

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
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  category_id: string | null;
  service_categories: { name: string } | { name: string }[] | null;
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
  clients: { id: string; name: string; phone: string | null; address: string | null } | null;
  appointment_services: AppointmentServiceData[];
}

export interface ServiceEntry {
  service_id: string;
  staff_id: string;
  is_parallel: boolean;
}

// ---- Constants ----

export const STATUS_FLOW = [
  { value: "scheduled", label: "Scheduled", color: "bg-gray-100 text-gray-700" },
  { value: "on_the_way", label: "On the Way", color: "bg-blue-100 text-blue-700" },
  { value: "arrived", label: "Arrived", color: "bg-amber-100 text-amber-700" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-700" },
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
}: {
  appointment: AppointmentData;
  staff: StaffMember[];
  onStatusUpdate: (status: string) => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const timings = getServiceTimings(appointment);
  const totalDuration = getApptTotalDuration(appointment);
  const endTime = getApptEndTime(appointment);
  const totalPrice = appointment.appointment_services.reduce(
    (sum, as2) => sum + (as2.services?.price || 0), 0
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500">Client</p>
        <p className="font-medium text-gray-900">{appointment.clients?.name || "Unknown"}</p>
        {appointment.clients?.phone && <p className="text-sm text-gray-500">{appointment.clients.phone}</p>}
        {appointment.clients?.address && <p className="text-sm text-gray-500">{appointment.clients.address}</p>}
      </div>

      <div>
        <p className="text-sm text-gray-500">Date & Time</p>
        <p className="font-medium text-gray-900">{appointment.date}</p>
        <p className="text-sm text-gray-700">
          {formatTime12(appointment.time)} - {formatTime12(endTime)} ({formatDuration(totalDuration)})
        </p>
      </div>

      {timings.length > 0 && (
        <div>
          <p className="text-sm text-gray-500 mb-1">Services</p>
          <div className="space-y-2">
            {timings.map((t, i) => {
              const staffMember = staff.find((s) => s.id === t.svc.staff_id);
              return (
                <div key={t.svc.id || i} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{t.svc.services?.name || "Unknown"}</p>
                    <span className="text-gray-500">AED {t.svc.services?.price || 0}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-gray-500">
                      {formatTime12Short(minutesToTime(t.startMin))} - {formatTime12Short(minutesToTime(t.endMin))}
                      {" "}({formatDuration(t.endMin - t.startMin)})
                      {t.svc.is_parallel && <span className="ml-1 text-violet-600">(parallel)</span>}
                    </p>
                    {staffMember && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {staffMember.full_name}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-sm font-medium text-gray-700">Total: AED {totalPrice}</p>
        </div>
      )}

      {appointment.notes && (
        <div>
          <p className="text-sm text-gray-500">Notes</p>
          <p className="text-sm text-gray-900">{appointment.notes}</p>
        </div>
      )}

      <div>
        <p className="text-sm text-gray-500 mb-2">Status</p>
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${STATUS_FLOW.find((s) => s.value === appointment.status)?.color || "bg-gray-100 text-gray-700"}`}>
          {STATUS_FLOW.find((s) => s.value === appointment.status)?.label || appointment.status}
        </span>
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-2">Update Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_FLOW.filter((s) => s.value !== appointment.status).map((s) => (
            <button key={s.value} onClick={() => onStatusUpdate(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${s.color} hover:opacity-80`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-4">
        <button onClick={onEdit}
          className="flex-1 rounded-lg border border-violet-600 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50">
          Edit
        </button>
        <button onClick={onCancel}
          className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          Cancel Appointment
        </button>
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
  onSubmit: (clientId: string, date: string, time: string, notes: string, entries: ServiceEntry[]) => Promise<void>;
  onNewClient: (name: string, phone: string, address: string) => Promise<ClientItem | null>;
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
  const [date, setDate] = useState(defaultValues?.date || dateStr);
  const [time, setTime] = useState(defaultValues?.time || prefillTime || "09:00");
  const [notes, setNotes] = useState(defaultValues?.notes || "");
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>(
    defaultValues?.serviceEntries?.length
      ? defaultValues.serviceEntries
      : [{ service_id: "", staff_id: prefillStaffId || "", is_parallel: false }]
  );
  const [submitting, setSubmitting] = useState(false);

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

  function updateEntry(idx: number, field: keyof ServiceEntry, value: string | boolean) {
    const updated = [...serviceEntries];
    updated[idx] = { ...updated[idx], [field]: value };
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
  const totalPrice = serviceEntries.reduce((sum, e) => {
    const svc = services.find((s) => s.id === e.service_id);
    return sum + (svc?.price || 0);
  }, 0);

  const startMin = timeToMinutes(time);
  const endTimeStr = minutesToTime(startMin + totalDuration);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    let clientId = selectedClientId;

    if (clientMode === "new") {
      if (!newClientName.trim()) { setSubmitting(false); return; }
      const newClient = await onNewClient(newClientName, newClientPhone, newClientAddress);
      if (!newClient) { setSubmitting(false); return; }
      clientId = newClient.id;
    }

    if (!clientId) { setSubmitting(false); return; }

    const validEntries = serviceEntries.filter((e) => e.service_id && e.staff_id);
    if (validEntries.length === 0) {
      setSubmitting(false);
      return;
    }

    await onSubmit(clientId, date, time, notes, validEntries);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">Client *</label>
          <button type="button" onClick={() => setClientMode(clientMode === "existing" ? "new" : "existing")}
            className="text-xs text-violet-600 hover:text-violet-800">
            {clientMode === "existing" ? "Add new client" : "Select existing"}
          </button>
        </div>

        {clientMode === "existing" ? (
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
            <option value="">Select a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>
            ))}
          </select>
        ) : (
          <div className="space-y-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
            <input type="text" placeholder="Client name *" value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)} required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            <div className="grid grid-cols-2 gap-2">
              <input type="tel" placeholder="Phone" value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
              <input type="text" placeholder="Location" value={newClientAddress}
                onChange={(e) => setNewClientAddress(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Time *</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Services *</label>
          <button type="button" onClick={addServiceEntry}
            className="text-xs text-violet-600 hover:text-violet-800 font-medium">+ Add service</button>
        </div>

        <div className="space-y-3">
          {serviceEntries.map((entry, idx) => {
            const selectedService = services.find((s) => s.id === entry.service_id);
            return (
              <div key={idx} className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                {idx > 0 && (
                  <div className="flex items-center gap-3 mb-2 pb-2 border-b border-gray-200">
                    <span className="text-xs text-gray-500">Timing:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`timing-${idx}`}
                        checked={!entry.is_parallel}
                        onChange={() => updateEntry(idx, "is_parallel", false)}
                        className="text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-xs text-gray-700">After previous</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`timing-${idx}`}
                        checked={entry.is_parallel}
                        onChange={() => updateEntry(idx, "is_parallel", true)}
                        className="text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-xs text-gray-700">Same time</span>
                    </label>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <select value={entry.service_id} onChange={(e) => updateEntry(idx, "service_id", e.target.value)}
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
                      <option value="">Select service</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {getServiceName(s)} ({s.duration_minutes} min, AED {s.price})
                        </option>
                      ))}
                    </select>

                    <select value={entry.staff_id} onChange={(e) => updateEntry(idx, "staff_id", e.target.value)}
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
                      <option value="">Assign staff *</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}{s.job_title ? ` (${s.job_title})` : ""}
                        </option>
                      ))}
                    </select>

                    {selectedService && (
                      <p className="text-xs text-gray-500">
                        {selectedService.duration_minutes} min · AED {selectedService.price}
                      </p>
                    )}
                  </div>

                  {serviceEntries.length > 1 && (
                    <button type="button" onClick={() => removeServiceEntry(idx)}
                      className="mt-1 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {totalDuration > 0 && (
          <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between text-violet-700">
              <span className="font-medium">
                {formatTime12Short(time)} - {formatTime12Short(endTimeStr)} ({formatDuration(totalDuration)})
              </span>
              <span className="font-medium">AED {totalPrice}</span>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
