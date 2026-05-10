"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Modal from "@/components/modal";
import MarkPaidModal from "@/components/mark-paid-modal";
import { useUndo } from "@/components/undo-toast";
import { useCurrentUser } from "@/lib/user-context";
import {
  StaffMember,
  ClientItem,
  ServiceItem,
  AppointmentData,
  ServiceEntry,
  STATUS_FLOW,
  formatTime12,
  formatTime12Short,
  timeToMinutes,
  minutesToTime,
  formatDuration,
  getServiceTimings,
  getApptTotalDuration,
  getApptTotal,
  getStaffServiceBlocks,
  getServiceName,
  DetailView,
  AppointmentForm,
  BundleForBooking,
} from "@/lib/calendar-shared";
import {
  getAppointmentsForDate,
  getCalendarBlocks,
  addClientQuick,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  markNoShow,
  deleteAppointment,
  updateAppointmentTime,
  updateAppointmentDuration,
  createCalendarBlock,
  createCalendarBlocksForStaff,
  updateCalendarBlock,
  updateCalendarBlockTimes,
  deleteCalendarBlock,
  getStaffSchedulesForDate,
  markShareSent,
} from "./actions";

// ---- Local Types ----

interface CalendarBlockData {
  id: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  block_type: string;
}

// ---- Constants ----

const HOUR_HEIGHT = 80;
const START_HOUR = 0;
const END_HOUR = 24;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const SNAP_MINUTES = 15;

// Appointment block color: light baby pink
const APPT_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-[#FFF8F0] border-[#FFD9A0] text-[#CC7700]",
  on_the_way: "bg-[#F0FAF2] border-[#B3E6BF] text-[#1B8736]",
  arrived: "bg-[#F0F7FF] border-[#B3D4FF] text-[#0062CC]",
  completed: "bg-[#F5F5F7] border-[#D1D1D6] text-[#48484A]",
  paid: "bg-[#F5F5F7]/60 border-[#D1D1D6]/50 text-[#48484A]/50",
  cancelled: "bg-red-50/60 border-red-200/50 text-red-400",
  no_show: "bg-purple-50/70 border-purple-200/60 text-purple-500",
};
// Calendar block color: light grey
const CAL_BLOCK_COLOR = "bg-neutral-100 border-neutral-200 text-text-primary";

// ---- Local Helpers ----

