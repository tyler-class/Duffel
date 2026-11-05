// Turning templates, catalog items and past trips into trip-item rows.
import type { QtyMode } from '../lookups';
import type { Item, TemplateItem, TripBag, TripItem } from '../types';
import { placeRow, rewriteLabelPrefix, type PlaceableBag } from './bags';
import { calcQty, resolveCalc, rowCalc, type LengthLike } from './quantity';

/** A trip-item row before it has an id, trip, timestamps or sort order. */
export interface TripItemDraft {
  item_id: string | null;
  name: string;
  person_id: string | null;
  trip_bag_id: string | null;
  no_bag: boolean;
  calc_mode: QtyMode | null;
  calc_unit_qty: number | null;
  calc_max: number | null;
  calc_offset: number | null;
  qty: number | null;
  qty_override: number | null;
  notes: string | null;
  carry_hint: boolean;
}

export interface PlanContext {
  len: LengthLike | null;
  /** Trip travelers. Empty = no restriction. */
  travelers: string[];
  /** The trip's bags, with who each is for. */
  bags: PlaceableBag[];
}

export interface PlanEntry {
  item: Item;
  override?: Pick<
    TemplateItem,
    'qty_mode_override' | 'qty_override' | 'qty_offset_override'
  > | null;
  /** Explicit people. Empty = fall back to the item's default people. */
  assignees: string[];
  carryHint: boolean;
  notes: string | null;
}

/**
 * One row per assignee (qty is per person), restricted to travelers. Items whose
 * people are all staying home are skipped; items with nobody become one shared row.
 */
export function planRows(entries: PlanEntry[], ctx: PlanContext): TripItemDraft[] {
  const out: TripItemDraft[] = [];
  for (const e of entries) {
    const base = e.assignees.length ? e.assignees : e.item.default_people;
    let people: (string | null)[] = base;
    if (ctx.travelers.length) {
      people = base.filter((p) => ctx.travelers.includes(p));
      if (base.length && !people.length) continue;
    }
    if (!people.length) people = [null];
    const calc = resolveCalc(e.item, e.override);
    const qty = calcQty(calc, ctx.len);
    for (const person of people) {
      const place = placeRow(
        { person_id: person, carry: e.carryHint, not_in_suitcase: e.item.not_in_suitcase },
        ctx.bags,
      );
      out.push({
        item_id: e.item.id,
        name: e.item.name,
        person_id: person,
        trip_bag_id: place.trip_bag_id,
        no_bag: place.no_bag,
        carry_hint: e.carryHint && !e.item.not_in_suitcase,
        calc_mode: calc.mode,
        calc_unit_qty: calc.unitQty,
        calc_max: calc.max,
        calc_offset: calc.offset ?? 0,
        qty,
        qty_override: null,
        notes: e.notes,
      });
    }
  }
  return out;
}

export function planFromTemplate(
  templateItems: TemplateItem[],
  items: Map<string, Item>,
  ctx: PlanContext,
): TripItemDraft[] {
  const entries: PlanEntry[] = [];
  for (const ti of [...templateItems].sort((a, b) => a.sort_order - b.sort_order)) {
    const item = items.get(ti.item_id);
    if (!item) continue;
    entries.push({
      item,
      override: ti,
      assignees: ti.assignees,
      carryHint: ti.carry_on || item.usually_carry_on,
      notes: ti.notes,
    });
  }
  return planRows(entries, ctx);
}

export interface ClonePlan {
  bags: (Omit<TripBag, 'trip_id'> & { source_id: string })[];
  items: (TripItemDraft & { sort_order: number })[];
}

/**
 * Copies bags and rows from a past trip. Every copied row starts unpacked.
 * Quantities with a calc snapshot are recomputed for the new trip length.
 * When `travelers` is given, rows for people not on the new trip are dropped.
 */
