"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Modal from "@/components/modal";
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
  getStaffServiceBlocks,
  getServiceName,
  DetailView,
  AppointmentForm,
} from "@/lib/calendar-shared";
import {
  getAppointmentsForDate,
  getStaffMembers,
  getClients,
  getServices,
  getCalendarBlocks,
  addClientQuick,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  updateAppointmentTime,
  updateAppointmentDuration,
  createCalendarBlock,
  updateCalendarBlock,
  updateCalendarBlockTimes,
  deleteCalendarBlock,
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
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const SNAP_MINUTES = 15;

// Appointment block color: light baby pink
const APPT_COLOR = "bg-pink-50 border-pink-200 text-pink-900";
// Calendar block color: light grey
const CAL_BLOCK_COLOR = "bg-gray-100 border-gray-300 text-gray-700";

// ---- Local Helpers ----

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

  return (
    <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-900">{monthName}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-[10px] font-medium text-gray-400 py-1">{d}</div>
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
              className={`rounded-lg py-1.5 text-sm transition-colors ${
                isSelected
                  ? "bg-violet-600 text-white font-semibold"
                  : isToday
                  ? "bg-violet-50 text-violet-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
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

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlockData[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Staff filter: empty set = show all
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [staffFilterOpen, setStaffFilterOpen] = useState(false);
  const staffFilterRef = useRef<HTMLDivElement>(null);

  // Date picker
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
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
      if (staffFilterRef.current && !staffFilterRef.current.contains(e.target as Node)) {
        setStaffFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [staffFilterOpen]);

  // Dismiss date picker on outside click
  useEffect(() => {
    if (!datePickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setDatePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [datePickerOpen]);

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
    try {
      const [appts, staffData, clientData, serviceData, blockData] = await Promise.all([
        getAppointmentsForDate(dateStr),
        getStaffMembers(),
        getClients(),
        getServices(),
        getCalendarBlocks(dateStr),
      ]);
      setAppointments(appts as unknown as AppointmentData[]);
      setStaff(staffData);
      setClients(clientData);
      setServices(serviceData as ServiceItem[]);
      setBlocks(blockData as CalendarBlockData[]);
    } catch {
      setError("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  const reload = useCallback(async () => {
    try {
      const [appts, blockData, clientData] = await Promise.all([
        getAppointmentsForDate(dateStr),
        getCalendarBlocks(dateStr),
        getClients(),
      ]);
      setAppointments(appts as unknown as AppointmentData[]);
      setBlocks(blockData as CalendarBlockData[]);
      setClients(clientData);
    } catch {
      /* ignore */
    }
  }, [dateStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Date navigation ----
  const goToday = () => setSelectedDate(new Date());
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
      reload();
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
      reload();
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
      reload();
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
      reload();
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

  // Get appointments for a specific staff member (those that have at least one service assigned to them)
  // Orphan appointments = no appointment_services rows (old data)
  const orphanAppts = appointments.filter(
    (a) => a.appointment_services.length === 0
  );

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

  if (loading) return <p className="mt-8 text-center text-gray-500">Loading...</p>;

  const isToday = formatDate(new Date()) === dateStr;

  return (
    <div className="flex flex-col h-full -m-4 lg:-m-6">
      {/* ---- Top bar ---- */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button onClick={goToday}
            className={`rounded-lg px-3 py-1 text-sm font-medium ${isToday ? "bg-violet-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
          >Today</button>
          <button onClick={goNext} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <div className="relative ml-2" ref={datePickerRef}>
            <button
              onClick={() => setDatePickerOpen((v) => !v)}
              className="flex items-center gap-1 text-lg font-semibold text-gray-900 hover:text-violet-700 transition-colors"
            >
              {formatDisplayDate(selectedDate)}
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {datePickerOpen && <DatePicker selected={selectedDate} onSelect={(d) => { setSelectedDate(d); setDatePickerOpen(false); }} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Staff filter */}
          <div className="relative" ref={staffFilterRef}>
            <button
              onClick={() => setStaffFilterOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${
                selectedStaffIds.size > 0
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              {selectedStaffIds.size === 0
                ? "All Staff"
                : `${selectedStaffIds.size} Staff`}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {staffFilterOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  onClick={() => setSelectedStaffIds(new Set())}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                    selectedStaffIds.size === 0 ? "text-violet-700 font-medium" : "text-gray-700"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                    selectedStaffIds.size === 0 ? "border-violet-600 bg-violet-600" : "border-gray-300"
                  }`}>
                    {selectedStaffIds.size === 0 && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  All Staff
                </button>
                <div className="my-1 border-t border-gray-100" />
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
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isSelected ? "border-violet-600 bg-violet-600" : "border-gray-300"
                      }`}>
                        {isSelected && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">
                          {member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <span className={isSelected ? "font-medium" : ""}>{member.full_name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={() => setBlockModalOpen(true)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >+ Block Time</button>
          <button onClick={() => setAddModalOpen(true)}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >+ Appointment</button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-sm text-red-600 bg-red-50">{error}</p>}

      {/* ---- Calendar grid ---- */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="inline-flex min-w-full">
          {/* Time column */}
          <div className="sticky left-0 z-10 w-16 shrink-0 border-r border-gray-200 bg-gray-50">
            <div className="h-12 border-b border-gray-200" />
            <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
              {HOURS.map((hour) => (
                <div key={hour} className="absolute w-full text-right pr-2 text-xs text-gray-400"
                  style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT + 2}px` }}>
                  {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                </div>
              ))}
            </div>
          </div>

          {/* Staff columns */}
          {filteredStaff.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-gray-500">
              {staff.length === 0 ? "No staff members yet. Add team members first." : "No staff selected. Use the filter to show staff columns."}
            </div>
          ) : (
            filteredStaff.map((member, idx) => {
              const memberAppts = getStaffAppointments(member.id, idx);
              const memberBlocks = getStaffBlocks(member.id);
              return (
                <div key={member.id} className="min-w-[180px] flex-1 border-r border-gray-200 last:border-r-0">
                  {/* Staff header */}
                  <div className="sticky top-0 z-10 flex h-12 items-center justify-center border-b border-gray-200 bg-white px-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                        {member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 truncate">{member.full_name}</span>
                    </div>
                  </div>

                  {/* Grid */}
                  <div
                    data-staff-grid
                    className="relative cursor-crosshair"
                    onMouseDown={(e) => handleGridMouseDown(e, member.id)}
                    onMouseMove={handleGridMouseMove}
                    onMouseUp={handleGridMouseUp}
                    style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                  >
                    {HOURS.map((hour) => (
                      <div key={hour} className="absolute w-full border-t border-gray-100"
                        style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }} />
                    ))}

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
                          className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-xs overflow-hidden select-none cursor-grab transition-shadow hover:shadow-md z-10 ${CAL_BLOCK_COLOR} ${isDraggingBlock ? "shadow-lg opacity-80 cursor-grabbing z-20" : ""}`}
                        >
                          <p className="font-semibold truncate">{block.title}</p>
                          <p className="opacity-70">
                            {formatTime12Short(block.start_time)} - {formatTime12Short(block.end_time)} ({formatDuration(dur)})
                          </p>
                          {/* Resize handle */}
                          <div
                            data-resize="true"
                            onPointerDown={(e) => handleBlockResizeStart(e, block)}
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize rounded-b-lg hover:bg-black/10"
                          />
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
                          className="absolute left-1 right-1 rounded-lg bg-violet-200/60 border-2 border-violet-400 pointer-events-none z-10"
                          style={{ top: `${topPx}px`, height: `${Math.max(heightPx, 10)}px` }}
                        >
                          <p className="px-2 py-1 text-xs font-medium text-violet-700">
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

                      const { top, height } = getBlockStyleFromMinutes(earliestStart, latestEnd);

                      const isDragging = dragApptId === appt.id;
                      const isResizing = resizeApptId === appt.id;
                      const colorClass = isOrphan
                        ? "bg-gray-100 border-gray-300 text-gray-700"
                        : APPT_COLOR;

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
                          className={`absolute left-1 right-1 rounded-lg border px-2 py-1 text-left text-xs cursor-grab overflow-hidden select-none transition-shadow hover:shadow-md ${colorClass} ${isDragging ? "shadow-lg opacity-80 cursor-grabbing z-20" : ""}`}
                          style={{ top: `${displayTop}px`, height: `${displayHeight}px` }}
                        >
                          <p className="font-semibold truncate">{appt.clients?.name || "Unknown"}</p>
                          {appt.clients?.address && (
                            <p className="truncate opacity-70">{appt.clients.address}</p>
                          )}
                          <p className="opacity-80 font-medium">
                            {formatTime12Short(blockStartTime)} - {formatTime12Short(blockEndTime)} ({formatDuration(blockDuration)})
                          </p>
                          {serviceNames.length > 0 && (
                            <p className="truncate opacity-60">{serviceNames.join(", ")}</p>
                          )}

                          {/* Resize handle */}
                          <div
                            data-resize="true"
                            onPointerDown={(e) => handleResizeStart(e, appt)}
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize rounded-b-lg hover:bg-black/10"
                          />
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

      {/* ==== QUICK ACTION POPOVER (click on grid) ==== */}
      {quickAction && (
        <div
          ref={quickActionRef}
          className="fixed z-50 rounded-xl border border-gray-200 bg-white shadow-xl p-1 min-w-[180px]"
          style={{
            left: `${quickAction.x}px`,
            top: `${quickAction.y}px`,
            transform: "translate(-50%, -100%) translateY(-8px)",
          }}
        >
          <p className="px-3 py-1.5 text-xs font-medium text-gray-400">
            {formatTime12Short(quickAction.startTime)} - {formatTime12Short(quickAction.endTime)} · {staff.find((s) => s.id === quickAction.staffId)?.full_name}
          </p>
          <button
            onClick={openAddFromGrid}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Appointment
          </button>
          <button
            onClick={openBlockFromGrid}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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
          prefillTime={prefillTime}
          prefillStaffId={prefillStaffId}
          onSubmit={async (clientId, date, time, notes, entries) => {
            setError(null);
            const result = await createAppointment(clientId, date, time, notes, entries);
            if (result.error) { setError(result.error); return; }
            setAddModalOpen(false);
            setPrefillTime(null);
            setPrefillStaffId(null);
            reload();
          }}
          onNewClient={async (name, phone, address) => {
            const result = await addClientQuick(name, phone, address);
            if (result.error) { setError(result.error); return null; }
            return result.client!;
          }}
          onCancel={() => { setAddModalOpen(false); setPrefillTime(null); setPrefillStaffId(null); }}
          submitLabel="Create"
        />
      </Modal>

      {/* ==== DETAIL MODAL ==== */}
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

      {/* ==== EDIT MODAL ==== */}
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

      {/* ==== BLOCK TIME MODAL ==== */}
      <Modal open={blockModalOpen} onClose={() => { setBlockModalOpen(false); setPrefillTime(null); setPrefillEndTime(null); setPrefillStaffId(null); }} title="Block Time">
        <BlockTimeForm
          dateStr={dateStr}
          staff={staff}
          prefillTime={prefillTime}
          prefillEndTime={prefillEndTime}
          prefillStaffId={prefillStaffId}
          onSubmit={async (staffId, date, startTime, endTime, title, blockType) => {
            setError(null);
            const result = await createCalendarBlock(staffId, date, startTime, endTime, title, blockType);
            if (result.error) { setError(result.error); return; }
            setBlockModalOpen(false);
            setPrefillTime(null);
            setPrefillEndTime(null);
            setPrefillStaffId(null);
            reload();
          }}
          onCancel={() => { setBlockModalOpen(false); setPrefillTime(null); setPrefillEndTime(null); setPrefillStaffId(null); }}
        />
      </Modal>

      {/* ==== BLOCK DETAIL MODAL ==== */}
      <Modal open={blockDetailOpen} onClose={() => { setBlockDetailOpen(false); }} title="Block Time Details">
        {selectedBlock && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Title</p>
              <p className="font-medium text-gray-900">{selectedBlock.title}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Type</p>
              <p className="font-medium text-gray-900 capitalize">{selectedBlock.block_type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Time</p>
              <p className="font-medium text-gray-900">
                {formatTime12(selectedBlock.start_time)} - {formatTime12(selectedBlock.end_time)}
                {" "}({formatDuration(timeToMinutes(selectedBlock.end_time) - timeToMinutes(selectedBlock.start_time))})
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Staff</p>
              <p className="font-medium text-gray-900">
                {staff.find((s) => s.id === selectedBlock.staff_id)?.full_name || "Unknown"}
              </p>
            </div>
            <div className="flex gap-3 border-t border-gray-100 pt-4">
              <button
                onClick={() => { setBlockDetailOpen(false); setBlockEditOpen(true); }}
                className="flex-1 rounded-lg border border-violet-600 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50"
              >Edit</button>
              <button
                onClick={async () => {
                  if (!confirm("Delete this block?")) return;
                  await deleteCalendarBlock(selectedBlock.id);
                  setBlockDetailOpen(false);
                  setSelectedBlock(null);
                  reload();
                }}
                className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >Delete</button>
            </div>
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
            onSubmit={async (staffId, date, startTime, endTime, title, blockType) => {
              setError(null);
              const result = await updateCalendarBlock(selectedBlock.id, staffId, startTime, endTime, title, blockType);
              if (result.error) { setError(result.error); return; }
              setBlockEditOpen(false);
              setSelectedBlock(null);
              reload();
            }}
            onCancel={() => { setBlockEditOpen(false); setSelectedBlock(null); }}
          />
        )}
      </Modal>
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
}: {
  dateStr: string;
  staff: StaffMember[];
  onSubmit: (staffId: string, date: string, startTime: string, endTime: string, title: string, blockType: string) => Promise<void>;
  onCancel: () => void;
  prefillTime?: string | null;
  prefillEndTime?: string | null;
  prefillStaffId?: string | null;
  defaultTitle?: string;
  defaultBlockType?: string;
  submitLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  // Calculate a default end time (1 hour after start, or use prefillEndTime)
  const defaultStart = prefillTime || "12:00";
  const defaultEnd = prefillEndTime || minutesToTime(Math.min(timeToMinutes(defaultStart) + 60, END_HOUR * 60));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    await onSubmit(
      fd.get("staff_id") as string,
      fd.get("date") as string,
      fd.get("start_time") as string,
      fd.get("end_time") as string,
      fd.get("title") as string,
      fd.get("block_type") as string
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Staff Member *</label>
        <select name="staff_id" required defaultValue={prefillStaffId || ""}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
          <option value="">Select staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Title *</label>
        <input type="text" name="title" required defaultValue={defaultTitle || "Lunch Break"} placeholder="e.g. Lunch Break, Travel"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Type</label>
        <select name="block_type" defaultValue={defaultBlockType || "break"}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500">
          <option value="break">Break</option>
          <option value="travel">Travel / Route</option>
          <option value="personal">Personal</option>
          <option value="other">Other</option>
        </select>
      </div>

      <input type="hidden" name="date" value={dateStr} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Time *</label>
          <input type="time" name="start_time" required defaultValue={defaultStart}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">End Time *</label>
          <input type="time" name="end_time" required defaultValue={defaultEnd}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
          {submitLabel || "Block Time"}
        </button>
      </div>
    </form>
  );
}
