import { createContext, useContext } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:        string
  email:     string
  role:      'student' | 'admin'
  full_name: string | null
}

interface AuthContextValue {
  /** Null until user is authenticated and profile has been loaded */
  userProfile: UserProfile | null
}

// ── Context ───────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthContextValue>({ userProfile: null })

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the current user profile from context */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
