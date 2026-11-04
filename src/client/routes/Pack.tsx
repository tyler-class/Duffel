import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { displayQty, isCarryOn, progress, shortBagLabel } from '@shared/logic';
import type { Item, Person, Trip, TripBag, TripDetail, TripItem } from '@shared/types';
import { api, errorMessage } from '../lib/api';
import { formatRange, plural } from '../lib/format';
import { keys, useAppState, usePatchTripItem, useTrip } from '../lib/queries';
import { load, save } from '../lib/storage';
import { isOffline } from '../lib/offline';
import { Icon } from '../components/Icon';
import { ItemSheet, type ItemDraft, type SaveResult } from '../components/ItemSheet';
import { CatalogPicker } from '../components/CatalogPicker';
import { useToast } from '../components/Toast';
import {
  ActionList,
  cx,
  Empty,
  ErrorText,
  FieldRow,
  GhostButton,
  IconButton,
  Menu,
  PersonDot,
  PrimaryButton,
  Segmented,
  Sheet,
  TextInput,
} from '../components/ui';

type Status = 'all' | 'packed' | 'todo';
type Where = 'all' | 'carry' | 'luggage';
type GroupBy = 'person' | 'bag';
const NO_BAG = '__nobag';
const SHARED = '__shared';
const UNDECIDED = '__undecided';

interface Group {
  key: string;
  label: string;
  person?: Person;
  bag?: TripBag;
  kind: 'person' | 'shared' | 'bag' | 'nobag' | 'undecided';
  rows: TripItem[];
}

export function Pack() {
  const { id = '' } = useParams();
  const state = useAppState();
  const trip = useTrip(id);
  if (state.isPending) return <div className="h-40" />;
  if (state.error) return <Empty title="Couldn’t load Duffel">{errorMessage(state.error)}</Empty>;
  const s = state.data;
  if (!s.trips.some((t) => t.id === id)) return <Empty title="Trip not found" />;
  return (
    <PackTrip
      tripId={id}
      trips={s.trips}
      people={s.people}
      catalog={s.items}
      detail={trip.data}
      error={trip.error}
    />
  );
}

