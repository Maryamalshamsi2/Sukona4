"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import {
  getGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
} from "./actions";
import type { Profile, TeamGroup } from "@/types";

export default function TeamPage() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter by group
  const [activeTab, setActiveTab] = useState<string>("all");

  // Modals
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TeamGroup | null>(null);

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);

  async function loadData() {
    try {
      const [g, m] = await Promise.all([getGroups(), getTeamMembers()]);
      setGroups(g);
      setMembers(m);
    } catch {
      setError("Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

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
    setError(null);
    const result = editingGroup
      ? await updateGroup(editingGroup.id, formData)
      : await addGroup(formData);

    if (result.error) {
      setError(result.error);
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
      setError(result.error);
      return;
    }
    if (activeTab === id) setActiveTab("all");
    loadData();
  }

  // ---- Member handlers ----
  function openAddMember() {
    setEditingMember(null);
    setIsAddingMember(true);
    setMemberModalOpen(true);
  }

  function openEditMember(member: Profile) {
    setEditingMember(member);
    setIsAddingMember(false);
    setMemberModalOpen(true);
  }

  function closeMemberModal() {
    setMemberModalOpen(false);
    setEditingMember(null);
    setIsAddingMember(false);
  }

  async function handleMemberSubmit(formData: FormData) {
    setError(null);

    const result = isAddingMember
      ? await addTeamMember(formData)
      : editingMember
        ? await updateTeamMember(editingMember.id, formData)
        : { error: "No member selected" };

    if (result.error) {
      setError(result.error);
      return;
    }
    closeMemberModal();
    loadData();
  }

  function roleBadge(role: string) {
    const colors: Record<string, string> = {
      owner: "bg-amber-100 text-amber-700",
      admin: "bg-blue-100 text-blue-700",
      staff: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] || colors.staff}`}>
        {role}
      </span>
    );
  }

  if (loading) {
    return <p className="mt-8 text-center text-gray-500">Loading...</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="mt-1 text-gray-500">
            {members.length} members &middot; {groups.length} groups
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openAddGroup}
            className="rounded-lg border border-violet-600 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50"
          >
            + Group
          </button>
          <button
            onClick={openAddMember}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            + Member
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Group tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-violet-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === g.id
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {g.name} ({count})
            </button>
          );
        })}
        {members.some((m) => !m.group_id) && (
          <button
            onClick={() => setActiveTab("unassigned")}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "unassigned"
                ? "bg-violet-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            Rename group
          </button>
          <button
            onClick={() => handleDeleteGroup(activeTab)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Delete group
          </button>
        </div>
      )}

      {/* Team members list */}
      {filteredMembers.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No team members{activeTab !== "all" ? " in this group" : ""}. Click &quot;+ Member&quot; to add one.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                  {member.full_name
                    ? member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                    : "?"}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{member.full_name || member.email}</p>
                    {roleBadge(member.role)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-gray-500">
                    {member.job_title && <span>{member.job_title}</span>}
                    {member.phone && <span>{member.phone}</span>}
                    {member.team_groups && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                        {member.team_groups.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {member.salary > 0 && (
                  <span className="hidden text-sm font-medium text-gray-700 sm:block">
                    AED {member.salary}/mo
                  </span>
                )}
                <button
                  onClick={() => openEditMember(member)}
                  className="text-sm text-violet-600 hover:text-violet-800"
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
        <form action={handleGroupSubmit} className="space-y-4">
          <div>
            <label htmlFor="grp-name" className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              id="grp-name"
              name="name"
              type="text"
              required
              defaultValue={editingGroup?.name ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setGroupModalOpen(false); setEditingGroup(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
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
      >
        <form action={handleMemberSubmit} className="space-y-4">
          {/* Only show email + password when adding */}
          {isAddingMember && (
            <>
              <div>
                <label htmlFor="mem-email" className="block text-sm font-medium text-gray-700">
                  Email *
                </label>
                <input
                  id="mem-email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label htmlFor="mem-password" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <input
                  id="mem-password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="mem-name" className="block text-sm font-medium text-gray-700">
              Full Name *
            </label>
            <input
              id="mem-name"
              name="full_name"
              type="text"
              required
              defaultValue={editingMember?.full_name ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label htmlFor="mem-title" className="block text-sm font-medium text-gray-700">
              Job Title
            </label>
            <input
              id="mem-title"
              name="job_title"
              type="text"
              placeholder="e.g. Nail Technician"
              defaultValue={editingMember?.job_title ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="mem-phone" className="block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                id="mem-phone"
                name="phone"
                type="tel"
                defaultValue={editingMember?.phone ?? ""}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label htmlFor="mem-role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="mem-role"
                name="role"
                defaultValue={editingMember?.role ?? "staff"}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="mem-group" className="block text-sm font-medium text-gray-700">
                Group
              </label>
              <select
                id="mem-group"
                name="group_id"
                defaultValue={editingMember?.group_id ?? ""}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
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
              <label htmlFor="mem-salary" className="block text-sm font-medium text-gray-700">
                Salary (AED/mo)
              </label>
              <input
                id="mem-salary"
                name="salary"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editingMember?.salary || ""}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {editingMember && (
            <p className="text-xs text-gray-400">
              Email: {editingMember.email} (cannot be changed)
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeMemberModal}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              {isAddingMember ? "Add Member" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
