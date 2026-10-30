export type UserRole = 'client' | 'pro' | 'admin';
export type ExtractRole = Extract<UserRole, 'client' | 'pro'>;
export type ZoneName =
  | 'distrito_nacional'
  | 'santo_domingo_este'
  | 'santo_domingo_norte'
  | 'santo_domingo_oeste';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type GeoPoint = { type: 'Point'; coordinates: [number, number] };
export type AssignmentMode = 'manual' | 'auto';
export type BookingStatus =
  | 'requested'
  | 'awaiting_payment'
  | 'scheduled'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'confirmed'
  | 'cancelled'
  | 'disputed'
  | 'expired';
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type PaymentStatus = 'pending' | 'held' | 'released' | 'refunded' | 'failed';
export type IssueStatus = 'open' | 'in_review' | 'resolved';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Sector {
  id: number;
  name: string;
  zone: ZoneName;
  center: string | GeoPoint;
  active: boolean;
}

export interface ProProfile {
  user_id: string;
  bio: string | null;
  years_experience: number | null;
  base_sector_id: number | null;
  verification_status: VerificationStatus;
  id_document_path: string | null;
  verification_note?: string | null;
  verification_reviewed_at?: string | null;
  verification_reviewed_by?: string | null;
  accepts_auto_assign: boolean;
  active: boolean;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  transport_type?: string | null;
  service_area_latitude?: number | null;
  service_area_longitude?: number | null;
  service_area_radius_m?: number | null;
  created_at: string;
}

export interface ProCard {
  pro_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  years_experience: number | null;
  base_sector_id: number | null;
  rating_avg: number;
  rating_count: number;
  jobs_completed: number;
  transport_type?: string | null;
}

export interface ProSector {
  pro_id: string;
  sector_id: number;
}

export interface ProAvailability {
  id: number;
  pro_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface ServiceType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  category_id?: number | null;
}

export interface PricingTier {
  id: number;
  service_type_id: number;
  label: string;
  bedrooms: number | null;
  bathrooms: number | null;
  price_dop: number;
  est_minutes: number;
}

export interface Address {
  id: string;
  client_id: string;
  label: string | null;
  street: string | null;
  references_text: string | null;
  sector_id: number | null;
  location: string;
  created_at: string;
}

export interface Booking {
  id: string;
  client_id: string;
  pro_id: string | null;
  service_type_id: number;
  pricing_tier_id: number | null;
  pro_service_id: string | null;
  address_id: string;
  client_lat: number | null;
  client_lng: number | null;
  address_text: string | null;
  landmark_notes: string | null;
  assignment_mode: AssignmentMode;
  status: BookingStatus;
  scheduled_start: string;
  est_minutes: number;
  price_dop: number;
  commission_pct: number;
  commission_dop: number;
  pro_payout_dop: number;
  notes: string | null;
  created_at: string;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
}

export interface BookingRequest {
  id: string;
  booking_id: string;
  pro_id: string;
  status: RequestStatus;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

export interface Review {
  id: string;
  booking_id: string;
  client_id: string;
  pro_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}