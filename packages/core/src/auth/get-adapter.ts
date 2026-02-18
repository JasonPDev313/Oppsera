import type { AuthAdapter } from './index';
import { SupabaseAuthAdapter } from './supabase-adapter';
import { DevAuthAdapter } from './dev-adapter';

let instance: AuthAdapter | null = null;

export function getAuthAdapter(): AuthAdapter {
  if (!instance) {
    if (process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
      console.log('[DEV AUTH] Using DevAuthAdapter — Supabase bypassed');
      instance = new DevAuthAdapter();
    } else {
      instance = new SupabaseAuthAdapter();
    }
  }
  return instance;
}
