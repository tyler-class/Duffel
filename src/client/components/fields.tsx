import { useId, useState, type ReactNode } from 'react';
import type { Person } from '@shared/types';
import { Icon } from './Icon';
import { Pick, PersonDot, Sheet, TextInput } from './ui';

/** Free text with suggestions. */
export function Combo({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <>
      <TextInput
        id={id}
        list={listId}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

/** Pick one (or none) from suggestions, or type a new one. */
export function OnePicker({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
}) {
  const [custom, setCustom] = useState('');
  const all =
    value && !options.some((o) => o.toLowerCase() === value.toLowerCase())
      ? [...options, value]
      : options;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((o) => (
        <Pick
          key={o}
          on={value?.toLowerCase() === o.toLowerCase()}
          onClick={() => onChange(value?.toLowerCase() === o.toLowerCase() ? null : o)}
        >
          {o}
        </Pick>
      ))}
      <AddTag value={custom} setValue={setCustom} onAdd={(t) => onChange(t)} />
    </div>
  );
}

/** Multi-select tags from suggestions, plus custom ones. */
export function TagPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
}) {
  const [custom, setCustom] = useState('');
  const lower = value.map((v) => v.toLowerCase());
  const all = [
    ...options,
    ...value.filter((v) => !options.some((o) => o.toLowerCase() === v.toLowerCase())),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((o) => {
        const on = lower.includes(o.toLowerCase());
        return (
          <Pick
            key={o}
            on={on}
            onClick={() =>
              onChange(
                on ? value.filter((v) => v.toLowerCase() !== o.toLowerCase()) : [...value, o],
              )
            }
          >
            {o}
          </Pick>
        );
      })}
      <AddTag
        value={custom}
        setValue={setCustom}
        onAdd={(t) => !lower.includes(t.toLowerCase()) && onChange([...value, t])}
      />
    </div>
  );
}

function AddTag({
  value,
  setValue,
  onAdd,
}: {
  value: string;
  setValue: (v: string) => void;
  onAdd: (t: string) => void;
}) {
  const add = () => {
    const t = value.trim();
    if (t) onAdd(t);
    setValue('');
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5">
      <Icon name="plus" size={13} className="text-faint" />
      <input
        aria-label="Add your own"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Other"
        className="w-16 bg-transparent text-sm focus:outline-none"
      />
    </span>
  );
}

export function PeoplePicker({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  if (!people.length)
    return <span className="text-sm text-faint">Add people under More → People.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((p) => {
        const on = value.includes(p.id);
        return (
          <Pick
            key={p.id}
            on={on}
            onClick={() => onChange(on ? value.filter((v) => v !== p.id) : [...value, p.id])}
          >
            <PersonDot person={p} />
            {p.name}
          </Pick>
        );
      })}
    </div>
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  step = 'any',
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <TextInput
      id={id}
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="tnum"
    />
  );
}

/**
 * A tap-to-open picker: shows the current value like a select, opens a sheet
 * listing the options, and lets you add a new one.
 */
export function SelectSheet({
  id,
  value,
  onChange,
  options,
  title,
  placeholder = 'Choose',
  allowNone = true,
}: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  title: string;
  placeholder?: string;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const all =
    value && !options.some((o) => o.toLowerCase() === value.toLowerCase())
      ? [...options, value]
      : options;
  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
    setCustom('');
  };
  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 text-left text-base"
      >
        <span className={value ? 'text-ink' : 'text-faint'}>{value || placeholder}</span>
        <Icon name="chevDown" size={16} className="text-soft" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="flex flex-col">
          {allowNone && (
            <OptionRow on={!value} onClick={() => pick(null)}>
              <span className="text-soft">None</span>
            </OptionRow>
          )}
          {all.map((o) => (
            <OptionRow
              key={o}
              on={value?.toLowerCase() === o.toLowerCase()}
              onClick={() => pick(o)}
            >
              {o}
            </OptionRow>
          ))}
          <form
            className="flex items-center gap-3 border-b border-line py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) pick(custom.trim());
            }}
          >
            <Icon name="plus" size={16} className="text-faint" />
            <input
              aria-label={`New ${title.toLowerCase()}`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Add new…"
              className="flex-1 bg-transparent text-base focus:outline-none"
            />
            {custom.trim() && (
              <button type="submit" className="text-[15px] text-accent">
                Add
              </button>
            )}
          </form>
        </div>
      </Sheet>
    </>
  );
}

function OptionRow({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex items-center gap-3 border-b border-line py-3 text-left text-base"
    >
      <span className="flex-1">{children}</span>
      {on && <Icon name="check" size={16} className="text-accent" strokeWidth={2.2} />}
    </button>
  );
}
