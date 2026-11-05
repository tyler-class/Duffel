// MCP server: lets any MCP-capable assistant read and update this household's packing lists.
// Tools call the same REST API the app uses (validation and logic live there), marked internal
// because OAuthProvider has already checked the assistant's token.
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  calcSummary,
  describeRelative,
  displayQty,
  isCarryOn,
  localToday,
  orderCategories,
  packChoice,
  packLabel,
  resolveCalc,
  shortBagLabel,
  sortTemplateTodos,
  sortTripTodos,
  splitTrips,
  todoDueDate,
} from '@shared/logic';
import {
  DEFAULT_LOOKUPS,
  REL_ANCHORS,
  REL_DIRS,
  TODO_PHASE_LABELS,
  TODO_PHASES,
} from '@shared/lookups';
import type {
  AppState,
  Item,
  Person,
  Template,
  TemplateTodo,
  TodoWhen,
  TripBag,
  TripDetail,
  TripItem,
} from '@shared/types';
import { app } from './app';
import { INTERNAL } from './auth';

type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

class ToolError extends Error {}

function apiCaller(origin: string, env: Cloudflare.Env, ctx: ExecutionContext): Call {
  const internalEnv = { ...env, [INTERNAL]: true };
  return async <T>(method: string, path: string, body?: unknown) => {
    const res = await app.fetch(
      new Request(`${origin}/api${path}`, {
        method,
        headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      }),
      internalEnv,
      ctx,
    );
    const data = (await res.json().catch(() => null)) as T & { message?: string };
    if (!res.ok) throw new ToolError(data?.message ?? `Request failed (${res.status}).`);
    return data;
  };
}

const text = (v: unknown) => ({
  content: [
    { type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) },
  ],
});
const fail = (e: unknown) => ({
  content: [
    { type: 'text' as const, text: e instanceof Error ? e.message : 'Something went wrong.' },
  ],
  isError: true,
});

function find<T extends { id: string }>(
  list: T[],
  key: string,
  nameOf: (t: T) => string,
  what: string,
): T {
  const k = key.trim().toLowerCase();
  const hit = list.find((t) => t.id === key) ?? list.find((t) => nameOf(t).toLowerCase() === k);
  if (hit) return hit;
  const partial = list.filter((t) => nameOf(t).toLowerCase().includes(k));
  if (partial.length === 1) return partial[0]!;
  const options = list.map(nameOf).join(', ') || 'none';
  throw new ToolError(`No ${what} matches “${key}”. Options: ${options}.`);
}

