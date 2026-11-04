import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { QTY_MODE_LABELS, type QtyMode } from '@shared/lookups';
import type { AppState, Item, Template, TemplateItem } from '@shared/types';
import { api } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
import { plural } from '../lib/format';
import { Icon } from '../components/Icon';
import { CatalogPicker } from '../components/CatalogPicker';
import { NumberInput, OnePicker, PeoplePicker, TagPicker } from '../components/fields';
import {
  DangerButton,
  Empty,
  ErrorText,
  FieldRow,
  GhostButton,
  ListRow,
  PageHeader,
  PersonDot,
  PrimaryButton,
  Segmented,
  Sheet,
  Switch,
  TextInput,
} from '../components/ui';

export function Templates() {
  const nav = useNavigate();
  const { data } = useAppState();
  const { run, busy, error } = useSave();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  if (!data) return null;
  return (
    <div className="pb-10">
      <PageHeader
        title="Templates"
        back="/more"
        action={
          <PrimaryButton icon="plus" onClick={() => (setName(''), setCreating(true))}>
            New
          </PrimaryButton>
        }
      />
      {!data.templates.length && (
        <Empty title="No templates yet">
          A template is a reusable packing list, like “Beach week”. You can also save any trip as a
          template from its menu.
        </Empty>
      )}
      {data.templates.map((t) => (
        <ListRow key={t.id} onClick={() => nav(`/templates/${t.id}`)}>
          <span className="text-base">{t.name}</span>
          <span className="text-[13px] text-soft">
            {[plural(t.items.length, 'item'), t.trip_type, t.climate].filter(Boolean).join(' · ')}
          </span>
        </ListRow>
      ))}
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="New template"
        footer={
          <>
            <ErrorText>{error}</ErrorText>
            <div className="ml-auto flex">
              <GhostButton onClick={() => setCreating(false)}>Cancel</GhostButton>
              <PrimaryButton
                disabled={!name.trim() || busy}
                onClick={async () => {
                  const t = await run(() => api.post<Template>('/templates', { name }));
                  if (t) nav(`/templates/${t.id}`);
                }}
              >
                Create
              </PrimaryButton>
            </div>
          </>
        }
      >
        <FieldRow icon="tmpl" label="Name" htmlFor="tpl-new">
          <TextInput
            id="tpl-new"
            autoFocus
            value={name}
            placeholder="e.g. Ski weekend"
            onChange={(e) => setName(e.target.value)}
          />
        </FieldRow>
      </Sheet>
    </div>
  );
}

function overrideSummary(ti: TemplateItem, item?: Item): string {
  const mode = ti.qty_mode_override ?? item?.qty_mode ?? 'fixed';
  const qty = ti.qty_override ?? item?.qty ?? 1;
  return mode === 'fixed' ? `×${qty}` : `${qty}${mode === 'per_day' ? '/day' : '/night'}`;
}

export function TemplateEditor() {
  const { id = '' } = useParams();
  const { data } = useAppState();
  if (!data) return null;
  const tpl = data.templates.find((t) => t.id === id);
  if (!tpl) return <Empty title="Template not found" />;
  return <TemplateBody key={tpl.id} data={data} tpl={tpl} />;
}

