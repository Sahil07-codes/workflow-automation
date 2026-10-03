/**
 * JWT claims
 */
export interface JwtClaims {
  sub: string; // user ID
  email: string;
  role: string; // USER, SUPPORT, ADMIN, SUPERADMIN
  sid: string; // session ID (refresh token family)
  iat: number;
  exp: number;
}

/**
 * Token pair returned after login
 */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * OTP challenge information
 */
export interface OtpChallenge {
  id: string;
  target: string; // email or phone
  channel: 'EMAIL' | 'SMS';
  attempts: number;
  expires_at: Date;
  consumed_at?: Date;
}

/**
 * Refresh token entity
 */
export interface RefreshToken {
  id: string;
  user_id: string;
  family_id: string; // Links tokens from same login session
  token_hash: string;
  used_at?: Date;
  revoked_at?: Date;
  expires_at: Date;
  ip?: string;
  user_agent?: string;
  created_at: Date;
}

/**
 * Request user context (extracted from JWT)
 */
export interface RequestUser {
  id: string;
  email: string;
  phone_e164?: string;
  role: string;
  session_id: string; // refresh token family ID
}
