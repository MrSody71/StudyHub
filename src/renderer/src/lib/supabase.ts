import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null
let _initUrl: string | null = null
let _initKey: string | null = null

/** Initialise (or re-initialise) the Supabase client.
 *  Returns the existing client if called again with the same URL + key. */
export function initSupabase(url: string, anonKey: string): SupabaseClient {
  if (_client && _initUrl === url && _initKey === anonKey) return _client

  const urlOk  = url     ? url.slice(0, 30)     + '…' : '(empty)'
  const keyOk  = anonKey ? anonKey.slice(0, 20) + '…' : '(empty)'
  console.log('[Supabase] init — URL:', urlOk, '| key:', keyOk)

  if (!url || !anonKey) {
    console.error('[Supabase] init failed: URL or key is missing')
  }

  _initUrl = url
  _initKey = anonKey
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
  _initUrl = null
  _initKey = null
}

/**
 * Returns the active session's user_id, or null if not authenticated.
 * Always calls getSession() so the token is refreshed if expired.
 */
export async function getActiveUserId(): Promise<string | null> {
  if (!_client) return null
  try {
    const { data: { session }, error } = await _client.auth.getSession()
    if (error) {
      console.error('[Supabase] getSession error:', error.message)
      return null
    }
    if (!session) {
      console.error('[Supabase] getSession: нет активной сессии')
      return null
    }
    return session.user.id
  } catch (e) {
    console.error('[Supabase] getSession exception:', e)
    return null
  }
}
