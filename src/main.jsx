import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// RC16.4: Apply saved text-size preference before React renders (avoids FOUC)
try {
  const savedSize = localStorage.getItem('borisend.text_size');
  document.documentElement.setAttribute('data-text-size', savedSize || 'standard');
} catch {
  document.documentElement.setAttribute('data-text-size', 'standard');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // Check for SW updates every 5 minutes
      setInterval(() => registration.update().catch(() => {}), 300000);

      // If a new SW is waiting, activate it immediately
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // Reload the page when a new SW takes over
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    }).catch(() => {});
  });
}