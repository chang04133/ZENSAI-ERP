export interface User {
  user_id: string;
  user_name: string;
  partner_code: string | null;
  role_group: number;
  role_name?: string;
  partner_name?: string;
  password_hash?: string;
  last_login: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleGroup {
  group_id: number;
  group_name: string;
  description: string | null;
  permissions: Record<string, unknown>;
}
