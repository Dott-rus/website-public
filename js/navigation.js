const RANDOM_ROUTE_FALLBACKS = [
  '/',
  '/about/',
  '/projects/',
  '/tracks/',
  '/buttons/',
  '/now/',
  '/feed/',
  '/stuff/',
  'https://album.somedott.space/',
];

function initMobileNavigation() {
  const sidebar = document.getElementById('sidebar-container');
  if (!sidebar || document.getElementById('hamburger-btn')) return;

  const hamburgerButton = document.createElement('button');
  hamburgerButton.id = 'hamburger-btn';
  hamburgerButton.className = 'hamburger-btn';
  hamburgerButton.type = 'button';
  hamburgerButton.setAttribute('aria-label', 'Toggle navigation');
  hamburgerButton.setAttribute('aria-controls', 'sidebar-container');
  hamburgerButton.setAttribute('aria-expanded', 'false');
  hamburgerButton.innerHTML = '<span></span><span></span><span></span>';
  hamburgerButton.addEventListener('click', function () {
    const isOpen = sidebar.classList.toggle('sidebar-open');
    hamburgerButton.classList.toggle('active', isOpen);
    hamburgerButton.setAttribute('aria-expanded', String(isOpen));
  });
  document.body.appendChild(hamburgerButton);
}

function initRandomNavigation() {
  const link = document.getElementById('random-page-link');
  if (!link || link.dataset.randomReady === 'true') return;

  let builtRoutes = [];
  try {
    builtRoutes = JSON.parse(link.dataset.randomRoutes || '[]');
  } catch {
    // Unbuilt layout templates contain a placeholder here; fallbacks still work.
  }
  if (!Array.isArray(builtRoutes)) builtRoutes = [];

  const routes = Array.from(new Set([
    ...RANDOM_ROUTE_FALLBACKS,
    ...builtRoutes.filter((route) => typeof route === 'string'),
  ]));
  link.dataset.randomReady = 'true';

  link.addEventListener('click', function (event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const choices = routes.filter(function (route) {
      try {
        const routePath = new URL(route, window.location.origin).pathname.replace(/\/+$/, '') || '/';
        return routePath !== currentPath;
      } catch {
        return false;
      }
    });
    if (!choices.length) return;

    event.preventDefault();
    window.location.assign(choices[Math.floor(Math.random() * choices.length)]);
  });
}

function initNavigation() {
  initMobileNavigation();
  initRandomNavigation();
}

document.addEventListener('dott:layout-ready', initNavigation);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavigation, { once: true });
} else {
  initNavigation();
}
