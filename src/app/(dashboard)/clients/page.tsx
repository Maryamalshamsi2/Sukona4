"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import { getClients, addClient, updateClient, deleteClient } from "./actions";
import type { Client } from "@/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadClients() {
    try {
      const data = await getClients();
      setClients(data);
    } catch {
      setError("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setModalOpen(true);
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = editing
      ? await updateClient(editing.id, formData)
      : await addClient(formData);

    if (result.error) {
      setError(result.error);
      return;
    }

    setModalOpen(false);
    setEditing(null);
    loadClients();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this client?")) return;
    const result = await deleteClient(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    loadClients();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Clients</h1>
          <p className="mt-0.5 text-sm text-gray-500">{clients.length} clients</p>
        </div>
        <button
          onClick={openAdd}
          className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 sm:px-4"
        >
          + Add Client
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <p className="mt-8 text-center text-gray-500">Loading...</p>
      ) : clients.length === 0 ? (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No clients yet. Click &quot;+ Add Client&quot; to get started.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {/* Desktop: table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Location</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
                    <td className="px-4 py-3 text-gray-600">{client.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>
                        {client.address || "—"}
                        {client.map_link && (
                          <a href={client.map_link} target="_blank" rel="noopener noreferrer"
                            className="ml-2 inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                            Map
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{client.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(client)} className="text-sm text-violet-600 hover:text-violet-800">Edit</button>
                        <button onClick={() => handleDelete(client.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="divide-y divide-gray-200 sm:hidden">
            {clients.map((client) => (
              <div key={client.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{client.name}</p>
                    {client.phone && <p className="mt-1 text-sm text-gray-500">{client.phone}</p>}
                    {client.address && <p className="mt-1 text-sm text-gray-500 truncate">{client.address}</p>}
                    {client.map_link && (
                      <a href={client.map_link} target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-violet-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        Open in Maps
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button onClick={() => openEdit(client)} className="p-1 text-sm text-violet-600">Edit</button>
                    <button onClick={() => handleDelete(client.id)} className="p-1 text-sm text-red-500">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Edit Client" : "Add Client"}
      >
        <form action={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name *</label>
            <input id="name" name="name" type="text" required defaultValue={editing?.name ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone</label>
            <input id="phone" name="phone" type="tel" defaultValue={editing?.phone ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3 bg-gray-50">
              <div>
                <label htmlFor="address" className="block text-xs text-gray-500 mb-0.5">Address (Area, Street, House/Floor/Apt)</label>
                <input id="address" name="address" type="text" defaultValue={editing?.address ?? ""}
                  placeholder="e.g. Al Reem Island, Tower 3, Floor 12, Apt 1204"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
              </div>
              <div>
                <label htmlFor="map_link" className="block text-xs text-gray-500 mb-0.5">Google Maps Link (pin location)</label>
                <input id="map_link" name="map_link" type="url" defaultValue={editing?.map_link ?? ""}
                  placeholder="https://maps.google.com/..."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); setEditing(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
              {editing ? "Save" : "Add Client"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
