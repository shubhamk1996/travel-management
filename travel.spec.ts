import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('/tests/e2e/fixture.json', 'utf8')) as { trips: { id: string }[] };
const tripFromApi = async (request: APIRequestContext, id = 'trip-kyoto') => (await (await request.get(`http://127.0.0.1:3101/trips/${id}`)).json()) as Record<string, any>;
const storedTrip = async (page: Page) => {
  const id = page.url().match(/\/trips\/([^/]+)/)?.[1];
  if (!id) throw new Error('Expected a trip page');
  return tripFromApi(page.request, id);
};
test.beforeEach(async ({ request }) => {
  const existing = await (await request.get('http://127.0.0.1:3101/trips')).json() as { id: string }[];
  for (const t of existing) expect((await request.delete(`http://127.0.0.1:3101/trips/${t.id}`)).ok()).toBeTruthy();
  for (const t of fixture.trips) expect((await request.post('http://127.0.0.1:3101/trips', { data: t })).ok()).toBeTruthy();
});

test('creates a trip and preserves it after refreshing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a trip' }).first().click();
  await page.getByLabel('Trip name').fill('Weekend escape');
  await page.getByLabel('Destination').fill('Portland, USA');
  await page.getByLabel('Start date').fill('2027-07-01');
  await page.getByLabel('End date').fill('2027-07-03');
  await page.getByLabel('Total budget (USD)').fill('1200.00');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weekend escape' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Weekend escape' })).toBeVisible();
  await expect(page.getByText('Portland, USA', { exact: true })).toBeVisible();
});

test('reorders activities across days, undoes and redoes the persisted change', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  const source = page.getByLabel('Drag Explore the old town');
  const destination = page.locator('.day').nth(3).locator('.day-events');
  await source.scrollIntoViewIfNeeded();
  const start = await source.boundingBox();
  await destination.scrollIntoViewIfNeeded();
  const end = await destination.boundingBox();
  if (!start || !end) throw new Error('Drag targets are not visible');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2 + 10, { steps: 3 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator('.day').nth(3).getByText('Explore the old town')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.day').nth(0).getByText('Explore the old town')).toBeVisible();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('.day').nth(3).getByText('Explore the old town')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  await expect(page.locator('.day').nth(3).getByText('Explore the old town')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('previews booking delays and commits the booking and activity as one undoable change', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.locator('.booking-card').filter({ hasText: 'Flight to Kyoto' }).getByRole('button', { name: 'Edit / delay' }).click();
  await page.getByLabel('Start time').fill('12:30');
  await page.getByRole('button', { name: 'Save booking' }).click();
  await expect(page.getByRole('dialog', { name: 'Review schedule changes' })).toContainText('Explore the old town');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('Booking and schedule updated')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.booking-card').filter({ hasText: 'Flight to Kyoto' })).toContainText('08:00');
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  await expect(page.locator('.activity-row').filter({ hasText: 'Explore the old town' })).toContainText('13:00');
});

test('validates an expense split and updates settlements', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('Lunch');
  await page.getByLabel('Amount (USD)').fill('10.00');
  await page.getByLabel('Paid by').selectOption({ label: 'Alex Morgan' });
  await page.getByLabel('Split method').selectOption('amount');
  for (const name of ['Alex Morgan', 'Jamie Chen', 'Sam Rivera']) await page.getByLabel(`${name} amount`).fill('1.00');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText('Split amounts must add up to the expense total.')).toBeVisible();
  await page.getByLabel('Alex Morgan amount').fill('8.00');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Lunch' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Lunch' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Lunch' })).toBeVisible();
  await page.getByRole('button', { name: 'Travellers', exact: true }).click();
  await expect(page.getByText('Suggested settlements')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Lunch' })).toBeVisible();
});

