import CalendarView from "./calendar-view";
import {
  AppointmentData,
  StaffMember,
  ClientItem,
  ServiceItem,
  BundleForBooking,
} from "@/lib/calendar-shared";
import {
  getAppointmentsForDate,
  getStaffMembers,
  getClients,
  getServices,
  getCalendarBlocks,
  getBundlesForBooking,
  getStaffSchedulesForDate,
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

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export default async function CalendarPage() {
  const today = formatDate(new Date());

  const [appts, staffData, clientData, serviceData, blockData, bundleData, schedData] =
    await Promise.all([
      getAppointmentsForDate(today),
      getStaffMembers(),
      getClients(),
      getServices(),
      getCalendarBlocks(today),
      getBundlesForBooking(),
      getStaffSchedulesForDate(today),
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
      initialClients={clientData as ClientItem[]}
      initialServices={serviceData as ServiceItem[]}
      initialBundles={bundleData as unknown as BundleForBooking[]}
      initialStaffScheduleMap={staffScheduleMap}
    />
  );
}