function PackTrip(props: {
  tripId: string | null;
  trips: Trip[];
  people: Person[];
  catalog: Item[];
  detail?: TripDetail;
  error: Error | null;
}) {
  const { trips, people, catalog, detail } = props;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatusRaw] = useState<Status>(() => load('status', 'all'));
  const [where, setWhereRaw] = useState<Where>(() => load('where', 'all'));
  const [groupBy, setGroupByRaw] = useState<GroupBy>(() => load('groupBy', 'person'));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => load('collapsed', {}));
  const [editing, setEditing] = useState<TripItem | null>(null);
  const [adding, setAdding] = useState<Partial<ItemDraft> | null>(null);
  const [menu, setMenu] = useState<null | 'menu' | 'reset' | 'template' | 'catalog'>(null);
  const [error, setError] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const patch = usePatchTripItem(props.tripId ?? 'none');

  const setStatus = (v: Status) => (setStatusRaw(v), save('status', v));
  const setWhere = (v: Where) => (setWhereRaw(v), save('where', v));
  const setGroupBy = (v: GroupBy) => (setGroupByRaw(v), save('groupBy', v));
  const toggleCollapsed = (k: string) =>
    setCollapsed((c) => {
      const n = { ...c, [k]: !c[k] };
      save('collapsed', n);
      return n;
    });

  const trip = detail?.trip ?? trips.find((t) => t.id === props.tripId);
  const bags = useMemo(() => detail?.bags ?? [], [detail]);
  const rows = useMemo(() => detail?.items ?? [], [detail]);
  const bagMap = useMemo(() => new Map(bags.map((b) => [b.id, b])), [bags]);
  const personMap = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const bagName = (b: TripBag) => shortBagLabel(b.label, trip?.name ?? '');
  const prog = progress(rows, bagMap);
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;

  const filtered = status !== 'all' || where !== 'all';
  const visible = rows.filter((r) => {
    if (status === 'packed' && !r.packed) return false;
    if (status === 'todo' && r.packed) return false;
    const carry = isCarryOn(r, bagMap);
    if (where === 'carry' && !carry) return false;
    if (where === 'luggage' && (carry || r.no_bag)) return false;
    return true;
  });

  const groups: Group[] = useMemo(() => {
    const out: Group[] = [];
    if (groupBy === 'person') {
      const onTrip = new Set(rows.map((r) => r.person_id).filter(Boolean));
      const list = people.filter(
        (p) => !trip?.travelers.length || trip.travelers.includes(p.id) || onTrip.has(p.id),
      );
      for (const p of list)
        out.push({
          key: p.id,
          label: p.name,
          person: p,
          kind: 'person',
          rows: visible.filter((r) => r.person_id === p.id),
        });
      const known = new Set(list.map((p) => p.id));
      out.push({
        key: SHARED,
        label: 'Shared',
        kind: 'shared',
        rows: visible.filter((r) => !r.person_id || !known.has(r.person_id)),
      });
    } else {
      for (const b of bags)
        out.push({
          key: b.id,
          label: bagName(b),
          bag: b,
          kind: 'bag',
          rows: visible.filter((r) => r.trip_bag_id === b.id),
        });
      out.push({
        key: NO_BAG,
        label: 'No bag',
        kind: 'nobag',
        rows: visible.filter((r) => r.no_bag),
      });
      out.push({
        key: UNDECIDED,
        label: 'No bag yet',
        kind: 'undecided',
        rows: visible.filter((r) => !r.no_bag && (!r.trip_bag_id || !bagMap.has(r.trip_bag_id))),
      });
    }
    // With filters on, hide empty groups. Without, keep people and bags (so + is always there),
    // but hide the catch-all groups when they're empty.
    return out.filter((g) =>
      filtered ? g.rows.length > 0 : g.rows.length > 0 || g.kind === 'person' || g.kind === 'bag',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, rows, visible.length, status, where, people, bags, trip?.travelers]);

  const refresh = () => {
    if (!props.tripId) return;
    qc.invalidateQueries({ queryKey: keys.trip(props.tripId) });
    qc.invalidateQueries({ queryKey: keys.state });
  };

  function toggle(r: TripItem) {
    setError('');
    patch.mutate(
      { id: r.id, patch: { packed: !r.packed } },
      { onError: (e) => !isOffline(e) && setError(errorMessage(e)) },
    );
  }

  async function remove(r: TripItem) {
    if (!props.tripId) return;
    const key = keys.trip(props.tripId);
    const prev = qc.getQueryData<TripDetail>(key);
    if (prev)
      qc.setQueryData<TripDetail>(key, { ...prev, items: prev.items.filter((x) => x.id !== r.id) });
    setEditing(null);
    try {
      await api.del(`/trip-items/${r.id}`);
      toast({
        text: `Deleted ${r.name}`,
        action: {
          label: 'Undo',
          run: async () => {
            try {
              await api.post(`/trips/${r.trip_id}/items`, {
                id: r.id,
                item_id: r.item_id,
                name: r.name,
                person_id: r.person_id && personMap.has(r.person_id) ? r.person_id : null,
                trip_bag_id: r.trip_bag_id && bagMap.has(r.trip_bag_id) ? r.trip_bag_id : null,
                no_bag: r.no_bag,
                qty: r.qty,
                qty_override: r.qty_override,
                packed: r.packed,
                notes: r.notes,
                sort_order: r.sort_order,
              });
            } catch (e) {
              setError(errorMessage(e));
            }
            refresh();
          },
        },
      });
    } catch (e) {
      setError(errorMessage(e));
    }
    refresh();
  }

  function openAdd(g: Group) {
    setAdding({
      person_id: g.kind === 'person' ? g.key : null,
      trip_bag_id:
        g.kind === 'bag'
          ? g.key
          : where === 'carry'
            ? (bags.find((b) => b.carry_on)?.id ?? null)
            : null,
      no_bag: g.kind === 'nobag',
    });
  }

  async function saveNew(r: SaveResult) {
    const { person_ids, ...row } = r;
    const owners: (string | null)[] = person_ids?.length ? person_ids : [null];
    // One row per person, so each person checks off their own.
    for (const person_id of owners) {
      await api.post(`/trips/${props.tripId}/items`, { ...row, person_id });
    }
    refresh();
  }

  async function saveEdit(r: SaveResult) {
    if (!editing) return;
    await patch.mutateAsync({ id: editing.id, patch: r as Partial<TripItem> });
  }

  if (!trip)
    return props.error ? (
      <Empty title="Couldn’t load this trip">{errorMessage(props.error)}</Empty>
    ) : (
      <div className="h-40" />
    );
  const len =
    trip.days === null && trip.nights === null ? null : { days: trip.days, nights: trip.nights };
  const travelers = trip.travelers.length;

  return (
    <div>
      <button
        onClick={() => nav('/')}
        className="ml-3.5 flex items-center gap-0.5 pt-3 text-[15px] text-soft"
      >
        <Icon name="back" size={18} /> Trips
      </button>

      <header className="flex flex-col gap-2 px-5 pt-5 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-[28px] leading-tight font-semibold tracking-[-0.025em] text-balance">
            {trip.name}
          </h1>
          <IconButton
            icon="more"
            label="Trip menu"
            onClick={(e) => {
              setMenuAnchor(e.currentTarget.getBoundingClientRect());
              setMenu('menu');
            }}
          />
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-sm text-soft">
          {(trip.start_date || trip.end_date) && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="cal" size={13} />
              {formatRange(trip.start_date, trip.end_date)}
            </span>
          )}
          {trip.nights !== null && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="moon" size={13} />
              {plural(trip.nights, 'night')}
            </span>
          )}
          {travelers > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="users" size={13} />
              {travelers}
            </span>
          )}
          {trip.destination && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" size={13} />
              {trip.destination}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <div
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Packed"
          >
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="inline-flex gap-2.5 font-mono text-xs text-soft tnum">
            <span className="inline-flex items-center gap-1" title="Packed">
              <Icon name="check" size={13} />
              {prog.done}/{prog.total}
            </span>
            {prog.carryTotal > 0 && (
              <span className="inline-flex items-center gap-1" title="Carry-on packed">
                <Icon name="backpack" size={13} />
                {prog.carryDone}/{prog.carryTotal}
              </span>
            )}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-2.5 px-5 pt-3.5 pb-1">
        <div className="grid grid-cols-2 gap-2">
          <Segmented<Status>
            label="Packed status"
            value={status}
            onChange={setStatus}
            options={[
              ['all', 'All'],
              ['packed', 'Packed'],
              ['todo', 'To pack'],
            ]}
          />
          <Segmented<Where>
            label="Where"
            value={where}
            onChange={setWhere}
            options={[
              ['all', 'All'],
              ['carry', 'Carry-on'],
              ['luggage', 'Luggage'],
            ]}
          />
        </div>
        <div className="flex items-center gap-3 text-[13px] text-faint">
          <span>Group by</span>
          {(['person', 'bag'] as GroupBy[]).map((g) => (
            <button
              key={g}
              aria-pressed={groupBy === g}
              onClick={() => setGroupBy(g)}
              className={cx(
                'border-b-[1.5px] py-0.5',
                groupBy === g
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-soft',
              )}
            >
              {g === 'person' ? 'Person' : 'Bag'}
            </button>
          ))}
          {filtered && (
            <button
              className="ml-auto text-accent"
              onClick={() => (setStatus('all'), setWhere('all'))}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="px-5">
        <ErrorText>{error}</ErrorText>
      </div>

      {!rows.length && detail ? (
        <Empty
          title="This list is empty"
          action={
            <div className="flex gap-2">
              <PrimaryButton icon="plus" onClick={() => setMenu('catalog')}>
                Add from catalog
              </PrimaryButton>
            </div>
          }
        >
          Add items from your catalog, or tap + next to a person.
        </Empty>
      ) : null}
      {filtered && rows.length > 0 && !groups.length && (
        <p className="px-5 py-12 text-center text-sm text-soft">
          {status === 'todo' && where === 'all'
            ? 'Everything is packed.'
            : 'Nothing matches these filters.'}
        </p>
      )}

      {(rows.length > 0 || !detail) &&
        groups.map((g) => {
          const ck = `${groupBy}:${g.key}`;
          const isCollapsed = !!collapsed[ck];
          const done = g.rows.filter((r) => r.packed).length;
          return (
            <section key={g.key} className="mt-5 px-5">
              <div className="flex items-center gap-2 border-b border-line pb-2">
                <button
                  className="flex min-w-0 items-center gap-2 text-[13px] font-semibold tracking-[0.01em]"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapsed(ck)}
                >
                  <GroupMark g={g} />
                  <span className="truncate">{g.label}</span>
                  {g.bag?.carry_on && (
                    <span className="rounded bg-accent-tint px-1.5 py-px text-[11px] font-medium text-accent">
                      Carry-on
                    </span>
                  )}
                  <Icon
                    name="chev"
                    size={13}
                    className={cx('text-faint transition-transform', isCollapsed && '-rotate-90')}
                  />
                </button>
                <span className="ml-auto font-mono text-xs text-faint tnum">
                  {done}/{g.rows.length}
                </span>
                {g.kind !== 'undecided' && (
                  <IconButton
                    icon="plus"
                    label={`Add to ${g.label}`}
                    className="h-7 w-7"
                    onClick={() => openAdd(g)}
                  />
                )}
              </div>
              {!isCollapsed &&
                g.rows.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    sub={rowSub(r, groupBy, bagMap, personMap, bagName)}
                    carry={groupBy === 'person' && isCarryOn(r, bagMap)}
                    onToggle={() => toggle(r)}
                    onEdit={() => setEditing(r)}
                    onDelete={() => remove(r)}
                  />
                ))}
            </section>
          );
        })}
      <div className="h-8" />

      <ItemSheet
        open={!!editing}
        mode="edit"
        row={editing ?? undefined}
        people={people}
        bags={bags}
        catalog={catalog}
        len={len}
        bagName={bagName}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
        onDelete={() => editing && remove(editing)}
      />
      <ItemSheet
        open={!!adding}
        mode="add"
        travelers={trip.travelers}
        initial={adding ?? undefined}
        people={people}
        bags={bags}
        catalog={catalog}
        len={len}
        bagName={bagName}
        onClose={() => setAdding(null)}
        onSave={saveNew}
      />
      <TripMenu
        anchor={menuAnchor}
        trip={trip}
        open={menu}
        setOpen={setMenu}
        rows={rows}
        catalog={catalog}
        onChanged={refresh}
      />
    </div>
  );
}

