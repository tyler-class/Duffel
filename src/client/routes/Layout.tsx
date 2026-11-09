import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { AboutButton } from '../components/AboutSheet';
import { Icon, type IconName } from '../components/Icon';
import { cx } from '../components/ui';
import { useTabSwipe } from '../lib/tabSwipe';

const TABS: [string, string, IconName][] = [
  ['/', 'Trips', 'map'],
  ['/catalog', 'Catalog', 'grid'],
  ['/templates', 'Templates', 'tmpl'],
  ['/settings', 'Settings', 'settings'],
];

const TAB_PATHS = TABS.map(([to]) => to);

/** The tab whose main page this is (swiping between tabs works there), or null deeper in. */
function tabRoot(path: string): string | null {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/trips') return '/';
  return TAB_PATHS.includes(p) ? p : null;
}

function activeTab(path: string): string {
  for (const p of ['/catalog', '/templates', '/settings']) if (path.startsWith(p)) return p;
  return '/';
}

export function Layout() {
  const { pathname } = useLocation();
  const active = activeTab(pathname);
  useTabSwipe(TAB_PATHS, tabRoot(pathname));
  // A new page starts at the top (the browser did this when the whole document scrolled).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    // Like Nitrogen: the page is the size of the screen and only the content area below the app
    // bar scrolls. The document itself never scrolls, so iOS never blurs content under the
    // status bar in the installed app.
    <div className="flex h-full flex-col md:pl-60">
      {/* Phones: a solid app bar at the top. */}
      <header className="z-20 flex h-[calc(env(safe-area-inset-top,0px)+48px)] flex-none items-center justify-center gap-2 border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)] md:hidden">
        <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
        <span className="text-[17px] font-semibold">Duffel</span>
      </header>
      {/* Tablet and desktop: a sidebar on the left. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-chip px-3 pt-[calc(20px+env(safe-area-inset-top,0px))] pb-5 md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-6">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="truncate text-[15px] font-semibold">Duffel</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {TABS.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              className={cx(
                'flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[15px]',
                active === to
                  ? 'bg-accent-tint font-semibold text-accent'
                  : 'text-soft hover:bg-line/60',
              )}
              aria-current={active === to ? 'page' : undefined}
            >
              <Icon name={icon} />
              {label}
            </NavLink>
          ))}
        </nav>
        <AboutButton variant="nav" className="mt-auto" />
      </aside>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 md:pt-safe"
      >
        <main className="mx-auto w-full max-w-2xl pb-[calc(72px+env(safe-area-inset-bottom,0px))] md:max-w-3xl md:px-6 md:pt-4 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Phones: tabs along the bottom. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-safe backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-4 pt-2 pb-2">
          {TABS.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              className={cx(
                'flex flex-col items-center gap-1 text-[11px]',
                active === to ? 'text-accent' : 'text-faint',
              )}
              aria-current={active === to ? 'page' : undefined}
            >
              <Icon name={icon} size={23} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
