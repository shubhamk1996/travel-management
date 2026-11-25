import { configureStore } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Trip } from './domain';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Trips'],
  endpoints: builder => ({
    getTrips: builder.query<Trip[], void>({ query: () => 'trips', providesTags: ['Trips'] }),
    getTrip: builder.query<Trip, string>({ query: id => `trips/${id}`, providesTags: ['Trips'] }),
    createTrip: builder.mutation<Trip, Trip>({ query: body => ({ url: 'trips', method: 'POST', body }), invalidatesTags: ['Trips'] }),
    updateTrip: builder.mutation<Trip, Trip>({
      query: body => ({ url: `trips/${body.id}`, method: 'PUT', body }),
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(api.util.updateQueryData('getTrip', data.id, () => data));
        } catch { /* The mutation error is reported to the caller. */ }
      },
      invalidatesTags: ['Trips']
    }),
    deleteTrip: builder.mutation<void, string>({ query: id => ({ url: `trips/${id}`, method: 'DELETE' }), invalidatesTags: ['Trips'] })
  })
});
export const { useGetTripsQuery, useGetTripQuery, useCreateTripMutation, useUpdateTripMutation, useDeleteTripMutation } = api;
export const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: getDefault => getDefault().concat(api.middleware) });
