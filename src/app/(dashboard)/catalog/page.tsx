"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/modal";
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getServices,
  addService,
  updateService,
  deleteService,
} from "./actions";
import type { Service, ServiceCategory } from "@/types";

export default function CatalogPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which category tab is selected ("all" or a category id)
  const [activeTab, setActiveTab] = useState<string>("all");

  // Modals
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  async function loadData() {
    try {
      const [cats, svcs] = await Promise.all([getCategories(), getServices()]);
      setCategories(cats);
      setServices(svcs);
    } catch {
      setError("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Filter services by active tab
  const filteredServices =
    activeTab === "all"
      ? services
      : activeTab === "uncategorized"
        ? services.filter((s) => !s.category_id)
        : services.filter((s) => s.category_id === activeTab);

  // ---- Category handlers ----
  function openAddCategory() {
    setEditingCategory(null);
    setCategoryModalOpen(true);
  }

  function openEditCategory(cat: ServiceCategory) {
    setEditingCategory(cat);
    setCategoryModalOpen(true);
  }

  async function handleCategorySubmit(formData: FormData) {
    setError(null);
    const result = editingCategory
      ? await updateCategory(editingCategory.id, formData)
      : await addCategory(formData);

    if (result.error) {
      setError(result.error);
      return;
    }
    setCategoryModalOpen(false);
    setEditingCategory(null);
    loadData();
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm("Delete this category? Services in it will become uncategorized.")) return;
    const result = await deleteCategory(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (activeTab === id) setActiveTab("all");
    loadData();
  }

  // ---- Service handlers ----
  function openAddService() {
    setEditingService(null);
    setServiceModalOpen(true);
  }

  function openEditService(service: Service) {
    setEditingService(service);
    setServiceModalOpen(true);
  }

  async function handleServiceSubmit(formData: FormData) {
    setError(null);
    const result = editingService
      ? await updateService(editingService.id, formData)
      : await addService(formData);

    if (result.error) {
      setError(result.error);
      return;
    }
    setServiceModalOpen(false);
    setEditingService(null);
    loadData();
  }

  async function handleDeleteService(id: string) {
    if (!confirm("Delete this service?")) return;
    const result = await deleteService(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    loadData();
  }

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  if (loading) {
    return <p className="mt-8 text-center text-gray-500">Loading...</p>;
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Catalog</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {categories.length} categories &middot; {services.length} services
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={openAddCategory}
            className="rounded-lg border border-violet-600 px-2.5 py-2 text-xs font-medium text-violet-600 hover:bg-violet-50 sm:px-4 sm:text-sm"
          >
            + Category
          </button>
          <button
            onClick={openAddService}
            className="rounded-lg bg-violet-600 px-2.5 py-2 text-xs font-medium text-white hover:bg-violet-700 sm:px-4 sm:text-sm"
          >
            + Service
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Category tabs */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-violet-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All ({services.length})
        </button>
        {categories.map((cat) => {
          const count = services.filter((s) => s.category_id === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`group relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === cat.id
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.name} ({count})
            </button>
          );
        })}
        {services.some((s) => !s.category_id) && (
          <button
            onClick={() => setActiveTab("uncategorized")}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "uncategorized"
                ? "bg-violet-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Uncategorized ({services.filter((s) => !s.category_id).length})
          </button>
        )}
      </div>

      {/* Category actions (edit/delete) when a category is selected */}
      {activeTab !== "all" && activeTab !== "uncategorized" && (
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => {
              const cat = categories.find((c) => c.id === activeTab);
              if (cat) openEditCategory(cat);
            }}
            className="text-sm text-violet-600 hover:text-violet-800"
          >
            Rename category
          </button>
          <button
            onClick={() => handleDeleteCategory(activeTab)}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Delete category
          </button>
        </div>
      )}

      {/* Services grid */}
      {filteredServices.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No services{activeTab !== "all" ? " in this category" : ""}. Click &quot;+ Service&quot; to add one.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className={`rounded-lg border bg-white p-5 ${
                service.is_active ? "border-gray-200" : "border-gray-200 opacity-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{service.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDuration(service.duration_minutes)}
                  </p>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  AED {service.price}
                </p>
              </div>

              {service.service_categories && (
                <span className="mt-2 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-600">
                  {service.service_categories.name}
                </span>
              )}

              {!service.is_active && (
                <span className="mt-2 ml-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  Inactive
                </span>
              )}

              <div className="mt-4 flex gap-3 border-t border-gray-100 pt-3">
                <button
                  onClick={() => openEditService(service)}
                  className="text-sm text-violet-600 hover:text-violet-800"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteService(service.id)}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Category Modal ---- */}
      <Modal
        open={categoryModalOpen}
        onClose={() => { setCategoryModalOpen(false); setEditingCategory(null); }}
        title={editingCategory ? "Edit Category" : "Add Category"}
      >
        <form action={handleCategorySubmit} className="space-y-4">
          <div>
            <label htmlFor="cat-name" className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              id="cat-name"
              name="name"
              type="text"
              required
              defaultValue={editingCategory?.name ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setCategoryModalOpen(false); setEditingCategory(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              {editingCategory ? "Save" : "Add Category"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Service Modal ---- */}
      <Modal
        open={serviceModalOpen}
        onClose={() => { setServiceModalOpen(false); setEditingService(null); }}
        title={editingService ? "Edit Service" : "Add Service"}
      >
        <form action={handleServiceSubmit} className="space-y-4">
          <div>
            <label htmlFor="svc-name" className="block text-sm font-medium text-gray-700">
              Name *
            </label>
            <input
              id="svc-name"
              name="name"
              type="text"
              required
              defaultValue={editingService?.name ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label htmlFor="svc-category" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="svc-category"
              name="category_id"
              defaultValue={editingService?.category_id ?? ""}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="svc-price" className="block text-sm font-medium text-gray-700">
                Price (AED) *
              </label>
              <input
                id="svc-price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={editingService?.price ?? ""}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label htmlFor="svc-duration" className="block text-sm font-medium text-gray-700">
                Duration (min) *
              </label>
              <input
                id="svc-duration"
                name="duration_minutes"
                type="number"
                min="5"
                step="5"
                required
                defaultValue={editingService?.duration_minutes ?? 60}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {editingService && (
            <div className="flex items-center gap-2">
              <input type="hidden" name="is_active" value="false" />
              <input
                id="svc-active"
                name="is_active"
                type="checkbox"
                value="true"
                defaultChecked={editingService.is_active}
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="svc-active" className="text-sm text-gray-700">
                Active
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setServiceModalOpen(false); setEditingService(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              {editingService ? "Save" : "Add Service"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
