import { useAuth } from '../contexts/AuthContext'

export interface RoleInfo {
  role:      'student' | 'admin'
  isAdmin:   boolean
  isStudent: boolean
}

/**
 * Returns the current user's role.
 *
 * Usage:
 *   const { isAdmin } = useRole()
 *   {isAdmin && <AdminPanel />}
 *
 * Defaults to 'student' when no profile is loaded (unauthenticated or loading).
 */
export function useRole(): RoleInfo {
  const { userProfile } = useAuth()
  const role = userProfile?.role ?? 'student'
  return {
    role,
    isAdmin:   role === 'admin',
    isStudent: role === 'student',
  }
}
