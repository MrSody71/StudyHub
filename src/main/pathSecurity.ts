import path from 'path'
import { app } from 'electron'

/**
 * Sanitise a user-supplied filename by stripping directory components,
 * null bytes, and OS-reserved characters.
 * Returns a safe basename that can be used with path.join().
 */
export function sanitizeFilename(filename: string): string {
  // Take only the basename — strips any directory traversal (../ etc.)
  let safe = path.basename(filename)

  // Remove null bytes (poison for C-level file APIs)
  safe = safe.replace(/\0/g, '')

  // Strip characters forbidden on Windows / dangerous on any OS
  safe = safe.replace(/[/\\?%*:|"<>]/g, '_')

  // Prevent hidden files / dotfile tricks
  safe = safe.replace(/^\.+/, '')

  // Fallback for completely empty result
  if (!safe || safe.trim() === '') {
    safe = `unnamed_${Date.now()}`
  }

  return safe
}

/**
 * Verify that `targetPath` resolves to a location inside the app's
 * userData directory. Prevents path-traversal attacks via crafted DB values.
 */
export function isInsideUserData(targetPath: string): boolean {
  const userData = path.resolve(app.getPath('userData'))
  const resolved = path.resolve(targetPath)
  // Ensure the resolved path starts with userData + separator (or is userData itself)
  return resolved === userData || resolved.startsWith(userData + path.sep)
}
