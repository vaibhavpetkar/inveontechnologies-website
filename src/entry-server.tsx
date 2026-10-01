// Build-time only: renders one page to HTML for scripts/prerender.mjs.
import { renderToString } from 'react-dom/server';
import type { HelmetServerState } from 'react-helmet-async';
import App from './App';
import { PUBLIC_PATHS, preloadRoute } from './routes';

export { PUBLIC_PATHS };

export async function render(path: string) {
  await preloadRoute(path);
  const helmetContext: { helmet?: HelmetServerState } = {};
  const html = renderToString(<App ssrPath={path} helmetContext={helmetContext} />);
  const h = helmetContext.helmet;
  const head = h ? [h.title, h.meta, h.link, h.script].map((part) => part.toString()).filter(Boolean).join('\n    ') : '';
  return { html, head };
}
