import React from 'react'
import ReactDOM from 'react-dom/client'
import { buildWebApi } from './api-web'
import App from '@renderer/App'
import ErrorBoundary from '@renderer/components/ErrorBoundary'
import '@renderer/styles/globals.css'

// Install the web API implementation before App mounts so that
// every window.api call inside App is satisfied by the Supabase adapter.
console.log('[StudyHub] main.tsx: building web API...')
try {
  ;(window as Window & typeof globalThis).api = buildWebApi()
  console.log('[StudyHub] main.tsx: web API ready')
} catch (e) {
  console.error('[StudyHub] main.tsx: buildWebApi crashed:', e)
}

console.log('[StudyHub] main.tsx: mounting React...')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