test('cancels a booking with preview and retains the recorded expense', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.locator('.booking-card').filter({ hasText: 'Flight to Kyoto' }).getByRole('button', { name: 'Edit / delay' }).click();
  await page.getByLabel('Status').selectOption('cancelled');
  await page.getByRole('button', { name: 'Save booking' }).click();
  await expect(page.getByRole('dialog', { name: 'Review schedule changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.locator('.booking-card').filter({ hasText: 'Flight to Kyoto' })).toContainText('cancelled');
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Flight tickets' })).toBeVisible();
  await expect(page.getByText('$720.00').first()).toBeVisible();
});

test('adds, edits and deletes an activity', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  await page.getByRole('button', { name: 'Add activity' }).click();
  await page.getByLabel('Activity name').fill('Garden stroll');
  await page.getByLabel('Location').selectOption('Botanical Garden');
  await page.getByLabel('Date', { exact: true }).fill('2027-04-15');
  await page.getByRole('button', { name: 'Save activity' }).click();
  const row = page.locator('.activity-row').filter({ hasText: 'Garden stroll' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Activity name').fill('Long garden stroll');
  await page.getByRole('button', { name: 'Save activity' }).click();
  const updated = page.locator('.activity-row').filter({ hasText: 'Long garden stroll' });
  await expect(updated).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await updated.getByRole('button', { name: 'Delete Long garden stroll' }).click();
  await expect(updated).toHaveCount(0);
});

test('edits and deletes a trip after confirmation and persists the edit', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Edit trip' }).click();
  await page.getByLabel('Trip name').fill('Kyoto, revised');
  await page.getByLabel('Total budget (USD)').fill('3000.25');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Kyoto, revised' })).toBeVisible();
  await expect.poll(async () => (await storedTrip(page)).budget).toBe(300025);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kyoto, revised' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete this trip?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep trip' }).click();
  await expect(page.getByRole('heading', { name: 'Kyoto, revised' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete trip' }).click();
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect((await page.request.get('http://127.0.0.1:3101/trips/trip-kyoto')).status()).toBe(404);
});

test('creates, edits, delays and deletes a booking with guarded linked expenses', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  const linked = page.locator('.booking-card').filter({ hasText: 'Flight to Kyoto' });
  await linked.getByRole('button', { name: 'Delete Flight to Kyoto' }).click();
  await expect(page.getByText(/Remove or unlink this booking/)).toBeVisible();
  await expect.poll(async () => (await tripFromApi(page.request)).bookings.length).toBe(1);

  await page.getByRole('button', { name: 'Add booking' }).click();
  await page.getByLabel('Booking name').fill('Cab to dinner');
  await page.getByLabel('Type').selectOption('cab');
  await page.getByLabel('Status').selectOption('pending');
  await page.getByLabel('Location').selectOption('Riverside Hotel');
  await page.getByLabel('Date', { exact: true }).fill('2027-04-14');
  await page.getByLabel('Start time').fill('17:00');
  await page.getByLabel('Duration (minutes)').fill('45');
  await page.getByLabel('Cost (USD)').fill('35.50');
  await page.getByRole('button', { name: 'Save booking' }).click();
  const cab = page.locator('.booking-card').filter({ hasText: 'Cab to dinner' });
  await expect(cab).toContainText('$35.50');

  await cab.getByRole('button', { name: 'Edit / delay' }).click();
  await page.getByLabel('Booking name').fill('Cab to restaurant');
  await page.getByLabel('Start time').fill('18:00');
  await page.getByRole('button', { name: 'Save booking' }).click();
  await expect(page.getByRole('dialog', { name: 'Review schedule changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('.booking-card').filter({ hasText: 'Cab to dinner' })).toContainText('17:00');
  await page.locator('.booking-card').filter({ hasText: 'Cab to dinner' }).getByRole('button', { name: 'Edit / delay' }).click();
  await page.getByLabel('Start time').fill('18:00');
  await page.getByRole('button', { name: 'Save booking' }).click();
  await page.getByRole('button', { name: 'Apply changes' }).click();
  const updated = page.locator('.booking-card').filter({ hasText: 'Cab to dinner' });
  await expect(updated).toContainText('18:00');
  page.once('dialog', dialog => dialog.accept());
  await updated.getByRole('button', { name: 'Delete Cab to dinner' }).click();
  await expect(updated).toHaveCount(0);
  await expect.poll(async () => (await tripFromApi(page.request)).bookings.length).toBe(1);
});

test('fixed activities cannot be moved', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  const fixed = page.getByLabel('Drag An afternoon at the museum');
  await expect(fixed).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move An afternoon at the museum earlier' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move An afternoon at the museum later' })).toBeDisabled();
});

test('swaps adjacent flexible activities within a day', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  await page.getByRole('button', { name: 'Add activity' }).click();
  await page.getByLabel('Activity name').fill('Second stop');
  await page.getByLabel('Date', { exact: true }).fill('2027-04-12');
  await page.getByLabel('Start time').fill('16:00');
  await page.getByRole('button', { name: 'Save activity' }).click();
  const source = page.getByLabel('Drag Second stop');
  const target = page.getByLabel('Drag Explore the old town');
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const source = document.querySelector<HTMLButtonElement>('[aria-label="Drag Second stop"]');
    const target = document.querySelector<HTMLButtonElement>('[aria-label="Drag Explore the old town"]');
    return Boolean(source && target && source.getBoundingClientRect().height && target.getBoundingClientRect().height);
  })).toBe(true);
  const boxes = await page.evaluate(() => {
    const rect = (label: string) => {
      const box = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return { source: rect('Drag Second stop'), target: rect('Drag Explore the old town') };
  });
  await page.mouse.move(boxes.source.x + boxes.source.width / 2, boxes.source.y + boxes.source.height / 2);
  await page.mouse.down();
  await page.mouse.move(boxes.source.x + boxes.source.width / 2, boxes.source.y + boxes.source.height / 2 - 10, { steps: 3 });
  await page.mouse.move(boxes.target.x + boxes.target.width / 2, boxes.target.y + boxes.target.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await tripFromApi(page.request)).activities.find((a: any) => a.title === 'Second stop').start).toBe('13:00');
  const trip = await tripFromApi(page.request);
  expect(trip.activities.find((a: any) => a.title === 'Second stop').start).toBe('13:00');
  expect(trip.activities.find((a: any) => a.id === 'a-1').start).toBe('16:00');
  await page.getByRole('button', { name: 'Move Second stop later' }).click();
  await expect.poll(async () => (await tripFromApi(page.request)).activities.find((a: any) => a.title === 'Second stop').start).toBe('16:00');
});

