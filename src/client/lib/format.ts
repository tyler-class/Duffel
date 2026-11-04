import { dayNumber } from '@shared/logic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(d: string) {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return { y, m, day };
}

export function formatDate(d: string | null): string {
  if (!d || dayNumber(d) === null) return '';
  const { m, day } = parts(d);
  return `${MONTHS[m - 1]} ${day}`;
}

/** "Dec 12 – 19", "Dec 30 – Jan 2", "Dec 12" */
export function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  if (!start || !end) return formatDate(start ?? end);
  const a = parts(start);
  const b = parts(end);
  if (start === end) return formatDate(start);
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m - 1]} ${a.day} – ${b.day}`;
  const yearNote = a.y !== b.y ? ` ${b.y}` : '';
  return `${MONTHS[a.m - 1]} ${a.day} – ${MONTHS[b.m - 1]} ${b.day}${yearNote}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
