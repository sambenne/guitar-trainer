/** Tiny hash router: '#/player/:id' style patterns, ':' segments become params. */

export interface RouteContext {
  params: Record<string, string>;
}

export type PageRenderer = (root: HTMLElement, ctx: RouteContext) => void | (() => void);

interface Route {
  segments: string[];
  render: PageRenderer;
}

const routes: Route[] = [];
let outlet: HTMLElement | null = null;
let cleanup: (() => void) | void;

export function addRoute(pattern: string, render: PageRenderer): void {
  routes.push({ segments: split(pattern), render });
}

export function navigate(path: string): void {
  location.hash = '#' + path;
}

export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/';
}

function split(path: string): string[] {
  return path.replace(/^\/|\/$/g, '').split('/');
}

function match(route: Route, path: string[]): Record<string, string> | null {
  if (route.segments.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i];
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(path[i]);
    else if (seg !== path[i]) return null;
  }
  return params;
}

function renderCurrent(): void {
  if (!outlet) return;
  const path = split(currentPath());
  for (const route of routes) {
    const params = match(route, path);
    if (params) {
      if (cleanup) cleanup();
      outlet.innerHTML = '';
      outlet.scrollTop = 0;
      cleanup = route.render(outlet, { params });
      document.dispatchEvent(new CustomEvent('route-changed'));
      return;
    }
  }
  navigate('/library');
}

export function startRouter(mount: HTMLElement): void {
  outlet = mount;
  window.addEventListener('hashchange', renderCurrent);
  if (!location.hash) location.hash = '#/library';
  renderCurrent();
}
