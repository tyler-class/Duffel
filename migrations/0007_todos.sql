-- To-dos: things to do before, during and after a trip ("Book the kennel", "Check out by 11").
-- Templates hold to-dos with a date relative to the trip; trips hold real dates.

CREATE TABLE trip_todos (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- 'pre', 'during' or 'after'.
  phase TEXT NOT NULL DEFAULT 'pre',
  due_date TEXT,
  notes TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_trip_todos_trip ON trip_todos (trip_id, sort_order);

CREATE TABLE template_todos (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'pre',
  -- When, relative to the trip: days before it starts (pre), the day of the trip
  -- counting from 1 (during), or days after it ends (after). NULL = no date.
  due_days INTEGER,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_template_todos_template ON template_todos (template_id, sort_order);
