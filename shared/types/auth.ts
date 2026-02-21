export interface TokenPayload {
  userId: string;
  userName: string;
  role: string;
  partnerCode: string | null;
}

export interface LoginRequest {
  user_id: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: TokenPayload;
}
