import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/** Initialise (or re-initialise) the Supabase client. */
export function initSupabase(url: string, anonKey: string): SupabaseClient {
  if (import.meta.env.DEV) {
    console.log('[Supabase] init — URL:', url || '(empty)', '| key:', anonKey ? anonKey.slice(0, 20) + '…' : '(empty)')
  }
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      storageKey: 'studyhub-supabase-auth',
      storage: localStorage,
    },
  })
  return _client
}

/** Returns the current client, or null if not yet initialised. */
export function getSupabase(): SupabaseClient | null {
  return _client
}

/** Clears the client (e.g. after removing config). */
export function clearSupabase(): void {
  _client = null
}
