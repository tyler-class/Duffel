import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SectionKind } from '@shared/lookups';
import {
  connections,
  dayNumber,
  dayShift,
  endInstant,
  entryMinutes,
  entryName,
  formatMinutes,
  sortEntries,
  sortSections,
  type tripStage,
} from '@shared/logic';
import type { EntryEnd, ItineraryEntry, ItinerarySection, TripDetail } from '@shared/types';
import { api, errorMessage } from '../lib/api';
import { DragActive } from '../lib/dragActive';
import { formatDay, formatRange } from '../lib/format';
import { deviceZone, formatClock, homeTime, likelyZone, zoneName } from '../lib/itinerary';
import { load, save } from '../lib/storage';
import { keys } from '../lib/queries';
import { draftOf, EntrySheet, KIND_ICONS, MODE_ICONS, type EntryDraft } from './EntrySheet';
import { Icon, type IconName } from './Icon';
import { SwipeRow } from './SwipeRow';
import { useToast } from './Toast';
import {
  cx,
  DangerButton,
  ErrorText,
  FieldRow,
  GhostButton,
  IconButton,
  Pick,
  PrimaryButton,
  Sheet,
  SlideToggle,
  TextInput,
} from './ui';

type Stage = ReturnType<typeof tripStage>;
type Clock = 'local' | 'home';
const DAY = 86_400_000;

/** "9:40 PM", or in home time "6:40 PM" with the day when it moves. */
function timeText(e: EntryEnd, clock: Clock): string {
  if (!e.time) return '';
  if (clock === 'home') {
    const h = homeTime(e);
    if (h) return `${formatClock(h.time)}${h.date !== e.date ? ` (${formatDay(h.date)})` : ''}`;
  }
  return formatClock(e.time);
}

function sectionDates(s: ItinerarySection): string {
  const days = s.entries
    .flatMap((e) => [e.start.date, e.end.date])
    .filter((d): d is string => !!d)
    .sort();
  return days.length ? formatRange(days[0]!, days[days.length - 1]!) : '';
}

function copy(text: string, toast: ReturnType<typeof useToast>) {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast({ text: `Copied ${text}` }))
    .catch(() => undefined);
}

/**
 * One line on the itinerary. A stay with a check-out shows twice, at check-in and at
 * check-out, so the days read in order; both open the same booking.
 */
interface Row {
  key: string;
  entry: ItineraryEntry;
  part: 'all' | 'in' | 'out';
  /** The day it's shown under. */
  date: string | null;
  /** When it starts and ends, for sorting and "Next". */
  from: number;
  until: number;
}

/** When an end happens: its instant, or its day (start or end of it) when there's no time. */
function when(e: EntryEnd, endOfDay: boolean): number {
  const at = endInstant(e);
  if (at !== null) return at;
  const d = dayNumber(e.date);
  return d === null ? Infinity : d * DAY + (endOfDay ? DAY - 1 : DAY / 2);
}

function rowsOf(entries: readonly ItineraryEntry[]): Row[] {
  const rows: Row[] = [];
  for (const e of entries) {
    if (e.kind === 'lodging' && e.end.date) {
      rows.push({
        key: `${e.id}:in`,
        entry: e,
        part: 'in',
        date: e.start.date,
        from: when(e.start, false),
        until: when(e.start, true),
      });
      rows.push({
        key: `${e.id}:out`,
        entry: e,
        part: 'out',
        date: e.end.date,
        from: when(e.end, false),
        until: when(e.end, true),
      });
    } else {
      rows.push({
        key: e.id,
        entry: e,
        part: 'all',
        date: e.start.date,
        from: when(e.start, false),
        until: e.end.date ? when(e.end, true) : when(e.start, true),
      });
    }
  }
  const rank = { in: 0, all: 1, out: 2 };
  return rows.sort((a, b) => {
    if (a.from !== b.from)
      return a.from === Infinity ? 1 : b.from === Infinity ? -1 : a.from - b.from;
    return rank[a.part] - rank[b.part] || a.entry.sort_order - b.entry.sort_order;
  });
}

