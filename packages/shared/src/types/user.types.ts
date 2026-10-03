/**
 * User roles for RBAC
 */
export enum UserRole {
  USER = 'USER',
  SUPPORT = 'SUPPORT',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}

/**
 * User account status
 */
export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

/**
 * User entity interface
 */
export interface User {
  id: string;
  email: string;
  phone_e164: string;
  password_hash?: string;
  email_verified_at?: Date;
  phone_verified_at?: Date;
  role: UserRole;
  status: UserStatus;
  referral_code: string;
  referred_by?: string;
  consent_version: string;
  consent_at: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Minimal user info (safe for exposure)
 */
export interface UserPublic {
  id: string;
  email: string;
  referral_code: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
}
