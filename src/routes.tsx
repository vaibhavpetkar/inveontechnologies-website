import { lazy, type ComponentType } from 'react';
import { SERVICES } from '@/data/services';

type Loader = () => Promise<{ default: ComponentType<any> }>;
export type LazyPage = ComponentType<any> & { preload: () => Promise<void> };

/**
 * A page loaded on demand, so visitors only download the code for the page
 * they open. `preload()` loads it ahead of time: the build does that before
 * pre-rendering, and the browser does it before taking over a pre-rendered
 * page, so neither ever shows a loading state.
 */
function page(load: Loader): LazyPage {
  let Loaded: ComponentType<any> | null = null;
  const Lazy = lazy(() => load().then((m) => ((Loaded = m.default), m)));
  const Page = ((props: any) => (Loaded ? <Loaded {...props} /> : <Lazy {...props} />)) as LazyPage;
  Page.preload = () => load().then((m) => void (Loaded = m.default));
  return Page;
}

export const RedirectToPortal = page(() => import('@/pages/careers/RedirectToPortal'));

export const ROUTES: { path: string; page: LazyPage }[] = [
  { path: '/', page: page(() => import('@/pages/Home')) },
  { path: '/services', page: page(() => import('@/pages/Services')) },
  { path: '/services/:slug', page: page(() => import('@/pages/ServiceDetail')) },
  { path: '/products', page: page(() => import('@/pages/Products')) },
  { path: '/products/:id', page: page(() => import('@/pages/ProductDetail')) },
  { path: '/insights', page: page(() => import('@/pages/Insights')) },
  { path: '/clients', page: page(() => import('@/pages/Clients')) },
  { path: '/about', page: page(() => import('@/pages/About')) },
  { path: '/contact', page: page(() => import('@/pages/Contact')) },
  { path: '/careers', page: page(() => import('@/pages/Careers')) },
  { path: '/privacy', page: page(() => import('@/pages/Privacy')) },
  { path: '/terms', page: page(() => import('@/pages/Terms')) },
  // Retired: this flow was a localStorage-only mock (plaintext passwords, no
  // real backend). Real candidate accounts live on the portal; nginx also
  // redirects these paths there directly.
  { path: '/careers/login', page: RedirectToPortal },
  { path: '/careers/profile', page: RedirectToPortal },
  { path: '/careers/apply/:roleId', page: RedirectToPortal },
  { path: '/careers/test/:roleId', page: RedirectToPortal },
  { path: '/careers/payment/:roleId', page: RedirectToPortal },
];

const toRegex = (pattern: string) => new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}/?$`);

/** Loads the code for the page at `path`, if it is one of ours. */
export async function preloadRoute(path: string) {
  await ROUTES.find((r) => toRegex(r.path).test(path))?.page.preload();
}

/** Every public page, for pre-rendering and the sitemap. */
export const PUBLIC_PATHS = [
  '/',
  '/services',
  ...SERVICES.map((s) => `/services/${s.slug}`),
  '/products',
  ...['crm', 'erp', 'erpnext', 'ai-suite'].map((id) => `/products/${id}`),
  '/insights',
  '/clients',
  '/about',
  '/contact',
  '/careers',
  '/privacy',
  '/terms',
];
