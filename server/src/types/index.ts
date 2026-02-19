export interface TokenPayload {
  userId: string;
  userName: string;
  role: string;
  partnerCode: string | null;
}

export interface User {
  user_id: string;
  user_name: string;
  partner_code: string | null;
  role_group: number;
  role_name?: string;
  password_hash?: string;
  last_login: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  partner_code: string;
  partner_name: string;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  contact: string | null;
  partner_type: '직영' | '가맹' | '온라인';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  product_code: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  season: string | null;
  base_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  variant_id: number;
  product_code: string;
  color: string;
  size: string;
  sku: string;
  price: number | null;
  is_active: boolean;
  created_at: string;
}

export interface RoleGroup {
  group_id: number;
  group_name: string;
  description: string | null;
  permissions: Record<string, unknown>;
}

export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
