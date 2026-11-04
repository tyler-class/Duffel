import { useState } from 'react';
import { defaultBagCarryOn } from '@shared/logic';
import type { Suitcase } from '@shared/types';
import { OnePicker } from './fields';
import {
  DangerButton,
  ErrorText,
  FieldRow,
  GhostButton,
  Pick,
  PrimaryButton,
  Sheet,
  Switch,
  TextInput,
} from './ui';

export interface BagDraft {
  label: string;
  suitcase_id: string | null;
  role: string | null;
  carry_on: boolean;
  notes: string | null;
}

type BagSheetProps = {
  open: boolean;
  initial?: BagDraft;
  suitcases: Suitcase[];
  roles: string[];
  onClose: () => void;
  onSave: (b: BagDraft) => Promise<void> | void;
  onDelete?: () => void;
  error?: string;
};

export function BagSheet(props: BagSheetProps) {
  if (!props.open) return null;
  return <BagSheetBody {...props} />;
}

function BagSheetBody(props: BagSheetProps) {
  const [d, setD] = useState<BagDraft>(
    () =>
      props.initial ?? { label: '', suitcase_id: null, role: null, carry_on: false, notes: null },
  );
  const [carryTouched, setCarryTouched] = useState(!!props.initial);
  const [err, setErr] = useState('');

  const set = (patch: Partial<BagDraft>) =>
    setD((cur) => {
      const next = { ...cur, ...patch };
      if (!carryTouched && ('suitcase_id' in patch || 'role' in patch)) {
        next.carry_on = defaultBagCarryOn(
          props.suitcases.find((s) => s.id === next.suitcase_id)?.type,
          next.role,
        );
      }
      return next;
    });

  async function save() {
    if (!d.label.trim()) return setErr('Give the bag a name.');
    await props.onSave({ ...d, label: d.label.trim() });
  }

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.initial ? 'Edit bag' : 'Add bag'}
      footer={
        <>
          {props.onDelete ? <DangerButton onClick={props.onDelete}>Remove</DangerButton> : <span />}
          <div className="flex">
            <GhostButton onClick={props.onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={save}>{props.initial ? 'Save' : 'Add'}</PrimaryButton>
          </div>
        </>
      }
    >
      <FieldRow icon="bag" label="Which suitcase">
        <div className="flex flex-wrap gap-1.5">
          {props.suitcases.map((s) => (
            <Pick
              key={s.id}
              on={d.suitcase_id === s.id}
              onClick={() =>
                set({ suitcase_id: d.suitcase_id === s.id ? null : s.id, label: d.label || s.name })
              }
            >
              {s.name}
            </Pick>
          ))}
          {!props.suitcases.length && (
            <span className="text-sm text-faint">
              Add your bags under More → Suitcases to track how full they get.
            </span>
          )}
        </div>
      </FieldRow>
      <FieldRow icon="tag" label="Name on this trip" htmlFor="bag-label">
        <TextInput
          id="bag-label"
          value={d.label}
          placeholder="e.g. Kids’ suitcase"
          onChange={(e) => set({ label: e.target.value })}
        />
      </FieldRow>
      <FieldRow icon="layers" label="Used as">
        <OnePicker value={d.role} onChange={(role) => set({ role })} options={props.roles} />
      </FieldRow>
      <FieldRow icon="backpack" hint="Items in a carry-on bag count as carry-on.">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base">Carry-on</span>
          <Switch
            label="Carry-on"
            on={d.carry_on}
            onChange={(v) => {
              setCarryTouched(true);
              setD((cur) => ({ ...cur, carry_on: v }));
            }}
          />
        </div>
      </FieldRow>
      <div className="pt-3">
        <ErrorText>{err || props.error}</ErrorText>
      </div>
    </Sheet>
  );
}
