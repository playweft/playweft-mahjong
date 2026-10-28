# Mahjong development notes

The repository is a standalone Vite project. `index.html`, `help.html`, and
`playweft.json` live at the root; all browser source lives under `src/`. `index.html` is a small mount shell;
`src/main.jsx` mounts the Preact `src/app/App.jsx` component tree.
No sibling checkout is needed to install, build, or test it.

## Source organization

- `src/game/`: Lua rules, JavaScript rule helpers, career calculation, save-data
  validation, and replay progression. These modules do not import UI, rendering,
  platform, runtime, or storage adapters.
- `src/ui/`: Preact/JSX components for the lobby, table controls, result pages, replay controls, settings,
  and shared DOM components. Feature styles live beside the corresponding UI;
  `src/styles/` contains global styles and font declarations.
- `src/render/`: Three.js scenes, tile factories, animation, result-hand
  rendering, and match audio.
- `src/app/`: application startup, session lifecycle, and orchestration of rules,
  rendering, UI, and persistence.
- `src/runtime/`: local Lua/Wasm execution, Worker communication, runtime
  loading, and deployment-path helpers.
- `src/platform/`: Playweft RPC, storage bridge, and room profile lookup.
- `src/storage/`: career and practice saves, acknowledged storage snapshots,
  IndexedDB, OPFS, replay archives, and imported asset packs.
- `src/offline/`: offline-resource downloads, policy, and service-worker registration.
- `src/assets/`: bundled images, fonts, and audio assets.

Keep match calculations and replay models independent of browser adapters.
For example, `src/game/career/career.js` settles a season;
`src/storage/career-store.js` persists it, and `src/ui/result/` presents it.
The practice-save model is in `src/game/replay/solo-save.js`, while
`src/storage/solo-save.js` owns reads and writes.

## UI ownership

Preact owns the interface markup and display state. Coordinators publish view
models through the narrow `ViewComponent.update()` interface, which commits
synchronously so a legal-action update is visible before the next input. Rules,
AI, replay progression, and save formats remain independent of Preact.
Components own claim-picker state, settings fields and tabs, career-slot rows,
result pages, replay lists, theme selections, and offline-resource controls.
Native DOM access is reserved for input adapters, focus management, transitions,
and integration with the existing Three.js and help-iframe surfaces.

The table canvas uses a stable host in `TableScene`; ordinary UI updates do not
replace it or recreate the renderer. The match runtime retains responsibility
for renderer startup and destruction. Dynamic theme lists render into empty
component host elements and unmount when the theme controller is destroyed.

Node tests run with the `tsx` loader to exercise the same JSX components used by
Vite. UI fixtures mount `App` instead of duplicating its markup. Font tooling
renders the component tree to HTML with `preact-render-to-string`, so brush
coverage continues to follow the actual interface.

## Game package and local execution

The development game and Manifest are served at `/` and `/playweft.json` on
port 9141.
The platform loads the Manifest and runs the generated `game-online.lua`;
standalone matches run `src/game/rules/game.lua` through a local Worker.
`build/lua/` transforms the room entry, and
`build/vite/plugins/game-package.js` serves/emits the Manifest and both Lua
entries directly at the package root.

