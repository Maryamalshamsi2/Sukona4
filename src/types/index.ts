export type UserRole = "owner" | "admin" | "staff";

export type AppointmentStatus =
  | "scheduled"
  | "on_the_way"
  | "arrived"
  | "completed"
  | "paid"
  | "cancelled";

export type PaymentMethod = "cash" | "card" | "other";

/**
 * A salon (tenant). Every other tenant-scoped row carries a `salon_id`
 * pointing here. RLS isolates data per salon.
 */
export interface Salon {
  id: string;
  name: string;
  slug: string | null;
  brand_color: string | null;
  contact_phone: string | null;
  public_review_url: string | null;
  signoff: string | null;
  default_language: string;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_access_token: string | null;
  is_onboarded: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceCategory {
  id: string;
  salon_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface TeamGroup {
  id: string;
  salon_id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  salon_id: string;
  email: string | null;
  full_name: string;
  role: UserRole;
  phone: string | null;
  group_id: string | null;
  salary: number;
  job_title: string | null;
  created_at: string;
  // joined from team_groups
  team_groups?: TeamGroup | null;
}

export interface Client {
  id: string;
  salon_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  map_link: string | null;
  notes: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  salon_id: string;
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  category_id: string | null;
  created_at: string;
  // joined from service_categories
  service_categories?: ServiceCategory | null;
}

export interface Appointment {
  id: string;
  salon_id: string;
  client_id: string;
  service_id: string | null;
  date: string;
  time: string;
  status: AppointmentStatus;
  notes: string | null;
  duration_override: number | null;
  created_at: string;
}

export interface AppointmentStaff {
  salon_id: string;
  appointment_id: string;
  staff_id: string;
}

export interface AppointmentService {
  id: string;
  salon_id: string;
  appointment_id: string;
  service_id: string;
  staff_id: string | null;
  created_at: string;
}

export type CalendarBlockType = "break" | "travel" | "personal" | "other";

export interface CalendarBlock {
  id: string;
  salon_id: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  block_type: CalendarBlockType;
  created_at: string;
}

export interface Payment {
  id: string;
  salon_id: string;
  appointment_id: string;
  amount: number;
  method: PaymentMethod;
  receipt_url: string | null;
  note: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  salon_id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  receipt_url: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  salon_id: string;
  name: string;
  quantity: number;
  low_stock_threshold: number;
  created_at: string;
}

export interface StaffSchedule {
  id: string;
  salon_id: string;
  profile_id: string;
  day_of_week: number; // 0=Sunday ... 6=Saturday
  is_day_off: boolean;
  start_time: string | null; // "HH:MM"
  end_time: string | null;
  created_at: string;
}

export interface StaffDayOff {
  id: string;
  salon_id: string;
  profile_id: string;
  date: string; // "YYYY-MM-DD"
  reason: string | null;
  created_at: string;
}

export interface ServiceBundleItem {
  id: string;
  salon_id: string;
  bundle_id: string;
  service_id: string;
  sort_order: number;
  created_at: string;
  // joined
  services?: Service | null;
}

export interface ServiceBundle {
  id: string;
  salon_id: string;
  name: string;
  category_id: string | null;
  discount_type: "percentage" | "fixed";
  discount_percentage: number | null;
  fixed_price: number | null;
  duration_override: number | null;
  is_active: boolean;
  created_at: string;
  // joined
  service_categories?: ServiceCategory | null;
  service_bundle_items?: ServiceBundleItem[];
}
