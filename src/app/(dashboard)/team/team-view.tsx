"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/modal";
import PhoneInput from "@/components/phone-input";
import { useUndo } from "@/components/undo-toast";
import { useCurrency, usePlan } from "@/lib/user-context";
import { canAddStaff, maxStaff, PLAN_LABELS } from "@/lib/plan";
import {
  getGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  getStaffSchedules,
  upsertStaffSchedules,
  getStaffDaysOff,
  addStaffDayOff,
  deleteStaffDayOff,
} from "./actions";
import type { Profile, TeamGroup, StaffDayOff } from "@/types";
import { useCurrentUser } from "@/lib/user-context";

export interface TeamViewProps {
  initialMembers: Profile[];
  initialGroups: TeamGroup[];
}

export default function TeamView({ initialMembers, initialGroups }: TeamViewProps) {
  const currentUser = useCurrentUser();
  const [members, setMembers] = useState<Profile[]>(initialMembers);
  const [groups, setGroups] = useState<TeamGroup[]>(initialGroups);
  const undo = useUndo();
  const currency = useCurrency();

  // Filter by group
  const [activeTab, setActiveTab] = useState<string>("all");

  // Modals
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TeamGroup | null>(null);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberPhone, setMemberPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Track role + appears_on_calendar in state so we can conditionally
  // show the calendar toggle only when the role is staff.
  const [memberRole, setMemberRole] = useState<string>("staff");
  const [appearsOnCalendar, setAppearsOnCalendar] = useState(true);
  // True when the owner is editing their own row — auth fields hide,
  // role stays editable but a self-demotion warning lives elsewhere.
  const editingSelf = !!editingMember && !!currentUser && editingMember.id === currentUser.id;
  // True when auth credential fields should be visible:
  // - Always when adding a new member
  // - When editing someone OTHER than yourself
  const showAuthFields = isAddingMember || (!!editingMember && !editingSelf);

  // Schedule state
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DEFAULT_SCHEDULE = DAY_NAMES.map((_, i) => ({
    day_of_week: i,
    is_day_off: i === 5 || i === 6, // Friday & Saturday off
    start_time: "09:00",
    end_time: "18:00",
  }));
  const [scheduleData, setScheduleData] = useState(DEFAULT_SCHEDULE);
  const [daysOff, setDaysOff] = useState<StaffDayOff[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [newDayOffDate, setNewDayOffDate] = useState("");
  const [newDayOffReason, setNewDayOffReason] = useState("");

  // "+" add dropdown
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setAddDropdownOpen(false);
      }
    }
    if (addDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addDropdownOpen]);

  async function loadData() {
    try {
      const [g, m] = await Promise.all([getGroups(), getTeamMembers()]);
      setGroups(g);
      setMembers(m);
    } catch {
      undo.error("Failed to load team");
    }
  }

  // Filter
  const filteredMembers =
    activeTab === "all"
      ? members
      : activeTab === "unassigned"
        ? members.filter((m) => !m.group_id)
        : members.filter((m) => m.group_id === activeTab);

  // ---- Group handlers ----
  function openAddGroup() {
    setEditingGroup(null);
    setGroupModalOpen(true);
  }

  function openEditGroup(g: TeamGroup) {
    setEditingGroup(g);
    setGroupModalOpen(true);
  }

  async function handleGroupSubmit(formData: FormData) {
    const result = editingGroup
      ? await updateGroup(editingGroup.id, formData)
      : await addGroup(formData);

    if (result.error) {
      undo.error(result.error);
      return;
    }
    setGroupModalOpen(false);
    setEditingGroup(null);
    loadData();
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Delete this group? Members will become unassigned.")) return;
    const result = await deleteGroup(id);
    if (result.error) {
      undo.error(result.error);
      return;
    }
    if (activeTab === id) setActiveTab("all");
    loadData();
  }

  // ---- Plan-limit check ----
  // Solo allows 1 member total (the owner). Team allows 5. Multi-Team
  // unlimited. When the user clicks "Add Team Member" and we're at the
  // cap, show an upgrade modal instead of opening the add form — the
  // server enforces the same limit and would reject anyway, but
  // catching it here is friendlier UX.
  const plan = usePlan();
  const atStaffLimit = !canAddStaff(plan, members.length);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  // ---- Member handlers ----
  function openAddMember() {
    if (atStaffLimit) {
      setUpgradeModalOpen(true);
      return;
    }
    setEditingMember(null);
    setIsAddingMember(true);
    setMemberPhone("");
    setShowPassword(false);
    setMemberRole("staff");
    setAppearsOnCalendar(true);
    setMemberModalOpen(true);
  }

  async function openEditMember(member: Profile) {
    setEditingMember(member);
    setIsAddingMember(false);
    setMemberPhone(member.phone || "");
    setShowPassword(false);
    setMemberRole(member.role);
    setAppearsOnCalendar(member.appears_on_calendar ?? true);
    setScheduleData(DEFAULT_SCHEDULE);
    setDaysOff([]);
    setNewDayOffDate("");
    setNewDayOffReason("");
    setMemberModalOpen(true);

    // Load schedule data
    setScheduleLoading(true);
    try {
      const [sched, off] = await Promise.all([
        getStaffSchedules(member.id),
        getStaffDaysOff(member.id),
      ]);
      if (sched.length > 0) {
        setScheduleData(
          DAY_NAMES.map((_, i) => {
            const row = sched.find((s) => s.day_of_week === i);
            return row
              ? { day_of_week: i, is_day_off: row.is_day_off, start_time: row.start_time?.slice(0, 5) || "09:00", end_time: row.end_time?.slice(0, 5) || "18:00" }
              : DEFAULT_SCHEDULE[i];
          })
        );
      }
      setDaysOff(off);
    } catch {
      // silently fail — defaults shown
    } finally {
      setScheduleLoading(false);
    }
  }

  function closeMemberModal() {
    setMemberModalOpen(false);
    setEditingMember(null);
    setIsAddingMember(false);
  }

  async function handleMemberSubmit(formData: FormData) {

    const result = isAddingMember
      ? await addTeamMember(formData)
      : editingMember
        ? await updateTeamMember(editingMember.id, formData)
        : { error: "No member selected" };

    if (result.error) {
      undo.error(result.error);
      return;
    }

    // Save schedule when editing
    if (editingMember) {
      const schedResult = await upsertStaffSchedules(editingMember.id, scheduleData);
      if (schedResult.error) {
        undo.error(schedResult.error);
        return;
      }
    }

    closeMemberModal();
    loadData();
  }

  // Schedule helpers
  function updateScheduleRow(dayIndex: number, field: string, value: string | boolean) {
    setScheduleData((prev) =>
      prev.map((row) =>
        row.day_of_week === dayIndex ? { ...row, [field]: value } : row
      )
    );
  }

  function applyToAllWorkingDays() {
    const firstWorking = scheduleData.find((d) => !d.is_day_off);
    if (!firstWorking) return;
    setScheduleData((prev) =>
      prev.map((row) =>
        row.is_day_off ? row : { ...row, start_time: firstWorking.start_time, end_time: firstWorking.end_time }
      )
    );
  }

  async function handleAddDayOff() {
    if (!editingMember || !newDayOffDate) return;
    const result = await addStaffDayOff(editingMember.id, newDayOffDate, newDayOffReason || null);
    if (result.error) {
      undo.error(result.error);
      return;
    }
    const updated = await getStaffDaysOff(editingMember.id);
    setDaysOff(updated);
    setNewDayOffDate("");
    setNewDayOffReason("");
  }

  async function handleDeleteDayOff(id: string) {
    const result = await deleteStaffDayOff(id);
    if (result.error) {
      undo.error(result.error);
      return;
    }
    setDaysOff((prev) => prev.filter((d) => d.id !== id));
  }

  function roleBadge(role: string) {
    const colors: Record<string, string> = {
      owner: "bg-amber-100 text-amber-700",
      admin: "bg-blue-100 text-blue-700",
      staff: "bg-surface-active text-text-secondary",
    };
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-caption font-medium ${colors[role] || colors.staff}`}>
        {role}
      </span>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">Team</h1>
        </div>
        {/* Desktop add button + dropdown. Mobile gets a thumb-zone FAB
            at the bottom of the screen with the same options — see below. */}
        <div className="relative shrink-0 hidden sm:block" ref={addDropdownRef}>
          <button
            onClick={() => setAddDropdownOpen((o) => !o)}
            aria-label="Add"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {addDropdownOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-40 rounded-xl border border-border bg-white py-1 shadow-lg">
              <button
                onClick={() => { openAddMember(); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                Member
              </button>
              <button
                onClick={() => { openAddGroup(); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                Group
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Group tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${
            activeTab === "all"
              ? "bg-neutral-900 text-text-inverse"
              : "bg-surface-active text-text-secondary hover:bg-neutral-100"
          }`}
        >
          All ({members.length})
        </button>
        {groups.map((g) => {
          const count = members.filter((m) => m.group_id === g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => setActiveTab(g.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${
                activeTab === g.id
                  ? "bg-neutral-900 text-text-inverse"
                  : "bg-surface-active text-text-secondary hover:bg-neutral-100"
              }`}
            >
              {g.name} ({count})
            </button>
          );
        })}
        {members.some((m) => !m.group_id) && (
          <button
            onClick={() => setActiveTab("unassigned")}
            className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${
              activeTab === "unassigned"
                ? "bg-neutral-900 text-text-inverse"
                : "bg-surface-active text-text-secondary hover:bg-neutral-100"
            }`}
          >
            Unassigned ({members.filter((m) => !m.group_id).length})
          </button>
        )}
      </div>

      {/* Group actions */}
      {activeTab !== "all" && activeTab !== "unassigned" && (
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => {
              const g = groups.find((g) => g.id === activeTab);
              if (g) openEditGroup(g);
            }}
            className="text-body-sm text-text-secondary hover:text-text-primary"
          >
            Rename group
          </button>
          <button
            onClick={() => handleDeleteGroup(activeTab)}
            className="text-body-sm text-error-500 hover:text-error-700"
          >
            Delete group
          </button>
        </div>
      )}

      {/* Team members list */}
      {filteredMembers.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl ring-1 ring-border bg-white px-6 py-14 text-center">
          <svg className="h-12 w-12 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          {members.length === 0 ? (
            <>
              <h2 className="mt-4 text-body font-semibold text-text-primary">No team members yet</h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                Add your staff so you can assign them to appointments.
              </p>
              <button
                type="button"
                onClick={openAddMember}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add your first member
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-body font-semibold text-text-primary">No members in this group</h2>
              <p className="mt-1 text-body-sm text-text-secondary">Pick a different group above, or assign someone here.</p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-2xl ring-1 ring-border bg-white p-6 sm:p-6 sm:gap-4"
            >
              {/* Avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-caption font-semibold text-text-primary sm:h-10 sm:w-10 sm:text-body-sm">
                {member.full_name
                  ? member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                  : "?"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-2">
                  <p className="truncate text-body-sm font-semibold text-text-primary sm:text-body">{member.full_name || member.email}</p>
                  {roleBadge(member.role)}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-text-secondary sm:gap-x-3 sm:text-body-sm">
                  {member.job_title && <span className="truncate">{member.job_title}</span>}
                  {member.phone && <span>{member.phone}</span>}
                  {member.team_groups && (
                    <span className="rounded bg-surface-active px-1.5 py-0.5 text-caption">
                      {member.team_groups.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                {member.salary > 0 && (
                  <span className="hidden text-body-sm font-semibold text-text-primary sm:block">
                    {currency} {member.salary}/mo
                  </span>
                )}
                <button
                  onClick={() => openEditMember(member)}
                  className="p-1 text-body-sm text-text-secondary hover:text-text-primary"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Group Modal ---- */}
      <Modal
        open={groupModalOpen}
        onClose={() => { setGroupModalOpen(false); setEditingGroup(null); }}
        title={editingGroup ? "Edit Group" : "Add Group"}
      >
        <form action={handleGroupSubmit} className="space-y-6">
          <div>
            <label htmlFor="grp-name" className="block text-body-sm font-semibold text-text-primary">
              Name *
            </label>
            <input
              id="grp-name"
              name="name"
              type="text"
              required
              defaultValue={editingGroup?.name ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => { setGroupModalOpen(false); setEditingGroup(null); }}
              className="rounded-xl bg-surface-active hover:bg-neutral-100 px-5 py-2.5 text-body-sm font-semibold text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
            >
              {editingGroup ? "Save" : "Add Group"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Add / Edit Member Modal ---- */}
      <Modal
        open={memberModalOpen}
        onClose={closeMemberModal}
        title={isAddingMember ? "Add Team Member" : "Edit Team Member"}
        size={isAddingMember ? "md" : "lg"}
      >
        <form action={handleMemberSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="mem-name" className="block text-body-sm font-semibold text-text-primary">
              Full Name *
            </label>
            <input
              id="mem-name"
              name="full_name"
              type="text"
              required
              defaultValue={editingMember?.full_name ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
            />
          </div>

          {/* Auth identifiers — Phone (required), Email (optional), Password.
              Hidden when an owner is editing their own row to prevent
              accidental self-lockout (they can use Settings instead). */}
          {showAuthFields ? (
            <>
              <div>
                <label className="block text-body-sm font-semibold text-text-primary">
                  Phone *
                </label>
                <input type="hidden" name="phone" value={memberPhone} />
                <div className="mt-1.5">
                  <PhoneInput
                    value={memberPhone}
                    onChange={setMemberPhone}
                    required={isAddingMember}
                  />
                </div>
                <p className="mt-1.5 text-caption text-text-tertiary">
                  {isAddingMember
                    ? "They'll use this number to sign in."
                    : "Used for sign-in. Leave unchanged to keep current."}
                </p>
              </div>

              <div>
                <label htmlFor="mem-email" className="block text-body-sm font-semibold text-text-primary">
                  Email <span className="font-normal text-text-tertiary">(optional)</span>
                </label>
                <input
                  id="mem-email"
                  name="email"
                  type="email"
                  defaultValue={editingMember?.email ?? ""}
                  placeholder="name@example.com"
                  className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
                />
                <p className="mt-1.5 text-caption text-text-tertiary">
                  If provided, they can sign in with phone OR email.
                </p>
              </div>

              <div>
                <label htmlFor="mem-password" className="block text-body-sm font-semibold text-text-primary">
                  {isAddingMember ? "Password *" : "New Password"}
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="mem-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required={isAddingMember}
                    minLength={isAddingMember ? 6 : undefined}
                    placeholder={isAddingMember ? "Min 6 characters" : "Leave blank to keep current"}
                    className="block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 pr-11 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            editingSelf && (
              <p className="rounded-xl bg-surface-active px-4 py-3 text-caption text-text-secondary">
                Edit your own sign-in credentials in Settings.
              </p>
            )
          )}

          {/* Job Title */}
          <div>
            <label htmlFor="mem-title" className="block text-body-sm font-semibold text-text-primary">
              Job Title <span className="font-normal text-text-tertiary">(optional)</span>
            </label>
            <input
              id="mem-title"
              name="job_title"
              type="text"
              placeholder="e.g. Nail Technician"
              defaultValue={editingMember?.job_title ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
            />
          </div>

          {/* Role */}
          <div>
            <label htmlFor="mem-role" className="block text-body-sm font-semibold text-text-primary">
              Role *
            </label>
            <select
              id="mem-role"
              name="role"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          {/* Appears on calendar — only meaningful for staff role.
              Toggle off for drivers, managers, etc. who don't take
              appointments. They can still log in and view the schedule. */}
          {memberRole === "staff" && (
            <div className="flex items-start justify-between gap-4 rounded-xl bg-neutral-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-semibold text-text-primary">Appears on calendar</p>
                <p className="mt-0.5 text-caption text-text-tertiary">
                  Turn off for staff who don&apos;t take appointments (drivers, managers, etc.). They can still log in and view the schedule.
                </p>
              </div>
              <input type="hidden" name="appears_on_calendar" value={appearsOnCalendar ? "true" : "false"} />
              <button
                type="button"
                role="switch"
                aria-checked={appearsOnCalendar}
                onClick={() => setAppearsOnCalendar((v) => !v)}
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  appearsOnCalendar ? "bg-primary-500" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    appearsOnCalendar ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Group + Salary (both optional) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="mem-group" className="block text-body-sm font-semibold text-text-primary">
                Group <span className="font-normal text-text-tertiary">(optional)</span>
              </label>
              <select
                id="mem-group"
                name="group_id"
                defaultValue={editingMember?.group_id ?? ""}
                className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mem-salary" className="block text-body-sm font-semibold text-text-primary">
                Salary ({currency}/mo) <span className="font-normal text-text-tertiary">(optional)</span>
              </label>
              <input
                id="mem-salary"
                name="salary"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editingMember?.salary || ""}
                className="mt-1.5 block w-full rounded-xl border-[1.5px] border-neutral-200 px-4 py-3 text-body text-text-primary transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-100 sm:py-2.5"
              />
            </div>
          </div>

          {/* Work Schedule — only when editing */}
          {editingMember && (
            <div className="border-t border-border pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-body-sm font-semibold text-text-primary">Work Schedule</h3>
                <button
                  type="button"
                  onClick={applyToAllWorkingDays}
                  className="text-caption text-text-secondary hover:text-text-primary"
                >
                  Apply to all working days
                </button>
              </div>

              {scheduleLoading ? (
                <p className="text-body-sm text-text-tertiary text-center py-4">Loading schedule...</p>
              ) : (
                <div className="space-y-2">
                  {scheduleData.map((day) => (
                    <div
                      key={day.day_of_week}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm ${day.is_day_off ? "bg-surface-hover opacity-60" : ""}`}
                    >
                      <span className="w-12 shrink-0 text-caption font-semibold text-text-primary">
                        {DAY_NAMES[day.day_of_week].slice(0, 3)}
                      </span>
                      <input
                        type="time"
                        value={day.start_time}
                        disabled={day.is_day_off}
                        onChange={(e) => updateScheduleRow(day.day_of_week, "start_time", e.target.value)}
                        className="block w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-caption disabled:bg-neutral-50 disabled:text-text-disabled focus:border-neutral-400 focus:outline-none"
                      />
                      <span className="text-caption text-text-tertiary">to</span>
                      <input
                        type="time"
                        value={day.end_time}
                        disabled={day.is_day_off}
                        onChange={(e) => updateScheduleRow(day.day_of_week, "end_time", e.target.value)}
                        className="block w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-caption disabled:bg-neutral-50 disabled:text-text-disabled focus:border-neutral-400 focus:outline-none"
                      />
                      <label className="flex shrink-0 items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={day.is_day_off}
                          onChange={(e) => updateScheduleRow(day.day_of_week, "is_day_off", e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-primary-100"
                        />
                        <span className="text-caption text-text-secondary">Off</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* Days Off */}
              <div className="mt-5">
                <h4 className="text-caption font-semibold text-text-primary mb-2">Days Off (one-time)</h4>
                {daysOff.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {daysOff.map((d) => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg bg-surface-hover px-3 py-2 text-caption">
                        <span className="text-text-primary">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                          {d.reason && <span className="text-text-tertiary ml-1.5">— {d.reason}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteDayOff(d.id)}
                          className="p-0.5 text-text-tertiary hover:text-error-500"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newDayOffDate}
                    onChange={(e) => setNewDayOffDate(e.target.value)}
                    className="block w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-caption focus:border-neutral-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newDayOffReason}
                    onChange={(e) => setNewDayOffReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="block w-full rounded-lg border border-neutral-200 px-2.5 py-2 text-caption focus:border-neutral-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddDayOff}
                    disabled={!newDayOffDate}
                    className="shrink-0 rounded-lg bg-surface-active px-4 py-2 text-caption font-semibold text-text-primary hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={closeMemberModal}
              className="rounded-xl bg-surface-active hover:bg-neutral-100 px-5 py-2.5 text-body-sm font-semibold text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition"
            >
              {isAddingMember ? "Add Member" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ==== MOBILE FAB ==== */}
      {/* Same two actions as the desktop dropdown, expanded above the
          FAB. The "+" rotates 45° when open to read as a close button. */}
      <div className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] right-6 z-40 sm:hidden">
        {addDropdownOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setAddDropdownOpen(false)} />
            <div className="absolute bottom-16 right-0 flex flex-col items-stretch gap-2">
              <button
                type="button"
                onClick={() => { setAddDropdownOpen(false); openAddMember(); }}
                className="flex items-center gap-2 rounded-full bg-neutral-900 pl-4 pr-5 py-2.5 text-body-sm font-semibold text-text-inverse shadow-lg whitespace-nowrap"
              >
                Member
              </button>
              <button
                type="button"
                onClick={() => { setAddDropdownOpen(false); openAddGroup(); }}
                className="flex items-center gap-2 rounded-full bg-white pl-4 pr-5 py-2.5 text-body-sm font-semibold text-text-primary shadow-lg ring-1 ring-black/5 whitespace-nowrap"
              >
                Group
              </button>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setAddDropdownOpen((v) => !v)}
          aria-label="Add"
          aria-expanded={addDropdownOpen}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-[0.97] ${
            addDropdownOpen ? "bg-neutral-700 rotate-45" : "bg-neutral-900"
          }`}
        >
          <svg className="h-7 w-7 text-text-inverse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* ==== UPGRADE MODAL — plan-limit reached on add staff ==== */}
      <Modal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade your plan"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div>
              <p className="text-body font-semibold text-text-primary">
                You&rsquo;ve reached the{" "}
                {PLAN_LABELS[plan]} plan&rsquo;s limit
              </p>
              <p className="mt-1.5 text-body-sm text-text-secondary">
                {plan === "solo"
                  ? "The Solo plan is for one person. Upgrade to Team to add up to 5 members, or Multi-Team for unlimited."
                  : plan === "team"
                    ? `Team plans include up to ${maxStaff(plan)} members. Upgrade to Multi-Team for unlimited.`
                    : "Your current plan doesn't allow more members."}
              </p>
            </div>
          </div>

          {currentUser?.role === "owner" ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(false)}
                className="flex-1 rounded-xl bg-surface-active px-4 py-2.5 text-body-sm font-semibold text-text-primary transition hover:bg-neutral-100"
              >
                Not now
              </button>
              <Link
                href="/settings/billing"
                onClick={() => setUpgradeModalOpen(false)}
                className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-body-sm font-semibold text-text-inverse transition hover:bg-neutral-800"
              >
                Upgrade plan
              </Link>
            </div>
          ) : (
            <div className="rounded-xl bg-[#F5F5F7] p-4 text-body-sm text-text-secondary">
              Only the salon owner can change the plan. Ask them to upgrade
              and try again.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
