import { createClient } from '../vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'conselho-auth', detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } },
});

export const usernameToEmail = (u) => `${String(u).trim().toLowerCase()}@conselho.app`;
