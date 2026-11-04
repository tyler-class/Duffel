// Seed suggestions for free-text fields. Users can type anything; pickers offer
// these plus every value already in use.

export const QTY_MODES = ['fixed', 'per_day', 'per_night'] as const;
export type QtyMode = (typeof QTY_MODES)[number];
export const QTY_MODE_LABELS: Record<QtyMode, string> = {
  fixed: 'Fixed',
  per_day: 'Per day',
  per_night: 'Per night',
};

export const DEFAULT_LOOKUPS = {
  role: ['Adult', 'Child', 'Baby'],
  category: [
    'Clothing',
    'Toiletries',
    'Baby gear',
    'Feeding',
    'Diapering',
    'Sleep',
    'Health & safety',
    'Electronics',
    'Documents',
    'Beach & pool',
    'Outdoor',
    'Entertainment',
    'Misc',
  ],
  climate: ['Cold', 'Mild', 'Hot'],
  activity: ['Beach', 'Pool', 'City', 'Hiking', 'Camping', 'Skiing', 'Nice dinners'],
  suitcaseType: ['Suitcase', 'Duffel', 'Backpack', 'Diaper bag', 'Tote', 'Cooler', 'Other'],
  tripType: ['Car trip', 'Domestic flight', 'International flight'],
  tripStatus: ['Planning', 'Packing', 'Packed', 'Done'],
  bagRole: ['Checked', 'Carry-on', 'Personal item', 'Car trunk', 'Car cabin'],
} as const;

export type LookupKind = keyof typeof DEFAULT_LOOKUPS;
export type Lookups = Record<LookupKind, string[]>;

/** Bag roles that make a trip bag carry-on when it has no suitcase. */
export const CARRY_ON_BAG_ROLES = ['carry-on', 'personal item'];

/** Person colors. Keys map to CSS tokens (--person-<key>). */
export const PERSON_COLORS = [
  'blue',
  'violet',
  'coral',
  'amber',
  'green',
  'rose',
  'teal',
  'slate',
] as const;
export type PersonColor = (typeof PERSON_COLORS)[number];

export function mergeLookups(inUse: Partial<Record<LookupKind, string[]>>): Lookups {
  const out = {} as Lookups;
  for (const kind of Object.keys(DEFAULT_LOOKUPS) as LookupKind[]) {
    const seen = new Map<string, string>();
    for (const v of [...DEFAULT_LOOKUPS[kind], ...(inUse[kind] ?? [])]) {
      const t = v.trim();
      if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    }
    out[kind] = [...seen.values()];
  }
  return out;
}