function TemplateBody({ data, tpl }: { data: AppState; tpl: Template }) {
  const nav = useNavigate();
  const { run, busy, error } = useSave();
  const [form, setForm] = useState({
    name: tpl.name,
    trip_type: tpl.trip_type,
    climate: tpl.climate,
    activities: tpl.activities,
    notes: tpl.notes ?? '',
  });
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const items = new Map(data.items.map((i) => [i.id, i]));
  const people = new Map(data.people.map((p) => [p.id, p]));
  const dirty =
    form.name !== tpl.name ||
    form.trip_type !== tpl.trip_type ||
    form.climate !== tpl.climate ||
    form.notes !== (tpl.notes ?? '') ||
    form.activities.join('|') !== tpl.activities.join('|');

  return (
    <div className="pb-12">
      <PageHeader
        title={tpl.name}
        back="/templates"
        action={
          <PrimaryButton icon="plus" onClick={() => nav(`/trips/new?template=${tpl.id}`)}>
            Trip
          </PrimaryButton>
        }
      />

      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <span className="text-xs tracking-[0.08em] text-soft uppercase">
          {plural(tpl.items.length, 'item')}
        </span>
        <GhostButton icon="plus" className="-mr-3 py-1" onClick={() => setPicker(true)}>
          Add from catalog
        </GhostButton>
      </div>
      {tpl.items.map((ti) => {
        const item = items.get(ti.item_id);
        const who = ti.assignees.length ? ti.assignees : (item?.default_people ?? []);
        return (
          <button
            key={ti.id}
            onClick={() => setEditing(ti)}
            className="flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base">{item?.name ?? 'Removed item'}</span>
              <span className="flex items-center gap-2.5 text-[13px] text-soft">
                {who.length ? (
                  <span className="inline-flex items-center gap-1">
                    {who.map((p) => (
                      <PersonDot key={p} color={people.get(p)?.color} />
                    ))}
                    {!ti.assignees.length && <span className="text-faint">default</span>}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="users" size={13} />
                    Shared
                  </span>
                )}
                {ti.carry_on && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="backpack" size={13} />
                    Carry-on
                  </span>
                )}
                {ti.notes && <span className="truncate">{ti.notes}</span>}
              </span>
            </span>
            <span className="font-mono text-[13px] text-soft tnum">
              {overrideSummary(ti, item)}
            </span>
          </button>
        );
      })}

      <div className="px-5 pt-6">
        <FieldRow icon="tag" label="Name" htmlFor="tpl-name">
          <TextInput
            id="tpl-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FieldRow>
        <FieldRow icon="plane" label="Trip type">
          <OnePicker
            value={form.trip_type}
            onChange={(trip_type) => setForm({ ...form, trip_type })}
            options={data.lookups.tripType ?? []}
          />
        </FieldRow>
        <FieldRow icon="sparkle" label="Weather and activities">
          <OnePicker
            value={form.climate}
            onChange={(climate) => setForm({ ...form, climate })}
            options={data.lookups.climate ?? []}
          />
          <TagPicker
            value={form.activities}
            onChange={(activities) => setForm({ ...form, activities })}
            options={data.lookups.activity ?? []}
          />
        </FieldRow>
        <FieldRow icon="note" label="Notes" htmlFor="tpl-notes">
          <TextInput
            id="tpl-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FieldRow>
        <div className="flex flex-col gap-3 pt-5">
          <ErrorText>{error}</ErrorText>
          {dirty && (
            <PrimaryButton
              disabled={busy || !form.name.trim()}
              onClick={() => run(() => api.patch(`/templates/${tpl.id}`, form))}
            >
              Save changes
            </PrimaryButton>
          )}
          <DangerButton className="self-start" onClick={() => setConfirmDelete(true)}>
            Delete template
          </DangerButton>
        </div>
      </div>

      <CatalogPicker
        open={picker}
        title={`Add to ${tpl.name}`}
        items={data.items}
        exclude={new Set(tpl.items.map((i) => i.item_id))}
        onClose={() => setPicker(false)}
        onAdd={async (ids) => {
          await run(() => api.post(`/templates/${tpl.id}/items`, { item_ids: ids }));
        }}
      />
      {editing && (
        <TemplateItemSheet
          key={editing.id}
          ti={editing}
          item={items.get(editing.item_id)}
          onClose={() => setEditing(null)}
        />
      )}
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${tpl.name}?`}
        footer={
          <>
            <GhostButton onClick={() => setConfirmDelete(false)}>Cancel</GhostButton>
            <PrimaryButton
              className="bg-danger"
              onClick={async () => {
                if (await run(() => api.del(`/templates/${tpl.id}`))) nav('/templates');
              }}
            >
              Delete
            </PrimaryButton>
          </>
        }
      >
        <p className="py-2 text-sm text-soft">Trips made from it keep their lists.</p>
      </Sheet>
    </div>
  );
}

type ModeChoice = 'default' | QtyMode;

function TemplateItemSheet({
  ti,
  item,
  onClose,
}: {
  ti: TemplateItem;
  item?: Item;
  onClose: () => void;
}) {
  const { data } = useAppState();
  const { run, busy, error } = useSave();
  const [mode, setMode] = useState<ModeChoice>(ti.qty_mode_override ?? 'default');
  const [qty, setQty] = useState<number | null>(ti.qty_override);
  const [assignees, setAssignees] = useState<string[]>(ti.assignees);
  const [carry, setCarry] = useState(ti.carry_on);
  const [notes, setNotes] = useState(ti.notes ?? '');
  if (!data) return null;
  const effMode = mode === 'default' ? (item?.qty_mode ?? 'fixed') : mode;
  return (
    <Sheet
      open={!!ti}
      onClose={onClose}
      title={item?.name ?? 'Template item'}
      footer={
        <>
          <DangerButton
            onClick={async () => {
              if (await run(() => api.del(`/template-items/${ti.id}`))) onClose();
            }}
          >
            Remove
          </DangerButton>
          <div className="flex">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton
              disabled={busy}
              onClick={async () => {
                const ok = await run(() =>
                  api.patch(`/template-items/${ti.id}`, {
                    qty_mode_override: mode === 'default' ? null : mode,
                    qty_override: qty,
                    assignees,
                    carry_on: carry,
                    notes,
                  }),
                );
                if (ok) onClose();
              }}
            >
              Save
            </PrimaryButton>
          </div>
        </>
      }
    >
      <FieldRow
        icon="hash"
        label="How many"
        hint={
          item
            ? `Catalog default: ${item.qty} ${QTY_MODE_LABELS[item.qty_mode].toLowerCase()}${item.max_qty !== null ? `, at most ${item.max_qty}` : ''}.`
            : undefined
        }
      >
        <Segmented<ModeChoice>
          label="Quantity mode"
          value={mode}
          onChange={setMode}
          options={[
            ['default', 'Default'],
            ['fixed', 'Fixed'],
            ['per_day', 'Per day'],
            ['per_night', 'Per night'],
          ]}
        />
        <NumberInput value={qty} placeholder={`Default (${item?.qty ?? 1})`} onChange={setQty} />
        <span className="text-xs text-faint">
          {effMode === 'fixed'
            ? 'Total per person.'
            : `Per person, ${QTY_MODE_LABELS[effMode].toLowerCase()}.`}
        </span>
      </FieldRow>
      <FieldRow
        icon="user"
        label="For"
        hint={
          assignees.length
            ? undefined
            : 'Nobody picked: uses the catalog item’s people, or one shared row.'
        }
      >
        <PeoplePicker people={data.people} value={assignees} onChange={setAssignees} />
      </FieldRow>
      <FieldRow icon="backpack" hint="Goes into the person’s carry-on bag when a trip is built.">
        <div className="flex items-center justify-between">
          <span className="text-base">Carry-on</span>
          <Switch label="Carry-on" on={carry} onChange={setCarry} />
        </div>
      </FieldRow>
      <FieldRow icon="note" label="Notes" htmlFor="ti-notes">
        <TextInput id="ti-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FieldRow>
      <div className="pt-3">
        <ErrorText>{error}</ErrorText>
      </div>
    </Sheet>
  );
}
