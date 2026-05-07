"use client";

import { useEffect, useState, useRef } from "react";
import Modal from "@/components/modal";
import { useCurrentUser } from "@/lib/user-context";
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getServices,
  addService,
  updateService,
  deleteService,
  getBundles,
  addBundle,
  updateBundle,
  deleteBundle,
  reorderServices,
  reorderBundles,
  reorderCategories,
} from "./actions";
import type { Service, ServiceCategory, ServiceBundle } from "@/types";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function DragHandleIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
    </svg>
  );
}

// Sortable wrapper for a category pill in the horizontal tab row.
function SortableCategoryPill({
  cat,
  active,
  count,
  onSelect,
}: {
  cat: ServiceCategory;
  active: boolean;
  count: number;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    touchAction: "none",
  };
  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors cursor-grab active:cursor-grabbing ${
        active
          ? "bg-neutral-900 text-text-inverse"
          : "bg-surface-active text-text-secondary hover:bg-neutral-100"
      }`}
    >
      {cat.name} ({count})
    </button>
  );
}

// Sortable wrapper for a service card.
function SortableServiceCard({
  id,
  showHandle,
  children,
}: {
  id: string;
  showHandle: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const handle = showHandle ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Reorder"
      className="cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary p-1 -m-1 touch-none"
      style={{ touchAction: "none" }}
    >
      <DragHandleIcon />
    </button>
  ) : null;
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}

export interface CatalogViewProps {
  initialCategories: ServiceCategory[];
  initialServices: Service[];
  initialBundles: ServiceBundle[];
}

export default function CatalogView({
  initialCategories,
  initialServices,
  initialBundles,
}: CatalogViewProps) {
  const currentUser = useCurrentUser();
  const isStaff = currentUser?.role === "staff";

  const [categories, setCategories] = useState<ServiceCategory[]>(initialCategories);
  const [services, setServices] = useState<Service[]>(initialServices);
  const [bundles, setBundles] = useState<ServiceBundle[]>(initialBundles);
  const [error, setError] = useState<string | null>(null);

  // "+ Add" dropdown
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);

  // Which category tab is selected ("all" or a category id)
  const [activeTab, setActiveTab] = useState<string>("all");

  // Modals
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<ServiceBundle | null>(null);

  // dnd-kit sensors. The 5px distance threshold prevents accidental drag
  // starts when the user just intends to tap (open edit modal) or scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function loadData() {
    try {
      const [cats, svcs, bdls] = await Promise.all([getCategories(), getServices(), getBundles()]);
      setCategories(cats);
      setServices(svcs);
      setBundles(bdls);
    } catch {
      setError("Failed to load catalog");
    }
  }

  // Close add dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setAddDropdownOpen(false);
      }
    }
    if (addDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addDropdownOpen]);

  // Merge services + bundles into a single list so bundles sit inside
  // the category of their included services (one category per bundle now).
  type CatalogItem =
    | { kind: "service"; service: Service; createdAt: string; categoryId: string | null }
    | { kind: "bundle"; bundle: ServiceBundle; createdAt: string; categoryId: string | null };

  const catalogItems: CatalogItem[] = [
    ...services.map<CatalogItem>((s) => ({
      kind: "service",
      service: s,
      createdAt: s.created_at,
      categoryId: s.category_id,
    })),
    ...bundles.map<CatalogItem>((b) => ({
      kind: "bundle",
      bundle: b,
      createdAt: b.created_at,
      categoryId: b.category_id,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Per-category counts (services + bundles combined)
  const countForCategory = (categoryId: string) =>
    catalogItems.filter((item) => item.categoryId === categoryId).length;
  const uncategorizedCount = catalogItems.filter((item) => !item.categoryId).length;

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

  // ---- Bundle handlers ----
  function openAddBundle() {
    setEditingBundle(null);
    setBundleModalOpen(true);
  }

  function openEditBundle(bundle: ServiceBundle) {
    setEditingBundle(bundle);
    setBundleModalOpen(true);
  }

  async function handleDeleteBundle(id: string) {
    if (!confirm("Delete this bundle?")) return;
    const result = await deleteBundle(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    loadData();
  }

  // ---- Drag-and-drop handlers ----
  // Each one optimistically updates state, fires the server action, and
  // reverts if the action returns { error }. Categories reorder applies
  // only to user-defined IDs (the All / Uncategorized pills aren't in
  // the sortable set). Service / bundle reorder sends the IDs of the
  // items currently visible in the active tab.
  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = categories;
    const next = arrayMove(categories, oldIndex, newIndex);
    setCategories(next);
    const result = await reorderCategories(next.map((c) => c.id));
    if (result.error) {
      setCategories(previous);
      setError(result.error);
    }
  }

  async function handleServicesDragEnd(event: DragEndEvent, visibleIds: string[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleIds.indexOf(active.id as string);
    const newIndex = visibleIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(visibleIds, oldIndex, newIndex);
    // Reorder the global services list so visible items appear in the new
    // order while preserving their original positions among other-category
    // items. We extract the visible-position slots and re-fill them.
    const previous = services;
    const visibleSet = new Set(visibleIds);
    const slotPositions: number[] = [];
    services.forEach((s, i) => {
      if (visibleSet.has(s.id)) slotPositions.push(i);
    });
    const byId = new Map(services.map((s) => [s.id, s]));
    const next = [...services];
    newOrder.forEach((id, k) => {
      const svc = byId.get(id);
      if (svc) next[slotPositions[k]] = svc;
    });
    setServices(next);
    const result = await reorderServices(newOrder);
    if (result.error) {
      setServices(previous);
      setError(result.error);
    }
  }

  async function handleBundlesDragEnd(event: DragEndEvent, visibleIds: string[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleIds.indexOf(active.id as string);
    const newIndex = visibleIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(visibleIds, oldIndex, newIndex);
    const previous = bundles;
    const visibleSet = new Set(visibleIds);
    const slotPositions: number[] = [];
    bundles.forEach((b, i) => {
      if (visibleSet.has(b.id)) slotPositions.push(i);
    });
    const byId = new Map(bundles.map((b) => [b.id, b]));
    const next = [...bundles];
    newOrder.forEach((id, k) => {
      const bdl = byId.get(id);
      if (bdl) next[slotPositions[k]] = bdl;
    });
    setBundles(next);
    const result = await reorderBundles(newOrder);
    if (result.error) {
      setBundles(previous);
      setError(result.error);
    }
  }

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  function getBundleOriginalPrice(bundle: ServiceBundle) {
    return (bundle.service_bundle_items || []).reduce(
      (sum, item) => sum + (item.services?.price || 0), 0
    );
  }

  function getBundlePrice(bundle: ServiceBundle) {
    const original = getBundleOriginalPrice(bundle);
    if (bundle.discount_type === "fixed" && bundle.fixed_price != null) {
      return bundle.fixed_price;
    }
    if (bundle.discount_type === "percentage" && bundle.discount_percentage != null) {
      return original * (1 - bundle.discount_percentage / 100);
    }
    return original;
  }

  function getBundleDuration(bundle: ServiceBundle) {
    if (bundle.duration_override != null) return bundle.duration_override;
    return (bundle.service_bundle_items || []).reduce(
      (sum, item) => sum + (item.services?.duration_minutes || 0), 0
    );
  }

  // Renders the inner card body for a service. The drag handle is passed
  // in (or null) so the sortable wrapper controls drag wiring.
  function renderServiceCard(service: Service, handle: React.ReactNode) {
    return (
      <div
        className={`rounded-2xl ring-1 ring-border bg-white p-6 ${
          service.is_active ? "" : "opacity-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary">{service.name}</h3>
            <p className="mt-1 text-body-sm text-text-secondary">
              {formatDuration(service.duration_minutes)}
            </p>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <p className="text-lg font-semibold text-text-primary">
              AED {service.price}
            </p>
            {handle}
          </div>
        </div>

        {!service.is_active && (
          <span className="mt-2 ml-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-caption text-text-secondary">
            Inactive
          </span>
        )}

        {!isStaff && (
          <div className="mt-4 flex gap-3 border-t border-border pt-3">
            <button
              onClick={() => openEditService(service)}
              className="text-body-sm text-text-secondary hover:text-text-primary"
            >
              Edit
            </button>
            <button
              onClick={() => handleDeleteService(service.id)}
              className="text-body-sm text-error-500 hover:text-error-700"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderBundleCard(bundle: ServiceBundle, handle: React.ReactNode) {
    const originalPrice = getBundleOriginalPrice(bundle);
    const bundlePrice = getBundlePrice(bundle);
    const duration = getBundleDuration(bundle);
    const savings = originalPrice - bundlePrice;
    const activeServices = (bundle.service_bundle_items || []).filter(
      (bi) => bi.services?.is_active !== false
    );
    return (
      <div
        className={`rounded-2xl ring-1 ring-border bg-white p-6 ${
          bundle.is_active ? "" : "opacity-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-text-primary">{bundle.name}</h3>
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-caption font-semibold text-violet-600">
                Bundle
              </span>
            </div>
            <p className="mt-1 text-body-sm text-text-secondary">
              {formatDuration(duration)} &middot; {activeServices.length} services
            </p>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <div className="text-right">
              <p className="text-lg font-semibold text-text-primary">
                AED {bundlePrice.toFixed(0)}
              </p>
              {savings > 0 && (
                <p className="text-caption text-text-tertiary line-through">
                  AED {originalPrice.toFixed(0)}
                </p>
              )}
            </div>
            {handle}
          </div>
        </div>

        {/* Included services */}
        <div className="mt-3 flex flex-wrap gap-1">
          {activeServices.map((bi) => (
            <span
              key={bi.id}
              className="rounded-full bg-surface-active px-2 py-0.5 text-caption text-text-primary"
            >
              {bi.services?.name}
            </span>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {bundle.service_categories && (
            <span className="inline-block rounded-full bg-surface-active px-2 py-0.5 text-caption text-text-primary">
              {bundle.service_categories.name}
            </span>
          )}
          {savings > 0 && (
            <span className="inline-block rounded-full bg-green-50 px-2 py-0.5 text-caption font-semibold text-green-700">
              Save AED {savings.toFixed(0)}
              {bundle.discount_type === "percentage" && bundle.discount_percentage
                ? ` (${bundle.discount_percentage}%)`
                : ""}
            </span>
          )}
          {!bundle.is_active && (
            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-caption text-text-secondary">
              Inactive
            </span>
          )}
        </div>

        {!isStaff && (
          <div className="mt-4 flex gap-3 border-t border-border pt-3">
            <button
              onClick={() => openEditBundle(bundle)}
              className="text-body-sm text-text-secondary hover:text-text-primary"
            >
              Edit
            </button>
            <button
              onClick={() => handleDeleteBundle(bundle.id)}
              className="text-body-sm text-error-500 hover:text-error-700"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  // Per-tab visible items (used to compute draggable ID sets).
  const tabServices: Service[] =
    activeTab === "all"
      ? services
      : activeTab === "uncategorized"
        ? services.filter((s) => !s.category_id)
        : services.filter((s) => s.category_id === activeTab);

  const tabBundles: ServiceBundle[] =
    activeTab === "all"
      ? bundles
      : activeTab === "uncategorized"
        ? bundles.filter((b) => !b.category_id)
        : bundles.filter((b) => b.category_id === activeTab);

  // Drag is enabled for owners/admins on category & uncategorized tabs only.
  const dragEnabled = !isStaff && activeTab !== "all";

  // For the All view, group items by category in `categories` order, then
  // uncategorized at the end. Within each category, services first then
  // bundles. This is purely a derived display order — no drag here.
  type AllGroup = {
    key: string;
    label: string | null; // null = no header
    services: Service[];
    bundles: ServiceBundle[];
  };
  const allGroups: AllGroup[] =
    activeTab === "all"
      ? [
          ...categories.map((cat) => ({
            key: cat.id,
            label: cat.name,
            services: services.filter((s) => s.category_id === cat.id),
            bundles: bundles.filter((b) => b.category_id === cat.id),
          })),
          {
            key: "__uncat",
            label: "Uncategorized",
            services: services.filter((s) => !s.category_id),
            bundles: bundles.filter((b) => !b.category_id),
          },
        ].filter((g) => g.services.length > 0 || g.bundles.length > 0)
      : [];

  const isEmpty =
    activeTab === "all"
      ? services.length === 0 && bundles.length === 0
      : tabServices.length === 0 && tabBundles.length === 0;

  return (
    <div>
      {/* Page title + "+" add button — matches the layout of Clients / Team. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title-page font-bold tracking-tight text-text-primary">Catalog</h1>
        </div>
        {!isStaff && (
        <div className="relative shrink-0" ref={addDropdownRef}>
          <button
            onClick={() => setAddDropdownOpen(!addDropdownOpen)}
            aria-label="Add"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {addDropdownOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-44 rounded-xl border border-border bg-white py-1 shadow-lg">
              <button
                onClick={() => { openAddService(); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                <svg className="h-5 w-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Service
              </button>
              <button
                onClick={() => { openAddBundle(); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                <svg className="h-5 w-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Bundle
              </button>
              <button
                onClick={() => { openAddCategory(); setAddDropdownOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-text-primary hover:bg-surface-hover"
              >
                <svg className="h-5 w-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Category
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {error && <p className="mt-4 text-body-sm text-error-700">{error}</p>}

      {/* ======= CATALOG (services + bundles, merged) ======= */}
      {/* Category tabs — single horizontal line, left-aligned (scrolls if overflow).
          For owners/admins, the user-defined category pills are draggable to
          reorder. The "All" and "Uncategorized" pills sit outside the
          sortable set so they always anchor the row. */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab("all")}
            className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${
              activeTab === "all"
                ? "bg-neutral-900 text-text-inverse"
                : "bg-surface-active text-text-secondary hover:bg-neutral-100"
            }`}
          >
            All ({catalogItems.length})
          </button>
          {isStaff ? (
            categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${
                  activeTab === cat.id
                    ? "bg-neutral-900 text-text-inverse"
                    : "bg-surface-active text-text-secondary hover:bg-neutral-100"
                }`}
              >
                {cat.name} ({countForCategory(cat.id)})
              </button>
            ))
          ) : (
            <DndContext
              id="catalog-categories"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={categories.map((c) => c.id)}
                strategy={horizontalListSortingStrategy}
              >
                {categories.map((cat) => (
                  <SortableCategoryPill
                    key={cat.id}
                    cat={cat}
                    active={activeTab === cat.id}
                    count={countForCategory(cat.id)}
                    onSelect={() => setActiveTab(cat.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
          {uncategorizedCount > 0 && (
            <button
              onClick={() => setActiveTab("uncategorized")}
              className={`shrink-0 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${
                activeTab === "uncategorized"
                  ? "bg-neutral-900 text-text-inverse"
                  : "bg-surface-active text-text-secondary hover:bg-neutral-100"
              }`}
            >
              Uncategorized ({uncategorizedCount})
            </button>
          )}
      </div>

      {/* Category actions (edit/delete) when a category is selected */}
      {!isStaff && activeTab !== "all" && activeTab !== "uncategorized" && (
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => {
              const cat = categories.find((c) => c.id === activeTab);
              if (cat) openEditCategory(cat);
            }}
            className="text-body-sm text-text-secondary hover:text-text-primary"
          >
            Rename category
          </button>
          <button
            onClick={() => handleDeleteCategory(activeTab)}
            className="text-body-sm text-error-500 hover:text-error-700"
          >
            Delete category
          </button>
        </div>
      )}

      {/* Single-column list — services & bundles stack vertically.
          - On a category tab (or Uncategorized): services list first, then
            bundles. Each is its own DndContext + SortableContext so they
            reorder independently.
          - On the All tab: items are grouped by category in `categories`
            order, with services-then-bundles inside each. Drag is disabled
            because All is a derived view. */}
      {isEmpty ? (
        <div className="mt-6 rounded-2xl ring-1 ring-border bg-white p-8 text-center text-text-secondary">
          {isStaff
            ? "Nothing here yet."
            : "Nothing here yet. Click “+” to add a service or bundle."}
        </div>
      ) : activeTab === "all" ? (
        <div className="mt-4 flex flex-col gap-6">
          {allGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-4">
              {group.label && (
                <h2 className="text-body-sm font-semibold uppercase tracking-wide text-text-tertiary">
                  {group.label}
                </h2>
              )}
              {group.services.map((service) => (
                <div key={`s-${service.id}`}>{renderServiceCard(service, null)}</div>
              ))}
              {group.bundles.map((bundle) => (
                <div key={`b-${bundle.id}`}>{renderBundleCard(bundle, null)}</div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {tabServices.length > 0 && (
            <DndContext
              id="catalog-services"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleServicesDragEnd(e, tabServices.map((s) => s.id))}
            >
              <SortableContext
                items={tabServices.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-4">
                  {tabServices.map((service) => (
                    <SortableServiceCard
                      key={`s-${service.id}`}
                      id={service.id}
                      showHandle={dragEnabled}
                    >
                      {(handle) => renderServiceCard(service, handle)}
                    </SortableServiceCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {tabServices.length > 0 && tabBundles.length > 0 && (
            <h2 className="text-body-sm font-semibold uppercase tracking-wide text-text-tertiary">
              Bundles
            </h2>
          )}

          {tabBundles.length > 0 && (
            <DndContext
              id="catalog-bundles"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleBundlesDragEnd(e, tabBundles.map((b) => b.id))}
            >
              <SortableContext
                items={tabBundles.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-4">
                  {tabBundles.map((bundle) => (
                    <SortableServiceCard
                      key={`b-${bundle.id}`}
                      id={bundle.id}
                      showHandle={dragEnabled}
                    >
                      {(handle) => renderBundleCard(bundle, handle)}
                    </SortableServiceCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}


      {/* ---- Category Modal ---- */}
      <Modal
        open={categoryModalOpen}
        onClose={() => { setCategoryModalOpen(false); setEditingCategory(null); }}
        title={editingCategory ? "Edit Category" : "Add Category"}
      >
        <form action={handleCategorySubmit} className="space-y-6">
          <div>
            <label htmlFor="cat-name" className="block text-body-sm font-semibold text-text-primary">
              Name *
            </label>
            <input
              id="cat-name"
              name="name"
              type="text"
              required
              defaultValue={editingCategory?.name ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setCategoryModalOpen(false); setEditingCategory(null); }}
              className="rounded-xl bg-surface-active px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
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
        <form action={handleServiceSubmit} className="space-y-6">
          <div>
            <label htmlFor="svc-name" className="block text-body-sm font-semibold text-text-primary">
              Name *
            </label>
            <input
              id="svc-name"
              name="name"
              type="text"
              required
              defaultValue={editingService?.name ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div>
            <label htmlFor="svc-category" className="block text-body-sm font-semibold text-text-primary">
              Category
            </label>
            <select
              id="svc-category"
              name="category_id"
              defaultValue={editingService?.category_id ?? ""}
              className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
              <label htmlFor="svc-price" className="block text-body-sm font-semibold text-text-primary">
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
                className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div>
              <label htmlFor="svc-duration" className="block text-body-sm font-semibold text-text-primary">
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
                className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
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
                className="h-5 w-5 rounded border-text-disabled text-neutral-900 focus:ring-primary-100"
              />
              <label htmlFor="svc-active" className="text-body-sm text-text-primary">
                Active
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setServiceModalOpen(false); setEditingService(null); }}
              className="rounded-xl bg-surface-active px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all"
            >
              {editingService ? "Save" : "Add Service"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Bundle Modal ---- */}
      <Modal
        open={bundleModalOpen}
        onClose={() => { setBundleModalOpen(false); setEditingBundle(null); }}
        title={editingBundle ? "Edit Bundle" : "Create Bundle"}
      >
        <BundleForm
          services={services.filter((s) => s.is_active)}
          categories={categories}
          editingBundle={editingBundle}
          onSubmit={async (data) => {
            setError(null);
            const result = editingBundle
              ? await updateBundle(
                  editingBundle.id,
                  data.name,
                  data.categoryId,
                  data.discountType,
                  data.discountPercentage,
                  data.fixedPrice,
                  data.durationOverride,
                  data.isActive,
                  data.serviceIds
                )
              : await addBundle(
                  data.name,
                  data.categoryId,
                  data.discountType,
                  data.discountPercentage,
                  data.fixedPrice,
                  data.durationOverride,
                  data.serviceIds
                );
            if (result.error) {
              setError(result.error);
              return;
            }
            setBundleModalOpen(false);
            setEditingBundle(null);
            loadData();
          }}
          onCancel={() => { setBundleModalOpen(false); setEditingBundle(null); }}
        />
      </Modal>
    </div>
  );
}

// ---- Bundle Form Component ----

function BundleForm({
  services,
  categories,
  editingBundle,
  onSubmit,
  onCancel,
}: {
  services: Service[];
  categories: ServiceCategory[];
  editingBundle: ServiceBundle | null;
  onSubmit: (data: {
    name: string;
    categoryId: string | null;
    discountType: "percentage" | "fixed";
    discountPercentage: number | null;
    fixedPrice: number | null;
    durationOverride: number | null;
    isActive: boolean;
    serviceIds: string[];
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editingBundle?.name || "");
  const [categoryId, setCategoryId] = useState<string>(editingBundle?.category_id || "");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    editingBundle?.service_bundle_items
      ?.sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => item.service_id) || []
  );
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    editingBundle?.discount_type || "fixed"
  );
  const [discountPercentage, setDiscountPercentage] = useState<string>(
    editingBundle?.discount_percentage?.toString() || ""
  );
  const [fixedPrice, setFixedPrice] = useState<string>(
    editingBundle?.fixed_price?.toString() || ""
  );
  const [customDuration, setCustomDuration] = useState<string>(
    editingBundle?.duration_override?.toString() || ""
  );
  const [isActive, setIsActive] = useState(editingBundle?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);

  const originalPrice = selectedServiceIds.reduce((sum, sid) => {
    const svc = services.find((s) => s.id === sid);
    return sum + (svc?.price || 0);
  }, 0);

  const totalDuration = selectedServiceIds.reduce((sum, sid) => {
    const svc = services.find((s) => s.id === sid);
    return sum + (svc?.duration_minutes || 0);
  }, 0);

  const effectiveDuration = customDuration ? parseInt(customDuration) : totalDuration;

  let bundlePrice = originalPrice;
  if (discountType === "fixed" && fixedPrice) {
    bundlePrice = parseFloat(fixedPrice);
  } else if (discountType === "percentage" && discountPercentage) {
    bundlePrice = originalPrice * (1 - parseFloat(discountPercentage) / 100);
  }

  const savings = originalPrice - bundlePrice;

  function toggleService(serviceId: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedServiceIds.length < 2) return;
    setSubmitting(true);
    await onSubmit({
      name,
      categoryId: categoryId || null,
      discountType,
      discountPercentage: discountType === "percentage" && discountPercentage
        ? parseFloat(discountPercentage) : null,
      fixedPrice: discountType === "fixed" && fixedPrice
        ? parseFloat(fixedPrice) : null,
      durationOverride: customDuration ? parseInt(customDuration) : null,
      isActive,
      serviceIds: selectedServiceIds,
    });
    setSubmitting(false);
  }

  function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-body-sm font-semibold text-text-primary">Bundle Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Mani & Pedi Combo"
          className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      <div>
        <label className="block text-body-sm font-semibold text-text-primary">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mt-1.5 block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          <option value="">No category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Service selection */}
      <div>
        <label className="block text-body-sm font-semibold text-text-primary mb-2">
          Select Services * <span className="text-text-tertiary font-normal">(min. 2)</span>
        </label>
        <div className="max-h-48 overflow-y-auto rounded-xl border-[1.5px] border-gray-200 divide-y divide-border">
          {services.map((svc) => {
            const isSelected = selectedServiceIds.includes(svc.id);
            return (
              <label
                key={svc.id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-hover ${
                  isSelected ? "bg-surface-hover" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleService(svc.id)}
                  className="h-5 w-5 rounded border-text-disabled text-neutral-900 focus:ring-primary-100"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm text-text-primary truncate">{svc.name}</p>
                  <p className="text-caption text-text-secondary">
                    {svc.duration_minutes} min &middot; AED {svc.price}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        {selectedServiceIds.length > 0 && selectedServiceIds.length < 2 && (
          <p className="mt-1 text-caption text-error-500">Select at least 2 services</p>
        )}
      </div>

      {/* Pricing */}
      {selectedServiceIds.length >= 2 && (
        <>
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-2">Bundle Pricing</label>
            <div className="flex gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={discountType === "fixed"}
                  onChange={() => setDiscountType("fixed")}
                  className="text-neutral-900 focus:ring-gray-400"
                />
                <span className="text-body-sm text-text-primary">Fixed price</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={discountType === "percentage"}
                  onChange={() => setDiscountType("percentage")}
                  className="text-neutral-900 focus:ring-gray-400"
                />
                <span className="text-body-sm text-text-primary">Percentage discount</span>
              </label>
            </div>

            {discountType === "fixed" ? (
              <div>
                <label className="block text-caption text-text-secondary mb-1">
                  Bundle Price (AED) — original: AED {originalPrice.toFixed(0)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  placeholder={originalPrice.toFixed(2)}
                  className="block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            ) : (
              <div>
                <label className="block text-caption text-text-secondary mb-1">
                  Discount Percentage (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={discountPercentage}
                  onChange={(e) => setDiscountPercentage(e.target.value)}
                  placeholder="e.g. 10"
                  className="block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="block text-body-sm font-semibold text-text-primary mb-1">
              Duration — auto: {formatDuration(totalDuration)}
            </label>
            <input
              type="number"
              min="5"
              step="5"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              placeholder={`${totalDuration} (auto from services)`}
              className="block w-full rounded-xl border-[1.5px] border-gray-200 px-4 py-3 sm:py-2.5 transition-all focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <p className="mt-1 text-caption text-text-tertiary">Leave empty to auto-calculate from services</p>
          </div>

          {/* Price summary */}
          <div className="rounded-xl bg-surface-hover px-3 py-2.5">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-text-secondary">Bundle price</span>
              <span className="font-semibold text-text-primary">AED {bundlePrice.toFixed(0)}</span>
            </div>
            <div className="flex items-center justify-between text-body-sm mt-1">
              <span className="text-text-secondary">Duration</span>
              <span className="font-semibold text-text-primary">{formatDuration(effectiveDuration)}</span>
            </div>
            {savings > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-green-700">Savings</span>
                <span className="font-semibold text-green-700">AED {savings.toFixed(0)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {editingBundle && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-5 w-5 rounded border-text-disabled text-neutral-900 focus:ring-primary-100"
          />
          <span className="text-body-sm text-text-primary">Active</span>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-surface-active px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-primary hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || selectedServiceIds.length < 2}
          className="rounded-xl bg-neutral-900 px-4 py-2.5 sm:px-5 text-body-sm font-semibold text-text-inverse hover:bg-neutral-800 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {submitting ? "Saving..." : editingBundle ? "Save" : "Create Bundle"}
        </button>
      </div>
    </form>
  );
}
