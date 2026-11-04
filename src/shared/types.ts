import type { QtyMode } from './lookups';

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
  climate_tags: string[];
  activity_tags: string[];
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  dimensions_source: string | null;
  not_in_suitcase: boolean;
  usually_carry_on: boolean;
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
}

export interface TemplateItem {
  id: string;
  template_id: string;
  item_id: string;
  qty_mode_override: QtyMode | null;
  qty_override: number | null;
  carry_on: boolean;
  notes: string | null;
  sort_order: number;
  assignees: string[];
}

export interface Template {
  id: string;
  name: string;
  trip_type: string | null;
  climate: string | null;
  activities: string[];
  notes: string | null;
  items: TemplateItem[];
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
  qty: number | null;
  qty_override: number | null;
  packed: boolean;
  packed_at: string | null;
  notes: string | null;
  sort_order: number;
}

export interface Settings {
  instance_name: string;
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
