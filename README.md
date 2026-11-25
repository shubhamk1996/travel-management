# Waypoint

A local-first travel planning workspace for trips, itineraries, bookings, budgets and shared expenses. All sample data is synthetic and uses USD. The app does not call external travel, payment or authentication services.

## Setup

Requires Node.js 22.12 or newer (or Node 24+) and npm. From this directory:

```sh
npm install
```

In two terminals:

```sh
npm run server
npm run dev
```

Open the address printed by Vite (normally http://localhost:5173). The API listens on 127.0.0.1:3001; Vite proxies `/api` to it. Keep both processes running. Trip data is stored in `db.json`; back up that file to preserve your changes. The server intentionally does not watch the file for external edits while running; restart it after manually replacing the file. The application and installed dependencies work offline.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run server` | Start the persistent local JSON Server |
| `npm run typecheck` | Type-check the project |
| `npm run build` | Type-check and create the production bundle in `dist` |
| `npm test` | Run unit and React integration tests |
| `npm run self-check` | Run type-checking, unit/integration tests and production build |
| `npx playwright install chromium` | Install the browser needed by the end-to-end suite (one-time, requires internet) |
| `npm run test:e2e` | Run isolated Playwright tests using ports 3101 and 4173 |

The browser suite uses `e2e/fixture.json` and a separate generated `e2e/db.test.json`, never your `db.json`. It starts and stops its own API and Vite processes. Free the test ports before running it. Run `npm run self-check` and `npm run test:e2e` for the complete automated checks.

## Using the planner

Create a trip from the dashboard, then add travellers, activities, bookings and expenses from its tabs. Drag a flexible activity onto another flexible activity to swap their slots, or onto a day to move it to that day at the same time. Arrow controls also swap adjacent activities. Fixed activities cannot be dragged. Review any conflicts shown above the itinerary.

Edit a booking to delay or cancel it. A preview shows proposed flexible activity moves and unresolved conflicts; apply or discard it as one operation. Use Undo and Redo on the trip page to reverse or restore changes during the current page session. Saved trip data survives refresh; the undo/redo history itself does not.

See [REQUIREMENTS.md](./REQUIREMENTS.md) for calculation rules, input contracts and scheduling limitations. This is a local single-user application: JSON Server has no authentication or concurrency control, so do not expose it to an untrusted network or edit the same trip concurrently in multiple tabs.
