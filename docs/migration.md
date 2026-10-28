# Extraction provenance

Extracted on 2026-10-28 from `playweft/playweft-games`, based on commit
`3b7da12013112039a58781e7aefbdf2741cba3b5`, including the working-tree league
promotion/relegation/retention result page changes present at extraction time.
Those outstanding game changes are included here rather than being discarded.

## Scope

- The complete `games/mahjong/` tree, icon and Mahjong-only asset/font tooling.
- Mahjong regression tests and its cases from mixed manifest, protocol,
  storage-cache and build-plugin tests.
- The required bridge, RPC, storage, offline-cache, local Lua runtime and CSS.
- Service-worker and content-version build support needed by offline packages.

Runtime files copied from the original `src/` are owned by this repository.
They are not imports or symlinks to the old checkout. When fixing shared bridge
or storage behavior, check whether the other repository needs the same fix.
The MIT license is preserved in the root. No extra SDK repository was introduced.

At extraction, the source layout and local-development `/mahjong/` path were retained.
Production uses the selected `BASE_PATH` (default `/`) as its game-package root;
the built Manifest ID follows that path, like the sibling single-game projects.
Gameplay rules, AI policy, asset bytes and storage identifiers were not rewritten
as part of extraction. Development uses port 9141 to avoid the games catalogue's
9139. Production domains, hosting setup and platform discovery sources are left
to the repository owner. No production deployment is performed by extraction.

The old repository removes its local Mahjong catalogue/build entries. Its other
games, shared runtime, static-host configuration and platform integration remain.

## Standalone source layout

After extraction, the browser source was reorganized under `src/`, with rules
and progression in `src/game/`, presentation in `src/ui/` and `src/render/`,
and explicit platform, storage, runtime, and offline adapters. Root HTML entries
and the Manifest replace the former `games/mahjong/` package layout. `build/lua/`
owns room-source generation. Production output still uses `BASE_PATH`.
Development now serves only the root entry, without the former `/mahjong/`
alias. Storage identifiers and save formats are unchanged.
