export default function LoadingScreen() {
  return (
    <div className="loading-screen" aria-label="Загрузка приложения">
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
