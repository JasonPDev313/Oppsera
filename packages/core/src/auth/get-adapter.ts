import type { AuthAdapter } from './index';
import { SupabaseAuthAdapter } from './supabase-adapter';

let instance: AuthAdapter | null = null;

export function getAuthAdapter(): AuthAdapter {
  if (!instance) {
    instance = new SupabaseAuthAdapter();
  }
  return instance;
}
