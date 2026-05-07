import HomeView, { type ActivityItem } from "./home-view";
import {
  AppointmentData,
  StaffMember,
  ClientItem,
  ServiceItem,
  BundleForBooking,
} from "@/lib/calendar-shared";
import { getTodayAppointments, getRecentActivities, getCurrentUserProfile } from "./actions";
import {
  getStaffMembers,
  getClients,
  getServices,
  getBundlesForBooking,
  getStaffSchedulesForDate,
} from "./calendar/actions";

// Returns YYYY-MM-DD in the *local* timezone, not UTC. Using toISOString()
// here would cause an off-by-one day for users east of UTC because the calendar
// seeds selectedDate via `new Date(y, m-1, d)` which is local-midnight; that
// round-trips back through getFullYear/getMonth/getDate but NOT through
// toISOString. Symptom: appointments created in UAE for "today" stored under
// yesterday's UTC date and missed by the homepage's "today" filter.
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

export default async function HomePage() {
  const today = formatDate(new Date());
  const todayStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  ).toISOString();

  // Fetch all dashboard data in parallel on the server
  const [appts, acts, staffData, clientData, serviceData, profile, bundleData, schedData] =
    await Promise.all([
      getTodayAppointments(today),
      getRecentActivities(todayStart),
      getStaffMembers(),
      getClients(),
      getServices(),
      getCurrentUserProfile(),
      getBundlesForBooking(),
      getStaffSchedulesForDate(today),
    ]);

  // Build staff schedule map (same logic as the calendar page)
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
    <HomeView
      initialAppointments={appts as unknown as AppointmentData[]}
      initialActivities={acts as unknown as ActivityItem[]}
      initialStaff={staffData as StaffMember[]}
      initialClients={clientData as ClientItem[]}
      initialServices={serviceData as ServiceItem[]}
      initialBundles={bundleData as unknown as BundleForBooking[]}
      initialStaffScheduleMap={staffScheduleMap}
      initialCurrentUser={profile}
    />
  );
}
