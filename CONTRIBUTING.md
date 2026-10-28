# Contributing

Run `npm ci`, then `npm run dev` and open http://localhost:9141/.

Keep rules, career progression, and replay models in `src/game/`; these modules
must stay independent of the DOM, Three.js, platform bridge, and persistence.
Put interface code and its CSS in `src/ui/`, Three.js presentation in
`src/render/`, and startup/session coordination in `src/app/`. Browser and
platform adapters belong in `src/storage/`, `src/offline/`, `src/platform/`,
and `src/runtime/`. See [development notes](docs/development.md) for the layout.

This checkout must build and test on its own. Preserve bridge compatibility
and existing storage identifiers when changing the adapters.

For a behavior change, add a regression covering the observed failure and run
`npm run check`. Exercise changes affecting rooms through the Playweft platform.
For visible UI changes, include desktop/mobile screenshots. Preserve sources and
licenses for third-party assets. Do not commit `node_modules/` or `dist/`.

Brush labels are collected from markup and dynamic result/action labels. After
adding characters, rebuild with
`bash build/fonts/build-bakudai-subset.sh /path/to/Bakudai-Regular.woff2`
and run `npm run fonts:check`.
