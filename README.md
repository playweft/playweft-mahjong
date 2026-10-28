# Playweft Mahjong

A browser-based Japanese mahjong game with a 3D table, AI opponents, career
progression, and replay playback. Play on your own or join friends through
[Playweft](https://github.com/playweft/playweft).

[Getting started](#getting-started) · [Multiplayer](#multiplayer) · [Deployment](#deployment) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)

## Features

- **Practice — 修練戦:** play East or South matches against three AI opponents.
- **Career — 立志戦:** three placement matches followed by eight-match league
  seasons, with promotion and relegation across E1–A1. Keep up to three
  independent saves.
- **Friends — 友人戦:** join rooms for 2–4 players through Playweft.
- **Replays:** review completed matches with playback and timeline controls.
- **Customization:** choose table themes, tile faces, portraits, and music.

Solo play runs in the browser and needs no game server. Progress is saved in
browser storage; it does not sync between devices. See the in-game rules page
for gameplay instructions.

## Getting started

Requires **Node.js 22.12 or newer** and npm.

```sh
git clone https://github.com/playweft/playweft-mahjong.git
cd playweft-mahjong
npm ci
npm run dev
```

Open [http://localhost:9141/](http://localhost:9141/).
If that port is occupied, use the address Vite prints in the terminal.

## Multiplayer

Room play uses the separate [Playweft platform](https://github.com/playweft/playweft)
for rooms, invitations, and server-side rules.

1. Start this game's development server with `npm run dev`.
2. Set up and start Playweft following its
   [local setup guide](https://github.com/playweft/playweft#run-locally).
3. Add the game to Playweft using its manifest URL:

   ```text
   http://localhost:9141/playweft.json
   ```

4. Create a room and share the invitation link.

For players on other devices, use an address they and the platform server can
reach instead of `localhost`. The **友人戦** button appears when the host
platform supports creating rooms.

## Deployment

Build and preview the production site:

```sh
npm run build
npm run preview
```

Deploy the entire **`dist/`** directory to a static host. By default, the game
is served at `/` and its manifest is `/playweft.json`.

To host it under a subpath, set `BASE_PATH` when building:

```sh
BASE_PATH=/mahjong/ npm run build
```

This produces `dist/mahjong/index.html` and `dist/mahjong/playweft.json`.
The upload directory is still `dist/`. Nested paths such as `/games/mahjong/`
also work. `BASE_PATH` affects production builds; the development URL remains
`/`.

For **Cloudflare Workers Builds**, use `npm run build` as the build command and
`npx wrangler deploy` as the deploy command. The included
[wrangler.jsonc](wrangler.jsonc) serves `dist/` as static assets. Set the Worker
name for your deployment and configure domains and routes in Cloudflare.

### Configuration

No environment variables are needed to run the game. Supply optional build
settings through the shell or your hosting provider's environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_PATH` | `/` | URL path where the production game is served. |
| `MAHJONG_DEFAULT_ASSET_CONFIG_URL` | Bundled assets | URL of a JSON configuration for default backgrounds, portraits, tile backs, and music. |

`BASE_PATH` can also be set in `.env.local`. See [.env.example](.env.example)
for an example. The browser's Lua/Wasm runtime is loaded from Wasmoon's
versioned CDN URL.

## Development

The client uses Preact with JSX for the interface, CSS for styling, and Three.js
for the table. Local rules and AI run in a
Web Worker using Lua and Wasmoon; room rules run on the Playweft server.

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm test` | Run the test suite. |
| `npm run build` | Build the production site. |
| `npm run preview` | Preview the production build locally. |
| `npm run check` | Build and run the test suite. |
| `npm run fonts:check` | Check brush-font character coverage. |

```text
index.html      Game entry
help.html       Rules page
playweft.json   Playweft package manifest
src/
  main.jsx      Mount the Preact application
  app/          App composition, startup, sessions, and match coordination
  game/         Rules, AI, career progression, and replay models
  ui/           Preact components for the lobby, table, settings, and results
  render/       Three.js scenes, tile models, animation, and audio
  runtime/      Lua/Wasm execution and Web Workers
  platform/     Playweft bridge, RPC, and room profiles
  storage/      Saves, IndexedDB, and OPFS
  offline/      Offline resources and caching
  assets/       Images, fonts, and audio assets
  styles/       Global styles
public/         Icons, service worker, and hosting headers
build/          Vite plugins, Lua packaging, and font tools
tests/          Game and runtime tests
docs/           Architecture and development notes
```

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
for the development workflow and [development notes](docs/development.md) for
architecture and progression rules.

## License

Code is licensed under the [MIT License](LICENSE).

Third-party fonts and assets retain their own licenses. The bundled Bakudai
font uses the [SIL Open Font License 1.1](src/assets/fonts/BAKUDAI-OFL.txt);
see its [notice](src/assets/fonts/BAKUDAI-FONT-NOTICE.txt). Asset sources
and additional terms are recorded alongside the corresponding files.