function rowSub(
  r: TripItem,
  groupBy: GroupBy,
  bags: Map<string, TripBag>,
  people: Map<string, Person>,
  bagName: (b: TripBag) => string,
) {
  const parts: React.ReactNode[] = [];
  if (groupBy === 'person') {
    const b = r.trip_bag_id ? bags.get(r.trip_bag_id) : undefined;
    if (b)
      parts.push(
        <span key="b" className="inline-flex min-w-0 items-center gap-1">
          <Icon name={b.carry_on ? 'backpack' : 'bag'} size={13} />
          <span className="truncate">{bagName(b)}</span>
        </span>,
      );
    else if (r.no_bag)
      parts.push(
        <span key="b" className="inline-flex items-center gap-1">
          <Icon name="nobag" size={13} />
          No bag
        </span>,
      );
  } else {
    const p = r.person_id ? people.get(r.person_id) : undefined;
    parts.push(
      <span key="p" className="inline-flex items-center gap-1.5">
        {p ? <PersonDot color={p.color} /> : <Icon name="users" size={13} />}
        {p ? p.name : 'Shared'}
      </span>,
    );
  }
  if (r.notes)
    parts.push(
      <span key="n" className="truncate">
        {r.notes}
      </span>,
    );
  return parts;
}

function GroupMark({ g }: { g: Group }) {
  if (g.kind === 'person') return <PersonDot color={g.person?.color} />;
  const icon =
    g.kind === 'shared'
      ? 'users'
      : g.kind === 'nobag'
        ? 'nobag'
        : g.kind === 'undecided'
          ? 'layers'
          : g.bag?.carry_on
            ? 'backpack'
            : 'bag';
  return <Icon name={icon} size={15} className="text-soft" />;
}

