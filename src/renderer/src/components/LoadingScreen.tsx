import { useState, useEffect } from 'react'

interface Props {
  /** When false the screen fades out and unmounts */
  visible: boolean
}

export default function LoadingScreen({ visible }: Props) {
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    if (!visible) {
      // Keep mounted long enough for the CSS fade-out to complete
      const t = setTimeout(() => setMounted(false), 450)
      return () => clearTimeout(t)
    }
    setMounted(true)
  }, [visible])

  if (!mounted) return null

  return (
    <div
      className="loading-screen"
      style={{
        opacity:       visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      aria-live="polite"
      aria-label="Загрузка приложения"
    >
      {/* Logo */}
      <div className="loading-logo">
        <span className="loading-logo-icon">📚</span>
        <span className="loading-logo-name">StudyHub</span>
      </div>

      {/* Three pulsing dots */}
      <div className="loading-dots" aria-hidden="true">
        <span className="loading-dot" style={{ animationDelay: '0ms'   }} />
        <span className="loading-dot" style={{ animationDelay: '180ms' }} />
        <span className="loading-dot" style={{ animationDelay: '360ms' }} />
      </div>
    </div>
  )
}
