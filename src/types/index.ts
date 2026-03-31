export type UserRole = "owner" | "admin" | "staff";

export type AppointmentStatus =
  | "scheduled"
  | "on_the_way"
  | "arrived"
  | "completed"
  | "paid"
  | "cancelled";

export type PaymentMethod = "cash" | "card";

export interface ServiceCategory {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface TeamGroup {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
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
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Service {
  id: string;
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
  appointment_id: string;
  staff_id: string;
}

export interface AppointmentService {
  id: string;
  appointment_id: string;
  service_id: string;
  staff_id: string | null;
  created_at: string;
}

export type CalendarBlockType = "break" | "travel" | "personal" | "other";

export interface CalendarBlock {
  id: string;
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
  appointment_id: string;
  amount: number;
  method: PaymentMethod;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  receipt_url: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  low_stock_threshold: number;
  created_at: string;
}
