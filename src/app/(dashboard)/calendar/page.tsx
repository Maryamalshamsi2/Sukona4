import CalendarView from "./calendar-view";
import {
  AppointmentData,
  StaffMember,
  ClientItem,
  ServiceItem,
  BundleForBooking,
  TeamGroup,
} from "@/lib/calendar-shared";
import {
  getAppointmentsForDate,
  getStaffMembers,
  getCalendarBlocks,
  getStaffSchedulesForDate,
  getTeamGroups,
} from "./actions";

interface CalendarBlockData {
  id: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  block_type: string;
}

// Returns YYYY-MM-DD in the *local* timezone. See note in (dashboard)/page.tsx
// — toISOString() would store appointments under the previous day's UTC date
// for users east of UTC, breaking the homepage "today" filter.
function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default async function CalendarPage() {
  const today = formatDate(new Date());

  // Only fetch what's needed for first paint. Clients / services /
  // bundles are only used inside the "New appointment" modal — the
  // client fetches those in the background after mount (mirrors the
  // home-view pattern). Cuts server-render time by ~300-500ms on
  // salons with 200+ clients.
  const [appts, staffData, blockData, schedData, teamGroupData] =
    await Promise.all([
      getAppointmentsForDate(today),
      getStaffMembers(),
      getCalendarBlocks(today),
      getStaffSchedulesForDate(today),
      getTeamGroups(),
    ]);

  // Build the staff schedule map server-side (same logic as the client used to do).
  const staffScheduleMap = new Map<string, { isOff: boolean; startMin: number; endMin: number }>();
  const offSet = new Set(schedData.daysOff.map((d: { profile_id: string }) => d.profile_id));
  for (const s of schedData.schedules) {
    if (offSet.has(s.profile_id)) {
      staffScheduleMap.set(s.profile_id, { isOff: true, startMin: 0, endMin: 0 });
    } else if (s.is_day_off) {
      staffScheduleMap.set(s.profile_id, { isOff: true, startMin: 0, endMin: 0 });
    } else if (s.start_time && s.end_time) {
      staffScheduleMap.set(s.profile_id, {
        isOff: false,
        startMin: timeToMinutes(s.start_time.slice(0, 5)),
        endMin: timeToMinutes(s.end_time.slice(0, 5)),
      });
    }
  }
  for (const d of schedData.daysOff) {
    if (!staffScheduleMap.has(d.profile_id)) {
      staffScheduleMap.set(d.profile_id, { isOff: true, startMin: 0, endMin: 0 });
    }
  }

  return (
    <CalendarView
      initialDateStr={today}
      initialAppointments={appts as unknown as AppointmentData[]}
      initialBlocks={blockData as CalendarBlockData[]}
      initialStaff={staffData as StaffMember[]}
      // Deferred to client (see CalendarView useEffect). Empty on
      // first paint — user only sees these inside the New Appointment
      // modal, which they can only open after mount when the
      // background fetch has already returned.
      initialClients={[] as ClientItem[]}
      initialServices={[] as ServiceItem[]}
      initialBundles={[] as BundleForBooking[]}
      initialStaffScheduleMap={staffScheduleMap}
      initialTeamGroups={(teamGroupData ?? []) as TeamGroup[]}
    />
  );
}