The bridge contract is documented in the platform's
[integration guide](https://github.com/playweft/playweft/blob/main/docs/game-integration/README.md).

## Persistent game progress

Mahjong's local match and browser preferences use the asynchronous `localStorage.*` capabilities on the existing Playweft
bridge. The platform stores strings in its top-level IndexedDB, isolated by
validated game origin. Standalone pages use their own first-party IndexedDB.
These are local browser saves, not account or cloud synchronization.

`src/storage/game-storage.js` chooses the backend and imports explicitly listed
legacy localStorage keys once. Existing destination values win; source
keys are removed only after all imports and the migration marker commit.
Migration can resume after a failed write. An unreadable legacy store or a
failed destination read is an error, never evidence of a new game.

`src/storage/game-storage-cache.js` hydrates the complete game snapshot before the UI
starts. Existing synchronous settings read that snapshot; writes are serialized
and coalesced per key. Only acknowledged commits leave the pending queue.
Read failures and invalid saves block startup with a diagnostic retry dialog.
Write failures retain the newest in-memory snapshot for explicit retry. They
never fall back to iframe localStorage. Add new keys to the game's allowlist
before using them.

Mahjong's separate replay archive and imported asset-pack databases are outside
this localStorage migration.

Theme selection and per-theme appearance preferences share the acknowledged
platform/standalone storage under `playweft.mahjong.theme-preferences.v1`.
This record contains the selected pack ID and appearance choices keyed by pack
ID, including the built-in `__default__` theme. Old theme settings are not read
or migrated. The new key is excluded from legacy localStorage imports.

Imported theme files, catalogs, and manifest defaults remain in the local
`playweft-mahjong-asset-packs-v2` IndexedDB. Switching themes or changing an
appearance does not rewrite that database. If the selected pack is unavailable
locally, the game displays the built-in theme and preserves the preference.
Deleting a theme removes its files and preferences; deleting the selected theme
also selects the built-in default. Theme files are not platform or cloud saves.

## Mahjong career progress

The lobby has a `立志戦` submenu with three independent save slots and a
`修練戦` submenu for the existing East and South free matches. Menu contents
fade out/in while the scene and timber frame stay fixed. Empty slots display
only their number and “新游戏”; format details live in a collapsed rules guide.

Career slots use `playweft.mahjong.career.slot-{1,2,3}.v1` in the same acknowledged
platform/standalone storage as local match saves. Each slot contains its current
match, placement results, current league period, recent period summaries, and
analysis counters together. Free practice keeps `playweft.mahjong.solo-save.v1`.
Completed replay archives remain independent and may be evicted without losing
career results. No account synchronization is implied by platform-owned storage.

After the third placement match's final-hand result, the ordinary match summary
is replaced by a paper-and-bamboo `定段結果` page. It shows the initial grade,
all three matches' ranks, final scores and points, and their total; it does not
display decision evaluation. “开始联赛” starts the first league match in the
same slot, while “返回大厅” returns to the three career slots. The slot's
`placementResultSeen` flag is acknowledged and flushed only on either action.
An unacknowledged grade is shown when the slot is reopened after a reload.
Older slots can show it once if league play has not already begun.

The eighth league match uses the same result page for `昇級結果`, `降級結果`
or `残留結果`, including retention at the E1/A1 boundaries. It shows the settled
grade, the completed period number and grade transition, all eight match results,
and the total. `pendingLeagueResult` saves that full snapshot atomically with
settlement before the active period resets. It survives reload and match cleanup
until either “开始下一期” or “返回大厅” acknowledges and flushes it. The next
period starts at zero points; returning to the lobby does not start a match.
Existing slots without a snapshot still load, but cannot reconstruct already
cleared historical match rows. New periods started before the update settle
normally and produce the full result page when their eighth match completes.

Version 1 progression is deliberately game-specific, not the official league
rulebook: three hanchan placement matches, then eight hanchan per period across
E1, D3, D2, D1, C3, C2, C1, B2, B1, A2, A1. Match points are
`(final score - 25000) / 1000 + [30, 10, -10, -30][rank - 1]`; raw canonical
opening-seat order breaks tied scores consistently with replay export. Period
scores of at least +80 promote one tier, at most -80 relegate one, and otherwise
retain the tier. E1 and A1 are boundaries. Progression constants and placement
thresholds are in `src/game/career/career.js`; opponents currently use the
existing local AI policy at every tier.

Initial placement grants C2 when three-match points total at least +120,
regardless of decision metrics, or when the total is at least +90 and at least
30 reviewed manual discards have mean quality strictly >80 and a major-deviation
rate <=10%. Quality and mistakes are pooled across all reviewed decisions.
Otherwise the three-match total determines the tier: >=+90 C3, >=+30 D1,
>=-30 D2, >=-90 D3, below -90 E1. There is no subsequent one-tier adjustment,
no exact-agreement fallback and no hidden point bonus. Saved, completed placements
are not recalculated. Placement is bounded to E1–C2. These are provisional
game-balance thresholds, not calibrated human-rank estimates.

The match worker optionally reviews a manual career discard before applying it.
Lua compares the same candidate set under one push/fold mode and returns score,
shanten, acceptance, value and risk differences. JS uses
`100 * (1 - clamp((scoreLoss - 14) / scale, 0, 1))`, rounded to an integer, with
scales 300/400/1050 for push/mixed/fold; a normalized loss >=0.4 is a major deviation.
The 14-point tolerance prevents near-equivalent choices from counting as errors.
Agreement compares tile kind and red status, not interchangeable physical copies.
Forced post-riichi discards, automatic actions and non-discard decisions are not
rated. Missing analysis is recorded separately rather than as a failed decision.
These scores are heuristic policy comparisons, not expected-point loss or Elo.

Final settlement and the resumable match are written together, deduplicated by
match ID. Starting the next match allocates a fresh seed and ID. Restoring a
finished but unsettled checkpoint repairs its settlement; restoring an already
settled result never counts the match twice. Settings offers “保存并返回” during
career play. Invalid slot records block startup and preserve the original data.


### Brush font coverage

Mahjong uses the Bakudai subset for lobby mode signs, match/round/wind labels,
action buttons/callouts, result continuation/waiting labels, traditional yaku
names, draw reasons, and career result titles/buttons/grades. Ordinary settings text, career save summaries, player
names, and score-sheet numbers use their existing UI/Kalam fonts.

`npm run fonts:check` verifies the generated glyph list
against the current lobby labels, career-result labels and known dynamic brush labels. Rebuild using
`bash build/fonts/build-bakudai-subset.sh /path/to/Bakudai-Regular.woff2`.
The script regenerates the text list, checks source coverage, builds WOFF2 and
verifies its output cmap. Missing simplified 继/续/厅/联/赛/开 codepoints use
the corresponding 繼/續/廳/聯/賽/開 glyphs while preserving UI/accessibility text.

The home `友人戦` sign is the existing capability-gated `room.create` entry;
progress is flushed before creation. Legacy API-created rooms return to the
originating game after they end; the platform owns this navigation.

## Build-time base path

`BASE_PATH` is normalized by `build/vite/base-path.js` for production builds.
The package plugin rebases the generated Manifest; Vite emits the root game and
help entries directly. After version stamps have been written to HTML,
`build/vite/plugins/static-site.js` nests the site under `dist/<base>/` and keeps
`_headers` at the upload root. The fixed `dist/` root is emptied on every build.
There is no multi-game packaging or post-build game-directory flattening.

Vite injects the site/package base into `src/runtime/package-paths.js`.
Development uses `/` for both. Offline discovery, completion markers, and
Service Worker registration use these helpers. The worker resolves its own
base from its script URL and ignores resources outside that prefix. Build tests
cover root, one-level and nested bases, resource and Manifest reachability,
worker/version paths, and stale-output removal.
