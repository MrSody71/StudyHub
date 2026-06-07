import React from 'react'
import ReactDOM from 'react-dom/client'
import { buildWebApi } from './api-web'
import App from '@renderer/App'
import ErrorBoundary from '@renderer/components/ErrorBoundary'
import '@renderer/styles/globals.css'

// Install the web API implementation before App mounts so that
// every window.api call inside App is satisfied by the Supabase adapter.
;(window as Window & typeof globalThis).api = buildWebApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