test('records equal, custom and percentage expenses exactly once', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  const before = await tripFromApi(page.request);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('Equal snack');
  await page.getByLabel('Amount (USD)').fill('10.01');
  await page.getByLabel('Paid by').selectOption('t-1');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect.poll(async () => (await tripFromApi(page.request)).expenses.length).toBe(before.expenses.length + 1);
  let trip = await tripFromApi(page.request);
  expect(Object.values(trip.expenses.at(-1).shares)).toEqual([334, 334, 333]);

  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('Percentage snack');
  await page.getByLabel('Amount (USD)').fill('10.01');
  await page.getByLabel('Paid by').selectOption('t-2');
  await page.getByLabel('Split method').selectOption('percentage');
  await page.getByLabel('Alex Morgan percentage').fill('33.34');
  await page.getByLabel('Jamie Chen percentage').fill('33.33');
  await page.getByLabel('Sam Rivera percentage').fill('33.33');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Percentage snack' })).toBeVisible();
  trip = await tripFromApi(page.request);
  expect(Object.values(trip.expenses.at(-1).shares)).toEqual([334, 334, 333]);

  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('Custom snack');
  await page.getByLabel('Amount (USD)').fill('10.00');
  await page.getByLabel('Paid by').selectOption('t-3');
  await page.getByLabel('Split method').selectOption('amount');
  await page.getByLabel('Alex Morgan amount').fill('4.00');
  await page.getByLabel('Jamie Chen amount').fill('4.00');
  await page.getByLabel('Sam Rivera amount').fill('2.00');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Custom snack' })).toBeVisible();
  trip = await tripFromApi(page.request);
  expect(trip.expenses.at(-1).shares).toEqual({ 't-1': 400, 't-2': 400, 't-3': 200 });
  expect(new Set(trip.expenses.map((e: any) => e.id)).size).toBe(trip.expenses.length);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(/Actual expenses exceed your budget/)).toHaveCount(0);
});

