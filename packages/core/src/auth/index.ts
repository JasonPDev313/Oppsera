export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantStatus: string;
  membershipStatus: string;
}

export interface AuthAdapter {
  validateToken(token: string): Promise<AuthUser | null>;
  signUp(email: string, password: string, name: string): Promise<{ userId: string }>;
  signIn(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }>;
  signOut(token: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
  sendMagicLink(email: string): Promise<void>;
}

export { SupabaseAuthAdapter } from './supabase-adapter';
export { requestContext, getRequestContext } from './context';
export type { RequestContext } from './context';
export { authenticate, resolveTenant } from './middleware';
export { withMiddleware } from './with-middleware';
export type { ImpersonationInfo, ImpersonationClaims, ImpersonationTokenPayload, ImpersonationSession } from './impersonation';
export {
  verifyImpersonationToken,
  createImpersonationAccessToken,
  createImpersonationRefreshToken,
  verifyExchangeToken,
  createExchangeToken,
  createImpersonationSession,
  activateImpersonationSession,
  getActiveImpersonationSession,
  endImpersonationSession,
  incrementImpersonationActionCount,
} from './impersonation';
