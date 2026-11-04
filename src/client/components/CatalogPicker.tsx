import { useMemo, useState } from 'react';
import type { Item } from '@shared/types';
import { Icon } from './Icon';
import { cx, ErrorText, GhostButton, PrimaryButton, Sheet } from './ui';

type PickerProps = {
  open: boolean;
  title: string;
  items: Item[];
  suggested?: Item[];
  exclude?: Set<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => Promise<void>;
};

/** Multi-select catalog items, with optional suggestions pinned on top. */
export function CatalogPicker(props: PickerProps) {
  if (!props.open) return null;
  return <PickerBody {...props} />;
}

function PickerBody(props: PickerProps) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const suggestedIds = useMemo(
    () => new Set((props.suggested ?? []).map((i) => i.id)),
    [props.suggested],
  );
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const visible = props.items.filter(
      (i) =>
        !i.archived &&
        !props.exclude?.has(i.id) &&
        (!needle ||
          i.name.toLowerCase().includes(needle) ||
          (i.category ?? '').toLowerCase().includes(needle)),
    );
    const out = new Map<string, Item[]>();
    if (!needle && suggestedIds.size) {
      const s = visible.filter((i) => suggestedIds.has(i.id));
      if (s.length) out.set('Suggested for this trip', s);
    }
    for (const i of visible) {
      if (!needle && suggestedIds.has(i.id)) continue;
      const k = i.category || 'Other';
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(i);
    }
    const sugg = out.get('Suggested for this trip');
    const rest = [...out.entries()]
      .filter(([k]) => k !== 'Suggested for this trip')
      .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
    return sugg ? [['Suggested for this trip', sugg] as [string, Item[]], ...rest] : rest;
  }, [props.items, props.exclude, q, suggestedIds]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function add() {
    setBusy(true);
    setError('');
    try {
      await props.onAdd([...picked]);
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add those.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <div className="ml-auto flex items-center">
            <GhostButton onClick={props.onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={add} disabled={!picked.size || busy}>
              {picked.size ? `Add ${picked.size}` : 'Add'}
            </PrimaryButton>
          </div>
        </>
      }
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface py-2.5">
        <Icon name="search" className="text-faint" />
        <input
          aria-label="Search the catalog"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-base focus:outline-none"
        />
      </div>
      {groups.length === 0 && (
        <p className="py-10 text-center text-sm text-soft">
          {props.items.length ? 'Nothing matches.' : 'Your catalog is empty.'}
        </p>
      )}
      {groups.map(([group, list]) => (
        <section key={group} className="pt-4">
          <h3 className="pb-1 text-xs tracking-[0.08em] text-soft uppercase">{group}</h3>
          {list.map((i) => {
            const on = picked.has(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggle(i.id)}
                aria-pressed={on}
                className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left"
              >
                <span
                  className={cx(
                    'grid h-5 w-5 flex-none place-items-center rounded-md border-[1.5px]',
                    on ? 'border-accent bg-accent text-accent-ink' : 'border-faint',
                  )}
                >
                  {on && <Icon name="check" size={14} strokeWidth={2.4} />}
                </span>
                <span className="flex-1 text-base">{i.name}</span>
              </button>
            );
          })}
        </section>
      ))}
    </Sheet>
  );
}
