import { useState } from 'react';
import { TODO_PHASE_LABELS, TODO_PHASES, type TodoPhase } from '@shared/lookups';
import { todoDays } from '@shared/logic';
import { relativeWhen } from '../lib/format';
import { NumberInput } from './fields';
import {
  DangerButton,
  ErrorText,
  FieldRow,
  GhostButton,
  Pick,
  PrimaryButton,
  Sheet,
  TextInput,
} from './ui';

export interface TodoDraft {
  title: string;
  phase: TodoPhase;
  /** Trips: a real date. */
  due_date: string | null;
  /** Templates: days relative to the trip. */
  due_days: number | null;
  notes: string;
}

const DAYS_LABEL: Record<TodoPhase, string> = {
  pre: 'Days before the trip',
  during: 'Day of the trip',
  after: 'Days after the trip',
};

type Props = {
  open: boolean;
  /** Trips have real dates; templates have dates relative to the trip. */
  kind: 'trip' | 'template';
  initial?: Partial<TodoDraft>;
  editing?: boolean;
  /** The trip's dates, to say when a date falls. */
  trip?: { start_date: string | null; end_date: string | null };
  onClose: () => void;
  onSave: (d: TodoDraft) => Promise<void>;
  onDelete?: () => void;
};

/** Add or edit a to-do on a trip or template. */
export function TodoSheet(props: Props) {
  if (!props.open) return null;
  return <TodoSheetBody {...props} />;
}

function TodoSheetBody({ kind, initial, editing, trip, onClose, onSave, onDelete }: Props) {
  const [d, setD] = useState<TodoDraft>({
    title: '',
    phase: 'pre',
    due_date: null,
    due_days: null,
    notes: '',
    ...initial,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<TodoDraft>) => setD((x) => ({ ...x, ...p }));
  const rel = kind === 'trip' && trip ? todoDays(d.phase, d.due_date, trip) : null;

  async function save() {
    if (!d.title.trim()) return setError('Enter what needs doing.');
    setBusy(true);
    setError('');
    try {
      await onSave({ ...d, title: d.title.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit to-do' : 'Add to-do'}
      footer={
        <>
          {editing && onDelete ? <DangerButton onClick={onDelete}>Delete</DangerButton> : <span />}
          <div className="flex items-center">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={busy}>
              {editing ? 'Save' : 'Add'}
            </PrimaryButton>
          </div>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FieldRow icon="check" label="To-do" htmlFor="todo-title">
          <TextInput
            id="todo-title"
            autoFocus={!editing}
            value={d.title}
            placeholder="e.g. Book the kennel"
            onChange={(e) => set({ title: e.target.value })}
          />
        </FieldRow>
        <FieldRow icon="clock" label="When">
          <div className="flex flex-wrap gap-1.5">
            {TODO_PHASES.map((p) => (
              <Pick key={p} on={d.phase === p} onClick={() => set({ phase: p })}>
                {TODO_PHASE_LABELS[p]}
              </Pick>
            ))}
          </div>
        </FieldRow>
        {kind === 'trip' ? (
          <FieldRow
            icon="cal"
            label="Date"
            htmlFor="todo-date"
            hint={rel !== null && rel >= 0 ? relativeWhen(d.phase, rel) : undefined}
          >
            <div className="flex items-center gap-2">
              <TextInput
                id="todo-date"
                type="date"
                value={d.due_date ?? ''}
                onChange={(e) => set({ due_date: e.target.value || null })}
              />
              {d.due_date && (
                <GhostButton className="py-1" onClick={() => set({ due_date: null })}>
                  Clear
                </GhostButton>
              )}
            </div>
          </FieldRow>
        ) : (
          <FieldRow
            icon="cal"
            label={DAYS_LABEL[d.phase]}
            htmlFor="todo-days"
            hint={relativeWhen(d.phase, d.due_days) || 'Optional. Trips turn it into a date.'}
          >
            <NumberInput
              id="todo-days"
              step="1"
              value={d.due_days}
              placeholder="No date"
              onChange={(v) => set({ due_days: v === null ? null : Math.max(0, Math.round(v)) })}
            />
          </FieldRow>
        )}
        <FieldRow icon="note" label="Notes" htmlFor="todo-notes">
          <textarea
            id="todo-notes"
            rows={3}
            value={d.notes}
            placeholder="Details, links, confirmation numbers"
            onChange={(e) => set({ notes: e.target.value })}
            className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </FieldRow>
        <button type="submit" hidden />
        <div className="pt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Sheet>
  );
}
