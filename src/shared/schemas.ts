// Request validation shared by the Worker (enforces) and the client (types).
import { z } from 'zod';
import { AUTOPACK_FALLBACKS, QTY_MODES, TODO_PHASES } from './lookups';
import { isISODate } from './logic/dates';

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const text = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const name = (max = 120) => z.string().trim().min(1, 'Name is required').max(max);
const num = z.number().finite().nonnegative().nullable();
const offset = z.number().finite().min(-999).max(999);
const int = z.number().int().nonnegative().nullable();
const id = z.string().min(1).max(64);
const date = z.preprocess(
  blankToNull,
  z.string().refine(isISODate, 'Use a YYYY-MM-DD date').nullable(),
);
const tags = z.array(z.string().trim().min(1).max(60)).max(50);
export const qtyModeSchema = z.enum(QTY_MODES);

/**
 * A PATCH version of a create schema: every field optional and, unlike `.partial()`,
 * no defaults, so fields the client didn't send are left alone.
 */
function patchOf<S extends z.ZodObject>(schema: S): ReturnType<S['partial']> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([k, v]) => [
      k,
      ((v instanceof z.ZodDefault ? v.removeDefault() : v) as z.ZodType).optional(),
    ]),
  );
  return z.object(shape) as unknown as ReturnType<S['partial']>;
}

export const personInput = z.object({
  name: name(80),
  role: text(40).optional(),
  color: z.string().trim().min(1).max(20).optional(),
  emoji: text(16).optional(),
  notes: text(2000).optional(),
  sort_order: z.number().int().optional(),
});
export const personPatch = patchOf(personInput);

export const itemInput = z.object({
  name: name(),
  category: text(60).optional(),
  qty_mode: qtyModeSchema.default('fixed'),
  qty: z.number().finite().nonnegative().default(1),
  max_qty: num.optional(),
  qty_offset: offset.default(0),
  climate_tags: tags.default([]),
  activity_tags: tags.default([]),
  length_in: num.optional(),
  width_in: num.optional(),
  height_in: num.optional(),
  dimensions_source: text(500).optional(),
  not_in_suitcase: z.boolean().default(false),
  usually_carry_on: z.boolean().default(false),
  pack_type: text(40).optional(),
  notes: text(2000).optional(),
  archived: z.boolean().default(false),
  default_people: z.array(id).max(50).default([]),
});
export const itemPatch = patchOf(itemInput);

export const suitcaseInput = z.object({
  name: name(),
  type: text(40).optional(),
  length_in: num.optional(),
  width_in: num.optional(),
  height_in: num.optional(),
  capacity_l: num.optional(),
  max_weight_lb: num.optional(),
  notes: text(2000).optional(),
  carry_on: z.boolean().default(false),
  /** Who the bag is for. Empty = shared. */
  people: z.array(id).max(50).default([]),
});
export const suitcasePatch = patchOf(suitcaseInput);

export const templateInput = z.object({
  name: name(),
  trip_type: text(60).optional(),
  climate: text(40).optional(),
  activities: tags.default([]),
  notes: text(2000).optional(),
  category_order: z.array(z.string().trim().min(1).max(60)).max(200).optional(),
});
export const templatePatch = patchOf(templateInput);

export const templateItemInput = z.object({
  item_id: id,
  qty_mode_override: qtyModeSchema.nullable().optional(),
  qty_override: num.optional(),
  qty_offset_override: offset.nullable().optional(),
  carry_on: z.boolean().default(false),
  pack_type: text(40).optional(),
  category: text(60).optional(),
  notes: text(2000).optional(),
  sort_order: z.number().int().optional(),
  assignees: z.array(id).max(50).default([]),
});
export const templateItemPatch = patchOf(templateItemInput.omit({ item_id: true }));
export const templateItemsAdd = z.object({ item_ids: z.array(id).min(1).max(500) });

export const tripBagInput = z.object({
  suitcase_id: id.nullable().optional(),
  label: name(),
  role: text(40).optional(),
  carry_on: z.boolean().optional(),
  notes: text(2000).optional(),
  sort_order: z.number().int().optional(),
  /** Who the bag is for. Omitted = the suitcase's people. */
  people: z.array(id).max(50).optional(),
});
export const templateBagInput = tripBagInput;
export const templateBagPatch = patchOf(tripBagInput);
export const tripBagPatch = patchOf(tripBagInput);

