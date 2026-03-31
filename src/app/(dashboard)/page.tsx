"use client";

import { useEffect, useState, useCallback } from "react";
import Modal from "@/components/modal";
import {
  AppointmentData,
  StaffMember,
  ClientItem,
  ServiceItem,
  ServiceEntry,
  STATUS_FLOW,
  formatTime12Short,
  getApptTotalDuration,
  getApptEndTime,
  formatDuration,
  DetailView,
  AppointmentForm,
} from "@/lib/calendar-shared";
import { getTodayAppointments, getRecentActivities, getCurrentUserProfile } from "./actions";
import {
  getStaffMembers,
  getClients,
  getServices,
  addClientQuick,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
} from "./calendar/actions";

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  performed_by: string | null;
  profiles: { full_name: string } | null;
}

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

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
      return "bg-green-500";
    case "status_updated":
      return "bg-blue-500";
    case "edited":
      return "bg-amber-500";
    case "cancelled":
      return "bg-red-400";
    case "time_changed":
      return "bg-purple-500";
    default:
      return "bg-gray-400";
  }
}

function actionLabel(action: string) {
  switch (action) {
    case "created": return "Created";
    case "status_updated": return "Status Updated";
    case "edited": return "Edited";
    case "cancelled": return "Cancelled";
    case "time_changed": return "Time Changed";
    case "block_created": return "Block Created";
    case "block_deleted": return "Block Deleted";
    default: return action;
  }
}

export default function HomePage() {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; full_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals — same as calendar
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);

  const today = formatDate(new Date());

  const loadData = useCallback(async () => {
    try {
      const [appts, acts, staffData, clientData, serviceData, profile] = await Promise.all([
        getTodayAppointments(today),
        getRecentActivities(),
        getStaffMembers(),
        getClients(),
        getServices(),
        getCurrentUserProfile(),
      ]);
      setAppointments(appts as unknown as AppointmentData[]);
      setActivities(acts as unknown as ActivityItem[]);
      setStaff(staffData);
      setClients(clientData);
      setServices(serviceData as ServiceItem[]);
      setCurrentUser(profile);
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [today]);

  const reload = useCallback(async () => {
    try {
      const [appts, acts, clientData] = await Promise.all([
        getTodayAppointments(today),
        getRecentActivities(),
        getClients(),
      ]);
      setAppointments(appts as unknown as AppointmentData[]);
      setActivities(acts as unknown as ActivityItem[]);
      setClients(clientData);
    } catch { /* ignore */ }
  }, [today]);

  useEffect(() => { loadData(); }, [loadData]);

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
    const result = await updateAppointmentStatus(selectedAppointment.id, status);
    if (result.error) { setError(result.error); return; }
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

  if (loading) return <p className="mt-8 text-center text-gray-500">Loading...</p>;

  const statusLabel = (status: string) =>
    STATUS_FLOW.find((s) => s.value === status)?.label || status;
  const statusColor = (status: string) =>
    STATUS_FLOW.find((s) => s.value === status)?.color || "bg-gray-100 text-gray-700";

  const isStaff = currentUser?.role === "staff";

  return (
    <div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ---- Daily Appointments ---- */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Today&apos;s Appointments</h2>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
              {appointments.length}
            </span>
          </div>

          {appointments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No appointments today
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {appointments.map((appt) => {
                const duration = getApptTotalDuration(appt);
                const endTime = getApptEndTime(appt);
                const isMine = isMyAppointment(appt);
                const location = appt.clients?.address;

                return (
                  <button
                    key={appt.id}
                    onClick={() => openDetail(appt)}
                    className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50 ${
                      isStaff && isMine ? "bg-violet-50/60 border-l-[3px] border-l-violet-400" : ""
                    }`}
                  >
                    {/* Time range */}
                    <div className="shrink-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatTime12Short(appt.time)} – {formatTime12Short(endTime)}
                      </p>
                      <p className="text-[10px] text-gray-400">{formatDuration(duration)}</p>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {appt.clients?.name || "Unknown"}
                      </p>
                      {location && (
                        <p className="truncate text-xs text-gray-500">{location}</p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusColor(appt.status)}`}>
                      {statusLabel(appt.status)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- Recent Activity ---- */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Activity</h2>
          </div>

          {activities.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No recent activity
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {activities.map((act) => (
                <div key={act.id} className="flex items-start gap-3 px-5 py-3">
                  {/* Action dot */}
                  <div className="mt-1.5 shrink-0">
                    <div className={`h-2 w-2 rounded-full ${actionIcon(act.action)}`} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">
                      {act.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">{actionLabel(act.action)}</span>
                      {act.profiles?.full_name && (
                        <> · by {act.profiles.full_name}</>
                      )}
                    </p>
                  </div>

                  {/* Time ago */}
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {timeAgo(act.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ==== DETAIL MODAL (same as calendar) ==== */}
      <Modal open={detailModalOpen} onClose={() => { setDetailModalOpen(false); }} title="Appointment Details">
        {selectedAppointment && (
          <DetailView
            appointment={selectedAppointment}
            staff={staff}
            onStatusUpdate={handleStatusUpdate}
            onEdit={openEdit}
            onCancel={handleCancel}
          />
        )}
      </Modal>

      {/* ==== EDIT MODAL (same as calendar) ==== */}
      <Modal open={editModalOpen} onClose={() => { setEditModalOpen(false); setSelectedAppointment(null); }} title="Edit Appointment">
        {selectedAppointment && (
          <AppointmentForm
            dateStr={selectedAppointment.date}
            clients={clients}
            services={services}
            staff={staff}
            onSubmit={async (clientId, date, time, notes, entries) => {
              setError(null);
              const result = await updateAppointment(selectedAppointment.id, clientId, date, time, notes, entries);
              if (result.error) { setError(result.error); return; }
              setEditModalOpen(false);
              setSelectedAppointment(null);
              reload();
            }}
            onNewClient={async (name, phone, address) => {
              const result = await addClientQuick(name, phone, address);
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
