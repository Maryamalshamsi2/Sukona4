"use client";

import { useEffect, useState, useCallback } from "react";
import Modal from "@/components/modal";
import MarkPaidModal from "@/components/mark-paid-modal";
import {
  AppointmentData,
  StaffMember,
  ClientItem,
  ServiceItem,
  BundleForBooking,
  STATUS_FLOW,
  formatTime12Short,
  getApptTotalDuration,
  getApptTotal,
  getApptEndTime,
  formatDuration,
  DetailView,
  AppointmentForm,
} from "@/lib/calendar-shared";
import { getTodayAppointments, getRecentActivities } from "./actions";
import {
  getClients,
  addClientQuick,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  deleteAppointment,
  markShareSent,
} from "./calendar/actions";

export interface ActivityItem {
  id: string;
  action: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  performed_by: string | null;
  profiles: { full_name: string } | null;
}

type ActivityRange = "today" | "30days";

// Local-tz YYYY-MM-DD; see note in (dashboard)/page.tsx for why we don't use
// toISOString() here.
function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getRangeFromDate(range: ActivityRange): string {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
}

const RANGE_LABELS: Record<ActivityRange, string> = {
  today: "Today",
  "30days": "30 Days",
};

function timeAgo(dateStr: string) {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function actionIcon(action: string) {
  switch (action) {
    case "created":
      return "bg-green-400";
    case "status_updated":
      return "bg-blue-400";
    case "edited":
      return "bg-amber-400";
    case "cancelled":
      return "bg-red-300";
    case "time_changed":
      return "bg-purple-400";
    default:
      return "bg-gray-300";
  }
}

interface HomeViewProps {
  initialAppointments: AppointmentData[];
  initialActivities: ActivityItem[];
  initialStaff: StaffMember[];
  initialClients: ClientItem[];
  initialServices: ServiceItem[];
  initialBundles: BundleForBooking[];
  initialStaffScheduleMap: Map<string, { isOff: boolean; startMin: number; endMin: number }>;
  initialCurrentUser: { id: string; role: string; full_name: string } | null;
}

export default function HomeView({
  initialAppointments,
  initialActivities,
  initialStaff,
  initialClients,
  initialServices,
  initialBundles,
  initialStaffScheduleMap,
  initialCurrentUser,
}: HomeViewProps) {
  const [appointments, setAppointments] = useState<AppointmentData[]>(initialAppointments);
  const [activities, setActivities] = useState<ActivityItem[]>(initialActivities);
  const [staff] = useState<StaffMember[]>(initialStaff);
  const [clients, setClients] = useState<ClientItem[]>(initialClients);
  const [services] = useState<ServiceItem[]>(initialServices);
  const [bundles] = useState<BundleForBooking[]>(initialBundles);
  const [staffScheduleMap] = useState(initialStaffScheduleMap);
  const [currentUser] = useState(initialCurrentUser);
  const [error, setError] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<ActivityRange>("today");
  const [didMount, setDidMount] = useState(false);

  // Modals — same as calendar
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);

  const today = formatDate(new Date());

  const loadActivities = useCallback(async (range: ActivityRange) => {
    try {
      const fromDate = getRangeFromDate(range);
      const acts = await getRecentActivities(fromDate);
      setActivities(acts as unknown as ActivityItem[]);
    } catch { /* ignore */ }
  }, []);

  const reload = useCallback(async () => {
    try {
      const fromDate = getRangeFromDate(activityRange);
      const [appts, acts, clientData] = await Promise.all([
        getTodayAppointments(today),
        getRecentActivities(fromDate),
        getClients(),
      ]);
      setAppointments(appts as unknown as AppointmentData[]);
      setActivities(acts as unknown as ActivityItem[]);
      setClients(clientData);
    } catch { /* ignore */ }
  }, [today, activityRange]);

  // Reload activities when the filter range changes (skip first mount — we already have initial data)
  useEffect(() => {
    if (!didMount) { setDidMount(true); return; }
    loadActivities(activityRange);
  }, [activityRange, didMount, loadActivities]);

  // Check if an appointment is assigned to the current staff user
  function isMyAppointment(appt: AppointmentData) {
    if (!currentUser || currentUser.role !== "staff") return false;
    return appt.appointment_services.some((as2) => as2.staff_id === currentUser.id);
  }

  // ---- Modal handlers (same as calendar) ----
  function openDetail(appt: AppointmentData) {
    setSelectedAppointment(appt);
    setDetailModalOpen(true);
  }

  function openEdit() {
    setDetailModalOpen(false);
    setEditModalOpen(true);
  }

  async function handleStatusUpdate(status: string) {
    if (!selectedAppointment) return;
    setError(null);
    // Intercept the transition to "paid" — collect method + receipt first.
    if (status === "paid") {
      setMarkPaidOpen(true);
      return;
    }
    const result = await updateAppointmentStatus(selectedAppointment.id, status);
    if (result.error) { setError(result.error); return; }
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    reload();
  }

  async function handlePaidComplete() {
    if (!selectedAppointment) return;
    const result = await updateAppointmentStatus(selectedAppointment.id, "paid");
    if (result.error) { setError(result.error); return; }
    setMarkPaidOpen(false);
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    reload();
  }

  async function handleCancel() {
    if (!selectedAppointment || !confirm("Cancel this appointment?")) return;
    const result = await cancelAppointment(selectedAppointment.id);
    if (result.error) { setError(result.error); return; }
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    reload();
  }

  async function handleDelete() {
    if (!selectedAppointment) return;
    if (!confirm("Delete this appointment? It will be removed from records and reports. This cannot be undone.")) return;
    const result = await deleteAppointment(selectedAppointment.id);
    if (result.error) { setError(result.error); return; }
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    reload();
  }

  const statusLabel = (status: string) =>
    STATUS_FLOW.find((s) => s.value === status)?.label || status;
  const statusColor = (status: string) =>
    STATUS_FLOW.find((s) => s.value === status)?.color || "bg-neutral-100 text-text-primary";

  const isStaff = currentUser?.role === "staff";

  return (
    <div>
      {error && <p className="mb-5 rounded-xl bg-error-50 px-4 py-3 text-body-sm text-error-700">{error}</p>}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-7">

        {/* ---- Daily Appointments ---- */}
        <div className="rounded-2xl bg-white border border-[#EAEAEA] shadow-xs">
          <div className="flex items-center justify-between p-6 sm:px-6">
            <h2 className="text-title-section font-semibold text-text-primary">Today</h2>
            <span className="tabular-nums text-caption font-normal text-text-tertiary">
              {appointments.length}
            </span>
          </div>

          {appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 pb-12 pt-8 sm:px-6">
              <svg className="h-12 w-12 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <p className="mt-3 text-caption text-text-disabled">No appointments</p>
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto">
              {appointments.map((appt, i) => {
                const duration = getApptTotalDuration(appt);
                const endTime = getApptEndTime(appt);
                const isMine = isMyAppointment(appt);
                const location = appt.clients?.address;
                const isPaid = appt.status === "paid";

                return (
                  <button
                    key={appt.id}
                    onClick={() => openDetail(appt)}
                    className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover sm:px-6 ${
                      i > 0 ? "border-t border-gray-100/80" : ""
                    } ${
                      isStaff && isMine ? "border-l-[3px] border-l-primary-500" : ""
                    } ${isPaid ? "opacity-35" : ""}`}
                  >
                    {/* Time range */}
                    <div className="w-[100px] shrink-0 sm:w-[110px]">
                      <p className="text-body-sm font-semibold text-text-primary">
                        {formatTime12Short(appt.time)} – {formatTime12Short(endTime)}
                      </p>
                      <p className="mt-0.5 text-caption text-text-tertiary">{formatDuration(duration)}</p>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-semibold text-text-primary">
                        {appt.clients?.name || "Unknown"}
                      </p>
                      {location && (
                        <p className="mt-0.5 truncate text-caption text-text-tertiary">{location}</p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-medium ${statusColor(appt.status)}`}>
                      {statusLabel(appt.status)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- Recent Activity ---- */}
        <div className="rounded-2xl bg-white border border-[#EAEAEA] shadow-xs">
          <div className="flex items-center justify-between gap-2 p-6 sm:px-6">
            <h2 className="shrink-0 whitespace-nowrap text-title-section font-semibold text-text-primary">Activity</h2>
            <div className="flex shrink-0 rounded-lg bg-black/[0.04] p-0.5">
              {(["today", "30days"] as ActivityRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setActivityRange(range)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 text-caption font-semibold transition-colors ${
                    activityRange === range
                      ? "bg-white text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {RANGE_LABELS[range]}
                </button>
              ))}
            </div>
          </div>

          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 pb-12 pt-8 sm:px-6">
              <svg className="h-12 w-12 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <p className="mt-3 text-caption text-text-disabled">No activity</p>
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto">
              {activities.map((act, i) => (
                <div key={act.id} className={`flex items-start gap-3 px-5 py-4 sm:px-6 ${i > 0 ? "border-t border-neutral-100/60" : ""}`}>
                  {/* Action dot */}
                  <div className="mt-[7px] shrink-0">
                    <div className={`h-1.5 w-1.5 rounded-full ${actionIcon(act.action)}`} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm leading-snug text-text-primary">
                      {act.description}
                    </p>
                    {act.profiles?.full_name && (
                      <p className="mt-0.5 text-caption text-text-tertiary">
                        {act.profiles.full_name}
                      </p>
                    )}
                  </div>

                  {/* Time ago */}
                  <span className="mt-0.5 shrink-0 text-caption text-text-disabled">
                    {timeAgo(act.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ==== DETAIL MODAL (same as calendar) ==== */}
      <Modal open={detailModalOpen} onClose={() => { setDetailModalOpen(false); }} title="Appointment Details" variant="drawer">
        {selectedAppointment && (
          <DetailView
            appointment={selectedAppointment}
            staff={staff}
            onStatusUpdate={handleStatusUpdate}
            onEdit={openEdit}
            onCancel={handleCancel}
            onDelete={handleDelete}
            onEditPayment={() => { setDetailModalOpen(false); setEditPaymentOpen(true); }}
            onShareSent={async () => {
              if (!selectedAppointment) return;
              await markShareSent(selectedAppointment.id);
              reload();
            }}
            canEdit={currentUser?.role !== "staff"}
          />
        )}
      </Modal>

      {/* ==== MARK AS PAID MODAL ==== */}
      <MarkPaidModal
        open={markPaidOpen}
        appointmentId={selectedAppointment?.id ?? null}
        defaultAmount={selectedAppointment ? getApptTotal(selectedAppointment) : 0}
        clientName={selectedAppointment?.clients?.name}
        onClose={() => setMarkPaidOpen(false)}
        onPaid={handlePaidComplete}
      />

      {/* ==== EDIT PAYMENT MODAL ==== */}
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
          reload();
        }}
      />

      {/* ==== EDIT MODAL (same as calendar) ==== */}
      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setSelectedAppointment(null); }} title="Edit Appointment">
        {selectedAppointment && (
          <AppointmentForm
            dateStr={selectedAppointment.date}
            clients={clients}
            services={services}
            staff={staff}
            bundles={bundles}
            staffSchedules={staffScheduleMap}
            onSubmit={async (clientId, date, time, notes, entries, adjustments) => {
              setError(null);
              const result = await updateAppointment(selectedAppointment.id, clientId, date, time, notes, entries, adjustments);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelectedAppointment(null);
              reload();
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
              serviceEntries: selectedAppointment.appointment_services
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((as2) => ({
                  service_id: as2.service_id,
                  staff_id: as2.staff_id || "",
                  is_parallel: as2.is_parallel,
                })),
            }}
          />
        )}
      </Modal>
    </div>
  );
}
