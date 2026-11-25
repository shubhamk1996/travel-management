import { describe, expect, it } from 'vitest';
import { budgetSummary, cents, conflicts, days, recordSnapshot, reschedule, settlements, splitAmount, status, travelMinutes, type Activity, type Booking, type Trip } from '../domain';

const activity = (overrides: Partial<Activity> = {}): Activity => ({ id: 'a', title: 'Museum visit', location: 'City Museum', date: '2027-04-12', start: '10:00', duration: 60, cost: 1000, open: '09:00', close: '17:00', fixed: false, ...overrides });
const booking = (overrides: Partial<Booking> = {}): Booking => ({ id: 'b', title: 'Train', type: 'train', status: 'confirmed', location: 'Central Station', date: '2027-04-12', start: '08:00', duration: 60, cost: 3000, ...overrides });
const trip = (overrides: Partial<Trip> = {}): Trip => ({ id: 'trip', name: 'Test trip', destination: 'Test city', startDate: '2027-04-12', endDate: '2027-04-13', budget: 10000, travellers: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }, { id: 'three', name: 'Three' }], activities: [], bookings: [], expenses: [], ...overrides });

describe('trips and money', () => {
  it('generates inclusive dates and derives status at boundaries', () => {
    expect(days('2027-04-12', '2027-04-13')).toEqual(['2027-04-12', '2027-04-13']);
    expect(days('2027-04-13', '2027-04-12')).toEqual([]);
    expect(days('2028-01-01', '2028-12-31')).toHaveLength(366);
    expect(days('2027-01-01', '2028-01-02')).toEqual([]);
    expect(status(trip(), '2027-04-11')).toBe('Upcoming');
    expect(status(trip(), '2027-04-12')).toBe('In progress');
    expect(status(trip(), '2027-04-13')).toBe('In progress');
    expect(status(trip(), '2027-04-14')).toBe('Completed');
    expect(cents('12.09')).toBe(1209);
    expect(cents('0')).toBe(0);
    expect(cents('9000000000.00')).toBe(900000000000);
    expect(() => cents('1.001')).toThrow();
    expect(() => cents('-1')).toThrow();
    expect(() => cents('9000000000.01')).toThrow(/too large/);
  });
  it('retains at most 50 undo snapshots', () => {
    const history = Array.from({ length: 50 }, (_, index) => index);
    const next = recordSnapshot(history, 50);
    expect(next).toHaveLength(50);
    expect(next[0]).toBe(1);
    expect(next.at(-1)).toBe(50);
  });
  it('splits cents deterministically and validates custom splits', () => {
    expect(splitAmount(100, ['one', 'two', 'three'], 'equal')).toEqual({ one: 34, two: 33, three: 33 });
    expect(splitAmount(101, ['one', 'two', 'three'], 'percentage', { one: 3333, two: 3333, three: 3334 })).toEqual({ one: 34, two: 33, three: 34 });
    expect(splitAmount(100, ['one', 'two'], 'amount', { one: 30, two: 70 })).toEqual({ one: 30, two: 70 });
    expect(() => splitAmount(100, ['one', 'two'], 'amount', { one: 30, two: 60 })).toThrow(/add up/);
    expect(() => splitAmount(100, ['one', 'two'], 'percentage', { one: 5000, two: 4999 })).toThrow(/100%/);
    expect(() => splitAmount(100, [], 'equal')).toThrow();
    expect(() => splitAmount(-1, ['one'], 'equal')).toThrow();
    expect(() => splitAmount(100, ['one', 'one'], 'equal')).toThrow();
    expect(() => splitAmount(100, ['one', 'two'], 'amount', { one: -1, two: 101 })).toThrow();
    expect(splitAmount(1, ['one', 'two', 'three'], 'percentage', { one: 3334, two: 3333, three: 3333 })).toEqual({ one: 1, two: 0, three: 0 });
    expect(Object.values(splitAmount(2, ['one', 'two', 'three'], 'percentage', { one: 3334, two: 3333, three: 3333 })).reduce((sum, value) => sum + value, 0)).toBe(2);
  });
  it('counts linked bookings once and calculates settlements exactly', () => {
    const t = trip({ activities: [activity()], bookings: [booking(), booking({ id: 'p', status: 'pending', cost: 2000 }), booking({ id: 'c', status: 'cancelled', cost: 9000 })], expenses: [
      { id: 'e', title: 'Train', category: 'Train', amount: 3000, paidBy: 'one', splitMode: 'equal', shares: { one: 1000, two: 1000, three: 1000 }, bookingId: 'b' },
      { id: 'e2', title: 'Food', category: 'Food', amount: 101, paidBy: 'two', splitMode: 'equal', shares: { one: 34, two: 34, three: 33 } }
    ] });
    expect(budgetSummary(t)).toEqual({ estimated: 6000, actual: 3101, remaining: 6899, categories: { Train: 3000, Food: 101 } });
    expect(settlements(t)).toEqual({ balances: { one: 1966, two: -933, three: -1033 }, transfers: [{ from: 'Two', to: 'One', amount: 933 }, { from: 'Three', to: 'One', amount: 1033 }] });
    expect(budgetSummary({ ...t, expenses: [] }).actual).toBe(3000);
    expect(budgetSummary({ ...t, budget: 100 }).remaining).toBe(-3001);
  });
  it('uses the sum of linked payments instead of the confirmed booking cost', () => {
    const t = trip({ bookings: [booking()], expenses: [
      { id: 'one', title: 'Deposit', category: 'Train', amount: 800, paidBy: 'one', splitMode: 'equal', shares: { one: 800 }, bookingId: 'b' },
      { id: 'two', title: 'Balance', category: 'Train', amount: 1200, paidBy: 'two', splitMode: 'equal', shares: { two: 1200 }, bookingId: 'b' }
    ] });
    expect(budgetSummary(t).actual).toBe(2000);
    expect(budgetSummary({ ...t, bookings: [booking({ status: 'cancelled' })] }).actual).toBe(2000);
    expect(budgetSummary({ ...t, bookings: [booking({ status: 'cancelled' })] }).estimated).toBe(0);
  });
  it('keeps hotels in budget but excludes them from scheduling', () => {
    const hotel = booking({ id: 'hotel', type: 'hotel', date: '2027-04-12', start: '09:30', duration: 600 });
    const t = trip({ activities: [activity({ start: '10:00' })], bookings: [hotel] });
    expect(budgetSummary(t)).toMatchObject({ estimated: 4000, actual: 3000 });
    expect(conflicts(t)).toEqual([]);
    expect(conflicts({ ...t, bookings: [hotel, { ...hotel, id: 'outside', date: '2027-04-14' }] }).map(c => c.key)).toContain('date-outside');
  });
});
describe('conflicts and rescheduling', () => {
  it('detects overlap, travel, opening hours, date and fixed booking conflicts', () => {
    const t = trip({ activities: [activity({ start: '08:30', duration: 90 }), activity({ id: 'x', title: 'Walk', date: '2027-04-14' })], bookings: [booking({ start: '09:00' })] });
    const messages = conflicts(t).map(c => c.message).join(' ');
    expect(messages).toMatch(/opening hours/);
    expect(messages).toMatch(/outside the trip dates/);
    expect(messages).toMatch(/overlaps.*booking/);
    const travelTrip = trip({ activities: [activity({ start: '09:10' })], bookings: [booking()] });
    expect(travelMinutes('Central Station', 'City Museum')).toBe(20);
    expect(conflicts(travelTrip).some(c => c.message.includes('only 10 minutes'))).toBe(true);
    expect(conflicts(trip({ bookings: [booking({ type: 'hotel', date: '2027-04-14' })] })).some(c => c.message.includes('outside the trip dates'))).toBe(true);
  });
  it('moves flexible activities without introducing conflicts and preserves fixed items', () => {
    const t = trip({ activities: [activity({ start: '10:00' }), activity({ id: 'fixed', title: 'Fixed dinner', start: '14:00', duration: 60, fixed: true })], bookings: [booking({ start: '09:30', duration: 90 })] });
    const result = reschedule(t);
    expect(result.moved).toHaveLength(1);
    expect(result.trip.activities.find(a => a.id === 'fixed')).toEqual(t.activities[1]);
    expect(result.trip.bookings).toEqual(t.bookings);
    expect(conflicts(result.trip)).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
  it('reports an unavailable activity instead of changing fixed events or creating conflicts', () => {
    const t = trip({ endDate: '2027-04-12', activities: [activity({ open: '10:00', close: '11:00' }), activity({ id: 'fixed', start: '10:00', open: '10:00', close: '11:00', fixed: true })] });
    const result = reschedule(t);
    expect(result.unresolved).toEqual(['Museum visit']);
    expect(result.trip).toEqual(t);
  });
  it('finds a minute-precise slot with enough travel time', () => {
    const t = trip({ endDate: '2027-04-12', bookings: [booking({ start: '09:00', duration: 60 })], activities: [activity({ start: '09:30', open: '10:00', close: '11:21', duration: 60 })] });
    const result = reschedule(t);
    expect(result.trip.activities[0].start).toBe('10:20');
    expect(conflicts(result.trip)).toEqual([]);
  });
  it('does not move fixed activities that conflict with a booking', () => {
    const t = trip({ activities: [activity({ fixed: true, start: '09:30' })], bookings: [booking({ start: '09:00' })] });
    const result = reschedule(t);
    expect(result.moved).toEqual([]);
    expect(result.trip.activities).toEqual(t.activities);
    expect(conflicts(result.trip).some(c => c.message.includes('overlaps'))).toBe(true);
  });
  it('reports unknown locations and midnight overruns without guessing travel time', () => {
    const unknown = activity({ id: 'unknown', location: 'Remote Cabin', start: '11:00' });
    const first = activity({ id: 'first', start: '10:00' });
    const late = activity({ id: 'late', start: '23:30', duration: 60 });
    expect(travelMinutes('Old Town', 'Remote Cabin')).toBeUndefined();
    const messages = conflicts(trip({ activities: [first, unknown, late] })).map(c => c.message).join(' ');
    expect(messages).toMatch(/travel time.*unavailable/i);
    expect(messages).toMatch(/ends after midnight/);
  });
  it('processes conflicting flexible activities in itinerary order', () => {
    const later = activity({ id: 'later', title: 'Later in the document', start: '09:45', duration: 30, close: '11:00' });
    const earlier = activity({ id: 'earlier', title: 'Earlier in the itinerary', start: '09:15', duration: 30, close: '11:00' });
    const result = reschedule(trip({
      endDate: '2027-04-12',
      activities: [later, earlier],
      bookings: [booking({ start: '09:00', duration: 60 })]
    }));
    expect(result.moved.map(move => move.title)).toEqual(['Earlier in the itinerary']);
    expect(result.unresolved).toEqual(['Later in the document']);
  });
});
