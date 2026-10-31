# companion-module-livelogix-cadence

A [Bitfocus Companion](https://bitfocus.io/companion) module for **[LiveLogix Cadence](https://cadence.livelogix.app)**: timers, presets, schedules, cue stacks, polls, messages, scenes, automations and cue lights, with live time, status and tally feedback.

## About Cadence

[Cadence](https://cadence.livelogix.app) is the countdown clock and show timer for Mac. One synced engine drives displays, the web, NDI®, SDI, vMix, wall clocks and the cloud, with audience polls (phones vote by QR code, results live on screen), run-of-show schedules from a live Google Sheet, Planning Center Services LIVE, and remote producer pages. It's in **free beta** with everything unlocked: [get a beta key](https://cadence.livelogix.app/#get).

Guides: [NDI® countdown timer](https://cadence.livelogix.app/ndi-countdown-timer/) · [SDI clock with DeckLink](https://cadence.livelogix.app/sdi-decklink-clock-mac/) · [ProPresenter countdown](https://cadence.livelogix.app/propresenter-countdown/) · [OBS & vMix countdown timer](https://cadence.livelogix.app/obs-countdown-timer/) · [Synced show clocks](https://cadence.livelogix.app/synced-clocks/) · [Planning Center countdown](https://cadence.livelogix.app/planning-center-countdown/)

## How the module works

It talks to a Cadence **Producer server** over the LAN: `GET /api/state` for a live snapshot (polled) and `POST /api/command` to drive it. That's the same HTTP surface Cadence's own Producer web page uses (`AppModel.producerHandleCommand` in the Cadence app is the wire reference).

See [companion/HELP.md](companion/HELP.md) for actions, feedbacks, variables and setup.

## Developing / loading into Companion

Companion loads external modules from a developer folder:

1. Companion → **Settings → Developer modules path** → point it at a folder that **contains** this module directory.
2. Add a connection and search for **Cadence**.

```sh
yarn install          # Yarn 4 (via corepack)
yarn test             # offline suite — real action code against a mock Cadence
yarn smoke 8730       # read-only smoke test against a RUNNING Cadence (app or Producer port)
node test/serve-mock.js 18730   # standalone mock Cadence for pointing a real Companion at
yarn package          # build the installable .tgz (companion-module-build)
```

## Releasing

Bump `version` in `package.json`, commit, tag `vX.Y.Z`, push, then submit the tag in the [Bitfocus Developer Portal](https://developer.bitfocus.io/) (My Connections → livelogix-cadence → Submit Version).

## Layout

| File                      | Role                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/main.js`             | Companion lifecycle + polling (thin)                                                                                      |
| `src/helpers.js`          | state normalisation, parsers, connection-status transitions, `sendCommand`, choice/find helpers — mixed onto the instance |
| `src/definitions.js`      | rebuild definitions / push values — mixed onto the instance                                                               |
| `src/config.js`           | connection settings (host / port / poll interval)                                                                         |
| `src/actions.js`          | control commands                                                                                                          |
| `src/feedbacks.js`        | button styling from live state                                                                                            |
| `src/variables.js`        | live readouts (table-driven per entity)                                                                                   |
| `src/presets.js`          | ready-made buttons                                                                                                        |
| `test/`                   | mock Cadence, fake instance, fixture snapshot, node:test suites, `test-harness.js` smoke, `roundtrip-test.js`             |
| `companion/manifest.json` | Companion module manifest                                                                                                 |
| `companion/HELP.md`       | in-app help                                                                                                               |

The tests run the module's real `helpers`/`definitions` mixins on a fake instance, so what's tested is what Companion runs.
