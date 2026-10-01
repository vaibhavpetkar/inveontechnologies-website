// After the normal client build, renders every public page to its own HTML
// file (dist/public/about.html and so on) with that page's title, meta tags,
// canonical link and content already in place. Search engines then see a
// real page for every URL instead of the same empty shell, and visitors see
// content before any JavaScript runs. Also writes sitemap.xml and 404.html.
import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist/public');
const serverOut = path.join(root, 'dist/server');
const SITE = 'https://inveontechnologies.in';

await build({
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'warn',
  build: { ssr: 'src/entry-server.tsx', outDir: serverOut, emptyOutDir: true },
});

const { render, PUBLIC_PATHS } = await import(pathToFileURL(path.join(serverOut, 'entry-server.js')).href);
const template = await fs.readFile(path.join(out, 'index.html'), 'utf8');
const DEFAULTS = /<!--head-defaults-->[\s\S]*?<!--\/head-defaults-->/;
if (!DEFAULTS.test(template)) throw new Error('index.html is missing the <!--head-defaults--> markers');

const page = (html, head) =>
  template.replace(DEFAULTS, head || template.match(DEFAULTS)[0]).replace('<div id="root"></div>', `<div id="root">${html}</div>`);

for (const url of PUBLIC_PATHS) {
  const { html, head } = await render(url);
  if (!head.includes('rel="canonical"')) throw new Error(`${url} has no canonical link`);
  const file = url === '/' ? 'index.html' : `${url.slice(1)}.html`;
  await fs.mkdir(path.dirname(path.join(out, file)), { recursive: true });
  await fs.writeFile(path.join(out, file), page(html, head));
}

// Unknown addresses get a real 404 page (nginx serves it with status 404).
const missing = await render('/this-page-does-not-exist');
await fs.writeFile(path.join(out, '404.html'), page(missing.html, missing.head.replace(/<link[^>]*rel="canonical"[^>]*>/, '') + '\n    <meta name="robots" content="noindex" />'));

const today = new Date().toISOString().slice(0, 10);
const urls = PUBLIC_PATHS.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join('\n');
await fs.writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

await fs.rm(serverOut, { recursive: true, force: true });
console.log(`Pre-rendered ${PUBLIC_PATHS.length} pages, 404.html and sitemap.xml`);
