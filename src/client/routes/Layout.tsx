import { NavLink, Outlet, useLocation } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { cx } from '../components/ui';

const TABS: [string, string, IconName][] = [
  ['/', 'Trips', 'map'],
  ['/catalog', 'Catalog', 'grid'],
  ['/templates', 'Templates', 'tmpl'],
  ['/settings', 'Settings', 'settings'],
];

function activeTab(path: string): string {
  for (const p of ['/catalog', '/templates', '/settings']) if (path.startsWith(p)) return p;
  return '/';
}

export function Layout() {
  const { pathname } = useLocation();
  const active = activeTab(pathname);
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col pt-safe">
      <main className="flex-1 pb-[calc(72px+env(safe-area-inset-bottom,0px))]">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-safe backdrop-blur">
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
              <Icon name={icon} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