/** How an assistant sees a to-do: when it's due in words and as a date. */
function todoView(t: TemplateTodo | TripDetail['todos'][number], trip?: TripDetail['trip']) {
  const date = trip ? todoDueDate(t, trip) : t.date_mode === 'fixed' ? t.due_date : null;
  return {
    id: t.id,
    title: t.title,
    phase: TODO_PHASE_LABELS[t.phase],
    when:
      t.date_mode === 'relative'
        ? describeRelative(t)
        : t.date_mode === 'fixed'
          ? 'fixed date'
          : 'no date',
    ...(date ? { date } : {}),
    ...('done' in t ? { done: t.done } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  };
}

const todoDateInput = {
  date: z
    .string()
    .nullable()
    .optional()
    .describe('A fixed date, YYYY-MM-DD. null removes the date.'),
  relative: z
    .object({
      days: z.number().int().min(0).max(3650).default(0),
      direction: z.enum(REL_DIRS),
      anchor: z.enum(REL_ANCHORS).describe('Start, middle or end of the trip'),
    })
    .optional()
    .describe(
      'A date relative to the trip, e.g. 3 days before the start. Follows the trip’s dates.',
    ),
};

function whenFrom(a: {
  date?: string | null;
  relative?: { days: number; direction: TodoWhen['rel_dir']; anchor: TodoWhen['rel_anchor'] };
}): Partial<TodoWhen> {
  if (a.relative)
    return {
      date_mode: 'relative',
      rel_days: a.relative.days,
      rel_dir: a.relative.direction,
      rel_anchor: a.relative.anchor,
    };
  if (a.date === null) return { date_mode: 'none' };
  if (a.date !== undefined) return { date_mode: 'fixed', due_date: a.date };
  return {};
}

/** The groups on a list, in the order they're shown. */
function groupOrder(rows: { category: string | null }[], saved: string[]) {
  const present = rows.map((r) => r.category?.trim()).filter((c): c is string => !!c);
  return orderCategories(present, saved, DEFAULT_LOOKUPS.category);
}

const groupInput = z
  .string()
  .nullable()
  .optional()
  .describe('Item group, e.g. "Clothing" or "Documents". null takes it out of its group.');

function summarizeTrip(d: TripDetail, people: Person[]) {
  const bags = new Map(d.bags.map((b) => [b.id, b]));
  const names = new Map(people.map((p) => [p.id, p.name]));
  return {
    id: d.trip.id,
    name: d.trip.name,
    start_date: d.trip.start_date,
    end_date: d.trip.end_date,
    days: d.trip.days,
    nights: d.trip.nights,
    destination: d.trip.destination,
    travelers: d.trip.travelers.map((p) => names.get(p) ?? p),
    packed: `${d.items.filter((r) => r.packed).length} of ${d.items.length}`,
    group_order: groupOrder(d.items, d.trip.category_order),
    bags: d.bags.map((b) => ({
      id: b.id,
      name: shortBagLabel(b.label, d.trip.name),
      carry_on: b.carry_on,
    })),
    items: d.items.map((r) => ({
      id: r.id,
      name: r.name,
      group: r.category,
      for: r.person_id ? (names.get(r.person_id) ?? 'Shared') : 'Shared',
      bag: r.trip_bag_id
        ? shortBagLabel(bags.get(r.trip_bag_id)?.label ?? '', d.trip.name)
        : 'No bag',
      carry_on: isCarryOn(r, bags),
      qty: displayQty(r),
      packed: r.packed,
      notes: r.notes,
    })),
    todos: sortTripTodos(d.todos, d.trip).map((t) => todoView(t, d.trip)),
  };
}

function buildServer(call: Call) {
  const server = new McpServer({ name: 'duffel', version: '1.0.0' });
  const state = () => call<AppState>('GET', '/state');
  const trip = (id: string) => call<TripDetail>('GET', `/trips/${encodeURIComponent(id)}`);
  async function resolveTrip(key?: string) {
    const s = await state();
    if (!key) {
      const { active, archived } = splitTrips(s.trips, localToday());
      const t = active[0] ?? archived[0];
      if (!t) throw new ToolError('There are no trips yet. Use create_trip first.');
      return { s, t };
    }
    return { s, t: find(s.trips, key, (t) => t.name, 'trip') };
  }
  function resolvePerson(
    people: Person[],
    key: string | null | undefined,
  ): string | null | undefined {
    if (key === undefined) return undefined;
    if (key === null || /^(shared|nobody|none)$/i.test(key.trim())) return null;
    return find(people, key, (p) => p.name, 'person').id;
  }
  function resolveBag(bags: TripBag[], tripName: string, key: string | undefined) {
    if (key === undefined) return {};
    if (/^no bag$|^none$|^outside$/i.test(key.trim())) return { no_bag: true, trip_bag_id: null };
    if (/^(later|undecided|no bag yet)$/i.test(key.trim()))
      return { no_bag: false, trip_bag_id: null };
    return {
      trip_bag_id: find(bags, key, (b) => shortBagLabel(b.label, tripName), 'bag').id,
      no_bag: false,
    };
  }

  server.registerTool(
    'list_trips',
    {
      description:
        'List upcoming and past trips with packing progress, plus the household’s people.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const s = await state();
        const { active, archived } = splitTrips(s.trips, localToday());
        const row = (t: (typeof s.trips)[number]) => ({
          id: t.id,
          name: t.name,
          start_date: t.start_date,
          end_date: t.end_date,
          destination: t.destination,
          packed: `${t.packed_count} of ${t.item_count}`,
        });
        return text({
          household: s.settings.instance_name,
          people: s.people.map((p) => p.name),
          upcoming: active.map(row),
          past: archived.map(row),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_packing_list',
    {
      description:
        'Show a trip’s packing list: every item with its group, who it’s for, which bag, carry-on, quantity and packed state, plus the group order and the trip’s to-dos. Defaults to the next upcoming trip.',
      inputSchema: z.object({ trip: z.string().optional().describe('Trip name or id') }),
    },
    async ({ trip: key }) => {
      try {
        const { s, t } = await resolveTrip(key);
        return text(summarizeTrip(await trip(t.id), s.people));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'search_catalog',
    {
      description: 'Search the catalog of things this household packs.',
      inputSchema: z.object({ query: z.string().optional() }),
    },
    async ({ query }) => {
      try {
        const s = await state();
        const q = query?.trim().toLowerCase() ?? '';
        const names = new Map(s.people.map((p) => [p.id, p.name]));
        const hits = s.items.filter(
          (i: Item) =>
            !i.archived &&
            (!q ||
              i.name.toLowerCase().includes(q) ||
              (i.category ?? '').toLowerCase().includes(q)),
        );
        return text(
          hits.map((i) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            quantity:
              i.qty_mode === 'fixed'
                ? i.qty
                : `${i.qty} ${i.qty_mode.replace('_', ' ')}${i.qty_offset ? ` ${i.qty_offset > 0 ? 'plus' : 'minus'} ${Math.abs(i.qty_offset)}` : ''}${i.max_qty !== null ? `, max ${i.max_qty}` : ''}`,
            who_packs: i.default_people.map((p) => names.get(p) ?? p),
            auto_pack: packLabel(packChoice(i)),
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'add_items',
    {
      description:
        'Add items to a trip’s packing list. Names that match the catalog use its quantity rules and group. bag can be a bag name, "no bag" (travels outside any bag) or "later".',
      inputSchema: z.object({
        trip: z.string().optional().describe('Trip name or id; defaults to the next trip'),
        items: z
          .array(
            z.object({
              name: z.string().min(1),
              for: z.string().optional().describe('Person name, or "shared"'),
              bag: z.string().optional(),
              qty: z.number().nonnegative().optional(),
              group: groupInput,
              notes: z.string().optional(),
            }),
          )
          .min(1)
          .max(100),
      }),
    },
    async ({ trip: key, items }) => {
      try {
        const { s, t } = await resolveTrip(key);
        const d = await trip(t.id);
        const added: string[] = [];
        for (const it of items) {
          const match = s.items.find(
            (i) => !i.archived && i.name.toLowerCase() === it.name.trim().toLowerCase(),
          );
          const row = await call<TripItem>('POST', `/trips/${t.id}/items`, {
            name: match?.name ?? it.name.trim(),
            item_id: match?.id ?? null,
            person_id: resolvePerson(s.people, it.for ?? null) ?? null,
            ...resolveBag(d.bags, t.name, it.bag),
            ...(match ? { qty_override: it.qty ?? null } : { qty: it.qty ?? 1 }),
            ...(it.group !== undefined ? { category: it.group } : {}),
            notes: it.notes ?? null,
          });
          added.push(`${row.name} (×${displayQty(row) ?? '?'})`);
        }
        return text(`Added to ${t.name}: ${added.join(', ')}.`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'update_item',
    {
      description:
        'Change one item on a packing list: mark packed or unpacked, move it to another person, bag or group, change quantity, rename, or edit notes. Use ids from get_packing_list.',
      inputSchema: z.object({
        item_id: z.string(),
        packed: z.boolean().optional(),
        for: z.string().optional().describe('Person name, or "shared"'),
        bag: z.string().optional().describe('Bag name, "no bag" or "later"'),
        qty: z.number().nonnegative().optional(),
        name: z.string().optional(),
        group: groupInput,
        notes: z.string().optional(),
      }),
    },
    async ({ item_id, packed, for: who, bag, qty, name, group, notes }) => {
      try {
        const s = await state();
        const owner = s.trips.length ? await findRowTrip(s, item_id) : null;
        if (!owner)
          throw new ToolError(
            'No packing-list item has that id. Use get_packing_list to find ids.',
          );
        const row = await call<TripItem>('PATCH', `/trip-items/${item_id}`, {
          ...(packed !== undefined ? { packed } : {}),
          ...(who !== undefined ? { person_id: resolvePerson(s.people, who) } : {}),
          ...resolveBag(owner.bags, owner.trip.name, bag),
          ...(qty !== undefined ? (owner.row.calc_mode ? { qty_override: qty } : { qty }) : {}),
          ...(name !== undefined ? { name } : {}),
          ...(group !== undefined ? { category: group } : {}),
          ...(notes !== undefined ? { notes } : {}),
        });
        return text(`Updated ${row.name}${row.packed ? ' (packed)' : ''}.`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  async function findRowTrip(s: AppState, rowId: string) {
    for (const t of s.trips) {
      const d = await trip(t.id);
      const row = d.items.find((r) => r.id === rowId);
      if (row) return { trip: d.trip, bags: d.bags, row };
    }
    return null;
  }

  server.registerTool(
    'set_packed',
    {
      description: 'Mark several items on one trip as packed (or not packed) at once.',
      inputSchema: z.object({
        trip: z.string().optional(),
        item_ids: z.array(z.string()).min(1).max(200),
        packed: z.boolean().default(true),
      }),
    },
    async ({ trip: key, item_ids, packed }) => {
      try {
        const { t } = await resolveTrip(key);
        const d = await trip(t.id);
        const ids = new Set(d.items.map((r) => r.id));
        const missing = item_ids.filter((id) => !ids.has(id));
        if (missing.length)
          throw new ToolError(`These ids aren’t on ${t.name}: ${missing.join(', ')}.`);
        for (const id of item_ids) await call('PATCH', `/trip-items/${id}`, { packed });
        return text(
          `Marked ${item_ids.length} item${item_ids.length === 1 ? '' : 's'} as ${packed ? 'packed' : 'not packed'} on ${t.name}.`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'remove_item',
    {
      description: 'Remove one item from a packing list.',
      inputSchema: z.object({ item_id: z.string() }),
    },
    async ({ item_id }) => {
      try {
        await call('DELETE', `/trip-items/${item_id}`);
        return text('Removed.');
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'create_trip',
    {
      description:
        'Create a trip from a template, by copying a past trip (everything starts unpacked and to-dos undone), or blank. Dates are YYYY-MM-DD; per-day items scale to the trip length and relative to-do dates follow the trip.',
      inputSchema: z.object({
        name: z.string().min(1),
        from_template: z.string().optional().describe('Template name or id'),
        copy_trip: z.string().optional().describe('Past trip name or id to copy'),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        destination: z.string().optional(),
        travelers: z.array(z.string()).optional().describe('People’s names; defaults to everyone'),
      }),
    },
    async (a) => {
      try {
        const s = await state();
        if (a.from_template && a.copy_trip)
          throw new ToolError('Use either from_template or copy_trip, not both.');
        const source = a.from_template
          ? {
              kind: 'template',
              template_id: find<Template>(s.templates, a.from_template, (t) => t.name, 'template')
                .id,
            }
          : a.copy_trip
            ? { kind: 'clone', trip_id: find(s.trips, a.copy_trip, (t) => t.name, 'trip').id }
            : { kind: 'blank' };
        const travelers =
          a.travelers?.map((n) => find(s.people, n, (p) => p.name, 'person').id) ??
          (a.copy_trip ? [] : s.people.map((p) => p.id));
        const d = await call<TripDetail>('POST', '/trips', {
          name: a.name,
          start_date: a.start_date ?? null,
          end_date: a.end_date ?? null,
          destination: a.destination ?? null,
          travelers,
          source,
        });
        return text({ created: summarizeTrip(d, s.people) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'list_templates',
    {
      description:
        'List templates (reusable packing lists) and what’s on them. Use get_template for item ids and groups.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const s = await state();
        const items = new Map(s.items.map((i) => [i.id, i.name]));
        return text(
          s.templates.map((t) => ({
            id: t.id,
            name: t.name,
            trip_type: t.trip_type,
            climate: t.climate,
            items: t.items.map((ti) => items.get(ti.item_id) ?? '?'),
            todos: sortTemplateTodos(t.todos).map((x) => todoView(x)),
          })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'save_trip_as_template',
    {
      description: 'Save a trip’s list as a new template. Packed checkmarks are not saved.',
      inputSchema: z.object({ trip: z.string(), name: z.string().min(1) }),
    },
    async ({ trip: key, name }) => {
      try {
        const { t } = await resolveTrip(key);
        const tpl = await call<Template>('POST', `/trips/${t.id}/save-as-template`, { name });
        return text(`Saved template “${tpl.name}” with ${tpl.items.length} items.`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------- templates and groups ----------
  function summarizeTemplate(t: Template, s: AppState) {
    const items = new Map(s.items.map((i) => [i.id, i]));
    const names = new Map(s.people.map((p) => [p.id, p.name]));
    return {
      id: t.id,
      name: t.name,
      trip_type: t.trip_type,
      climate: t.climate,
      activities: t.activities,
      group_order: groupOrder(t.items, t.category_order),
      items: [...t.items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ti) => {
          const item = items.get(ti.item_id);
          const who = ti.assignees.length ? ti.assignees : (item?.default_people ?? []);
          return {
            id: ti.id,
            name: item?.name ?? 'Removed item',
            group: ti.category,
            who_packs: who.length ? who.map((p) => names.get(p) ?? p) : 'Shared',
            quantity: calcSummary(
              resolveCalc(item ?? { qty_mode: 'fixed', qty: 1, max_qty: null }, ti),
            ),
            ...(ti.pack_type || ti.carry_on ? { auto_pack: ti.pack_type ?? 'Carry-on' } : {}),
            ...(ti.notes ? { notes: ti.notes } : {}),
          };
        }),
      todos: sortTemplateTodos(t.todos).map((x) => todoView(x)),
    };
  }

  server.registerTool(
    'get_template',
    {
      description:
        'Show a template: its items with ids, groups, who packs each, quantities and notes, the group order, and its to-dos.',
      inputSchema: z.object({ template: z.string().describe('Template name or id') }),
    },
    async ({ template }) => {
      try {
        const s = await state();
        return text(
          summarizeTemplate(
            find(s.templates, template, (t) => t.name, 'template'),
            s,
          ),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'update_template_item',
    {
      description:
        'Change one item on a template: its group, who packs it, or notes. Use ids from get_template.',
      inputSchema: z.object({
        template_item_id: z.string(),
        group: groupInput,
        who_packs: z
          .array(z.string())
          .optional()
          .describe('People’s names. Empty uses the catalog item’s people, or one shared entry.'),
        notes: z.string().nullable().optional(),
      }),
    },
    async ({ template_item_id, group, who_packs, notes }) => {
      try {
        const s = await state();
        const tpl = s.templates.find((t) => t.items.some((i) => i.id === template_item_id));
        if (!tpl)
          throw new ToolError('No template item has that id. Use get_template to find ids.');
        const t = await call<Template>('PATCH', `/template-items/${template_item_id}`, {
          ...(group !== undefined ? { category: group } : {}),
          ...(who_packs !== undefined
            ? { assignees: who_packs.map((n) => find(s.people, n, (p) => p.name, 'person').id) }
            : {}),
          ...(notes !== undefined ? { notes } : {}),
        });
        const row = summarizeTemplate(t, s).items.find((i) => i.id === template_item_id);
        return text({ updated: row });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'set_group_order',
    {
      description:
        'Set the order item groups are shown in on a trip or template. Groups you leave out follow, in their usual order.',
      inputSchema: z.object({
        trip: z.string().optional().describe('Trip name or id; defaults to the next trip'),
        template: z.string().optional().describe('Template name or id'),
        order: z.array(z.string().min(1)).min(1).max(200),
      }),
    },
    async (a) => {
      try {
        const s = await state();
        if (a.trip && a.template) throw new ToolError('Give either trip or template, not both.');
        if (a.template) {
          const t = find(s.templates, a.template, (x) => x.name, 'template');
          const u = await call<Template>('PATCH', `/templates/${t.id}`, {
            category_order: a.order,
          });
          return text({ template: u.name, group_order: groupOrder(u.items, u.category_order) });
        }
        const { t } = await resolveTrip(a.trip);
        const d = await call<TripDetail>('PATCH', `/trips/${t.id}`, { category_order: a.order });
        return text({ trip: d.trip.name, group_order: groupOrder(d.items, d.trip.category_order) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------- to-dos ----------
  async function todoOwner(s: AppState, a: { trip?: string; template?: string }) {
    if (a.trip && a.template) throw new ToolError('Give either trip or template, not both.');
    if (a.template)
      return {
        template: find<Template>(s.templates, a.template, (t) => t.name, 'template'),
      };
    return { trip: (await resolveTrip(a.trip)).t };
  }

  server.registerTool(
    'list_todos',
    {
      description:
        'List to-dos (Pre-trip, During trip, After trip) for a trip or a template, sorted by date. Defaults to the next trip.',
      inputSchema: z.object({
        trip: z.string().optional().describe('Trip name or id'),
        template: z.string().optional().describe('Template name or id'),
      }),
    },
    async (a) => {
      try {
        const s = await state();
        const o = await todoOwner(s, a);
        if (o.template)
          return text({
            template: o.template.name,
            todos: sortTemplateTodos(o.template.todos).map((t) => todoView(t)),
          });
        const d = await trip(o.trip!.id);
        return text({
          trip: d.trip.name,
          start_date: d.trip.start_date,
          end_date: d.trip.end_date,
          todos: sortTripTodos(d.todos, d.trip).map((t) => todoView(t, d.trip)),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'add_todos',
    {
      description:
        'Add to-dos to a trip or a template. phase is pre (before the trip), during or after. Give a fixed date, a relative one (days before/on/after the start, middle or end of the trip), or neither.',
      inputSchema: z.object({
        trip: z.string().optional().describe('Trip name or id; defaults to the next trip'),
        template: z.string().optional().describe('Template name or id'),
        todos: z
          .array(
            z.object({
              title: z.string().min(1),
              phase: z.enum(TODO_PHASES).default('pre'),
              ...todoDateInput,
              notes: z.string().optional(),
            }),
          )
          .min(1)
          .max(100),
      }),
    },
    async (a) => {
      try {
        const s = await state();
        const o = await todoOwner(s, a);
        const path = o.template
          ? `/templates/${o.template.id}/todos`
          : `/trips/${o.trip!.id}/todos`;
        for (const t of a.todos)
          await call('POST', path, {
            title: t.title,
            phase: t.phase,
            ...whenFrom(t),
            notes: t.notes ?? null,
          });
        return text(
          `Added ${a.todos.length} to-do${a.todos.length === 1 ? '' : 's'} to ${o.template?.name ?? o.trip!.name}.`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'update_todo',
    {
      description:
        'Change a to-do on a trip or template: mark it done (trips), rename it, move it to another phase, change or remove its date, or edit notes. Use ids from list_todos.',
      inputSchema: z.object({
        todo_id: z.string(),
        done: z.boolean().optional(),
        title: z.string().min(1).optional(),
        phase: z.enum(TODO_PHASES).optional(),
        ...todoDateInput,
        notes: z.string().nullable().optional(),
      }),
    },
    async (a) => {
      try {
        const s = await state();
        const onTemplate = s.templates.some((t) => t.todos.some((x) => x.id === a.todo_id));
        if (onTemplate && a.done !== undefined)
          throw new ToolError('Template to-dos can’t be done; only trip to-dos can.');
        const body = {
          ...(a.done !== undefined ? { done: a.done } : {}),
          ...(a.title !== undefined ? { title: a.title } : {}),
          ...(a.phase !== undefined ? { phase: a.phase } : {}),
          ...whenFrom(a),
          ...(a.notes !== undefined ? { notes: a.notes } : {}),
        };
        if (onTemplate) {
          await call('PATCH', `/template-todos/${a.todo_id}`, body);
          return text('Updated the template to-do.');
        }
        const d = await call<TripDetail>('PATCH', `/trip-todos/${a.todo_id}`, body).catch(() => {
          throw new ToolError('No to-do has that id. Use list_todos to find ids.');
        });
        const t = d.todos.find((x) => x.id === a.todo_id)!;
        return text({ updated: todoView(t, d.trip) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'remove_todo',
    {
      description: 'Delete a to-do from a trip or template.',
      inputSchema: z.object({ todo_id: z.string() }),
    },
    async ({ todo_id }) => {
      try {
        const s = await state();
        const onTemplate = s.templates.some((t) => t.todos.some((x) => x.id === todo_id));
        await call('DELETE', onTemplate ? `/template-todos/${todo_id}` : `/trip-todos/${todo_id}`);
        return text('Removed.');
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}

/** The OAuthProvider apiHandler for /mcp. Only reached with a valid token. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const origin = new URL(request.url).origin;
    const call = apiCaller(origin, env, ctx);
    const handler = createMcpHandler(() => buildServer(call));
    return handler.fetch(request);
  },
};