test('traveller edits retain references, removal is guarded, and settlements update', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Travellers', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Alex Morgan' }).click();
  await expect(page.getByText(/traveller’s expenses before removing/)).toBeVisible();
  expect((await tripFromApi(page.request)).travellers).toHaveLength(3);

  await page.getByRole('button', { name: 'Edit Jamie Chen' }).click();
  await page.getByLabel('Name').fill('Jamie Kim');
  await page.getByRole('button', { name: 'Save traveller' }).click();
  await expect(page.locator('.traveller-row').filter({ hasText: 'Jamie Kim' })).toBeVisible();
  const renamed = (await tripFromApi(page.request)).travellers.find((t: any) => t.id === 't-2');
  expect(renamed.name).toBe('Jamie Kim');
  await page.getByRole('button', { name: 'Add traveller' }).click();
  await page.getByLabel('Name').fill('Riley Park');
  await page.getByRole('button', { name: 'Add traveller' }).click();
  await expect(page.locator('.traveller-row').filter({ hasText: 'Riley Park' })).toBeVisible();
  await expect(page.locator('.settlement')).toHaveCount(2);
  const riley = page.locator('.traveller-row').filter({ hasText: 'Riley Park' });
  page.once('dialog', dialog => dialog.accept());
  await riley.getByRole('button', { name: 'Remove Riley Park' }).click();
  await expect(riley).toHaveCount(0);
  expect((await tripFromApi(page.request)).travellers).toHaveLength(3);
  await page.reload();
  await page.getByRole('button', { name: 'Travellers', exact: true }).click();
  await expect(page.locator('.traveller-row').filter({ hasText: 'Jamie Kim' })).toBeVisible();
});

test('edits and deletes expenses while replacing linked booking cost', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  const expense = page.locator('.expense-row').filter({ hasText: 'Flight tickets' });
  await expense.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Amount (USD)').fill('700.00');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect.poll(async () => (await tripFromApi(page.request)).expenses[0].amount).toBe(70000);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(/Remaining budget: \$2,100.00/)).toHaveCount(1);
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  page.once('dialog', dialog => dialog.accept());
  await expense.getByRole('button', { name: 'Delete Flight tickets' }).click();
  await expect(expense).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText(/Remaining budget: \$2,080.00/)).toHaveCount(1);
});

test('trip date edits keep out-of-range activities visible for correction', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Edit trip' }).click();
  await page.getByLabel('End date').fill('2027-04-12');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  const outlier = page.locator('.outliers').getByText(/An afternoon at the museum/);
  await expect(outlier).toBeVisible();
  await page.locator('.outliers').getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Date', { exact: true }).fill('2027-04-12');
  await page.getByRole('button', { name: 'Save activity' }).click();
  await expect(page.locator('.outliers')).toHaveCount(0);
  await expect(page.locator('.day').first().getByText('An afternoon at the museum')).toBeVisible();
});

test('surfaces schedule, travel, opening-hours and date conflicts after manual edits', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  const oldTown = page.locator('.activity-row').filter({ hasText: 'Explore the old town' });
  await oldTown.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Start time').fill('10:05');
  await page.getByLabel('Opens').fill('11:00');
  await page.getByRole('button', { name: 'Save activity' }).click();
  await expect(page.locator('.conflicts')).toContainText('outside its opening hours');
  await expect(page.locator('.conflicts')).toContainText('Allow 40 minutes');
});

