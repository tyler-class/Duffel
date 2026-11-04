import { useState } from 'react';
import { PERSON_COLORS } from '@shared/lookups';
import type { Person } from '@shared/types';
import { api } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
import { OnePicker } from '../components/fields';
import { CatalogHeader } from '../components/CatalogNav';
import { SwipeRow } from '../components/SwipeRow';
import {
  cx,
  DangerButton,
  Empty,
  ErrorText,
  FieldRow,
  GhostButton,
  PersonDot,
  PrimaryButton,
  Sheet,
  TextInput,
} from '../components/ui';

type Draft = {
  name: string;
  role: string | null;
  color: string | undefined;
  emoji: string;
  notes: string;
};

export function People() {
  const { data } = useAppState();
  const { run, busy, error } = useSave();
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [d, setD] = useState<Draft>({
    name: '',
    role: null,
    color: undefined,
    emoji: '',
    notes: '',
  });
  if (!data) return null;

  const open = (p: Person | 'new') => {
    setEditing(p);
    setD(
      p === 'new'
        ? { name: '', role: null, color: undefined, emoji: '', notes: '' }
        : {
            name: p.name,
            role: p.role,
            color: p.color,
            emoji: p.emoji ?? '',
            notes: p.notes ?? '',
          },
    );
  };
  const save = async () => {
    const ok = await run(() =>
      editing === 'new'
        ? api.post('/people', d)
        : api.patch(`/people/${(editing as Person).id}`, d),
    );
    if (ok) setEditing(null);
  };

  return (
    <div className="pb-10">
      <CatalogHeader addLabel="Person" onAdd={() => open('new')} />
      {!data.people.length && (
        <Empty title="No one yet">
          Add everyone you pack for. Each person gets a color so their things are easy to spot.
        </Empty>
      )}
      {data.people.map((p) => (
        <SwipeRow
          key={p.id}
          id={p.id}
          onDelete={() => run(() => api.del(`/people/${p.id}`))}
          className="mx-6 border-b border-line"
        >
          <button
            onClick={() => open(p)}
            className="flex w-full items-center gap-3 py-3.5 text-left"
          >
            <PersonDot color={p.color} size={10} />
            <span className="flex-1 text-base">
              {p.emoji ? `${p.emoji} ` : ''}
              {p.name}
            </span>
            {p.role && <span className="text-[13px] text-soft">{p.role}</span>}
          </button>
        </SwipeRow>
      ))}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add person' : 'Edit person'}
        footer={
          <>
            {editing && editing !== 'new' ? (
              <DangerButton
                onClick={async () => {
                  if (await run(() => api.del(`/people/${editing.id}`))) setEditing(null);
                }}
              >
                Remove
              </DangerButton>
            ) : (
              <span />
            )}
            <div className="flex">
              <GhostButton onClick={() => setEditing(null)}>Cancel</GhostButton>
              <PrimaryButton disabled={!d.name.trim() || busy} onClick={save}>
                Save
              </PrimaryButton>
            </div>
          </>
        }
      >
        <FieldRow icon="user" label="Name" htmlFor="p-name">
          <TextInput
            id="p-name"
            autoFocus={editing === 'new'}
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
          />
        </FieldRow>
        <FieldRow icon="tag" label="Role">
          <OnePicker
            value={d.role}
            onChange={(role) => setD({ ...d, role })}
            options={data.lookups.role ?? []}
          />
        </FieldRow>
        <FieldRow icon="palette" label="Color">
          <div className="flex flex-wrap gap-2.5">
            {PERSON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={d.color === c}
                onClick={() => setD({ ...d, color: c })}
                className={cx(
                  'grid h-8 w-8 place-items-center rounded-full border',
                  d.color === c ? 'border-ink' : 'border-transparent',
                )}
              >
                <PersonDot color={c} size={18} />
              </button>
            ))}
          </div>
        </FieldRow>
        <FieldRow icon="smile" label="Emoji (optional)" htmlFor="p-emoji">
          <TextInput
            id="p-emoji"
            value={d.emoji}
            maxLength={8}
            onChange={(e) => setD({ ...d, emoji: e.target.value })}
          />
        </FieldRow>
        <FieldRow icon="note" label="Notes" htmlFor="p-notes">
          <TextInput
            id="p-notes"
            value={d.notes}
            placeholder="Sizes, allergies…"
            onChange={(e) => setD({ ...d, notes: e.target.value })}
          />
        </FieldRow>
        {editing && editing !== 'new' && (
          <p className="pt-3 text-xs text-faint">
            Removing someone keeps their items on past trips as Shared.
          </p>
        )}
        <div className="pt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </Sheet>
    </div>
  );
}
