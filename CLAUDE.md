# ZeroSQL — Browser Detective SQL Game

## What is this?

Browser-based detective game where SQL queries ARE the gameplay. Player is a detective-analyst in DataCity investigating criminal group "BASE". Dark noir theme, Russian language interface.

## Tech Stack

- **Next.js 16** (App Router, Turbopack, `src/` dir)
- **SQL.js** — SQLite compiled to WASM, runs entirely in browser
- **CodeMirror 6** — SQL editor with syntax highlighting + autocomplete
- **Zustand** — state management with LocalStorage persistence
- **shadcn/ui** + Tailwind CSS — UI components, noir dark theme

## Key Architecture

- `/game` route is fully client-side (`'use client'`). No server-side SQL execution.
- SQL.js WASM binary served from `public/sql-wasm.wasm`
- Game database (8 tables) is created and seeded in-browser on first load
- Mission validation checks **query results**, not SQL text — any correct query works
- Progress saved to LocalStorage via Zustand persist middleware

## Project Structure

- `src/engine/` — database init, query execution, schema, seed, validator, mission runner
- `src/data/missions/` — mission definitions (add new missions here)
- `src/stores/game-store.ts` — central Zustand store
- `src/components/game/` — game UI components (editor, results, mission panel)
- `src/types/` — TypeScript types for game, missions, database

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
```

## Adding New Missions

1. Create `src/data/missions/mission-XX-name.ts` following the `Mission` type
2. Add to `src/data/missions/index.ts` array
3. Validation types: `row_count`, `contains_columns`, `contains_value`, `exact_match`, `custom`

## Game Database Tables

suspects, crimes, evidence, crime_suspects, locations, communications, transactions, org_members
