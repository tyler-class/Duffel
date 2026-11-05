import { CARRY_ON_BAG_ROLES, type AutoPackFallback } from '../lookups';

/** A trip bag is carry-on if its suitcase is marked carry-on, or (with no suitcase) by its role. */
export function defaultBagCarryOn(
  suitcaseCarryOn: boolean | null | undefined,
  role: string | null | undefined,
): boolean {
  if (suitcaseCarryOn !== null && suitcaseCarryOn !== undefined) return suitcaseCarryOn;
  return CARRY_ON_BAG_ROLES.includes(role?.trim().toLowerCase() ?? '');
}

export interface PlaceableBag {
  id: string;
  carry_on: boolean;
  /** Who the bag is for. Empty = shared. */
  people: string[];
  sort_order: number;
  /** The bag's type from the catalog (its suitcase's type). */
  type?: string | null;
}

/** Trip or template bags with their catalog type, so auto pack can match them. */
export function typedBags<B extends Omit<PlaceableBag, 'type'> & { suitcase_id: string | null }>(
  bags: B[],
  suitcases: Map<string, { type: string | null }>,
): (B & { type: string | null })[] {
  return bags.map((b) => ({
    ...b,
    type: b.suitcase_id ? (suitcases.get(b.suitcase_id)?.type ?? null) : null,
  }));
}

const sameType = (a: string | null | undefined, b: string) =>
  !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

export type Placement = { trip_bag_id: string | null; no_bag: boolean };

/**
 * Where a row goes when a trip is built:
 * - items that never go in a bag → No bag;
 * - items with a bag type → their person's bag of that type, else the one shared bag of
 *   that type; with none, No bag yet (or, if `fallback` is 'main', on to the rules below);
 * - a person's carry-on items → their carry-on bag; other items → their checked bag
 *   (the first by bag order when they have several);
 * - if they have no matching bag of their own, the one shared bag of that kind, if
 *   there is exactly one;
 * - shared items → the one shared bag of that kind; shared carry-on items may also go
 *   in the trip's only carry-on bag;
 * - otherwise No bag yet.
 */
export function placeRow(
  row: {
    person_id: string | null;
    carry: boolean;
    not_in_suitcase: boolean;
    pack_type?: string | null;
  },
  bags: PlaceableBag[],
  fallback: AutoPackFallback = 'unplaced',
): Placement {
  if (row.not_in_suitcase) return { trip_bag_id: null, no_bag: true };
  if (row.pack_type) {
    const typed = [...bags]
      .filter((b) => sameType(b.type, row.pack_type!))
      .sort((a, b) => a.sort_order - b.sort_order);
    const mine = row.person_id ? typed.find((b) => b.people.includes(row.person_id!)) : undefined;
    if (mine) return { trip_bag_id: mine.id, no_bag: false };
    const shared = typed.filter((b) => !b.people.length);
    if (shared.length === 1) return { trip_bag_id: shared[0]!.id, no_bag: false };
    if (!row.person_id && typed.length === 1) return { trip_bag_id: typed[0]!.id, no_bag: false };
    if (fallback === 'unplaced') return { trip_bag_id: null, no_bag: false };
  }
  const kind = [...bags]
    .filter((b) => b.carry_on === row.carry)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (row.person_id) {
    const mine = kind.find((b) => b.people.includes(row.person_id!));
    if (mine) return { trip_bag_id: mine.id, no_bag: false };
  }
  const shared = kind.filter((b) => !b.people.length);
  if (shared.length === 1) return { trip_bag_id: shared[0]!.id, no_bag: false };
  if (!row.person_id && row.carry && kind.length === 1)
    return { trip_bag_id: kind[0]!.id, no_bag: false };
  return { trip_bag_id: null, no_bag: false };
}

/** "Mexico Dec - Big checked bag" → "Lisbon - Big checked bag" when the prefix is the old trip name. */
export function rewriteLabelPrefix(
  label: string,
  oldTripName: string,
  newTripName: string,
): string {
  const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(label);
  if (m && m[1]!.trim().toLowerCase() === oldTripName.trim().toLowerCase()) {
    return `${newTripName} - ${m[2]}`;
  }
  return label;
}

/** Short bag name for display: drops a leading "<trip name> - " prefix. */
export function shortBagLabel(label: string, tripName: string): string {
  const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(label);
  if (m && m[1]!.trim().toLowerCase() === tripName.trim().toLowerCase()) return m[2]!;
  return label;
}

/** An item's (or template item's) auto pack choice, as one value for a picker. */
export type PackChoice = 'main' | 'carry_on' | 'none' | { type: string };

export function packChoice(i: {
  not_in_suitcase?: boolean;
  usually_carry_on?: boolean;
  pack_type: string | null;
}): PackChoice {
  if (i.not_in_suitcase) return 'none';
  if (i.pack_type) return { type: i.pack_type };
  return i.usually_carry_on ? 'carry_on' : 'main';
}

/** The catalog item fields for a choice. */
export function packFields(c: PackChoice) {
  return {
    not_in_suitcase: c === 'none',
    usually_carry_on: c === 'carry_on',
    pack_type: typeof c === 'object' ? c.type : null,
  };
}

/** "Diaper bag", "Carry-on", "Main bag", "No bag". */
export function packLabel(c: PackChoice): string {
  if (typeof c === 'object') return c.type;
  return c === 'none' ? 'No bag' : c === 'carry_on' ? 'Carry-on' : 'Main bag';
}
