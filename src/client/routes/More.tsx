import { useNavigate } from 'react-router';
import { useAppState } from '../lib/queries';
import { plural } from '../lib/format';
import { Icon, type IconName } from '../components/Icon';
import { PageHeader } from '../components/ui';

export function More() {
  const nav = useNavigate();
  const { data } = useAppState();
  const links: [string, string, IconName, string][] = [
    ['/templates', 'Templates', 'tmpl', data ? plural(data.templates.length, 'template') : ''],
    ['/people', 'People', 'users', data ? plural(data.people.length, 'person', 'people') : ''],
    ['/suitcases', 'Suitcases', 'bag', data ? plural(data.suitcases.length, 'suitcase') : ''],
    ['/connect', 'Connect an AI assistant', 'ai', 'Claude, ChatGPT and others'],
    ['/settings', 'Settings', 'settings', 'Backup, install, sign out'],
  ];
  return (
    <div>
      <PageHeader title={data?.settings.instance_name ?? 'More'} />
      {links.map(([to, label, icon, sub]) => (
        <button
          key={to}
          onClick={() => nav(to)}
          className="flex w-full items-center gap-3.5 border-b border-line px-5 py-3.5 text-left"
        >
          <Icon name={icon} className="text-soft" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base">{label}</span>
            <span className="text-[13px] text-soft">{sub}</span>
          </span>
          <Icon name="chevRight" className="text-faint" />
        </button>
      ))}
    </div>
  );
}
