import HomeView, { type ActivityItem } from "./home-view";
import { AppointmentData } from "@/lib/calendar-shared";
import { getTodayAppointments, getRecentActivities, getCurrentUserProfile } from "./actions";
import { getStaffSchedulesForDate } from "./calendar/actions";

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

  // Only the data needed for *first paint* is awaited here:
  //   - Today's appointments (the main list on the page)
  //   - Recent activities (the activity feed)
  //   - Current user profile (drives staff vs owner views)
  //   - Today's staff schedules (powers the calendar header timing)
  //
  // The booking-form data (staff list, clients, services, bundles)
  // used to be prefetched here in the same Promise.all, but the user
  // only sees that data once they tap "+ New" to open the booking
  // modal — which doesn't happen on first paint and rarely within
  // the first second. HomeView now fetches those in the background
  // after mount, so the dashboard renders ~2–4× faster on sign-in.
  const [appts, acts, profile, schedData] = await Promise.all([
    getTodayAppointments(today),
    getRecentActivities(todayStart),
    getCurrentUserProfile(),
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
      initialStaffScheduleMap={staffScheduleMap}
      initialCurrentUser={profile}
    />
  );
}