const REVEAL = 88;
const ROW_OPEN_EVENT = 'duffel:row-open';

/** One row: check to pack, tap to edit, swipe left to reveal Delete. */
function Row({
  row,
  sub,
  carry,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: TripItem;
  sub: React.ReactNode[];
  carry: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number; swiping: boolean } | null>(null);
  const moved = useRef(false);
  const qty = displayQty(row);

  // Only one row shows its Delete button at a time.
  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== row.id) setOpen(false);
    };
    window.addEventListener(ROW_OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(ROW_OPEN_EVENT, onOtherOpen);
  }, [row.id]);

  const base = open ? -REVEAL : 0;
  const offset = dragging ? Math.min(0, Math.max(-REVEAL - 32, base + dx)) : base;
  /** A tap on an open row just closes it. */
  const tap = (fn: () => void) => () => {
    if (moved.current) return;
    if (open) setOpen(false);
    else fn();
  };

  return (
    <div className="relative overflow-hidden border-b border-line">
      <button
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-danger text-sm font-medium text-white"
        style={{ width: REVEAL }}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => {
          setOpen(false);
          onDelete();
        }}
      >
        Delete
      </button>
      <div
        className="relative flex items-center bg-bg"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform .18s ease',
          touchAction: 'pan-y',
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          start.current = { x: e.clientX, y: e.clientY, swiping: false };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const ddx = e.clientX - s.x;
          const ddy = e.clientY - s.y;
          if (!s.swiping && Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) {
            s.swiping = true;
            setDragging(true);
          }
          if (s.swiping) {
            moved.current = true;
            setDx(ddx);
          }
        }}
        onPointerUp={() => {
          if (start.current?.swiping) {
            const reveal = base + dx < -REVEAL / 2;
            setOpen(reveal);
            if (reveal) window.dispatchEvent(new CustomEvent(ROW_OPEN_EVENT, { detail: row.id }));
          }
          start.current = null;
          setDragging(false);
          setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setDx(0);
        }}
      >
        <button
          className="flex h-full items-center py-3 pr-3.5"
          aria-label={row.packed ? `Mark ${row.name} not packed` : `Mark ${row.name} packed`}
          aria-pressed={row.packed}
          onClick={tap(onToggle)}
        >
          <span
            className={cx(
              'grid h-5 w-5 place-items-center rounded-md border-[1.5px] transition-colors',
              row.packed ? 'border-accent bg-accent text-accent-ink' : 'border-faint',
            )}
          >
            {row.packed && <Icon name="check" size={14} strokeWidth={2.4} />}
          </span>
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
          onClick={tap(onEdit)}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cx(
                'text-base leading-tight',
                row.packed && 'text-faint line-through decoration-1',
              )}
            >
              {row.name}
            </span>
            {sub.length > 0 && (
              <span className="flex min-w-0 items-center gap-2.5 overflow-hidden text-[13px] whitespace-nowrap text-soft">
                {sub}
              </span>
            )}
          </span>
          {carry && (
            <span
              className={cx(
                'grid h-6 w-6 flex-none place-items-center rounded-md bg-accent-tint text-accent',
                row.packed && 'opacity-50',
              )}
              title="Carry-on"
            >
              <Icon name="backpack" size={14} />
            </span>
          )}
          <span
            className={cx(
              'min-w-7 flex-none text-right font-mono text-[13px] tnum',
              row.packed ? 'text-faint' : 'text-soft',
            )}
          >
            {qty === null ? '–' : `×${qty}`}
          </span>
        </button>
      </div>
    </div>
  );
}

