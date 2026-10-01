import { createRoot, hydrateRoot } from 'react-dom/client';

import App from './App';
import { preloadRoute } from './routes';

import './index.css';

const root = document.getElementById('root')!;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

if (root.hasChildNodes()) {
  // The build pre-rendered this page: load its code first, then take over
  // the existing HTML instead of redrawing it.
  preloadRoute(location.pathname.slice(base.length) || '/').then(() => hydrateRoot(root, <App />));
} else {
  createRoot(root).render(<App />);
}
