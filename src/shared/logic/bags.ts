import { CARRY_ON_BAG_ROLES, CARRY_ON_SUITCASE_TYPES } from '../lookups';

export function defaultBagCarryOn(
  suitcaseType: string | null | undefined,
  role: string | null | undefined,
): boolean {
  const t = suitcaseType?.trim().toLowerCase() ?? '';
  const r = role?.trim().toLowerCase() ?? '';
  return CARRY_ON_SUITCASE_TYPES.includes(t) || CARRY_ON_BAG_ROLES.includes(r);
}

function hasWord(haystack: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, 'iu').test(haystack);
}

/**
 * Where a "usually carry-on" item should go: the trip's only carry-on bag, or
 * the one carry-on bag whose label names this person. Null when unclear.
 */
export function pickCarryBag<B extends { id: string; label: string; carry_on: boolean }>(
  bags: B[],
  personName: string | null | undefined,
): B | null {
  const carry = bags.filter((b) => b.carry_on);
  if (carry.length === 1) return carry[0]!;
  if (!personName) return null;
  const mine = carry.filter((b) => hasWord(b.label, personName));
  return mine.length === 1 ? mine[0]! : null;
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
