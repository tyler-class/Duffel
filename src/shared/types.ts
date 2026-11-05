import type { AutoPackFallback, QtyMode } from './lookups';

export interface Person {
  id: string;
  name: string;
  role: string | null;
  color: string;
  emoji: string | null;
  notes: string | null;
  sort_order: number;
}

export interface Item {
  id: string;
  name: string;
  category: string | null;
  qty_mode: QtyMode;
  qty: number;
  max_qty: number | null;
  /** Added to a per-day or per-night count: 1 per day plus 2. Can be negative. */
  qty_offset: number;
  climate_tags: string[];
  activity_tags: string[];
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  dimensions_source: string | null;
  not_in_suitcase: boolean;
  usually_carry_on: boolean;
  /** Auto pack: goes into its person's bag of this type ("Diaper bag"). */
  pack_type: string | null;
  notes: string | null;
  archived: boolean;
  default_people: string[];
}

export interface Suitcase {
  id: string;
  name: string;
  type: string | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  capacity_l: number | null;
  max_weight_lb: number | null;
  notes: string | null;
  /** Its items count as carry-on; carry-on items go here when a trip is built. */
  carry_on: boolean;
  /** Who this bag is for. Empty = shared. */
  people: string[];
}

export interface TemplateItem {
  id: string;
  template_id: string;
  item_id: string;
  qty_mode_override: QtyMode | null;
  qty_override: number | null;
  /** Null = the catalog item's offset. */
  qty_offset_override: number | null;
  carry_on: boolean;
  /** Auto pack bag type; wins over carry_on and the catalog's choice. */
  pack_type: string | null;
  notes: string | null;
  sort_order: number;
  assignees: string[];
}

/** A bag in a template's bag setup; copied onto trips built from the template. */
export interface TemplateBag {
  id: string;
  template_id: string;
  suitcase_id: string | null;
  label: string;
  role: string | null;
  carry_on: boolean;
  notes: string | null;
  sort_order: number;
  people: string[];
}

export interface Template {
  id: string;
  name: string;
  trip_type: string | null;
  climate: string | null;
  activities: string[];
  notes: string | null;
  items: TemplateItem[];
  bags: TemplateBag[];
}

export interface Trip {
  id: string;
  name: string;
  template_id: string | null;
  cloned_from_trip_id: string | null;
  trip_type: string | null;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  nights: number | null;
  destination: string | null;
  climate: string | null;
  activities: string[];
  status: string | null;
  notes: string | null;
  archived_at: string | null;
  travelers: string[];
  item_count: number;
  packed_count: number;
}

export interface TripBag {
  id: string;
  trip_id: string;
  suitcase_id: string | null;
  label: string;
  role: string | null;
  carry_on: boolean;
  notes: string | null;
  sort_order: number;
  /** Who this bag is for. Empty = shared. */
  people: string[];
}

export interface TripItem {
  id: string;
  trip_id: string;
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
  packed: boolean;
  packed_at: string | null;
  /** Should ride in its person's carry-on bag. */
  carry_hint: boolean;
  /** Auto pack bag type: the row moves into a bag of this type when one is added. */
  pack_type: string | null;
  notes: string | null;
  sort_order: number;
}

export interface Settings {
  instance_name: string;
  /** Where an item with a bag type goes when its person has no bag of that type. */
  autopack_fallback: AutoPackFallback;
}

/** Everything except trip items: small enough to load in one request. */
export interface AppState {
  settings: Settings;
  people: Person[];
  items: Item[];
  suitcases: Suitcase[];
  templates: Template[];
  trips: Trip[];
  lookups: Record<string, string[]>;
}

export interface TripDetail {
  trip: Trip;
  bags: TripBag[];
  items: TripItem[];
}
