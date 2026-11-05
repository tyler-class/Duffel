import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import { cx, Sheet } from './ui';

const LINKS: [string, string, IconName][] = [
  ['https://github.com/tyler-class/Duffel', 'Duffel on GitHub', 'github'],
  ['mailto:duffel@tylerclass.net', 'Questions or help? duffel@tylerclass.net', 'mail'],
  [
    'https://ko-fi.com/tylerclass',
    'Duffel is free, no baggage fees. Buy me a coffee to keep it that way ☕',
    'dollar',
  ],
  ['https://tylerclass.net', 'tylerclass.net', 'link'],
];

/** About Duffel: version, what it is, who built it, and links. */
export function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="About Duffel"
      sub={`Version ${__APP_VERSION__}`}
      closeButton
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-base text-ink">
          Duffel is a free, open-source packing list for families: who packs what, which bag it goes
          in, and the to-dos around every trip. It runs on your own Cloudflare account, so your data
          stays yours.
        </p>
        <p className="text-sm text-soft">Built by Tyler Class.</p>
      </div>
      <div className="pt-3 pb-2">
        {LINKS.map(([href, label, icon]) => (
          <a
            key={href}
            href={href}
            // Email opens the mail app; the rest open in a new tab.
            {...(href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noreferrer' })}
            className="flex w-full items-center gap-3 border-t border-line py-3.5 text-base text-ink"
          >
            <Icon name={icon} size={18} className="flex-none text-accent" />
            <span className="flex-1">{label}</span>
            <Icon name="chevRight" size={16} className="flex-none text-faint" />
          </a>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * "About Duffel" and its sheet. `nav` looks like a sidebar item; `header` is a small pill
 * for the top right of a page.
 */
export function AboutButton({
  variant,
  className,
}: {
  variant: 'nav' | 'header';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          variant === 'nav'
            ? 'flex items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-[15px] text-soft hover:bg-line/60'
            : 'inline-flex flex-none items-center gap-1.5 rounded-full bg-chip px-3.5 py-2 text-sm text-soft',
          className,
        )}
      >
        <Icon name="info" size={variant === 'nav' ? 20 : 16} />
        About Duffel
      </button>
      <AboutSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
