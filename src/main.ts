import './theme.css';
import { registerSW } from 'virtual:pwa-register';
import { addRoute, currentPath, startRouter } from './app/router';
import { renderLibrary } from './pages/library';
import { renderPlayer } from './pages/player';
import { renderSettings } from './pages/settings';

const app = document.querySelector<HTMLDivElement>('#app')!;

const NAV_ITEMS = [
  {
    path: '/library',
    label: 'Library',
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.61 3.61 0 0 1 8.4 12c0-1.98 1.62-3.6 3.6-3.6s3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
  },
];

app.innerHTML = `
  <main id="outlet"></main>
  <nav class="bottom-nav">
    ${NAV_ITEMS.map(
      (item) => `<a href="#${item.path}" data-path="${item.path}">${item.icon}<span>${item.label}</span></a>`,
    ).join('')}
  </nav>
`;

function updateNav(): void {
  const path = currentPath();
  app.querySelectorAll<HTMLAnchorElement>('.bottom-nav a').forEach((a) => {
    a.classList.toggle('active', path.startsWith(a.dataset.path!));
  });
  // Hide the nav inside the player for maximum screen space
  const inPlayer = path.startsWith('/player/');
  (app.querySelector('.bottom-nav') as HTMLElement).style.display = inPlayer ? 'none' : '';
  (app.querySelector('#outlet') as HTMLElement).classList.toggle('no-nav', inPlayer);
}
document.addEventListener('route-changed', updateNav);

addRoute('/library', renderLibrary);
addRoute('/player/:id', renderPlayer);
addRoute('/settings', (root) => renderSettings(root));

startRouter(document.querySelector('#outlet')!);

registerSW({ immediate: true });
