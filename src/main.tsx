import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './design/App';
import './design/styles/main.scss';
import { registerServiceWorker } from './logic/utils/registerSW';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register PWA Service Worker for offline support and installability
registerServiceWorker();

