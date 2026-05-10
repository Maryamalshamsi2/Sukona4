"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import MarkPaidModal from "@/components/mark-paid-modal";
import PhoneInput from "@/components/phone-input";
import { useUndo } from "@/components/undo-toast";
import { useCurrentUser } from "@/lib/user-context";
import { getClients, addClient, updateClient, deleteClient, getClientAppointments } from "./actions";
import {
  getStaffMembers,
  getClients as getClientsForForm,
  getServices,
  addClientQuick,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  markNoShow,
  deleteAppointment,
  getBundlesForBooking,
  getStaffSchedulesForDate,
} from "../calendar/actions";
import {
  AppointmentData,
  StaffMember,
  ClientItem,
  ServiceItem,
  BundleForBooking,
  STATUS_LABELS,
  formatTime12Short,
  getApptTotalDuration,
  getApptEndTime,
  getApptTotal,
  DetailView,
  AppointmentForm,
  timeToMinutes,
} from "@/lib/calendar-shared";
import type { Client } from "@/types";

function formatDateLabel(dateStr: string) {
  // Parse "YYYY-MM-DD" without timezone shift
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface ClientsViewProps {
  initialClients: Client[];
}

export default function ClientsView({ initialClients }: ClientsViewProps) {
  const currentUser = useCurrentUser();
  const isStaff = currentUser?.role === "staff";
  const undo = useUndo();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  // Free-text filter applied to name / phone / address. Case-insensitive,
  // matches against normalized phone (digits only) so "0501234567" finds
  // "+971 50 123 4567" and vice-versa.
  const [searchQuery, setSearchQuery] = useState("");

  // ---- Client appointments list modal ----
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listClient, setListClient] = useState<Client | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [clientAppointments, setClientAppointments] = useState<AppointmentData[]>([]);

  // ---- Appointment detail / edit / mark-paid ----
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);

  // Supporting data for AppointmentForm
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [allClientsForForm, setAllClientsForForm] = useState<ClientItem[]>([]);
  const [allServices, setAllServices] = useState<ServiceItem[]>([]);
  const [allBundles, setAllBundles] = useState<BundleForBooking[]>([]);
  const [staffScheduleMap, setStaffScheduleMap] = useState<Map<string, { isOff: boolean; startMin: number; endMin: number }>>(new Map());
  const [formDataLoaded, setFormDataLoaded] = useState(false);

  async function loadClients() {
    try {
      const data = await getClients();
      setClients(data);
    } catch {
      setError("Failed to load clients");
    }
  }

  // Lazy-load shared form data (staff/services/bundles) the first time we open
  // an appointment list. These feed DetailView & AppointmentForm.
  async function ensureFormDataLoaded(appointmentDate?: string) {
    if (formDataLoaded && !appointmentDate) return;
    try {
      const [staffData, clientData, serviceData, bundleData] = await Promise.all([
        getStaffMembers(),
        getClientsForForm(),
        getServices(),
        getBundlesForBooking(),
      ]);
      setAllStaff(staffData);
      setAllClientsForForm(clientData);
      setAllServices(serviceData as ServiceItem[]);
      setAllBundles(bundleData as unknown as BundleForBooking[]);
      setFormDataLoaded(true);
    } catch {
      /* ignore */
    }
  }

  // Refresh the schedule map for the date we're editing (so the
  // AppointmentForm's out-of-hours warning reflects that day).
  async function loadSchedulesForDate(dateStr: string) {
    try {
      const schedData = await getStaffSchedulesForDate(dateStr);
      const map = new Map<string, { isOff: boolean; startMin: number; endMin: number }>();
      const offSet = new Set(schedData.daysOff.map((d: { profile_id: string }) => d.profile_id));
      for (const s of schedData.schedules) {
        if (offSet.has(s.profile_id)) {
          map.set(s.profile_id, { isOff: true, startMin: 0, endMin: 0 });
        } else if (s.is_day_off) {
          map.set(s.profile_id, { isOff: true, startMin: 0, endMin: 0 });
        } else if (s.start_time && s.end_time) {
          map.set(s.profile_id, {
            isOff: false,
            startMin: timeToMinutes(s.start_time.slice(0, 5)),
            endMin: timeToMinutes(s.end_time.slice(0, 5)),
          });
        }
      }
      for (const d of schedData.daysOff) {
        if (!map.has(d.profile_id)) {
          map.set(d.profile_id, { isOff: true, startMin: 0, endMin: 0 });
        }
      }
      setStaffScheduleMap(map);
    } catch {
      setStaffScheduleMap(new Map());
    }
  }

  function openAdd() {
    setEditing(null);
    setPhoneValue("");
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setPhoneValue(client.phone || "");
    setModalOpen(true);
  }

  async function openClientAppointments(client: Client) {
    setListClient(client);
    setListModalOpen(true);
    setListLoading(true);
    // Load appointments + form data in parallel
    await Promise.all([
      (async () => {
        try {
          const data = await getClientAppointments(client.id);
          setClientAppointments(data as unknown as AppointmentData[]);
        } catch {
          setClientAppointments([]);
        }
      })(),
      ensureFormDataLoaded(),
    ]);
    setListLoading(false);
  }

  async function refreshClientAppointments() {
    if (!listClient) return;
    try {
      const data = await getClientAppointments(listClient.id);
      setClientAppointments(data as unknown as AppointmentData[]);
    } catch {
      /* ignore */
    }
  }

  function openAppointmentDetail(appt: AppointmentData) {
    setSelectedAppointment(appt);
    setDetailModalOpen(true);
  }

  async function openAppointmentEdit() {
    if (!selectedAppointment) return;
    await loadSchedulesForDate(selectedAppointment.date);
    setDetailModalOpen(false);
    setEditModalOpen(true);
  }

  // ---- Optimistic action helpers ----
  // See home-view for the rationale. Same pattern: patch local state
  // immediately, fire server action without blocking, roll back on error.
  function patchClientAppt(id: string, patch: Partial<AppointmentData>) {
    setClientAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setSelectedAppointment((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  function handleStatusUpdate(status: string) {
    if (!selectedAppointment) return;
    setError(null);
    if (status === "paid") {
      setMarkPaidOpen(true);
      return;
    }
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    patchClientAppt(apptId, { status });
    void updateAppointmentStatus(apptId, status).then((result) => {
      if (result?.error) {
        setError(result.error);
        patchClientAppt(apptId, { status: prevStatus });
      }
    });
  }

  function handlePaidComplete() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    patchClientAppt(apptId, { status: "paid" });
    setMarkPaidOpen(false);
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    void updateAppointmentStatus(apptId, "paid").then((result) => {
      if (result?.error) {
        setError(result.error);
        patchClientAppt(apptId, { status: prevStatus });
      } else {
        // Targeted refetch to pull in the freshly-minted receipt fields.
        refreshClientAppointments();
      }
    });
  }

  function handleAppointmentCancel() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    const clientName = selectedAppointment.clients?.name || "appointment";
    patchClientAppt(apptId, { status: "cancelled" });
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    void cancelAppointment(apptId).then((result) => {
      if (result?.error) {
        setError(result.error);
        patchClientAppt(apptId, { status: prevStatus });
        return;
      }
      undo.show(`Cancelled · ${clientName}`, () => {
        patchClientAppt(apptId, { status: prevStatus });
        void updateAppointmentStatus(apptId, prevStatus);
      });
    });
  }

  function handleAppointmentNoShow() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    const clientName = selectedAppointment.clients?.name || "appointment";
    patchClientAppt(apptId, { status: "no_show" });
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    void markNoShow(apptId).then((result) => {
      if (result?.error) {
        setError(result.error);
        patchClientAppt(apptId, { status: prevStatus });
        return;
      }
      undo.show(`Marked no-show · ${clientName}`, () => {
        patchClientAppt(apptId, { status: prevStatus });
        void updateAppointmentStatus(apptId, prevStatus);
      });
    });
  }

  function handleAppointmentDelete() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const removed = selectedAppointment;
    const clientName = selectedAppointment.clients?.name || "appointment";
    setClientAppointments((prev) => prev.filter((a) => a.id !== apptId));
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    let undone = false;
    const timer = setTimeout(() => {
      if (undone) return;
      void deleteAppointment(apptId).then((result) => {
        if (result?.error) {
          setError(result.error);
          setClientAppointments((prev) => {
            if (prev.some((a) => a.id === apptId)) return prev;
            return [...prev, removed];
          });
        }
      });
    }, 6000);
    undo.show(
      `Deleted · ${clientName}`,
      () => {
        undone = true;
        clearTimeout(timer);
        setClientAppointments((prev) => {
          if (prev.some((a) => a.id === apptId)) return prev;
          return [...prev, removed];
        });
      },
      6000,
    );
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = editing
      ? await updateClient(editing.id, formData)
      : await addClient(formData);

    if (result.error) {
      setError(result.error);
      return;
    }

    setModalOpen(false);
    setEditing(null);
    loadClients();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this client?")) return;
    const result = await deleteClient(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    loadClients();
  }

  // Filter clients by name / phone / address. Phone match strips non-digits
  // on both sides so a query like "501234567" finds "+971 50 123 4567".
  const trimmedQuery = searchQuery.trim();
  const queryLower = trimmedQuery.toLowerCase();
  const queryDigits = trimmedQuery.replace(/\D/g, "");
  const filteredClients = !trimmedQuery
    ? clients
    : clients.filter((c) => {
        if (c.name?.toLowerCase().includes(queryLower)) return true;
        if (c.address?.toLowerCase().includes(queryLower)) return true;
        if (queryDigits && c.phone) {
          const phoneDigits = c.phone.replace(/\D/g, "");
          if (phoneDigits.includes(queryDigits)) return true;
        }
        return false;
      });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">Clients</h1>
        </div>
        {/* Desktop add button. Mobile gets a thumb-zone FAB at the
            bottom of the screen instead — see below. */}
        {!isStaff && (
          <button
            onClick={openAdd}
            aria-label="Add client"
            className="hidden shrink-0 sm:flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Search box. Hidden when there are no clients yet — the empty
          state below covers that case and a search field would be
          confusing on an empty list. */}
      {clients.length > 0 && (
        <div className="relative mt-4">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, or location"
            className="w-full rounded-xl border-[1.5px] border-neutral-200 bg-white pl-10 pr-4 py-2.5 text-body-sm transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 text-body-sm text-error-700">{error}</p>
      )}

      {clients.length === 0 ? (
        // First-time empty: friendly icon, headline, and a primary
        // action so the user has somewhere to go from a blank list.
        // Staff can't add clients, so they get the icon + headline only.
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl ring-1 ring-border bg-white px-6 py-14 text-center">
          <svg className="h-12 w-12 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <h2 className="mt-4 text-body font-semibold text-text-primary">No clients yet</h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            {isStaff ? "Your owner hasn\u2019t added any clients." : "Add your first client to start booking appointments."}
          </p>
          {!isStaff && (
            <button
              type="button"
              onClick={openAdd}
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add your first client
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl ring-1 ring-border bg-white">
          {/* No-results state inside the card so the search box stays visible. */}
          {filteredClients.length === 0 && (
            <div className="px-6 py-10 text-center text-body-sm text-text-secondary">
              No clients match {`"${trimmedQuery}"`}.
            </div>
          )}

          {/* Desktop: table */}
          <div className={`hidden ${filteredClients.length > 0 ? "sm:block" : ""}`}>
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-border bg-surface-hover">
                <tr>
                  <th className="px-5 py-4 font-semibold text-text-secondary">Name</th>
                  <th className="px-5 py-4 font-semibold text-text-secondary">Phone</th>
                  <th className="px-5 py-4 font-semibold text-text-secondary">Location</th>
                  <th className="px-5 py-4 font-semibold text-text-secondary">Notes</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-surface-hover">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openClientAppointments(client)}
                        className="font-semibold text-text-primary hover:text-primary-700 hover:underline underline-offset-2 transition-colors text-left"
                      >
                        {client.name}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {client.phone ? (
                        <a
                          href={`tel:${client.phone}`}
                          className="hover:text-text-primary hover:underline underline-offset-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {client.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      <div>
                        {client.address || "—"}
                        {client.map_link && (
                          <a href={client.map_link} target="_blank" rel="noopener noreferrer"
                            className="ml-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                            Map
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-text-secondary max-w-[200px] truncate">{client.notes || "—"}</td>
                    <td className="px-5 py-4">
                      {!isStaff && (
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => openEdit(client)} className="text-body-sm text-text-secondary hover:text-text-primary">Edit</button>
                          <button onClick={() => handleDelete(client.id)} className="text-body-sm text-error-500 hover:text-error-700">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="divide-y divide-black/[0.04] sm:hidden">
            {filteredClients.map((client) => (
              <div key={client.id} className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      onClick={() => openClientAppointments(client)}
                      className="font-semibold text-text-primary hover:text-primary-700 transition-colors text-left"
                    >
                      {client.name}
                    </button>
                    {client.phone && (
                      <p className="mt-1 text-body-sm text-text-secondary">
                        <a href={`tel:${client.phone}`} className="hover:text-text-primary">
                          {client.phone}
                        </a>
                      </p>
                    )}
                    {client.address && <p className="mt-1 text-body-sm text-text-secondary truncate">{client.address}</p>}
                    {client.map_link && (
                      <a href={client.map_link} target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        Open in Maps
                      </a>
                    )}
                  </div>
                  {!isStaff && (
                    <div className="flex shrink-0 gap-3">
                      <button onClick={() => openEdit(client)} className="p-1 text-body-sm text-text-secondary hover:text-text-primary">Edit</button>
                      <button onClick={() => handleDelete(client.id)} className="p-1 text-body-sm text-error-500">Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==== Add / Edit Client Modal ==== */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Edit Client" : "Add Client"}
      >
        <form action={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-body-sm font-semibold text-text-primary">Name *</label>
            <input id="name" name="name" type="text" required defaultValue={editing?.name ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5" />
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary">Phone *</label>
            <input type="hidden" name="phone" value={phoneValue} />
            <div className="mt-1.5">
              <PhoneInput value={phoneValue} onChange={setPhoneValue} required />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1.5">Location *</label>
            <div className="space-y-6 rounded-xl ring-1 ring-border p-4 bg-surface-hover">
              <div>
                <label htmlFor="address" className="block text-caption font-semibold text-text-secondary mb-1">Address (Area, Street, House/Floor/Apt) *</label>
                <input id="address" name="address" type="text" required defaultValue={editing?.address ?? ""}
                  placeholder="e.g. Al Reem Island, Tower 3, Floor 12, Apt 1204"
                  className="block w-full rounded-lg border border-neutral-200 px-4 py-2.5 text-body-sm text-text-primary focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-100 sm:py-2" />
              </div>
              <div>
                <label htmlFor="map_link" className="block text-caption font-semibold text-text-secondary mb-1">Google Maps Link (pin location)</label>
                <input id="map_link" name="map_link" type="url" defaultValue={editing?.map_link ?? ""}
                  placeholder="https://maps.google.com/..."
                  className="block w-full rounded-lg border border-neutral-200 px-4 py-2.5 text-body-sm text-text-primary focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary-100 sm:py-2" />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="block text-body-sm font-semibold text-text-primary">Notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition-all focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5" />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={() => { setModalOpen(false); setEditing(null); }}
              className="rounded-xl bg-surface-active px-5 py-2.5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100">Cancel</button>
            <button type="submit"
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all">
              {editing ? "Save" : "Add Client"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==== Client Appointments List Modal ==== */}
      <Modal
        open={listModalOpen}
        onClose={() => {
          setListModalOpen(false);
          setListClient(null);
          setClientAppointments([]);
        }}
        title={listClient ? `${listClient.name}'s Appointments` : "Appointments"}
      >
        {listLoading ? (
          <p className="py-6 text-center text-text-secondary">Loading...</p>
        ) : clientAppointments.length === 0 ? (
          <div className="py-10 text-center">
            <svg className="mx-auto h-12 w-12 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="mt-3 text-body-sm text-text-secondary">No appointments yet</p>
          </div>
        ) : (
          <div className="-mx-2 max-h-[65vh] overflow-y-auto">
            <div className="divide-y divide-border">
              {clientAppointments.map((appt) => {
                const endTime = getApptEndTime(appt);
                const duration = getApptTotalDuration(appt);
                const statusMeta = STATUS_LABELS[appt.status];
                const statusLabel = statusMeta?.label || appt.status;
                const statusColor = statusMeta?.color || "bg-neutral-100 text-text-primary";
                // Dim past appointments that didn't result in revenue
                // (cancelled or no-show) so the eye lands on completed
                // / paid rows first.
                const isInactive = appt.status === "cancelled" || appt.status === "no_show";

                const serviceNames = appt.appointment_services
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((as) => as.services?.name)
                  .filter(Boolean)
                  .join(", ");

                const staffNames = Array.from(
                  new Set(
                    appt.appointment_services
                      .map((as) => allStaff.find((s) => s.id === as.staff_id)?.full_name)
                      .filter((n): n is string => Boolean(n))
                  )
                ).join(", ");

                // Use the bundle-aware helper so two copies of the same
                // bundle each contribute their own price, and any
                // appointment-level adjustments (transport / discount /
                // override) are reflected.
                const totalPrice = getApptTotal(appt);

                return (
                  <button
                    key={appt.id}
                    onClick={() => openAppointmentDetail(appt)}
                    className={`flex w-full items-start gap-3 px-3 py-3.5 text-left transition-colors hover:bg-surface-hover ${
                      isInactive ? "opacity-60" : ""
                    }`}
                  >
                    {/* Left: date + time */}
                    <div className="w-[110px] shrink-0">
                      <p className="text-body-sm font-semibold text-text-primary">
                        {formatDateLabel(appt.date)}
                      </p>
                      <p className="mt-0.5 text-caption text-text-tertiary">
                        {formatTime12Short(appt.time)} – {formatTime12Short(endTime)}
                      </p>
                      <p className="mt-0.5 text-caption text-text-tertiary">{duration} min</p>
                    </div>

                    {/* Middle: services + staff */}
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm text-text-primary line-clamp-2">
                        {serviceNames || "—"}
                      </p>
                      {staffNames && (
                        <p className="mt-0.5 text-caption text-text-tertiary truncate">{staffNames}</p>
                      )}
                    </div>

                    {/* Right: status + total */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-caption font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                      <span className="text-caption font-semibold text-text-primary tabular-nums">
                        AED {totalPrice}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* ==== Appointment Detail Modal ==== */}
      <Modal
        open={detailModalOpen}
        onClose={() => { setDetailModalOpen(false); }}
        title="Appointment Details"
        variant="drawer"
      >
        {selectedAppointment && (
          <DetailView
            appointment={selectedAppointment}
            staff={allStaff}
            onStatusUpdate={handleStatusUpdate}
            onEdit={openAppointmentEdit}
            onCancel={handleAppointmentCancel}
            onNoShow={!isStaff ? handleAppointmentNoShow : undefined}
            onDelete={handleAppointmentDelete}
            onEditPayment={() => { setDetailModalOpen(false); setEditPaymentOpen(true); }}
            canEdit={currentUser?.role !== "staff"}
          />
        )}
      </Modal>

      {/* ==== Mark As Paid Modal ==== */}
      <MarkPaidModal
        open={markPaidOpen}
        appointmentId={selectedAppointment?.id ?? null}
        defaultAmount={selectedAppointment ? getApptTotal(selectedAppointment) : 0}
        clientName={selectedAppointment?.clients?.name}
        onClose={() => setMarkPaidOpen(false)}
        onPaid={handlePaidComplete}
      />

      {/* ==== Edit Payment Modal ==== */}
      <MarkPaidModal
        open={editPaymentOpen}
        clientName={selectedAppointment?.clients?.name}
        existingPayment={(() => {
          const list = selectedAppointment?.payments ?? [];
          if (list.length === 0) return null;
          return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
        })()}
        onClose={() => setEditPaymentOpen(false)}
        onPaid={() => {
          setEditPaymentOpen(false);
          setSelectedAppointment(null);
          refreshClientAppointments();
        }}
      />

      {/* ==== Edit Appointment Modal ==== */}
      <Modal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setSelectedAppointment(null); }}
        title="Edit Appointment"
      >
        {selectedAppointment && (
          <AppointmentForm
            dateStr={selectedAppointment.date}
            clients={allClientsForForm}
            services={allServices}
            staff={allStaff}
            bundles={allBundles}
            staffSchedules={staffScheduleMap}
            onSubmit={async (clientId, date, time, notes, entries, adjustments) => {
              setError(null);
              const result = await updateAppointment(selectedAppointment.id, clientId, date, time, notes, entries, adjustments);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelectedAppointment(null);
              refreshClientAppointments();
            }}
            onNewClient={async (name, phone, address, mapLink, notes) => {
              const result = await addClientQuick(name, phone, address, mapLink, notes);
              if (result.error) { setError(result.error); return null; }
              return result.client!;
            }}
            onCancel={() => { setEditModalOpen(false); setSelectedAppointment(null); }}
            submitLabel="Save"
            defaultValues={{
              client_id: selectedAppointment.client_id,
              date: selectedAppointment.date,
              time: selectedAppointment.time,
              notes: selectedAppointment.notes || "",
              transportation_charge: selectedAppointment.transportation_charge ?? null,
              discount_type: selectedAppointment.discount_type ?? null,
              discount_value: selectedAppointment.discount_value ?? null,
              total_override: selectedAppointment.total_override ?? null,
              duration_override: selectedAppointment.duration_override ?? null,
              serviceEntries: selectedAppointment.appointment_services
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((as2) => ({
                  service_id: as2.service_id,
                  staff_id: as2.staff_id || "",
                  is_parallel: as2.is_parallel,
                  // Carry the bundle association forward so editing
                  // preserves bundle pricing instead of dropping it.
                  bundle_id: as2.bundle_id ?? undefined,
                  bundle_instance_id: as2.bundle_instance_id ?? undefined,
                  bundle_name: as2.bundle_name ?? undefined,
                  bundle_total_price: as2.bundle_total_price ?? undefined,
                })),
            }}
          />
        )}
      </Modal>

      {/* ==== MOBILE FAB ==== */}
      {/* Thumb-zone primary action. Sits well above the bottom tab bar
          (~58px) plus the iPhone home-indicator safe area, so it reads
          as a clearly separate floating element. Owners + admins only —
          staff can't add clients. */}
      {!isStaff && (
        <button
          type="button"
          onClick={openAdd}
          aria-label="Add client"
          className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] right-6 z-40 sm:hidden flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-text-inverse shadow-lg active:scale-[0.97] transition-transform"
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}
    </div>
  );
}