function TripMenu(props: {
  anchor: DOMRect | null;
  trip: Trip;
  open: null | 'menu' | 'reset' | 'template' | 'catalog';
  setOpen: (v: null | 'menu' | 'reset' | 'template' | 'catalog') => void;
  rows: TripItem[];
  catalog: Item[];
  onChanged: () => void;
}) {
  const { trip, open, setOpen } = props;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<Item[]>([]);
  const close = () => (setOpen(null), setError(''));

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      props.onChanged();
      close();
      toast({ text: done });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openCatalog() {
    setOpen('catalog');
    try {
      setSuggested(await api.get<Item[]>(`/trips/${trip.id}/suggestions`));
    } catch {
      setSuggested([]);
    }
  }

  const onTrip = new Set(props.rows.map((r) => r.item_id).filter((x): x is string => !!x));
  return (
    <>
      <Menu open={open === 'menu'} onClose={close} anchor={props.anchor} title={trip.name}>
        <ActionList
          actions={[
            { icon: 'plus', label: 'Add from catalog', onClick: openCatalog },
            {
              icon: 'settings',
              label: 'Trip details and bags',
              onClick: () => nav(`/trips/${trip.id}/details`),
            },
            {
              icon: 'tmpl',
              label: 'Save as template',
              onClick: () => (setName(trip.name), setOpen('template')),
            },
            {
              icon: 'download',
              label: 'Download as CSV',
              onClick: () => (window.location.href = `/api/trips/${trip.id}/export.csv`),
            },
            {
              icon: 'reset',
              label: 'Reset all to unpacked',
              onClick: () => setOpen('reset'),
              hidden: !props.rows.some((r) => r.packed),
              danger: true,
            },
          ]}
        />
      </Menu>

      <Sheet
        open={open === 'reset'}
        onClose={close}
        title="Reset all to unpacked?"
        footer={
          <>
            <ErrorText>{error}</ErrorText>
            <div className="ml-auto flex">
              <GhostButton onClick={close}>Cancel</GhostButton>
              <PrimaryButton
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/trips/${trip.id}/reset-packed`), 'Everything is unpacked')
                }
              >
                Reset
              </PrimaryButton>
            </div>
          </>
        }
      >
        <p className="py-2 text-sm text-soft">
          Every item on {trip.name} will be marked not packed.
        </p>
      </Sheet>

      <Sheet
        open={open === 'template'}
        onClose={close}
        title="Save as template"
        footer={
          <>
            <ErrorText>{error}</ErrorText>
            <div className="ml-auto flex">
              <GhostButton onClick={close}>Cancel</GhostButton>
              <PrimaryButton
                disabled={busy || !name.trim()}
                onClick={() =>
                  run(async () => {
                    await api.post(`/trips/${trip.id}/save-as-template`, { name });
                    await qc.invalidateQueries({ queryKey: keys.state });
                  }, `Saved template “${name.trim()}”`)
                }
              >
                Save
              </PrimaryButton>
            </div>
          </>
        }
      >
        <FieldRow icon="tmpl" label="Template name" htmlFor="tpl-name">
          <TextInput
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FieldRow>
        <p className="pt-3 text-sm text-soft">
          The list, people, quantities and carry-on choices are saved. Packed checkmarks aren’t.
        </p>
      </Sheet>

      <CatalogPicker
        open={open === 'catalog'}
        title={`Add to ${trip.name}`}
        items={props.catalog}
        suggested={suggested}
        exclude={onTrip}
        onClose={close}
        onAdd={async (ids) => {
          await api.post(`/trips/${trip.id}/items/from-catalog`, { item_ids: ids });
          props.onChanged();
        }}
      />
    </>
  );
}
