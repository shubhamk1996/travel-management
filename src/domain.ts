import { addDays, format, parseISO, differenceInCalendarDays, isValid } from 'date-fns';

export type BookingStatus = 'confirmed' | 'pending' | 'cancelled';
export type BookingType = 'flight' | 'train' | 'hotel' | 'cab';
export type SplitMode = 'equal' | 'amount' | 'percentage';
export interface Traveller { id: string; name: string }
export interface Activity {
  id: string; title: string; location: string; date: string; start: string;
  duration: number; cost: number; open: string; close: string; fixed: boolean;
}
export interface Booking {
  id: string; title: string; type: BookingType; status: BookingStatus;
  location: string; date: string; start: string; duration: number; cost: number;
}
export interface Expense {
  id: string; title: string; category: string; amount: number; paidBy: string;
  splitMode: SplitMode; shares: Record<string, number>; splitInputs?: Record<string, number>; bookingId?: string;
}
export interface Trip {
  id: string; name: string; destination: string; startDate: string; endDate: string;
  budget: number; travellers: Traveller[]; activities: Activity[]; bookings: Booking[]; expenses: Expense[];
}
export interface Conflict { key: string; message: string; ids: string[] }

export const locations = ['Airport', 'Central Station', 'Old Town', 'Riverside Hotel', 'City Museum', 'Botanical Garden', 'Harbour', 'Market Square'];
const travel: number[][] = [
  [0, 35, 40, 35, 45, 50, 45, 40],
  [35, 0, 15, 15, 20, 25, 20, 15],
  [40, 15, 0, 10, 10, 20, 20, 5],
  [35, 15, 10, 0, 15, 20, 15, 10],
  [45, 20, 10, 15, 0, 15, 25, 10],
  [50, 25, 20, 20, 15, 0, 30, 20],
  [45, 20, 20, 15, 25, 30, 0, 15],
  [40, 15, 5, 10, 10, 20, 15, 0]
];
export function travelMinutes(from: string, to: string): number | undefined {
  const a = locations.indexOf(from), b = locations.indexOf(to);
  return a < 0 || b < 0 ? undefined : travel[a][b];
}
export const uid = () => crypto.randomUUID();
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function cents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a non-negative amount with at most two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 900000000000) throw new Error('Amount is too large.');
  return result;
}
export function recordSnapshot<T>(history: T[], snapshot: T): T[] {
  return [...history.slice(-49), snapshot];
}
export const decimal = (value: number) => (value / 100).toFixed(2);
export function days(start: string, end: string): string[] {
  const a = parseISO(start), b = parseISO(end);
  if (!isValid(a) || !isValid(b) || differenceInCalendarDays(b, a) < 0 || differenceInCalendarDays(b, a) > 365) return [];
  return Array.from({ length: differenceInCalendarDays(b, a) + 1 }, (_, i) => format(addDays(a, i), 'yyyy-MM-dd'));
}
export function status(trip: Trip, today = format(new Date(), 'yyyy-MM-dd')): string {
  return today < trip.startDate ? 'Upcoming' : today > trip.endDate ? 'Completed' : 'In progress';
}
export function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
export function clock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export function splitAmount(amount: number, ids: string[], mode: SplitMode, values: Record<string, number> = {}): Record<string, number> {
  if (!Number.isSafeInteger(amount) || amount < 0 || !ids.length || new Set(ids).size !== ids.length) throw new Error('Select at least one traveller and a valid amount.');
  if (mode === 'equal') {
    const base = Math.floor(amount / ids.length), remainder = amount % ids.length;
    return Object.fromEntries(ids.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
  }
  if (ids.some(id => !Number.isSafeInteger(values[id]) || values[id] < 0)) throw new Error('All split values must be non-negative.');
  const sum = ids.reduce((n, id) => n + values[id], 0);
  if (mode === 'amount') {
    if (sum !== amount) throw new Error('Split amounts must add up to the expense total.');
    return Object.fromEntries(ids.map(id => [id, values[id]]));
  }
  if (sum !== 10000) throw new Error('Percentages must add up to 100%.');
  const raw = ids.map(id => ({ id, floor: Math.floor(amount * values[id] / 10000), remainder: (amount * values[id]) % 10000 }));
  let left = amount - raw.reduce((n, item) => n + item.floor, 0);
  const ranked = [...raw].sort((a, b) => b.remainder - a.remainder || ids.indexOf(a.id) - ids.indexOf(b.id));
  for (const item of ranked) if (left-- > 0) item.floor++;
  return Object.fromEntries(raw.map(item => [item.id, item.floor]));
}
export function settlements(trip: Trip) {
  const balances = Object.fromEntries(trip.travellers.map(t => [t.id, 0])) as Record<string, number>;
  for (const expense of trip.expenses) {
    balances[expense.paidBy] += expense.amount;
    for (const [id, share] of Object.entries(expense.shares)) balances[id] -= share;
  }
  const debtors = trip.travellers.map(t => ({ ...t, value: balances[t.id] })).filter(t => t.value < 0);
  const creditors = trip.travellers.map(t => ({ ...t, value: balances[t.id] })).filter(t => t.value > 0);
  const transfers: { from: string; to: string; amount: number }[] = [];
  for (const debtor of debtors) for (const creditor of creditors) {
    const amount = Math.min(-debtor.value, creditor.value);
    if (amount > 0) { transfers.push({ from: debtor.name, to: creditor.name, amount }); debtor.value += amount; creditor.value -= amount; }
  }
  return { balances, transfers };
}
export function budgetSummary(trip: Trip) {
  const active = trip.bookings.filter(b => b.status !== 'cancelled');
  const linked = new Set(trip.expenses.filter(e => e.bookingId).map(e => e.bookingId));
  const estimated = trip.activities.reduce((n, a) => n + a.cost, 0) + active.reduce((n, b) => n + b.cost, 0);
  const categories: Record<string, number> = {};
  for (const e of trip.expenses) categories[e.category] = (categories[e.category] || 0) + e.amount;
  for (const b of active.filter(b => b.status === 'confirmed' && !linked.has(b.id))) {
    const key = b.type[0].toUpperCase() + b.type.slice(1);
    categories[key] = (categories[key] || 0) + b.cost;
  }
  const actual = Object.values(categories).reduce((a, b) => a + b, 0);
  return { estimated, actual, remaining: trip.budget - actual, categories };
}
type Event = { id: string; title: string; location: string; date: string; start: string; duration: number; kind: 'activity' | 'booking' };
export function conflicts(trip: Trip): Conflict[] {
  const result: Conflict[] = [];
  const events: Event[] = [
    ...trip.activities.map(a => ({ ...a, kind: 'activity' as const })),
    ...trip.bookings.filter(b => b.status !== 'cancelled' && b.type !== 'hotel').map(b => ({ ...b, kind: 'booking' as const }))
  ];
  for (const a of trip.activities) {
    if (a.date < trip.startDate || a.date > trip.endDate) result.push({ key: `date-${a.id}`, ids: [a.id], message: `${a.title} is outside the trip dates. Move it to a trip day.` });
    if (minutes(a.start) < minutes(a.open) || minutes(a.start) + a.duration > minutes(a.close)) result.push({ key: `hours-${a.id}`, ids: [a.id], message: `${a.title} is outside its opening hours (${a.open}–${a.close}).` });
  }
  for (const e of events) {
    if (minutes(e.start) + e.duration > 1440) result.push({ key: `midnight-${e.id}`, ids: [e.id], message: `${e.title} ends after midnight. Adjust its time or duration.` });
  }
  for (const b of trip.bookings.filter(b => b.status !== 'cancelled')) {
    if (b.date < trip.startDate || b.date > trip.endDate) result.push({ key: `date-${b.id}`, ids: [b.id], message: `${b.title} is outside the trip dates.` });
  }
  const sorted = [...events].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    if (a.date !== b.date) break;
    const gap = minutes(b.start) - (minutes(a.start) + a.duration);
    if (gap < 0) result.push({ key: `overlap-${a.id}-${b.id}`, ids: [a.id, b.id], message: `${a.title} overlaps ${b.title}${a.kind === 'booking' || b.kind === 'booking' ? ' (booking)' : ''}.` });
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a.date !== b.date) continue;
    const gap = minutes(b.start) - (minutes(a.start) + a.duration);
    const travelTime = travelMinutes(a.location, b.location);
    if (travelTime === undefined) result.push({ key: `travel-unknown-${a.id}-${b.id}`, ids: [a.id, b.id], message: `Travel time between ${a.location} and ${b.location} is unavailable.` });
    else if (gap >= 0 && gap < travelTime) result.push({ key: `travel-${a.id}-${b.id}`, ids: [a.id, b.id], message: `Allow ${travelTime} minutes between ${a.title} and ${b.title}; only ${gap} minutes available.` });
  }
  return result;
}
export function reschedule(trip: Trip): { trip: Trip; moved: { title: string; from: string; to: string }[]; unresolved: string[] } {
  let next = structuredClone(trip);
  const moved: { title: string; from: string; to: string }[] = [], unresolved: Activity[] = [];
  const initial = conflicts(next);
  const candidates = next.activities
    .filter(a => !a.fixed && initial.some(c => c.ids.includes(a.id)))
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  for (const original of candidates) {
    if (!conflicts(next).some(c => c.ids.includes(original.id))) continue;
    const baseline = new Set(conflicts(next).filter(c => !c.ids.includes(original.id)).map(c => c.key));
    let found: Activity | undefined;
    for (const date of days(next.startDate, next.endDate)) {
      for (let time = minutes(original.open); time + original.duration <= Math.min(minutes(original.close), 1440); time++) {
        const proposal = { ...original, date, start: clock(time) };
        const trial = { ...next, activities: next.activities.map(a => a.id === original.id ? proposal : a) };
        const problems = conflicts(trial);
        if (!problems.some(c => c.ids.includes(original.id)) && problems.every(c => baseline.has(c.key))) { found = proposal; break; }
      }
      if (found) break;
    }
    if (found) {
      next = { ...next, activities: next.activities.map(a => a.id === original.id ? found! : a) };
      moved.push({ title: original.title, from: `${original.date} ${original.start}`, to: `${found.date} ${found.start}` });
    } else unresolved.push(original);
  }
  const remaining = conflicts(next);
  return { trip: next, moved, unresolved: unresolved.filter(a => remaining.some(c => c.ids.includes(a.id))).map(a => a.title) };
}