export function planClone(input: {
  sourceName: string;
  newName: string;
  bags: TripBag[];
  items: TripItem[];
  len: LengthLike | null;
  travelers?: string[];
  newId: () => string;
}): ClonePlan {
  const bagMap = new Map<string, string>();
  const bags = [...input.bags]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((b) => {
      const id = input.newId();
      bagMap.set(b.id, id);
      return {
        id,
        source_id: b.id,
        suitcase_id: b.suitcase_id,
        label: rewriteLabelPrefix(b.label, input.sourceName, input.newName),
        role: b.role,
        carry_on: b.carry_on,
        notes: b.notes,
        sort_order: b.sort_order,
        people: b.people,
      };
    });
  const keep = input.travelers?.length ? new Set(input.travelers) : null;
  const items = [...input.items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((r) => !keep || r.person_id === null || keep.has(r.person_id))
    .map((r) => {
      const qty = r.calc_mode && r.calc_unit_qty !== null ? calcQty(rowCalc(r), input.len) : r.qty;
      return {
        item_id: r.item_id,
        name: r.name,
        person_id: r.person_id,
        trip_bag_id: r.trip_bag_id ? (bagMap.get(r.trip_bag_id) ?? null) : null,
        no_bag: r.no_bag,
        calc_mode: r.calc_mode,
        calc_unit_qty: r.calc_unit_qty,
        calc_max: r.calc_max,
        calc_offset: r.calc_offset,
        qty,
        qty_override: r.qty_override,
        notes: r.notes,
        carry_hint: r.carry_hint,
        sort_order: r.sort_order,
      };
    });
  return { bags, items };
}

export interface TemplatePlanItem {
  /** Existing catalog item id, or the id of an entry in `newCatalogItems`. */
  item_id: string;
  qty_mode_override: QtyMode | null;
  qty_override: number | null;
  qty_offset_override: number | null;
  carry_on: boolean;
  notes: string | null;
  assignees: string[];
  sort_order: number;
}

export interface NewCatalogItem {
  id: string;
  name: string;
  qty: number;
  not_in_suitcase: boolean;
}

/**
 * Builds a template from a trip's list. Rows that differ only by person are
 * merged into one template item with several assignees. Packed state, bags and
 * manual quantity totals are not carried over. Rows that aren't in the catalog
 * get a new catalog item so the template can point at them.
 */
export function planTemplateFromTrip(input: {
  rows: TripItem[];
  bags: Map<string, Pick<TripBag, 'carry_on'>>;
  items: Map<string, Pick<Item, 'id' | 'qty_mode' | 'qty'> & { qty_offset?: number }>;
  newId: () => string;
}): { newCatalogItems: NewCatalogItem[]; templateItems: TemplatePlanItem[] } {
  const newCatalogItems: NewCatalogItem[] = [];
  const adHoc = new Map<string, string>(); // lower-cased name → new item id
  const groups = new Map<string, TemplatePlanItem>();
  let order = 0;
  for (const r of [...input.rows].sort((a, b) => a.sort_order - b.sort_order)) {
    let itemId = r.item_id && input.items.has(r.item_id) ? r.item_id : null;
    if (!itemId) {
      const key = r.name.trim().toLowerCase();
      itemId = adHoc.get(key) ?? null;
      if (!itemId) {
        itemId = input.newId();
        adHoc.set(key, itemId);
        newCatalogItems.push({
          id: itemId,
          name: r.name.trim(),
          qty: r.qty_override ?? r.qty ?? 1,
          not_in_suitcase: r.no_bag,
        });
      }
    }
    const item = input.items.get(itemId);
    const mode = item && r.calc_mode && r.calc_mode !== item.qty_mode ? r.calc_mode : null;
    const unit =
      item && r.calc_unit_qty !== null && r.calc_unit_qty !== item.qty ? r.calc_unit_qty : null;
    const off =
      item &&
      r.calc_mode &&
      r.calc_mode !== 'fixed' &&
      (r.calc_offset ?? 0) !== (item.qty_offset ?? 0)
        ? (r.calc_offset ?? 0)
        : null;
    const carry =
      (r.trip_bag_id ? (input.bags.get(r.trip_bag_id)?.carry_on ?? false) : false) || r.carry_hint;
    const notes = r.notes?.trim() || null;
    const key = JSON.stringify([itemId, mode, unit, off, carry, notes, r.person_id === null]);
    const g = groups.get(key);
    if (g && r.person_id && !g.assignees.includes(r.person_id)) {
      g.assignees.push(r.person_id);
    } else if (!g) {
      groups.set(key, {
        item_id: itemId,
        qty_mode_override: mode,
        qty_override: unit,
        qty_offset_override: off,
        carry_on: carry,
        notes,
        assignees: r.person_id ? [r.person_id] : [],
        sort_order: order++,
      });
    }
  }
  return { newCatalogItems, templateItems: [...groups.values()] };
}

/** Catalog items that fit a trip's climate and activities and aren't on it yet. */
export function suggestItems(
  items: Item[],
  climate: string | null,
  activities: string[],
  onTrip: Set<string>,
): Item[] {
  const c = climate?.trim().toLowerCase() || null;
  const acts = new Set(activities.map((a) => a.trim().toLowerCase()));
  return items.filter((it) => {
    if (it.archived || onTrip.has(it.id)) return false;
    const climateOk =
      !it.climate_tags.length || (c !== null && it.climate_tags.some((t) => t.toLowerCase() === c));
    const actOk =
      !it.activity_tags.length || it.activity_tags.some((t) => acts.has(t.toLowerCase()));
    return climateOk && actOk;
  });
}

export interface UnplacedGroup {
  person_id: string | null;
  carry: boolean;
  count: number;
}

/** Rows that would wait in "No bag yet", grouped by person and carry-on vs checked. */
export function unplacedSummary(
  rows: Pick<TripItemDraft, 'person_id' | 'trip_bag_id' | 'no_bag' | 'carry_hint'>[],
): UnplacedGroup[] {
  const groups = new Map<string, UnplacedGroup>();
  for (const r of rows) {
    if (r.trip_bag_id || r.no_bag) continue;
    const key = `${r.person_id ?? ''}|${r.carry_hint ? 1 : 0}`;
    const g = groups.get(key) ?? { person_id: r.person_id, carry: r.carry_hint, count: 0 };
    g.count++;
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * For rows waiting in "No bag yet", the bag each would go in now (e.g. after a bag
 * was added or given an owner). Only rows that now have a home are returned.
 */
export function suggestPlacements(
  rows: Pick<TripItem, 'id' | 'person_id' | 'trip_bag_id' | 'no_bag' | 'carry_hint'>[],
  bags: PlaceableBag[],
): { id: string; trip_bag_id: string }[] {
  const out: { id: string; trip_bag_id: string }[] = [];
  for (const r of rows) {
    if (r.trip_bag_id || r.no_bag) continue;
    const place = placeRow(
      { person_id: r.person_id, carry: r.carry_hint, not_in_suitcase: false },
      bags,
    );
    if (place.trip_bag_id) out.push({ id: r.id, trip_bag_id: place.trip_bag_id });
  }
  return out;
}
