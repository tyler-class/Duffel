import { Hono } from 'hono';
import { templateInput, templateItemPatch, templateItemsAdd, templatePatch } from '@shared/schemas';
import {
  b,
  existingIds,
  first,
  insertStmt,
  json,
  loadTemplates,
  newId,
  nowIso,
  updateStmt,
} from '../db';
import { body, defined, notFound, type AppEnv } from './util';

export const templates = new Hono<AppEnv>();

function templateFields(input: Partial<ReturnType<typeof templateInput.parse>>) {
  const f: Record<string, unknown> = defined({
    name: input.name,
    trip_type: input.trip_type,
    climate: input.climate,
    notes: input.notes,
  });
  if (input.activities !== undefined) f.activities = json(input.activities);
  return f;
}

async function one(db: D1Database, id: string) {
  const t = (await loadTemplates(db, id))[0];
  if (!t) throw notFound('Template');
  return t;
}

templates.post('/templates', async (c) => {
  const input = await body(c, templateInput);
  const id = newId();
  const now = nowIso();
  await insertStmt(c.env.DB, 'templates', {
    id,
    ...templateFields(input),
    created_at: now,
    updated_at: now,
  }).run();
  return c.json(await one(c.env.DB, id), 201);
});

templates.patch('/templates/:id', async (c) => {
  const id = c.req.param('id');
  await one(c.env.DB, id);
  const fields = templateFields(await body(c, templatePatch));
  if (Object.keys(fields).length) await updateStmt(c.env.DB, 'templates', id, fields).run();
  return c.json(await one(c.env.DB, id));
});

templates.delete('/templates/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM templates WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/** Adds catalog items to a template (skipping ones already on it). */
templates.post('/templates/:id/items', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const t = await one(db, id);
  const { item_ids } = await body(c, templateItemsAdd);
  const valid = await existingIds(db, 'items', item_ids);
  const already = new Set(t.items.map((i) => i.item_id));
  let order = Math.max(-1, ...t.items.map((i) => i.sort_order)) + 1;
  const now = nowIso();
  const stmts = [...new Set(item_ids)]
    .filter((i) => valid.has(i) && !already.has(i))
    .map((itemId) =>
      insertStmt(db, 'template_items', {
        id: newId(),
        template_id: id,
        item_id: itemId,
        carry_on: 0,
        sort_order: order++,
        created_at: now,
        updated_at: now,
      }),
    );
  if (stmts.length) await db.batch(stmts);
  return c.json(await one(db, id), 201);
});

templates.patch('/template-items/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const row = await first<{ template_id: string }>(
    db,
    'SELECT template_id FROM template_items WHERE id = ?',
    id,
  );
  if (!row) throw notFound('Template item');
  const input = await body(c, templateItemPatch);
  const f: Record<string, unknown> = defined({
    qty_mode_override: input.qty_mode_override,
    qty_override: input.qty_override,
    notes: input.notes,
    sort_order: input.sort_order,
  });
  if (input.carry_on !== undefined) f.carry_on = b(input.carry_on);
  const stmts = [];
  if (Object.keys(f).length) stmts.push(updateStmt(db, 'template_items', id, f));
  if (input.assignees) {
    const valid = await existingIds(db, 'people', input.assignees);
    stmts.push(
      db.prepare('DELETE FROM template_item_assignees WHERE template_item_id = ?').bind(id),
    );
    for (const p of valid)
      stmts.push(
        db
          .prepare(
            'INSERT INTO template_item_assignees (template_item_id, person_id) VALUES (?, ?)',
          )
          .bind(id, p),
      );
  }
  if (stmts.length) await db.batch(stmts);
  return c.json(await one(db, row.template_id));
});

templates.delete('/template-items/:id', async (c) => {
  const id = c.req.param('id');
  const row = await first<{ template_id: string }>(
    c.env.DB,
    'SELECT template_id FROM template_items WHERE id = ?',
    id,
  );
  await c.env.DB.prepare('DELETE FROM template_items WHERE id = ?').bind(id).run();
  if (!row) return c.json({ ok: true });
  return c.json(await one(c.env.DB, row.template_id));
});