test('smart rescheduling preserves fixed events and reports unavailable slots', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  const flight = page.locator('.booking-card').filter({ hasText: 'Flight to Kyoto' });
  await flight.getByRole('button', { name: 'Edit / delay' }).click();
  await page.getByLabel('Date', { exact: true }).fill('2027-04-13');
  await page.getByLabel('Start time').fill('10:00');
  await page.getByLabel('Duration (minutes)').fill('60');
  await page.getByRole('button', { name: 'Save booking' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review schedule changes' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('An afternoon at the museum');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  const trip = await tripFromApi(page.request);
  expect(trip.activities.find((a: any) => a.id === 'a-2')).toMatchObject({ date: '2027-04-13', start: '10:00', fixed: true });
});

test('undo expense changes keeps budget and settlements consistent', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('Museum refund adjustment');
  await page.getByLabel('Amount (USD)').fill('100.00');
  await page.getByLabel('Paid by').selectOption('t-2');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect.poll(async () => (await tripFromApi(page.request)).expenses.length).toBe(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await tripFromApi(page.request)).expenses.length).toBe(1);
  await page.getByRole('button', { name: 'Travellers', exact: true }).click();
  await expect(page.getByText('pays Jamie Chen')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => (await tripFromApi(page.request)).expenses.length).toBe(2);
  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  await expect(page.locator('.expense-row').filter({ hasText: 'Museum refund adjustment' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('New history branch');
  await page.getByLabel('Amount (USD)').fill('1.00');
  await page.getByLabel('Paid by').selectOption('t-1');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  expect((await tripFromApi(page.request)).expenses.map((e: any) => e.title)).not.toContain('Museum refund adjustment');
});

test('validates amount, date, duration and percentage boundaries without persisting invalid data', async ({ page }) => {
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Edit trip' }).click();
  await page.getByLabel('Start date').fill('2027-04-17');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/valid date range/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Itinerary', exact: true }).click();
  await page.getByRole('button', { name: 'Add activity' }).click();
  await page.getByLabel('Activity name').fill('Invalid activity');
  await page.getByLabel('Start time').fill('23:30');
  await page.getByLabel('Duration (minutes)').fill('60');
  await page.getByRole('button', { name: 'Save activity' }).click();
  await expect(page.getByText('Activities must end on the same day.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Budget & expenses' }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Expense name').fill('Invalid amount');
  await page.getByLabel('Amount (USD)').fill('1.001');
  await page.getByLabel('Paid by').selectOption('t-1');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText(/at most two decimal places/)).toBeVisible();
  await page.getByLabel('Amount (USD)').fill('10.00');
  await page.getByLabel('Split method').selectOption('percentage');
  await page.getByLabel('Alex Morgan percentage').fill('50.00');
  await page.getByLabel('Jamie Chen percentage').fill('50.00');
  await page.getByLabel('Sam Rivera percentage').fill('0.01');
  await page.getByRole('button', { name: 'Save expense' }).click();
  await expect(page.getByText('Percentages must add up to 100%.')).toBeVisible();
  expect((await tripFromApi(page.request)).expenses).toHaveLength(1);
});

test('shows API errors and preserves the displayed trip on failed saves', async ({ page }) => {
  await page.route('**/api/trips/trip-kyoto', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'forced failure' }) });
    else await route.continue();
  });
  await page.goto('/trips/trip-kyoto');
  await page.getByRole('button', { name: 'Edit trip' }).click();
  await page.getByLabel('Trip name').fill('Should not save');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit trip' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Edit trip' }).getByText(/Something went wrong/)).toBeVisible();
  expect((await tripFromApi(page.request)).name).toBe('A little magic in Kyoto');
});

test('shows loading and empty dashboard states and handles unknown routes', async ({ page }) => {
  const trips = await (await page.request.get('http://127.0.0.1:3101/trips')).json() as { id: string }[];
  for (const trip of trips) await page.request.delete(`http://127.0.0.1:3101/trips/${trip.id}`);
  await page.route('**/api/trips', async route => {
    await new Promise(resolve => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.getByText('Loading your trips…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your next adventure starts here' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a trip' }).first()).toBeVisible();
  await page.goto('/trips/not-a-trip');
  await expect(page.getByRole('heading', { name: 'Trip unavailable' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to dashboard' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/not-a-route');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1100 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`${viewport.name} layout is responsive and all primary navigation works`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/trips/trip-kyoto');
    for (const name of ['Itinerary', 'Bookings', 'Budget & expenses', 'Travellers', 'Overview']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.locator('.tabs .selected')).toContainText(name);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Edit trip' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit trip' });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole('button', { name: 'Close' }).click();
  });
}
