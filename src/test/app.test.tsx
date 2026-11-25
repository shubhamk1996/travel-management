import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../App';

const create = vi.fn();
vi.mock('../store', () => ({
  useGetTripsQuery: () => ({ data: [], isLoading: false }),
  useGetTripQuery: () => ({ data: undefined, isLoading: false }),
  useCreateTripMutation: () => [create],
  useUpdateTripMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteTripMutation: () => [vi.fn()]
}));
beforeEach(() => create.mockReset());
it('creates a trip with validated input and opens its overview', async () => {
  create.mockImplementation((trip: unknown) => ({ unwrap: () => Promise.resolve(trip) }));
  const user = userEvent.setup();
  render(<MemoryRouter><App/></MemoryRouter>);
  await user.click(screen.getAllByRole('button', { name: /create a trip/i })[0]);
  await user.type(screen.getByLabelText('Trip name'), 'Mountain escape');
  await user.type(screen.getByLabelText('Destination'), 'Alpine village');
  await user.type(screen.getByLabelText('Start date'), '2027-05-01');
  await user.type(screen.getByLabelText('End date'), '2027-05-03');
  await user.type(screen.getByLabelText('Total budget (USD)'), '123.45');
  await user.click(screen.getByRole('button', { name: 'Create trip' }));
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mountain escape', budget: 12345, activities: [], bookings: [], expenses: [] }));
});
it('rejects a reversed date range without creating a trip', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><App/></MemoryRouter>);
  await user.click(screen.getAllByRole('button', { name: /create a trip/i })[0]);
  await user.type(screen.getByLabelText('Trip name'), 'Test');
  await user.type(screen.getByLabelText('Destination'), 'City');
  await user.type(screen.getByLabelText('Start date'), '2027-05-03');
  await user.type(screen.getByLabelText('End date'), '2027-05-01');
  await user.type(screen.getByLabelText('Total budget (USD)'), '100');
  await user.click(screen.getByRole('button', { name: 'Create trip' }));
  expect(await screen.findByText(/valid date range/)).toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
});