export const tripInput = z.object({
  name: name(),
  trip_type: text(60).optional(),
  start_date: date.optional(),
  end_date: date.optional(),
  days: int.optional(),
  nights: int.optional(),
  destination: text(120).optional(),
  climate: text(40).optional(),
  activities: tags.default([]),
  status: text(40).optional(),
  notes: text(2000).optional(),
  archived: z.boolean().optional(),
  travelers: z.array(id).max(50).default([]),
  category_order: z.array(z.string().trim().min(1).max(60)).max(200).optional(),
});
export const tripPatch = patchOf(tripInput);
export const tripSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blank') }),
  z.object({ kind: z.literal('template'), template_id: id }),
  z.object({ kind: z.literal('clone'), trip_id: id }),
]);
export const tripCreate = tripInput.extend({
  source: tripSource.default({ kind: 'blank' }),
  bags: z.array(tripBagInput).max(30).default([]),
});

export const tripItemInput = z.object({
  id: z.string().uuid().optional(), // lets "undo" restore a deleted row with its id
  item_id: id.nullable().optional(),
  name: name(),
  person_id: id.nullable().optional(),
  trip_bag_id: id.nullable().optional(),
  no_bag: z.boolean().default(false),
  qty: num.optional(),
  qty_override: num.optional(),
  packed: z.boolean().default(false),
  category: text(60).optional(),
  notes: text(2000).optional(),
  sort_order: z.number().int().optional(),
});
export const tripItemPatch = patchOf(tripItemInput.omit({ id: true, item_id: true }));
export const tripItemsAdd = z.object({
  item_ids: z.array(id).min(1).max(500),
  person_id: id.nullable().optional(),
});
export const tripItemsBulk = z.object({
  ids: z.array(id).min(1).max(500),
  /** Applied to every row. Omit to delete the rows instead (with delete: true). */
  patch: z
    .object({
      trip_bag_id: id.nullable().optional(),
      no_bag: z.boolean().optional(),
      packed: z.boolean().optional(),
      person_id: id.nullable().optional(),
      category: text(60).optional(),
    })
    .optional(),
  delete: z.boolean().optional(),
});
/** New positions (and groups) for rows after a drag and drop. */
export const reorderRows = z.object({
  moves: z
    .array(
      z.object({
        id,
        sort_order: z.number().int(),
        category: text(60).optional(),
      }),
    )
    .min(1)
    .max(1000),
});
const todoPhase = z.enum(TODO_PHASES);
export const tripTodoInput = z.object({
  title: name(200),
  phase: todoPhase.default('pre'),
  due_date: date.optional(),
  notes: text(2000).optional(),
  done: z.boolean().default(false),
  sort_order: z.number().int().optional(),
});
export const tripTodoPatch = patchOf(tripTodoInput);
export const templateTodoInput = z.object({
  title: name(200),
  phase: todoPhase.default('pre'),
  /** Days before the trip (pre), day of the trip from 1 (during), days after (after). */
  due_days: z.number().int().min(0).max(3650).nullable().optional(),
  notes: text(2000).optional(),
  sort_order: z.number().int().optional(),
});
export const templateTodoPatch = patchOf(templateTodoInput);

export const saveAsTemplate = z.object({ name: name() });

export const settingsPatch = z.object({
  instance_name: name(60).optional(),
  autopack_fallback: z.enum(AUTOPACK_FALLBACKS).optional(),
});
export const loginInput = z.object({ password: z.string().min(1).max(500) });

export type PersonInput = z.input<typeof personInput>;
export type ItemInput = z.input<typeof itemInput>;
export type SuitcaseInput = z.input<typeof suitcaseInput>;
export type TemplateInput = z.input<typeof templateInput>;
export type TemplateItemInput = z.input<typeof templateItemInput>;
export type TripInput = z.input<typeof tripInput>;
export type TripCreate = z.input<typeof tripCreate>;
export type TripBagInput = z.input<typeof tripBagInput>;
export type TripItemInput = z.input<typeof tripItemInput>;
