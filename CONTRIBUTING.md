# Contributing

Run `npm ci`, then `npm run dev` and open http://localhost:9141/.

Keep rules, career progression, and replay models in `src/game/`; these modules
must stay independent of the DOM, Three.js, platform bridge, and persistence.
Put Preact/JSX components and their CSS in `src/ui/`, Three.js presentation in
`src/render/`, and startup/session coordination in `src/app/`. Browser and
platform adapters belong in `src/storage/`, `src/offline/`, `src/platform/`,
and `src/runtime/`. See [development notes](docs/development.md) for the layout.

This checkout must build and test on its own. Preserve bridge compatibility
and existing storage identifiers when changing the adapters.

Keep `index.html` as a small mount shell. Update components through their view
models; avoid replacing component-owned DOM with `innerHTML` or `createElement`.
Mount the actual components in UI tests using `tests/helpers/ui.jsx`.

For a behavior change, add a regression covering the observed failure and run
`npm run check`. Exercise changes affecting rooms through the Playweft platform.
For visible UI changes, include desktop/mobile screenshots. Preserve sources and
licenses for third-party assets. Do not commit `node_modules/` or `dist/`.

Brush labels are collected from markup and dynamic result/action labels. After
adding characters, rebuild with
`bash build/fonts/build-bakudai-subset.sh /path/to/Bakudai-Regular.woff2`
and run `npm run fonts:check`.
