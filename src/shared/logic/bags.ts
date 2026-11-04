import { CARRY_ON_BAG_ROLES } from '../lookups';

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
}

export type Placement = { trip_bag_id: string | null; no_bag: boolean };

/**
 * Where a row goes when a trip is built:
 * - items that never go in a bag → No bag;
 * - a person's carry-on items → their carry-on bag; other items → their checked bag
 *   (the first by bag order when they have several);
 * - if they have no matching bag of their own, the one shared bag of that kind, if
 *   there is exactly one;
 * - shared items → the one shared bag of that kind; shared carry-on items may also go
 *   in the trip's only carry-on bag;
 * - otherwise No bag yet.
 */
export function placeRow(
  row: { person_id: string | null; carry: boolean; not_in_suitcase: boolean },
  bags: PlaceableBag[],
): Placement {
  if (row.not_in_suitcase) return { trip_bag_id: null, no_bag: true };
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