// Local-tz YYYY-MM-DD. See note in (dashboard)/page.tsx — toISOString() would
// cause the calendar's selectedDate (created from `new Date(y, m-1, d)` which
// is local-midnight) to convert back to a different UTC date for users east
// of UTC, leading to appointments being saved against the wrong day.
function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(date: Date) {
  // Example: "Sat 18 Apr"
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${day} ${month}`;
}

function snapMinutes(minutes: number) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

// ---- Date Picker Component ----

function DatePicker({ selected, onSelect }: { selected: Date; onSelect: (d: Date) => void }) {
  const [viewDate, setViewDate] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = formatDate(new Date());
  const selectedStr = formatDate(selected);

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthName = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Popover position: centered under the trigger on mobile (the trigger
  // sits in the middle of the top bar; left-aligning would overflow the
  // right edge), left-aligned on sm+ where the trigger is on the left
  // side and there is room to the right. max-w clamps in case the
  // viewport is narrower than the popover width.
  return (
    <div className="absolute top-full mt-1 z-50 w-72 max-w-[calc(100vw-1.5rem)] left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 rounded-xl bg-white p-3 shadow-lg ring-1 ring-black/5" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="rounded-lg p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-body-sm font-semibold text-text-primary">{monthName}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="rounded-lg p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-caption font-semibold text-text-tertiary py-1">{d}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const dateObj = new Date(year, month, day);
          const dateString = formatDate(dateObj);
          const isSelected = dateString === selectedStr;
          const isToday = dateString === today;
          return (
            <button
              key={day}
              onClick={() => onSelect(dateObj)}
              className={`rounded-lg py-1.5 text-body-sm transition-colors ${
                isSelected
                  ? "bg-neutral-900 text-text-inverse font-semibold"
                  : isToday
                  ? "bg-surface-active text-text-primary font-semibold"
                  : "text-text-primary hover:bg-surface-hover"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Main Component ----

export interface CalendarViewProps {
  initialDateStr: string;
  initialAppointments: AppointmentData[];
  initialBlocks: CalendarBlockData[];
  initialStaff: StaffMember[];
  initialClients: ClientItem[];
  initialServices: ServiceItem[];
  initialBundles: BundleForBooking[];
  initialStaffScheduleMap: Map<string, { isOff: boolean; startMin: number; endMin: number }>;
}

export default function CalendarView({
  initialDateStr,
  initialAppointments,
  initialBlocks,
  initialStaff,
  initialClients,
  initialServices,
  initialBundles,
  initialStaffScheduleMap,
}: CalendarViewProps) {
  const currentUser = useCurrentUser();
  const isStaff = currentUser?.role === "staff";
  const undo = useUndo();

  // Seed selectedDate from the server's initialDateStr so server + client agree.
  const [selectedDate, setSelectedDate] = useState(() => {
    const [y, m, d] = initialDateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  const [appointments, setAppointments] = useState<AppointmentData[]>(initialAppointments);
  const [blocks, setBlocks] = useState<CalendarBlockData[]>(initialBlocks);
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [clients, setClients] = useState<ClientItem[]>(initialClients);
  const [services, setServices] = useState<ServiceItem[]>(initialServices);
  const [bundles, setBundles] = useState<BundleForBooking[]>(initialBundles);
  const [staffScheduleMap, setStaffScheduleMap] =
    useState<Map<string, { isOff: boolean; startMin: number; endMin: number }>>(initialStaffScheduleMap);
  const [loading, setLoading] = useState(false);

  // Staff filter: empty set = show all
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [staffFilterOpen, setStaffFilterOpen] = useState(false);
  const staffFilterRef = useRef<HTMLDivElement>(null);
  const staffFilterMobileRef = useRef<HTMLDivElement>(null);

  // Date picker
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const datePickerDesktopRef = useRef<HTMLDivElement>(null);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  // Edit-payment modal — re-uses MarkPaidModal in "edit" mode. Opens
  // when the owner clicks "Edit payment" in the detail drawer.
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockDetailOpen, setBlockDetailOpen] = useState(false);
  const [blockEditOpen, setBlockEditOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlockData | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);

  // Calendar block drag/resize state
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragBlockOffsetY, setDragBlockOffsetY] = useState(0);
  const [dragBlockCurrentTop, setDragBlockCurrentTop] = useState(0);
  const dragBlockStartY = useRef<number | null>(null);
  const dragBlockPending = useRef<{ blockId: string; block: CalendarBlockData } | null>(null);
  const didBlockDrag = useRef(false);

  const [resizeBlockId, setResizeBlockId] = useState<string | null>(null);
  const [resizeBlockHeight, setResizeBlockHeight] = useState(0);
  const resizeBlockPending = useRef(false);

  // Current time indicator (minutes from midnight) — updates every 30 seconds
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // FAB (floating action button) for mobile
  const [fabOpen, setFabOpen] = useState(false);
  // Desktop "+ Add" dropdown
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);
  const addDropdownMenuRef = useRef<HTMLDivElement>(null);

  // Grid drag-to-create selection
  const [quickAction, setQuickAction] = useState<{
    x: number; y: number; startTime: string; endTime: string; staffId: string;
  } | null>(null);
  const quickActionRef = useRef<HTMLDivElement>(null);
  const [gridSelection, setGridSelection] = useState<{
    staffId: string; startMin: number; currentMin: number;
  } | null>(null);
  const gridDragging = useRef(false);

  // Drag state
  const [dragApptId, setDragApptId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragCurrentTop, setDragCurrentTop] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragPending = useRef<{ apptId: string; appt: AppointmentData; startMin: number } | null>(null);
  const didDrag = useRef(false);

  // Resize state
  const [resizeApptId, setResizeApptId] = useState<string | null>(null);
  const [resizeCurrentHeight, setResizeCurrentHeight] = useState(0);
  const resizePending = useRef(false);

  // Prefill time/staff when opening modals from grid click
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [prefillEndTime, setPrefillEndTime] = useState<string | null>(null);
  const [prefillStaffId, setPrefillStaffId] = useState<string | null>(null);

  const dateStr = formatDate(selectedDate);

  // Filtered staff list (empty selectedStaffIds = show all)
  const filteredStaff = selectedStaffIds.size === 0
    ? staff
    : staff.filter((s) => selectedStaffIds.has(s.id));

  // Dismiss staff filter dropdown on outside click
  useEffect(() => {
    if (!staffFilterOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        (staffFilterRef.current && staffFilterRef.current.contains(target)) ||
        (staffFilterMobileRef.current && staffFilterMobileRef.current.contains(target))
      ) return;
      setStaffFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [staffFilterOpen]);

  // Dismiss date picker on outside click
  useEffect(() => {
    if (!datePickerOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        datePickerRef.current?.contains(target) ||
        datePickerDesktopRef.current?.contains(target)
      ) return;
      setDatePickerOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [datePickerOpen]);

  // Dismiss add dropdown on outside click
  useEffect(() => {
    if (!addDropdownOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        (addDropdownRef.current && addDropdownRef.current.contains(target)) ||
        (addDropdownMenuRef.current && addDropdownMenuRef.current.contains(target))
      ) return;
      setAddDropdownOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addDropdownOpen]);

  // Dismiss quick-action popover on outside click
  useEffect(() => {
    if (!quickAction) return;
    function handleClick(e: MouseEvent) {
      if (quickActionRef.current && !quickActionRef.current.contains(e.target as Node)) {
        setQuickAction(null);
        setGridSelection(null);
      }
    }
    // Delay attaching so the mouseup that created the popover doesn't dismiss it
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClick); };
  }, [quickAction]);

  // Grid drag-to-create: mouse down
  function handleGridMouseDown(e: React.MouseEvent, staffId: string) {
    if (isStaff) return; // Staff cannot create appointments or blocks
    const target = e.target as HTMLElement;
    if (target.closest('[data-appt-block]') || target.closest('[data-cal-block]')) return;
    if (quickAction) { setQuickAction(null); return; }

    const gridEl = target.closest('[data-staff-grid]') as HTMLElement;
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const totalMinutes = START_HOUR * 60 + (clickY / HOUR_HEIGHT) * 60;
    const snapped = snapMinutes(totalMinutes);
    const clampedMin = Math.max(START_HOUR * 60, Math.min(snapped, (END_HOUR - 1) * 60));

    gridDragging.current = true;
    setGridSelection({ staffId, startMin: clampedMin, currentMin: clampedMin + SNAP_MINUTES });
  }

  // Grid drag-to-create: mouse move
  function handleGridMouseMove(e: React.MouseEvent) {
    if (!gridDragging.current || !gridSelection) return;

    const target = e.target as HTMLElement;
    const gridEl = target.closest('[data-staff-grid]') as HTMLElement;
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const totalMinutes = START_HOUR * 60 + (clickY / HOUR_HEIGHT) * 60;
    const snapped = snapMinutes(totalMinutes);
    const clampedMin = Math.max(START_HOUR * 60, Math.min(snapped, END_HOUR * 60));

    setGridSelection((prev) => prev ? { ...prev, currentMin: clampedMin } : null);
  }

  // Grid drag-to-create: mouse up
  function handleGridMouseUp(e: React.MouseEvent) {
    if (!gridDragging.current || !gridSelection) return;
    gridDragging.current = false;

    const selStart = Math.min(gridSelection.startMin, gridSelection.currentMin);
    const selEnd = Math.max(gridSelection.startMin, gridSelection.currentMin);
    // Ensure minimum 15 min selection
    const finalEnd = selEnd <= selStart ? selStart + SNAP_MINUTES : selEnd;

    setQuickAction({
      x: e.clientX,
      y: e.clientY,
      startTime: minutesToTime(selStart),
      endTime: minutesToTime(Math.min(finalEnd, END_HOUR * 60)),
      staffId: gridSelection.staffId,
    });
    // Keep selection visible until popover is dismissed
  }

  function openAddFromGrid() {
    if (!quickAction) return;
    setPrefillTime(quickAction.startTime);
    setPrefillStaffId(quickAction.staffId);
    setQuickAction(null);
    setGridSelection(null);
    setAddModalOpen(true);
  }

  function openBlockFromGrid() {
    if (!quickAction) return;
    setPrefillTime(quickAction.startTime);
    setPrefillEndTime(quickAction.endTime);
    setPrefillStaffId(quickAction.staffId);
    setQuickAction(null);
    setGridSelection(null);
    setBlockModalOpen(true);
  }

  const loadData = useCallback(async () => {
    // Date change: only date-scoped data is stale (appointments, blocks,
    // staff schedules). Staff / clients / services / bundles are session-
    // wide and don't change between dates — refetching them every time
    // the user tapped next-day was the bulk of the perceived lag.
    //
    // Clear appointments + blocks immediately so the grid shows the new
    // empty state during the fetch instead of yesterday's appointments
    // sitting under today's date label.
    setLoading(true);
    setAppointments([]);
    setBlocks([]);
    try {
      const [appts, blockData, schedData] = await Promise.all([
        getAppointmentsForDate(dateStr),
        getCalendarBlocks(dateStr),
        getStaffSchedulesForDate(dateStr),
      ]);
      setAppointments(appts as unknown as AppointmentData[]);
      setBlocks(blockData as CalendarBlockData[]);

      // Build schedule map
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
      // Also mark staff with one-off day off but no schedule row
      for (const d of schedData.daysOff) {
        if (!map.has(d.profile_id)) {
          map.set(d.profile_id, { isOff: true, startMin: 0, endMin: 0 });
        }
      }
      setStaffScheduleMap(map);
    } catch {
      undo.error("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  // Targeted reloads. Most in-page mutations only invalidate one slice
  // of the data — refetching everything (clients especially, which is
  // 200+ rows) was the biggest remaining source of perceived lag after
  // optimistic updates landed. Use the narrowest one that covers the
  // mutation; reload() (everything) is still here for the rare cases
  // (e.g. block edits) but most callers should pick a smaller variant.
  const reloadAppointments = useCallback(async () => {
    try {
      const appts = await getAppointmentsForDate(dateStr);
      setAppointments(appts as unknown as AppointmentData[]);
    } catch { /* ignore */ }
  }, [dateStr]);

  const reloadBlocks = useCallback(async () => {
    try {
      const blockData = await getCalendarBlocks(dateStr);
      setBlocks(blockData as CalendarBlockData[]);
    } catch { /* ignore */ }
  }, [dateStr]);

  // (Previously had a full reload() and a reloadClients() helper, but
  // every caller has been migrated to either reloadAppointments,
  // reloadBlocks, or to patching local state directly. Removed.)

  // Skip the very first run because the server already seeded today's data.
  // Subsequent date changes still trigger a fetch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    loadData();
  }, [loadData]);

  // ---- Auto-scroll to current time ----
  // Scrolls the calendar grid so the red "now" line sits about 20% from
  // the top of the viewport, matching the Google/iOS Calendar pattern:
  // a small bit of context behind, plenty of room ahead.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);

  const scrollToNow = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nowPx = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const target = Math.max(0, nowPx - container.clientHeight * 0.2);
    container.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
  }, [nowMinutes]);

  // On initial mount, if we're viewing today, scroll once to "now".
  // Doesn't re-fire on data refetches or on prev/next nav — only on first
  // render and on Today button clicks (handled inside goToday).
  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    const todayStr = formatDate(new Date());
    if (dateStr !== todayStr) return;
    hasAutoScrolledRef.current = true;
    // Small delay so the grid has its final laid-out height before we scroll.
    const t = setTimeout(() => scrollToNow(true), 100);
    return () => clearTimeout(t);
  }, [dateStr, scrollToNow]);

  // ---- Date navigation ----
  const goToday = () => {
    setSelectedDate(new Date());
    // Wait one tick for the date state to settle, then scroll.
    setTimeout(() => scrollToNow(true), 50);
  };
  const goPrev = () =>
    setSelectedDate((d) => { const p = new Date(d); p.setDate(p.getDate() - 1); return p; });
  const goNext = () =>
    setSelectedDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });

  // ---- Block position helpers ----
  function getBlockStyleFromMinutes(startMin: number, endMin: number) {
    const startOffset = startMin - START_HOUR * 60;
    const duration = endMin - startMin;
    const top = (startOffset / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT - 2, 28);
    return { top, height };
  }

  function getCalBlockStyle(block: CalendarBlockData) {
    const startMin = timeToMinutes(block.start_time) - START_HOUR * 60;
    const endMin = timeToMinutes(block.end_time) - START_HOUR * 60;
    const top = (startMin / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT - 2, 20);
    return { top: `${top}px`, height: `${height}px` };
  }

  const DRAG_THRESHOLD = 5; // pixels before drag starts

  // ---- Drag handlers ----
  function handlePointerDown(e: React.PointerEvent, svcStartMin: number, appt: AppointmentData) {
    if ((e.target as HTMLElement).dataset.resize) return;
    // Staff: open detail on click; no drag-to-reschedule.
    if (isStaff) {
      e.preventDefault();
      openDetail(appt);
      return;
    }
    e.preventDefault();
    didDrag.current = false;
    dragStartY.current = e.clientY;
    dragPending.current = { apptId: appt.id, appt, startMin: svcStartMin };
    (e.target as HTMLElement).closest('[data-appt-block]')?.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    // Handle resize move
    if (resizePending.current && resizeApptId) {
      e.preventDefault();
      setResizeCurrentHeight((prev) => Math.max(28, prev + e.movementY));
      didDrag.current = true;
      return;
    }

    // Handle drag pending (hasn't started yet)
    if (dragPending.current && dragStartY.current !== null && !dragApptId) {
      const dist = Math.abs(e.clientY - dragStartY.current);
      if (dist >= DRAG_THRESHOLD) {
        // Start actual drag
        const { appt } = dragPending.current;
        const apptStartMin = timeToMinutes(appt.time);
        const top = ((apptStartMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        setDragApptId(appt.id);
        setDragCurrentTop(top);
        const gridEl = (e.target as HTMLElement).closest('[data-staff-grid]');
        const rect = gridEl?.getBoundingClientRect();
        const gridTop = rect?.top || 0;
        setDragOffsetY(dragStartY.current - gridTop - top);
        didDrag.current = true;
      }
      return;
    }

    // Handle active drag
    if (dragApptId) {
      e.preventDefault();
      const gridEl = (e.target as HTMLElement).closest('[data-staff-grid]');
      const rect = gridEl?.getBoundingClientRect();
      const gridTop = rect?.top || 0;
      const newTop = e.clientY - gridTop - dragOffsetY;
      setDragCurrentTop(Math.max(0, newTop));
    }
  }

  async function handlePointerUp(appt: AppointmentData) {
    // Resize end
    if (resizePending.current && resizeApptId) {
      const durationMinutes = Math.round((resizeCurrentHeight / HOUR_HEIGHT) * 60);
      const snappedDuration = Math.max(SNAP_MINUTES, snapMinutes(durationMinutes));
      await updateAppointmentDuration(resizeApptId, snappedDuration);
      setResizeApptId(null);
      resizePending.current = false;
      // Only the appointment row changed — skip refetching blocks +
      // clients which are unchanged.
      reloadAppointments();
      return;
    }

    // Drag end
    if (dragApptId) {
      const totalMinutes = START_HOUR * 60 + (dragCurrentTop / HOUR_HEIGHT) * 60;
      const snapped = snapMinutes(totalMinutes);
      const clampedMin = Math.max(START_HOUR * 60, Math.min(snapped, (END_HOUR - 1) * 60));
      const newTime = minutesToTime(clampedMin);
      await updateAppointmentTime(dragApptId, newTime);
      setDragApptId(null);
      dragPending.current = null;
      dragStartY.current = null;
      reloadAppointments();
      return;
    }

    // Click (no drag happened)
    if (!didDrag.current) {
      openDetail(appt);
    }

    dragPending.current = null;
    dragStartY.current = null;
    didDrag.current = false;
  }

  // ---- Resize handlers ----
  function handleResizeStart(e: React.PointerEvent, appt: AppointmentData) {
    if (isStaff) return; // Staff cannot resize/reschedule
    e.preventDefault();
    e.stopPropagation();
    didDrag.current = true;
    resizePending.current = true;
    const duration = getApptTotalDuration(appt);
    const height = (duration / 60) * HOUR_HEIGHT;
    setResizeApptId(appt.id);
    setResizeCurrentHeight(height);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  // ---- Calendar block drag/resize/click handlers ----
  function handleBlockPointerDown(e: React.PointerEvent, block: CalendarBlockData) {
    if ((e.target as HTMLElement).dataset.resize) return;
    // Staff: open block detail on click; no drag-to-reschedule.
    if (isStaff) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedBlock(block);
      setBlockDetailOpen(true);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    didBlockDrag.current = false;
    dragBlockStartY.current = e.clientY;
    dragBlockPending.current = { blockId: block.id, block };
    (e.target as HTMLElement).closest('[data-cal-block]')?.setPointerCapture(e.pointerId);
  }

  function handleBlockPointerMove(e: React.PointerEvent) {
    // Resize
    if (resizeBlockPending.current && resizeBlockId) {
      e.preventDefault();
      setResizeBlockHeight((prev) => Math.max(20, prev + e.movementY));
      didBlockDrag.current = true;
      return;
    }
    // Drag pending
    if (dragBlockPending.current && dragBlockStartY.current !== null && !dragBlockId) {
      const dist = Math.abs(e.clientY - dragBlockStartY.current);
      if (dist >= DRAG_THRESHOLD) {
        const block = dragBlockPending.current.block;
        const startMin = timeToMinutes(block.start_time) - START_HOUR * 60;
        const top = (startMin / 60) * HOUR_HEIGHT;
        setDragBlockId(block.id);
        setDragBlockCurrentTop(top);
        const gridEl = (e.target as HTMLElement).closest('[data-staff-grid]');
        const rect = gridEl?.getBoundingClientRect();
        setDragBlockOffsetY(dragBlockStartY.current - (rect?.top || 0) - top);
        didBlockDrag.current = true;
      }
      return;
    }
    // Active drag
    if (dragBlockId) {
      e.preventDefault();
      const gridEl = (e.target as HTMLElement).closest('[data-staff-grid]');
      const rect = gridEl?.getBoundingClientRect();
      const newTop = e.clientY - (rect?.top || 0) - dragBlockOffsetY;
      setDragBlockCurrentTop(Math.max(0, newTop));
    }
  }

  async function handleBlockPointerUp(block: CalendarBlockData) {
    // Resize end
    if (resizeBlockPending.current && resizeBlockId) {
      const durationMin = Math.round((resizeBlockHeight / HOUR_HEIGHT) * 60);
      const snappedDur = Math.max(SNAP_MINUTES, snapMinutes(durationMin));
      const startMin = timeToMinutes(block.start_time);
      const newEnd = minutesToTime(startMin + snappedDur);
      await updateCalendarBlockTimes(resizeBlockId, block.start_time, newEnd);
      setResizeBlockId(null);
      resizeBlockPending.current = false;
      // Only blocks changed — skip appointments + clients refetch.
      reloadBlocks();
      return;
    }
    // Drag end
    if (dragBlockId) {
      const totalMin = START_HOUR * 60 + (dragBlockCurrentTop / HOUR_HEIGHT) * 60;
      const snapped = snapMinutes(totalMin);
      const clampedMin = Math.max(START_HOUR * 60, Math.min(snapped, (END_HOUR - 1) * 60));
      const duration = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
      const newStart = minutesToTime(clampedMin);
      const newEnd = minutesToTime(clampedMin + duration);
      await updateCalendarBlockTimes(dragBlockId, newStart, newEnd);
      setDragBlockId(null);
      dragBlockPending.current = null;
      dragBlockStartY.current = null;
      reloadBlocks();
      return;
    }
    // Click
    if (!didBlockDrag.current) {
      setSelectedBlock(block);
      setBlockDetailOpen(true);
    }
    dragBlockPending.current = null;
    dragBlockStartY.current = null;
    didBlockDrag.current = false;
  }

  function handleBlockResizeStart(e: React.PointerEvent, block: CalendarBlockData) {
    if (isStaff) return; // Staff cannot resize blocks
    e.preventDefault();
    e.stopPropagation();
    didBlockDrag.current = true;
    resizeBlockPending.current = true;
    const dur = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);
    setResizeBlockId(block.id);
    setResizeBlockHeight((dur / 60) * HOUR_HEIGHT);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  // ---- Modal handlers ----
  function openDetail(appt: AppointmentData) {
    setSelectedAppointment(appt);
    setDetailModalOpen(true);
  }

  function openEdit() {
    setDetailModalOpen(false);
    setEditModalOpen(true);
  }

  // ---- Optimistic action helpers ----
  // See home-view for the rationale. Same pattern: patch local state
  // immediately, fire server action without blocking, roll back on error.
  function patchAppointment(id: string, patch: Partial<AppointmentData>) {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setSelectedAppointment((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  function handleStatusUpdate(status: string) {
    if (!selectedAppointment) return;
    // Intercept the transition to "paid" — collect method + receipt first.
    if (status === "paid") {
      setMarkPaidOpen(true);
      return;
    }
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    patchAppointment(apptId, { status });
    void updateAppointmentStatus(apptId, status).then((result) => {
      if (result?.error) {
        undo.error(result.error);
        patchAppointment(apptId, { status: prevStatus });
      }
    });
  }

  // Called after the Mark-Paid modal successfully records a payment.
  function handlePaidComplete() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    patchAppointment(apptId, { status: "paid" });
    setMarkPaidOpen(false);
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    void updateAppointmentStatus(apptId, "paid").then((result) => {
      if (result?.error) {
        undo.error(result.error);
        patchAppointment(apptId, { status: prevStatus });
      } else {
        // Single targeted refetch so the freshly-minted receipt_token +
        // payments rows make it into the appointments list.
        getAppointmentsForDate(dateStr)
          .then((fresh) => setAppointments(fresh as unknown as AppointmentData[]))
          .catch(() => { /* non-critical */ });
      }
    });
  }

  function handleCancel() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    const clientName = selectedAppointment.clients?.name || "appointment";
    patchAppointment(apptId, { status: "cancelled" });
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    void cancelAppointment(apptId).then((result) => {
      if (result?.error) {
        undo.error(result.error);
        patchAppointment(apptId, { status: prevStatus });
        return;
      }
      undo.show(`Cancelled · ${clientName}`, () => {
        patchAppointment(apptId, { status: prevStatus });
        void updateAppointmentStatus(apptId, prevStatus);
      });
    });
  }

  function handleNoShow() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const prevStatus = selectedAppointment.status;
    const clientName = selectedAppointment.clients?.name || "appointment";
    patchAppointment(apptId, { status: "no_show" });
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    void markNoShow(apptId).then((result) => {
      if (result?.error) {
        undo.error(result.error);
        patchAppointment(apptId, { status: prevStatus });
        return;
      }
      undo.show(`Marked no-show · ${clientName}`, () => {
        patchAppointment(apptId, { status: prevStatus });
        void updateAppointmentStatus(apptId, prevStatus);
      });
    });
  }

  function handleDelete() {
    if (!selectedAppointment) return;
    const apptId = selectedAppointment.id;
    const removed = selectedAppointment;
    const clientName = selectedAppointment.clients?.name || "appointment";
    // Defer the hard delete by 6s so the user can undo. The toast
    // shows immediately, the appointment is removed from the list
    // optimistically; if the timer fires the server delete runs.
    setAppointments((prev) => prev.filter((a) => a.id !== apptId));
    setDetailModalOpen(false);
    setSelectedAppointment(null);
    let undone = false;
    const timer = setTimeout(() => {
      if (undone) return;
      void deleteAppointment(apptId).then((result) => {
        if (result?.error) {
          undo.error(result.error);
          setAppointments((prev) => {
            if (prev.some((a) => a.id === apptId)) return prev;
            return [...prev, removed].sort((a, b) => a.time.localeCompare(b.time));
          });
        }
      });
    }, 6000);
    undo.show(
      `Deleted · ${clientName}`,
      () => {
        undone = true;
        clearTimeout(timer);
        setAppointments((prev) => {
          if (prev.some((a) => a.id === apptId)) return prev;
          return [...prev, removed].sort((a, b) => a.time.localeCompare(b.time));
        });
      },
      6000,
    );
  }

  // Get appointments for a specific staff member (those that have at least one service assigned to them)
  // "Orphan" appointments are appointments with no visible owner — either:
  //   - no appointment_services rows at all (legacy / old data), OR
  //   - every assigned staff_id is hidden from the calendar (owner toggled
  //     "Appears on calendar" off — e.g. driver, manager). Without this we'd
  //     silently lose those appointments from the grid.
  const visibleStaffIds = new Set(staff.map((s) => s.id));
  const orphanAppts = appointments.filter((a) => {
    if (a.appointment_services.length === 0) return true;
    return !a.appointment_services.some(
      (as2) => as2.staff_id && visibleStaffIds.has(as2.staff_id)
    );
  });

  function getStaffAppointments(staffId: string, staffIdx: number) {
    const assigned = appointments.filter((a) =>
      a.appointment_services.some((as2) => as2.staff_id === staffId)
    );
    // Show orphan appointments on the first staff column so they're visible
    if (staffIdx === 0) return [...assigned, ...orphanAppts];
    return assigned;
  }

  function getStaffBlocks(staffId: string) {
    return blocks.filter((b) => b.staff_id === staffId);
  }

  // Note: previously this blanked the entire page with "Loading..."
  // whenever the date changed. That destroyed the surrounding context
  // (top bar, navigation arrows). Now `loading` only drives a small
  // top-bar indicator below; the cleared appointments + blocks act as
  // the implicit loading state for the grid itself.

  const isToday = formatDate(new Date()) === dateStr;

  return (
    <div className="absolute inset-0 flex flex-col px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-6 lg:px-8 lg:pt-4 lg:pb-8">
     <div className="relative flex flex-col flex-1 overflow-hidden rounded-2xl bg-white border border-[#EAEAEA] shadow-xs">
      {/* Date-change loading indicator: a thin animated bar at the
          very top of the calendar card. Tiny, doesn't shift layout,
          tells the user fresh data is on the way without yanking the
          context the way the old full-page "Loading..." did. */}
      {loading && (
        <div className="absolute left-0 right-0 top-0 z-30 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-[loadingbar_1s_linear_infinite] bg-neutral-900/60" />
        </div>
      )}
      {/* ---- Top bar ---- */}
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5 sm:hidden">
        <button onClick={goToday}
          className={`rounded-lg px-2.5 py-1 text-caption font-semibold ${isToday ? "bg-neutral-900 text-text-inverse" : "bg-surface-active text-text-secondary hover:bg-neutral-100"}`}
        >Today</button>

        <div className="flex items-center gap-1">
          <button onClick={goPrev} className="rounded-lg p-2 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setDatePickerOpen((v) => !v)}
              className="text-body-sm font-semibold text-text-primary hover:text-text-secondary transition-colors"
            >
              {formatDisplayDate(selectedDate)}
            </button>
            {datePickerOpen && <DatePicker selected={selectedDate} onSelect={(d) => { setSelectedDate(d); setDatePickerOpen(false); }} />}
          </div>
          <button onClick={goNext} className="rounded-lg p-2 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative" ref={staffFilterMobileRef}>
            <button
              onClick={() => setStaffFilterOpen((v) => !v)}
              className={`rounded-lg p-2 ${
                selectedStaffIds.size > 0 ? "text-text-primary bg-surface-active" : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>

            {staffFilterOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                <button
                  onClick={() => setSelectedStaffIds(new Set())}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                    selectedStaffIds.size === 0 ? "text-text-primary font-semibold" : "text-text-secondary"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                    selectedStaffIds.size === 0 ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                  }`}>
                    {selectedStaffIds.size === 0 && (
                      <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  All Staff
                </button>
                <div className="my-1 border-t border-border" />
                {staff.map((member) => {
                  const isSelected = selectedStaffIds.has(member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        setSelectedStaffIds((prev) => {
                          const next = new Set(prev);
                          if (isSelected) {
                            next.delete(member.id);
                          } else {
                            next.add(member.id);
                          }
                          return next;
                        });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-body-sm text-text-secondary hover:bg-surface-hover"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isSelected ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                      }`}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-active text-caption font-semibold text-text-primary">
                          {member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <span className={isSelected ? "font-semibold text-text-primary" : ""}>{member.full_name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop top bar */}
      <div className="hidden sm:flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <button onClick={goToday}
            className={`rounded-lg px-3 py-1.5 text-body-sm font-semibold ${isToday ? "bg-neutral-900 text-text-inverse" : "bg-surface-active text-text-secondary hover:bg-neutral-100"}`}
          >Today</button>
          <button onClick={goPrev} className="ml-2 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="relative" ref={datePickerDesktopRef}>
            <button
              onClick={() => setDatePickerOpen((v) => !v)}
              className="text-title-section font-semibold text-text-primary hover:text-text-secondary transition-colors"
            >
              {formatDisplayDate(selectedDate)}
            </button>
            {datePickerOpen && <DatePicker selected={selectedDate} onSelect={(d) => { setSelectedDate(d); setDatePickerOpen(false); }} />}
          </div>
          <button onClick={goNext} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-hover hover:text-text-secondary">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop staff filter */}
          <div className="relative" ref={staffFilterRef}>
            <button
              onClick={() => setStaffFilterOpen((v) => !v)}
              className={`relative flex items-center justify-center rounded-lg p-2 ${
                selectedStaffIds.size > 0
                  ? "bg-surface-active text-text-primary"
                  : "text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              {selectedStaffIds.size > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[9px] font-bold text-text-inverse">
                  {selectedStaffIds.size}
                </span>
              )}
            </button>
            {staffFilterOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                <button
                  onClick={() => setSelectedStaffIds(new Set())}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-body-sm hover:bg-surface-hover ${
                    selectedStaffIds.size === 0 ? "text-text-primary font-semibold" : "text-text-secondary"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                    selectedStaffIds.size === 0 ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                  }`}>
                    {selectedStaffIds.size === 0 && (
                      <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  All Staff
                </button>
                <div className="my-1 border-t border-border" />
                {staff.map((member) => {
                  const isSelected = selectedStaffIds.has(member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => {
                        setSelectedStaffIds((prev) => {
                          const next = new Set(prev);
                          if (isSelected) next.delete(member.id);
                          else next.add(member.id);
                          return next;
                        });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-body-sm text-text-secondary hover:bg-surface-hover"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isSelected ? "border-gray-900 bg-neutral-900" : "border-neutral-200"
                      }`}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-active text-caption font-semibold text-text-primary">
                          {member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <span className={isSelected ? "font-semibold text-text-primary" : ""}>{member.full_name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {!isStaff && (
            <div className="hidden sm:block" ref={addDropdownRef}>
              <button
                onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                aria-label="Add"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---- Calendar grid ---- */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-[#FAFAFA]">
        <div className="inline-flex min-w-full">
          {/* Time column */}
          <div className="sticky left-0 z-10 w-12 shrink-0 border-r border-border bg-[#FAFAFA] sm:w-16">
            <div className="h-[52px] border-b border-border sm:h-12" />
            <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
              {HOURS.map((hour) => (
                <div key={hour} className="absolute w-full text-right pr-2 text-caption text-text-tertiary"
                  style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT + 2}px` }}>
                  {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                </div>
              ))}
              {/* Current-time dot (only on today) */}
              {isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                <div
                  className="absolute -right-[5px] z-20 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#FAFAFA]"
                  style={{ top: `${((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT - 5}px` }}
                />
              )}
            </div>
          </div>

          {/* Staff columns */}
          {filteredStaff.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-text-secondary">
              {staff.length === 0 ? "No staff members yet. Add team members first." : "No staff selected. Use the filter to show staff columns."}
            </div>
          ) : (
            filteredStaff.map((member, idx) => {
              const memberAppts = getStaffAppointments(member.id, idx);
              const memberBlocks = getStaffBlocks(member.id);
              const isOwnColumn = isStaff && member.id === currentUser?.id;
              return (
                <div
                  key={member.id}
                  className="min-w-[100px] sm:min-w-[180px] flex-1 border-r border-border last:border-r-0"
                >
                  {/* Staff header — fixed height that matches the time-column
                      header so the body grids start at the same Y on every
                      column (otherwise the now-line and now-dot end up at
                      different vertical positions on mobile, where the staff
                      header would otherwise be content-sized).
                      For the staff's own column, the bottom divider is
                      upgraded from 1px grey to a 3px orange marker. */}
                  <div
                    className={`sticky top-0 z-10 flex h-[52px] items-center justify-center gap-2 bg-white px-2 sm:h-12 ${
                      isOwnColumn ? "border-b-[3px] border-b-primary-500" : "border-b border-border"
                    }`}
                  >
                    <span className="text-body-sm font-semibold text-text-primary truncate">{member.full_name}</span>
                  </div>

                  {/* Grid */}
                  <div
                    data-staff-grid
                    className={`relative ${isStaff ? "cursor-default" : "cursor-crosshair"}`}
                    onMouseDown={(e) => handleGridMouseDown(e, member.id)}
                    onMouseMove={handleGridMouseMove}
                    onMouseUp={handleGridMouseUp}
                    style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                  >
                    {HOURS.map((hour) => (
                      <div key={hour} className="absolute w-full border-t border-border"
                        style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }} />
                    ))}

                    {/* Current-time red line (only on today) */}
                    {isToday && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                      <div
                        className="absolute left-0 right-0 z-[15] pointer-events-none"
                        style={{ top: `${((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT}px` }}
                      >
                        <div className="h-px bg-red-500" />
                      </div>
                    )}

                    {/* Non-working hours overlay */}
                    {(() => {
                      const sched = staffScheduleMap.get(member.id);
                      if (!sched) return null;
                      if (sched.isOff) {
                        return (
                          <div
                            className="absolute left-0 right-0 bg-neutral-200/30 pointer-events-none z-[1]"
                            style={{ top: 0, height: `${HOURS.length * HOUR_HEIGHT}px` }}
                          >
                            <div className="flex items-center justify-center h-full">
                              <span className="text-caption font-medium text-text-tertiary bg-white/60 rounded px-2 py-0.5">Day Off</span>
                            </div>
                          </div>
                        );
                      }
                      const overlays = [];
                      if (sched.startMin > START_HOUR * 60) {
                        overlays.push(
                          <div
                            key="before"
                            className="absolute left-0 right-0 bg-neutral-200/30 pointer-events-none z-[1]"
                            style={{
                              top: 0,
                              height: `${((sched.startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT}px`,
                            }}
                          />
                        );
                      }
                      if (sched.endMin < END_HOUR * 60) {
                        overlays.push(
                          <div
                            key="after"
                            className="absolute left-0 right-0 bg-neutral-200/30 pointer-events-none z-[1]"
                            style={{
                              top: `${((sched.endMin - START_HOUR * 60) / 60) * HOUR_HEIGHT}px`,
                              height: `${((END_HOUR * 60 - sched.endMin) / 60) * HOUR_HEIGHT}px`,
                            }}
                          />
                        );
                      }
                      return overlays;
                    })()}

                    {/* Calendar blocks (buffer time) */}
                    {memberBlocks.map((block) => {
                      const isDraggingBlock = dragBlockId === block.id;
                      const isResizingBlock = resizeBlockId === block.id;
                      const style = getCalBlockStyle(block);
                      const displayTop = isDraggingBlock ? `${dragBlockCurrentTop}px` : style.top;
                      const displayHeight = isResizingBlock ? `${resizeBlockHeight}px` : style.height;
                      const dur = timeToMinutes(block.end_time) - timeToMinutes(block.start_time);

                      return (
                        <div
                          key={block.id}
                          data-cal-block
                          onPointerDown={(e) => handleBlockPointerDown(e, block)}
                          onPointerMove={handleBlockPointerMove}
                          onPointerUp={() => handleBlockPointerUp(block)}
                          style={{ top: displayTop, height: displayHeight }}
                          className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-xs overflow-hidden select-none transition-shadow hover:shadow-md z-10 ${CAL_BLOCK_COLOR} ${isStaff ? "cursor-pointer" : "cursor-grab"} ${isDraggingBlock ? "shadow-lg opacity-80 cursor-grabbing z-20" : ""}`}
                        >
                          <p className="font-semibold truncate">{block.title}</p>
                          <p className="opacity-70">
                            {formatTime12Short(block.start_time)} - {formatTime12Short(block.end_time)} ({formatDuration(dur)})
                          </p>
                          {/* Resize handle (hidden for staff) */}
                          {!isStaff && (
                            <div
                              data-resize="true"
                              onPointerDown={(e) => handleBlockResizeStart(e, block)}
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize rounded-b-lg hover:bg-black/10"
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Drag-to-create selection rectangle */}
                    {gridSelection && gridSelection.staffId === member.id && (() => {
                      const selStart = Math.min(gridSelection.startMin, gridSelection.currentMin);
                      const selEnd = Math.max(gridSelection.startMin, gridSelection.currentMin);
                      const finalEnd = selEnd <= selStart ? selStart + SNAP_MINUTES : selEnd;
                      const topPx = ((selStart - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const heightPx = ((finalEnd - selStart) / 60) * HOUR_HEIGHT;
                      return (
                        <div
                          className="absolute left-1 right-1 rounded-lg bg-neutral-200/60 border-2 border-neutral-400 pointer-events-none z-10"
                          style={{ top: `${topPx}px`, height: `${Math.max(heightPx, 10)}px` }}
                        >
                          <p className="px-2 py-1 text-caption font-semibold text-text-primary">
                            {formatTime12Short(minutesToTime(selStart))} - {formatTime12Short(minutesToTime(finalEnd))}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Appointment service blocks for this staff member */}
                    {memberAppts.map((appt) => {
                      const staffBlocks = getStaffServiceBlocks(appt, member.id);
                      const isOrphan = appt.appointment_services.length === 0;

                      // For orphan appointments, use the appointment time directly
                      let earliestStart: number, latestEnd: number;
                      if (staffBlocks.length > 0) {
                        earliestStart = Math.min(...staffBlocks.map((b) => b.startMin));
                        latestEnd = Math.max(...staffBlocks.map((b) => b.endMin));
                      } else if (isOrphan) {
                        earliestStart = timeToMinutes(appt.time);
                        latestEnd = earliestStart + (appt.duration_override || 60);
                      } else {
                        return null; // Has services but none assigned to this staff
                      }
                      // duration_override (set by drag-resize on the grid OR by
                      // editing the end time in the form) wins over the sum of
                      // service rows. Without this the block would keep its
                      // service-sum size even after the user shortens it.
                      if (appt.duration_override != null) {
                        const apptStartMin = timeToMinutes(appt.time);
                        earliestStart = apptStartMin;
                        latestEnd = apptStartMin + appt.duration_override;
                      }

                      const { top, height } = getBlockStyleFromMinutes(earliestStart, latestEnd);

                      const isDragging = dragApptId === appt.id;
                      const isResizing = resizeApptId === appt.id;
                      const colorClass = isOrphan
                        ? "bg-neutral-100 border-neutral-200 text-text-primary"
                        : (APPT_STATUS_COLORS[appt.status] || APPT_STATUS_COLORS.scheduled);

                      // When dragging, offset the visual position based on the appointment's original start
                      const apptStartMin = timeToMinutes(appt.time);
                      const offsetFromApptStart = earliestStart - apptStartMin;
                      const offsetPx = (offsetFromApptStart / 60) * HOUR_HEIGHT;
                      const displayTop = isDragging ? dragCurrentTop + offsetPx : top;
                      const displayHeight = isResizing ? resizeCurrentHeight : height;

                      // Time range label
                      const blockStartTime = minutesToTime(earliestStart);
                      const blockEndTime = minutesToTime(latestEnd);
                      const blockDuration = latestEnd - earliestStart;
                      const serviceNames = staffBlocks.map((b) => b.svc.services?.name || "").filter(Boolean);

                      return (
                        <div
                          key={`${appt.id}-${member.id}`}
                          data-appt-block
                          onPointerDown={(e) => handlePointerDown(e, earliestStart, appt)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={() => handlePointerUp(appt)}
                          className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-left text-xs overflow-hidden select-none transition-shadow hover:shadow-md ${colorClass} ${isStaff ? "cursor-pointer" : "cursor-grab"} ${isDragging ? "shadow-lg opacity-80 cursor-grabbing z-20" : ""}`}
                          style={{ top: `${displayTop}px`, height: `${displayHeight}px` }}
                        >
                          <p className="font-semibold truncate">{appt.clients?.name || "Unknown"}</p>
                          {appt.clients?.address && (
                            <p className="truncate opacity-70">{appt.clients.address}</p>
                          )}
                          <p className="opacity-80 font-semibold">
                            {formatTime12Short(blockStartTime)} - {formatTime12Short(blockEndTime)} ({formatDuration(blockDuration)})
                          </p>
                          {serviceNames.length > 0 && (
                            <p className="truncate opacity-60">{serviceNames.join(", ")}</p>
                          )}

                          {/* Resize handle (hidden for staff) */}
                          {!isStaff && (
                            <div
                              data-resize="true"
                              onPointerDown={(e) => handleResizeStart(e, appt)}
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize rounded-b-lg hover:bg-black/10"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ==== DESKTOP ADD DROPDOWN (rendered outside overflow container) ==== */}
      {addDropdownOpen && addDropdownRef.current && (() => {
        const rect = addDropdownRef.current!.getBoundingClientRect();
        return (
          <div ref={addDropdownMenuRef} className="fixed z-[9999]" style={{ top: rect.bottom + 6, right: window.innerWidth - rect.right }}>
            <div className="w-44 rounded-xl border border-border bg-white py-1 shadow-lg">
              <button
                onClick={() => { setAddModalOpen(true); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Appointment
              </button>
              <button
                onClick={() => { setBlockModalOpen(true); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Block Time
              </button>
            </div>
          </div>
        );
      })()}

      {/* ==== MOBILE FAB (floating action button) ====
           Sits well above the bottom tab bar (~58px tall) plus the
           iPhone home-indicator safe-area inset. Generous gap so the
           FAB reads as a clearly separate floating element. */}
      {!isStaff && (
      <div className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] right-6 z-40 sm:hidden">
        {fabOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setFabOpen(false)} />
            <div className="absolute bottom-16 right-0 flex flex-col items-stretch gap-2">
              <button
                onClick={() => { setFabOpen(false); setAddModalOpen(true); }}
                className="flex items-center gap-2 rounded-full bg-neutral-900 pl-4 pr-5 py-2.5 text-body-sm font-semibold text-text-inverse shadow-lg"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Appointment
              </button>
              <button
                onClick={() => { setFabOpen(false); setBlockModalOpen(true); }}
                className="flex items-center gap-2 rounded-full bg-white pl-4 pr-5 py-2.5 text-body-sm font-semibold text-text-primary shadow-lg ring-1 ring-black/5"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Block Time
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setFabOpen((v) => !v)}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform ${
            fabOpen ? "bg-neutral-700 rotate-45" : "bg-neutral-900"
          }`}
        >
          <svg className="h-7 w-7 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      )}

      {/* ==== QUICK ACTION POPOVER (click on grid) ==== */}
      {quickAction && (
        <div
          ref={quickActionRef}
          className="fixed z-50 rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-1 min-w-[180px]"
          style={{
            left: `${quickAction.x}px`,
            top: `${quickAction.y}px`,
            transform: "translate(-50%, -100%) translateY(-8px)",
          }}
        >
          <p className="px-3 py-1.5 text-caption font-normal text-text-tertiary">
            {formatTime12Short(quickAction.startTime)} - {formatTime12Short(quickAction.endTime)} · {staff.find((s) => s.id === quickAction.staffId)?.full_name}
          </p>
          <button
            onClick={openAddFromGrid}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-body-sm text-text-primary hover:bg-surface-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Appointment
          </button>
          <button
            onClick={openBlockFromGrid}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-body-sm text-text-primary hover:bg-surface-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            Block Time
          </button>
        </div>
      )}

      {/* ==== ADD APPOINTMENT MODAL ==== */}
      <Modal open={addModalOpen} onClose={() => { setAddModalOpen(false); setPrefillTime(null); setPrefillStaffId(null); }} title="New Appointment">
        <AppointmentForm
          dateStr={dateStr}
          clients={clients}
          services={services}
          staff={staff}
          bundles={bundles}
          staffSchedules={staffScheduleMap}
          prefillTime={prefillTime}
          prefillStaffId={prefillStaffId}
          onSubmit={async (clientId, date, time, notes, entries, adjustments) => {
                    const result = await createAppointment(clientId, date, time, notes, entries, adjustments);
            if (result.error) { undo.error(result.error); return; }
            setAddModalOpen(false);
            setPrefillTime(null);
            setPrefillStaffId(null);
            // Only appointments changed — skip refetching clients/blocks.
            reloadAppointments();
          }}
          onNewClient={async (name, phone, address, mapLink, notes) => {
            const result = await addClientQuick(name, phone, address, mapLink, notes);
            if (result.error) { undo.error(result.error); return null; }
            // Patch the new client into local state so the next form
            // open sees them — saves a round-trip vs reloadClients().
            setClients((prev) => [...prev, result.client!]);
            return result.client!;
          }}
          onCancel={() => { setAddModalOpen(false); setPrefillTime(null); setPrefillStaffId(null); }}
          submitLabel="Create"
        />
      </Modal>

      {/* ==== DETAIL MODAL ==== */}
      <Modal open={detailModalOpen} onClose={() => { setDetailModalOpen(false); }} title="Appointment Details" variant="drawer">
        {selectedAppointment && (
          <DetailView
            appointment={selectedAppointment}
            staff={staff}
            onStatusUpdate={handleStatusUpdate}
            onEdit={openEdit}
            onCancel={handleCancel}
            onNoShow={!isStaff ? handleNoShow : undefined}
            onDelete={handleDelete}
            onEditPayment={() => { setDetailModalOpen(false); setEditPaymentOpen(true); }}
            onShareSent={async () => {
              if (!selectedAppointment) return;
              await markShareSent(selectedAppointment.id);
              reloadAppointments();
            }}
            canEdit={!isStaff}
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
          reloadAppointments();
        }}
      />

      {/* ==== EDIT MODAL ==== */}
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
                        const result = await updateAppointment(selectedAppointment.id, clientId, date, time, notes, entries, adjustments);
              if (result.error) { undo.error(result.error); return; }
              setEditModalOpen(false);
              setSelectedAppointment(null);
              reloadAppointments();
            }}
            onNewClient={async (name, phone, address, mapLink, notes) => {
              const result = await addClientQuick(name, phone, address, mapLink, notes);
              if (result.error) { undo.error(result.error); return null; }
              setClients((prev) => [...prev, result.client!]);
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
                  // Carry the bundle association forward so editing
                  // preserves bundle pricing instead of dropping it.
                  bundle_id: as2.bundle_id ?? undefined,
                  bundle_instance_id: as2.bundle_instance_id ?? undefined,
                  bundle_name: as2.bundle_name ?? undefined,
                  bundle_total_price: as2.bundle_total_price ?? undefined,
                })),
              transportation_charge: selectedAppointment.transportation_charge ?? null,
              discount_type: selectedAppointment.discount_type ?? null,
              discount_value: selectedAppointment.discount_value ?? null,
              total_override: selectedAppointment.total_override ?? null,
              duration_override: selectedAppointment.duration_override ?? null,
            }}
          />
        )}
      </Modal>

      {/* ==== BLOCK TIME MODAL ==== */}
      <Modal open={blockModalOpen} onClose={() => { setBlockModalOpen(false); setPrefillTime(null); setPrefillEndTime(null); setPrefillStaffId(null); }} title="Block Time">
        <BlockTimeForm
          dateStr={dateStr}
          staff={staff}
          prefillTime={prefillTime}
          prefillEndTime={prefillEndTime}
          prefillStaffId={prefillStaffId}
          multiStaff
          onSubmit={async (staffIds, date, startTime, endTime, title, blockType) => {
                    const result = staffIds.length === 1
              ? await createCalendarBlock(staffIds[0], date, startTime, endTime, title, blockType)
              : await createCalendarBlocksForStaff(staffIds, date, startTime, endTime, title, blockType);
            if (result.error) { undo.error(result.error); return; }
            setBlockModalOpen(false);
            setPrefillTime(null);
            setPrefillEndTime(null);
            setPrefillStaffId(null);
            reloadBlocks();
          }}
          onCancel={() => { setBlockModalOpen(false); setPrefillTime(null); setPrefillEndTime(null); setPrefillStaffId(null); }}
        />
      </Modal>

      {/* ==== BLOCK DETAIL MODAL ==== */}
      <Modal open={blockDetailOpen} onClose={() => { setBlockDetailOpen(false); }} title="Block Time Details">
        {selectedBlock && (
          <div className="space-y-6">
            <div>
              <p className="text-body-sm text-text-secondary">Title</p>
              <p className="font-semibold text-text-primary">{selectedBlock.title}</p>
            </div>
            <div>
              <p className="text-body-sm text-text-secondary">Type</p>
              <p className="font-semibold text-text-primary capitalize">{selectedBlock.block_type}</p>
            </div>
            <div>
              <p className="text-body-sm text-text-secondary">Time</p>
              <p className="font-semibold text-text-primary">
                {formatTime12(selectedBlock.start_time)} - {formatTime12(selectedBlock.end_time)}
                {" "}({formatDuration(timeToMinutes(selectedBlock.end_time) - timeToMinutes(selectedBlock.start_time))})
              </p>
            </div>
            <div>
              <p className="text-body-sm text-text-secondary">Staff</p>
              <p className="font-semibold text-text-primary">
                {staff.find((s) => s.id === selectedBlock.staff_id)?.full_name || "Unknown"}
              </p>
            </div>
            {!isStaff && (
              <div className="flex gap-3 border-t border-border pt-4">
                <button
                  onClick={() => { setBlockDetailOpen(false); setBlockEditOpen(true); }}
                  className="flex-1 rounded-lg bg-surface-active px-4 py-2 text-body-sm font-semibold text-text-primary hover:bg-neutral-100"
                >Edit</button>
                <button
                  onClick={async () => {
                    if (!confirm("Delete this block?")) return;
                    await deleteCalendarBlock(selectedBlock.id);
                    setBlockDetailOpen(false);
                    setSelectedBlock(null);
                    reloadBlocks();
                  }}
                  className="flex-1 rounded-lg border border-error-200 px-4 py-2 text-body-sm font-semibold text-error-700 hover:bg-red-50"
                >Delete</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ==== BLOCK EDIT MODAL ==== */}
      <Modal open={blockEditOpen} onClose={() => { setBlockEditOpen(false); setSelectedBlock(null); }} title="Edit Block Time">
        {selectedBlock && (
          <BlockTimeForm
            dateStr={dateStr}
            staff={staff}
            prefillTime={selectedBlock.start_time}
            prefillEndTime={selectedBlock.end_time}
            prefillStaffId={selectedBlock.staff_id}
            defaultTitle={selectedBlock.title}
            defaultBlockType={selectedBlock.block_type}
            submitLabel="Save"
            onSubmit={async (staffIds, date, startTime, endTime, title, blockType) => {
                        const result = await updateCalendarBlock(selectedBlock.id, staffIds[0], startTime, endTime, title, blockType);
              if (result.error) { undo.error(result.error); return; }
              setBlockEditOpen(false);
              setSelectedBlock(null);
              reloadBlocks();
            }}
            onCancel={() => { setBlockEditOpen(false); setSelectedBlock(null); }}
          />
        )}
      </Modal>
     </div>
    </div>
  );
}

// DetailView and AppointmentForm imported from @/lib/calendar-shared
// ==== BLOCK TIME FORM ====

function BlockTimeForm({
  dateStr,
  staff,
  onSubmit,
  onCancel,
  prefillTime,
  prefillEndTime,
  prefillStaffId,
  defaultTitle,
  defaultBlockType,
  submitLabel,
  multiStaff,
}: {
  dateStr: string;
  staff: StaffMember[];
  onSubmit: (staffIds: string[], date: string, startTime: string, endTime: string, title: string, blockType: string) => Promise<void>;
  onCancel: () => void;
  prefillTime?: string | null;
  prefillEndTime?: string | null;
  prefillStaffId?: string | null;
  defaultTitle?: string;
  defaultBlockType?: string;
  submitLabel?: string;
  multiStaff?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(
    prefillStaffId ? [prefillStaffId] : []
  );

  // Calculate a default end time (1 hour after start, or use prefillEndTime)
  const defaultStart = prefillTime || "12:00";
  const defaultEnd = prefillEndTime || minutesToTime(Math.min(timeToMinutes(defaultStart) + 60, END_HOUR * 60));

  function toggleStaff(id: string) {
    setSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const ids = multiStaff
      ? selectedStaffIds
      : [fd.get("staff_id") as string].filter(Boolean);
    if (!ids.length) return;
    await onSubmit(
      ids,
      fd.get("date") as string,
      fd.get("start_time") as string,
      fd.get("end_time") as string,
      fd.get("title") as string,
      fd.get("block_type") as string
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-body-sm font-semibold text-text-primary">
          Staff Member{multiStaff ? "s" : ""} *
        </label>
        {multiStaff ? (
          <>
            <div className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border-[1.5px] border-neutral-200 divide-y divide-border">
              {staff.map((s) => {
                const checked = selectedStaffIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-hover ${
                      checked ? "bg-surface-hover" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStaff(s.id)}
                      className="h-5 w-5 rounded border-text-disabled text-neutral-900 focus:ring-primary-100"
                    />
                    <span className="text-body-sm text-text-primary">{s.full_name}</span>
                  </label>
                );
              })}
              {staff.length === 0 && (
                <p className="px-3 py-4 text-body-sm text-text-secondary text-center">
                  No staff members available.
                </p>
              )}
            </div>
            {selectedStaffIds.length === 0 && (
              <p className="mt-1 text-caption text-text-tertiary">
                Select one or more staff to block time for.
              </p>
            )}
          </>
        ) : (
          <select name="staff_id" required defaultValue={prefillStaffId || ""}
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary">Title *</label>
        <input type="text" name="title" required defaultValue={defaultTitle || "Lunch Break"} placeholder="e.g. Lunch Break, Travel"
          className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary">Type</label>
        <select name="block_type" defaultValue={defaultBlockType || "break"}
          className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100">
          <option value="break">Break</option>
          <option value="travel">Travel / Route</option>
          <option value="personal">Personal</option>
          <option value="other">Other</option>
        </select>
      </div>

      <input type="hidden" name="date" value={dateStr} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">Start Time *</label>
          <input type="time" name="start_time" required defaultValue={defaultStart}
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
        <div>
          <label className="block text-body-sm font-semibold text-text-primary">End Time *</label>
          <input type="time" name="end_time" required defaultValue={defaultEnd}
            className="mt-1 block w-full rounded-xl border-[1.5px] border-neutral-200 px-3 py-2 text-body-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg bg-surface-active px-4 py-2 text-body-sm font-semibold text-text-primary hover:bg-neutral-100">
          Cancel
        </button>
        <button
          type="submit"
          disabled={multiStaff && selectedStaffIds.length === 0}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel || "Block Time"}
        </button>
      </div>
    </form>
  );
}
