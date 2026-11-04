import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { QTY_MODE_LABELS, type QtyMode } from '@shared/lookups';
import type { AppState, Item, Template, TemplateBag, TemplateItem } from '@shared/types';
import { planFromTemplate, unplacedSummary } from '@shared/logic';
import { BagSheet, type BagDraft } from '../components/BagSheet';
import { api } from '../lib/api';
import { useAppState } from '../lib/queries';
import { useSave } from '../lib/useSave';
import { plural } from '../lib/format';
import { Icon } from '../components/Icon';
import { CatalogPicker } from '../components/CatalogPicker';
import { NumberInput, OnePicker, PeoplePicker, TagPicker } from '../components/fields';
import { SwipeRow } from '../components/SwipeRow';
import {
  DangerButton,
  Empty,
  ErrorText,
  FieldRow,
  GhostButton,
  ListRow,
  PageHeader,
  PersonDot,
  SectionLabel,
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
  const [toDelete, setToDelete] = useState<Template | null>(null);
  if (!data) return null;
  return (
    <div className="pb-10">
      <PageHeader
        title="Templates"
        icon="tmpl"
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
        <ListRow
          key={t.id}
          onClick={() => nav(`/templates/${t.id}`)}
          swipeDelete={{ id: t.id, onDelete: () => setToDelete(t) }}
        >
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
      <Sheet
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete?.name ?? 'template'}?`}
        footer={
          <>
            <GhostButton onClick={() => setToDelete(null)}>Cancel</GhostButton>
            <PrimaryButton
              tone="danger"
              disabled={busy}
              onClick={async () => {
                if (toDelete && (await run(() => api.del(`/templates/${toDelete.id}`))))
                  setToDelete(null);
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
  const [bagSheet, setBagSheet] = useState<TemplateBag | 'new' | null>(null);
  const items = new Map(data.items.map((i) => [i.id, i]));
  const people = new Map(data.people.map((p) => [p.id, p]));
  // Where this template's items would go with its bags (all people, any trip length).
  const gaps = tpl.items.length
    ? unplacedSummary(
        planFromTemplate(tpl.items, items, { len: null, travelers: [], bags: tpl.bags }),
      )
    : [];
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

      <SectionLabel
        icon="bag"
        trailing={
          <button className="text-sm text-accent" onClick={() => setBagSheet('new')}>
            + Add bag
          </button>
        }
      >
        Bags
      </SectionLabel>
      {!tpl.bags.length && (
        <p className="px-6 pt-2 text-sm text-soft">
          Add the bags you usually take. Trips made from this template start with them, and each
          person’s items go straight into their bags.
        </p>
      )}
      {tpl.bags.map((bg) => (
        <SwipeRow
          key={bg.id}
          id={bg.id}
          onDelete={() => run(() => api.del(`/template-bags/${bg.id}`))}
          className="mx-6 border-b border-line"
        >
          <button
            onClick={() => setBagSheet(bg)}
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <Icon name={bg.carry_on ? 'backpack' : 'bag'} className="text-soft" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base">{bg.label}</span>
              <span className="flex items-center gap-2 text-[13px] text-soft">
                {bg.people.length ? (
                  <span className="inline-flex items-center gap-1">
                    {bg.people.map((p) => (
                      <PersonDot key={p} person={people.get(p)} />
                    ))}
                    {bg.people
                      .map((p) => people.get(p)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                ) : (
                  <span>Shared</span>
                )}
                {bg.carry_on && <span>· Carry-on</span>}
              </span>
            </span>
          </button>
        </SwipeRow>
      ))}
      {gaps.length > 0 && (
        <div className="mx-6 mt-3 flex flex-col gap-1 rounded-2xl bg-chip px-4 py-3 text-sm text-soft">
          <span className="font-medium text-ink">Some items won’t have a bag</span>
          {gaps.map((g) => (
            <span key={`${g.person_id}|${g.carry}`}>
              {g.person_id ? (people.get(g.person_id)?.name ?? 'Someone') : 'Shared'}:{' '}
              {plural(g.count, g.carry ? 'carry-on item' : 'item')} with no{' '}
              {g.carry ? 'carry-on' : 'checked'} bag
            </span>
          ))}
          <span className="text-xs text-faint">They’ll start in No bag on new trips.</span>
        </div>
      )}

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
          <SwipeRow
            key={ti.id}
            id={ti.id}
            onDelete={() => run(() => api.del(`/template-items/${ti.id}`))}
            className="mx-6 border-b border-line"
          >
            <button
              onClick={() => setEditing(ti)}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base">{item?.name ?? 'Removed item'}</span>
                <span className="flex items-center gap-2.5 text-[13px] text-soft">
                  {who.length ? (
                    <span className="inline-flex items-center gap-1">
                      {who.map((p) => (
                        <PersonDot key={p} person={people.get(p)} />
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
          </SwipeRow>
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
        <FieldRow icon="weather" label="Weather">
          <OnePicker
            value={form.climate}
            onChange={(climate) => setForm({ ...form, climate })}
            options={data.lookups.climate ?? []}
          />
        </FieldRow>
        <FieldRow icon="run" label="Activities">
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
        existing={tpl.items.reduce(
          (m, i) => m.set(i.item_id, (m.get(i.item_id) ?? 0) + 1),
          new Map<string, number>(),
        )}
        existingLabel="On template"
        onClose={() => setPicker(false)}
        onAdd={async (ids) => {
          await run(() => api.post(`/templates/${tpl.id}/items`, { item_ids: ids }));
        }}
      />
      <BagSheet
        open={bagSheet !== null}
        initial={
          bagSheet && bagSheet !== 'new'
            ? {
                label: bagSheet.label,
                suitcase_id: bagSheet.suitcase_id,
                role: bagSheet.role,
                carry_on: bagSheet.carry_on,
                notes: bagSheet.notes,
                people: bagSheet.people,
              }
            : undefined
        }
        suitcases={data.suitcases}
        people={data.people}
        roles={data.lookups.bagRole ?? []}
        error={error}
        onClose={() => setBagSheet(null)}
        onSave={async (b: BagDraft) => {
          const ok = await run(() =>
            bagSheet === 'new'
              ? api.post(`/templates/${tpl.id}/bags`, b)
              : api.patch(`/template-bags/${(bagSheet as TemplateBag).id}`, b),
          );
          if (ok) setBagSheet(null);
        }}
        onDelete={
          bagSheet && bagSheet !== 'new'
            ? async () => {
                if (await run(() => api.del(`/template-bags/${bagSheet.id}`))) setBagSheet(null);
              }
            : undefined
        }
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
              tone="danger"
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
          assignees.length > 1
            ? 'Each person gets their own row on the trip, with this quantity each.'
            : assignees.length
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