/** A trip's itinerary: sections in order, with transport, lodging, plans and notes. */
export function TripItinerary({ detail, stage }: { detail: TripDetail; stage: Stage }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState('');
  const [sectionSheet, setSectionSheet] = useState<{
    section?: ItinerarySection;
    kind: SectionKind;
  } | null>(null);
  const [entrySheet, setEntrySheet] = useState<{
    section: ItinerarySection;
    entry?: ItineraryEntry;
  } | null>(null);
  const [clock, setClockRaw] = useState<Clock>(() => load('itineraryClock', 'local'));
  const setClock = (c: Clock) => (setClockRaw(c), save('itineraryClock', c));
  const [dragging, setDragging] = useState(false);
  // A drag ends with a click on whatever is under the pointer; swallow it.
  const quiet = useRef(false);
  const tripId = detail.trip.id;
  const key = keys.trip(tripId);
  const sections = sortSections(detail.itinerary);
  const here = deviceZone();
  const otherZones = sections.some((s) =>
    s.entries.some((e) => [e.start.tz, e.end.tz].some((z) => z && z !== here)),
  );
  const [now] = useState(() => Date.now());
  const rowsBySection = new Map(sections.map((s) => [s.id, rowsOf(s.entries)]));

  // "Next": the first line not over yet, once it's close (during the trip, or within two days).
  let next: string | null = null;
  if (stage !== 'after')
    for (const s of sections) {
      const r = rowsBySection.get(s.id)!.find((x) => x.until !== Infinity && x.until >= now);
      if (r) {
        if (stage === 'during' || r.from - now < 2 * DAY) next = r.key;
        break;
      }
    }
  const nextRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stage === 'during') nextRef.current?.scrollIntoView({ block: 'center' });
  }, [stage]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function send(fn: () => Promise<TripDetail>) {
    setError('');
    try {
      qc.setQueryData(key, await fn());
    } catch (e) {
      setError(errorMessage(e));
      qc.invalidateQueries({ queryKey: key });
    }
  }

  function onDragEnd(e: DragEndEvent) {
    quiet.current = true;
    setTimeout(() => (quiet.current = false), 300);
    setDragging(false);
    const ids = sections.map((s) => s.id);
    const a = ids.indexOf(String(e.active.id));
    const b = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (a < 0 || b < 0 || a === b) return;
    const order = arrayMove(ids, a, b);
    const prev = qc.getQueryData<TripDetail>(key);
    if (prev)
      qc.setQueryData<TripDetail>(key, {
        ...prev,
        itinerary: prev.itinerary.map((s) => ({ ...s, sort_order: order.indexOf(s.id) })),
      });
    void send(() => api.post<TripDetail>(`/trips/${tripId}/itinerary/order`, { ids: order }));
  }

  async function removeEntry(e: ItineraryEntry, section: ItinerarySection) {
    setEntrySheet(null);
    await send(() => api.del<TripDetail>(`/itinerary-entries/${e.id}`));
    toast({
      text: `Deleted ${entryName(e)}`,
      action: {
        label: 'Undo',
        run: () =>
          void send(() =>
            api.post<TripDetail>(`/itinerary-sections/${section.id}/entries`, {
              ...draftOf(e),
              sort_order: e.sort_order,
            }),
          ),
      },
    });
  }

  function print() {
    const root = document.documentElement;
    const theme = root.dataset.theme;
    // Print in light colors, whatever the screen uses.
    root.dataset.theme = 'light';
    root.dataset.print = 'itinerary';
    const restore = () => {
      if (theme) root.dataset.theme = theme;
      else delete root.dataset.theme;
      delete root.dataset.print;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  const travelCount = sections.filter((s) => s.kind === 'travel').length;
  const t = detail.trip;

  return (
    <div id="itinerary-print">
      {/* On paper: the trip first. */}
      <header className="hidden px-5 pt-2 pb-1 print:block">
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <p className="text-sm text-soft">
          {[formatRange(t.start_date, t.end_date), t.destination].filter(Boolean).join(' · ')}
        </p>
      </header>

      <div className="px-5">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="flex items-center gap-2 px-5 pt-3 print:hidden">
        {sections.length > 0 && otherZones && (
          <SlideToggle<Clock>
            size="sm"
            label="Show times in"
            value={clock}
            onChange={setClock}
            options={[
              ['local', 'Local'],
              [
                'home',
                <span key="h" title="Your time zone">
                  {zoneName(here, now)}
                </span>,
              ],
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {sections.length > 0 && (
            <button
              className="grid h-8 w-8 place-items-center rounded-full bg-chip text-soft"
              onClick={print}
              aria-label="Print itinerary"
              title="Print itinerary"
            >
              <Icon name="printer" size={16} />
            </button>
          )}
          <AddPill icon="plane" onClick={() => setSectionSheet({ kind: 'travel' })}>
            Travel
          </AddPill>
          <AddPill icon="pin" onClick={() => setSectionSheet({ kind: 'stay' })}>
            Stay
          </AddPill>
        </div>
      </div>

      {!sections.length && (
        <p className="px-6 pt-5 text-sm text-soft">
          Flights, trains, places to stay, reservations: everything in order. Start with how you’re
          getting there.
        </p>
      )}

      <DragActive.Provider value={dragging}>
        <div
          onClickCapture={(e) => {
            if (quiet.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => {
              setDragging(true);
              navigator.vibrate?.(10);
            }}
            onDragCancel={() => setDragging(false)}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((s) => {
                const rows = rowsBySection.get(s.id)!;
                const conns = new Map(connections(sortEntries(s.entries)).map((c) => [c.after, c]));
                const dates = sectionDates(s);
                let lastDay: string | null = null;
                return (
                  <SortableSection
                    key={s.id}
                    section={s}
                    dates={dates}
                    onEdit={() => setSectionSheet({ section: s, kind: s.kind })}
                    onAdd={() => setEntrySheet({ section: s })}
                  >
                    {s.notes && <p className="px-3.5 pt-2 text-[13px] text-soft">{s.notes}</p>}
                    {!rows.length && (
                      <button
                        className="px-3 py-3 text-left text-sm text-faint print:hidden"
                        onClick={() => setEntrySheet({ section: s })}
                      >
                        {s.kind === 'travel'
                          ? 'Add a flight, train, bus, boat or drive.'
                          : 'Add where you’re staying, reservations and plans.'}
                      </button>
                    )}
                    {rows.map((r) => {
                      const showDay = r.date && r.date !== lastDay;
                      if (r.date) lastDay = r.date;
                      const c = r.part === 'all' ? conns.get(r.entry.id) : undefined;
                      return (
                        <Fragment key={r.key}>
                          {showDay && (
                            <div className="px-3 pt-3 pb-1 text-xs font-medium text-faint break-after-avoid">
                              {formatDay(r.date)}
                            </div>
                          )}
                          <div
                            ref={r.key === next ? nextRef : undefined}
                            className="break-inside-avoid"
                          >
                            <SwipeRow
                              id={r.key}
                              onDelete={() => removeEntry(r.entry, s)}
                              className={cx('border-b border-line', c && 'border-b-0')}
                            >
                              <EntryRow
                                row={r}
                                clock={clock}
                                next={r.key === next}
                                onOpen={() => setEntrySheet({ section: s, entry: r.entry })}
                                onCopy={(text) => copy(text, toast)}
                              />
                            </SwipeRow>
                          </div>
                          {c && (
                            <div className="flex items-center gap-2 border-b border-line py-2 pr-3 pl-11 text-[13px] text-soft break-inside-avoid">
                              <Icon name="clock" size={13} className="text-faint" />
                              <span>
                                Layover{c.at ? ` in ${c.at}` : ''} · {formatMinutes(c.minutes)}
                                {c.change && (
                                  <span className="text-danger">
                                    {' '}
                                    · change {c.change.from} → {c.change.to}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </Fragment>
                      );
                    })}
                  </SortableSection>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      </DragActive.Provider>
      <div className="h-8" />

      <SectionSheet
        open={!!sectionSheet}
        section={sectionSheet?.section}
        kind={sectionSheet?.kind ?? 'stay'}
        suggestion={
          sectionSheet?.kind === 'travel'
            ? travelCount
              ? 'Heading home'
              : 'Getting there'
            : (detail.trip.destination ?? '')
        }
        count={sections.length}
        onClose={() => setSectionSheet(null)}
        onSave={async (v) => {
          const res = sectionSheet?.section
            ? await api.patch<TripDetail>(`/itinerary-sections/${sectionSheet.section.id}`, v)
            : await api.post<TripDetail>(`/trips/${tripId}/itinerary`, v);
          qc.setQueryData(key, res);
          // A new section is ready for its first entry.
          if (!sectionSheet?.section) {
            const added = sortSections(res.itinerary).at(-1);
            if (added) setEntrySheet({ section: added });
          }
        }}
        onDelete={() => {
          const s = sectionSheet?.section;
          setSectionSheet(null);
          if (s) void send(() => api.del<TripDetail>(`/itinerary-sections/${s.id}`));
        }}
      />

      <EntrySheet
        open={!!entrySheet}
        editing={!!entrySheet?.entry}
        zone={entrySheet ? likelyZone(sections, entrySheet.section.id) : here}
        initial={
          entrySheet?.entry
            ? draftOf(entrySheet.entry)
            : entrySheet?.section.kind === 'travel'
              ? { kind: 'transport', mode: 'plane' }
              : { kind: entrySheet?.section.entries.length ? 'plan' : 'lodging' }
        }
        onClose={() => setEntrySheet(null)}
        onDelete={
          entrySheet?.entry ? () => removeEntry(entrySheet.entry!, entrySheet.section) : undefined
        }
        onSave={async (d: EntryDraft) => {
          const res = entrySheet?.entry
            ? await api.patch<TripDetail>(`/itinerary-entries/${entrySheet.entry.id}`, d)
            : await api.post<TripDetail>(
                `/itinerary-sections/${entrySheet!.section.id}/entries`,
                d,
              );
          qc.setQueryData(key, res);
        }}
      />
    </div>
  );
}

function AddPill({
  icon,
  onClick,
  children,
}: {
  icon: IconName;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="inline-flex h-8 items-center gap-1 rounded-full bg-chip pr-3 pl-2 text-[13px] font-medium text-ink"
      onClick={onClick}
    >
      <Icon name="plus" size={14} className="text-soft" />
      <Icon name={icon} size={14} className="text-soft" />
      {children}
    </button>
  );
}

/** A section: its bar (hold and drag it to move the section) and its lines. */
function SortableSection({
  section: s,
  dates,
  onEdit,
  onAdd,
  children,
}: {
  section: ItinerarySection;
  dates: string;
  onEdit: () => void;
  onAdd: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
  });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx(
        'relative mt-5 px-5 print:mt-4',
        isDragging && 'z-20 opacity-90 [&>div:first-child]:shadow-lg',
      )}
    >
      <div
        {...attributes}
        {...listeners}
        role="group"
        aria-roledescription="Section you can drag to reorder"
        className="flex touch-manipulation items-center gap-2 rounded-2xl bg-chip py-1.5 pr-1.5 pl-3.5 select-none break-after-avoid"
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
          onClick={onEdit}
          aria-label={`Edit ${s.title}`}
        >
          <Icon name={s.kind === 'travel' ? 'plane' : 'pin'} size={16} className="text-soft" />
          <span className="truncate text-base font-semibold">{s.title}</span>
          {dates && <span className="ml-auto flex-none text-xs text-faint tnum">{dates}</span>}
        </button>
        <IconButton
          icon="plus"
          label={`Add to ${s.title}`}
          className="h-7 w-7 print:hidden"
          onClick={onAdd}
        />
      </div>
      {children}
    </section>
  );
}

function EntryRow({
  row,
  clock,
  next,
  onOpen,
  onCopy,
}: {
  row: Row;
  clock: Clock;
  next: boolean;
  onOpen: () => void;
  onCopy: (text: string) => void;
}) {
  const e = row.entry;
  const icon: IconName =
    row.part === 'out'
      ? 'logout'
      : e.kind === 'transport'
        ? MODE_ICONS[e.mode ?? 'plane']
        : KIND_ICONS[e.kind];
  const lines: ReactNode[] = [];
  let lead: string | null = null;
  if (e.kind === 'transport') {
    const from = e.start.code ?? e.start.place;
    const to = e.end.code ?? e.end.place;
    const shift = dayShift(e);
    const route = [
      [from, timeText(e.start, clock)].filter(Boolean).join(' '),
      [to, timeText(e.end, clock)].filter(Boolean).join(' '),
    ];
    if (route.some(Boolean))
      lines.push(
        <span key="route" className="tnum">
          {route[0] || '?'} → {route[1] || '?'}
          {shift > 0 && clock === 'local' && (
            <sup className="ml-0.5 text-[10px] text-faint">+{shift}</sup>
          )}
        </span>,
      );
    const label = entryName(e);
    const sub = [e.carrier, e.number].filter(Boolean).join(' ');
    if (e.title && sub && sub !== label) lines.push(<span key="num">{sub}</span>);
    if (e.end.date && e.start.date && e.end.date !== e.start.date && shift > 1)
      lines.push(<span key="arr">Arrives {formatDay(e.end.date)}</span>);
  } else if (e.kind === 'lodging') {
    if (row.part === 'out') {
      lead = 'Check out';
      const outT = timeText(e.end, clock);
      if (outT) lines.push(<span key="t">{outT}</span>);
    } else {
      lead = row.part === 'in' ? 'Check in' : null;
      const inT = timeText(e.start, clock);
      const nights =
        e.start.date && e.end.date ? dayNumber(e.end.date)! - dayNumber(e.start.date)! : null;
      const bits = [
        inT,
        nights ? `${nights} night${nights === 1 ? '' : 's'}` : '',
        e.address ?? '',
      ].filter(Boolean);
      if (bits.length) lines.push(<span key="t">{bits.join(' · ')}</span>);
    }
  } else if (e.kind === 'plan') {
    const time = [timeText(e.start, clock), timeText(e.end, clock)].filter(Boolean).join(' – ');
    const where = e.start.place;
    if (time || where) lines.push(<span key="t">{[time, where].filter(Boolean).join(' · ')}</span>);
  }
  const out = row.part === 'out';
  const minutes = e.kind === 'transport' ? entryMinutes(e) : null;
  const statusQuery =
    e.kind === 'transport' && e.mode === 'plane' && e.carrier && e.number
      ? `${e.carrier} ${e.number} flight status`
      : null;

  return (
    <div
      className={cx(
        'flex items-start gap-3 px-3 py-3',
        next && 'bg-accent-tint/30 print:bg-transparent',
      )}
    >
      <Icon name={icon} size={18} className="mt-0.5 text-soft" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button className="flex min-w-0 flex-col gap-0.5 text-left" onClick={onOpen}>
          <span className="flex items-center gap-2">
            <span className={cx('min-w-0 truncate text-base leading-tight', out && 'text-soft')}>
              {lead && <span className="text-soft">{lead} · </span>}
              {entryName(e)}
            </span>
            {next && (
              <span className="flex-none rounded bg-accent-tint px-1.5 py-px text-[11px] font-medium text-accent print:hidden">
                Next
              </span>
            )}
            {minutes !== null && (
              <span className="ml-auto flex-none font-mono text-xs text-faint tnum">
                {formatMinutes(minutes)}
              </span>
            )}
          </span>
          {lines.map((l, i) => (
            <span key={i} className="text-[13px] text-soft">
              {l}
            </span>
          ))}
          {e.kind === 'note' && e.notes && (
            <span className="text-[13px] whitespace-pre-line text-soft">{e.notes}</span>
          )}
          {!out && e.kind !== 'note' && (e.details || e.notes) && (
            <span className="truncate text-[13px] text-faint print:whitespace-normal">
              {[e.details, e.notes].filter(Boolean).join(' · ')}
            </span>
          )}
        </button>
        {!out && (e.confirmation || statusQuery) && (
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            {e.confirmation && (
              <button
                className="inline-flex items-center gap-1 rounded-md bg-chip px-1.5 py-0.5 font-mono text-xs text-ink"
                aria-label={`Copy confirmation ${e.confirmation}`}
                onClick={() => onCopy(e.confirmation!)}
              >
                <Icon name="copy" size={12} className="text-faint print:hidden" />
                {e.confirmation}
              </button>
            )}
            {statusQuery && (
              <a
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-accent print:hidden"
                href={`https://www.google.com/search?q=${encodeURIComponent(statusQuery)}`}
                target="_blank"
                rel="noreferrer"
              >
                Flight status
              </a>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionSheet(props: {
  open: boolean;
  section?: ItinerarySection;
  kind: SectionKind;
  suggestion: string;
  count: number;
  onClose: () => void;
  onSave: (v: { kind: SectionKind; title: string; notes: string | null }) => Promise<void>;
  onDelete: () => void;
}) {
  if (!props.open) return null;
  return <SectionSheetBody {...props} />;
}

function SectionSheetBody({
  section,
  kind: initialKind,
  suggestion,
  count,
  onClose,
  onSave,
  onDelete,
}: Parameters<typeof SectionSheet>[0]) {
  const [kind, setKind] = useState<SectionKind>(section?.kind ?? initialKind);
  const [title, setTitle] = useState(section?.title ?? suggestion);
  const [notes, setNotes] = useState(section?.notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const n = section?.entries.length ?? 0;

  async function save() {
    if (!title.trim()) return setError('Give the section a name.');
    setBusy(true);
    try {
      await onSave({ kind, title: title.trim(), notes: notes.trim() || null });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={section ? 'Edit section' : kind === 'travel' ? 'Add travel' : 'Add a stay'}
      footer={
        <>
          {section ? (
            <DangerButton onClick={() => (n && !confirm ? setConfirm(true) : onDelete())}>
              {confirm ? `Delete with ${n} ${n === 1 ? 'entry' : 'entries'}?` : 'Delete'}
            </DangerButton>
          ) : (
            <span />
          )}
          <div className="flex items-center">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={busy}>
              {section ? 'Save' : 'Add'}
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
        <FieldRow icon="layers" label="Type">
          <div className="flex flex-wrap gap-1.5">
            <Pick on={kind === 'travel'} onClick={() => setKind('travel')}>
              <Icon name="plane" size={15} />
              Travel
            </Pick>
            <Pick on={kind === 'stay'} onClick={() => setKind('stay')}>
              <Icon name="pin" size={15} />
              Stay
            </Pick>
          </div>
        </FieldRow>
        <FieldRow
          icon="tag"
          label="Name"
          htmlFor="section-title"
          hint={
            kind === 'travel' ? 'e.g. Getting there, Lisbon → Porto, Heading home' : 'e.g. Lisbon'
          }
        >
          <TextInput
            id="section-title"
            autoFocus={!section}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FieldRow>
        <FieldRow icon="note" label="Notes" htmlFor="section-notes">
          <TextInput
            id="section-notes"
            value={notes}
            placeholder="Optional"
            onChange={(e) => setNotes(e.target.value)}
          />
        </FieldRow>
        {section && count > 1 && (
          <p className="pt-3 text-xs text-faint">
            To move this section, hold its bar in the list and drag it.
          </p>
        )}
        <button type="submit" hidden />
        <div className="pt-3">
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Sheet>
  );
}
