import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isStaleClientChunkError, reloadForFreshClientAssets } from './lib/client-asset-reload';
import './index.css';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadForFreshClientAssets();
});

window.addEventListener('unhandledrejection', (event) => {
  if (isStaleClientChunkError(event.reason)) {
    event.preventDefault();
    reloadForFreshClientAssets();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
