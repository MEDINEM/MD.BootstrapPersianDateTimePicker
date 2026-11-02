# Rased patches on MD.BootstrapPersianDateTimePicker v5.0.1

This branch is **upstream v5.0.1 plus fixes**. It is not an official upstream release, and no
npm package is published from it.

| | |
| --- | --- |
| Upstream | https://github.com/Mds92/MD.BootstrapPersianDateTimePicker |
| Baseline | tag `v5.0.1`, commit `fb64e19e068237e21a2764d7714b68dffcdc2ca2` (release published 2026-09-06) |
| Fork | https://github.com/MEDINEM/MD.BootstrapPersianDateTimePicker |
| Branch | `codex/rased-datepicker-fixes` |
| Version string | `5.0.1+rased.1` (semver build metadata: same release, local patches) |
| License | MIT, as declared by upstream `package.json`; the upstream banner is kept in every build |

## Patches

Every fix has a regression in `test/picker.spec.cjs` that fails on the unmodified v5.0.1
build. Run the suite against the upstream files to see it (see **Checking a patch** below).

1. **Rebuilding during a Bootstrap transition.** `setDate`, `clearDate` and `updateOptions`
   rebuilt the picker 100ms later with `Popover.dispose()`, even while the popover was still
   fading in or out. Bootstrap's transition callback then read `_activeTrigger` from the disposed
   instance: `TypeError: Cannot convert undefined or null to object`. The picker now tracks the
   popover/modal transition, waits for `shown`/`hidden` before rebuilding, closes an open calendar
   with its normal animation first, and coalesces several updates so the last one wins.
   Tests: *clearing a date while the popover is closing*, *rapid set/clear/set*, and the calendar
   tests that change the date after choosing a day.
2. **Disposal.** `dispose()` did not cancel the pending rebuild, so a picker disposed within
   100ms of creation or of an update was rebuilt afterwards. It also left the instance
   registered, its capture-phase listeners attached (they were removed without the capture
   flag), its attributes on the element and, in modal mode, its modal in the page. Disposal
   during a transition threw the same `_activeTrigger` error. Constructing a picker on an element
   that already has one now disposes the old one, so both no longer handle every click.
   Tests: the *Disposal and re-initialisation* group, *disposing while the popover is closing*.
3. **Listener lifecycle.** The document listeners were registered 500ms after the popover
   opened: a day tapped in that window was ignored, and if the popover closed first the
   listeners were added after it closed and never removed. A picker with leaked listeners then
   handled clicks inside every other picker as well, writing the selection twice and putting the
   other picker's calendar into its own popover. Listeners are now registered when opening starts
   (`show`, so a day tapped during the fade-in counts), removed on `hidden` with matching capture
   flags, scoped to the picker's own popover, and each picker
   handles only clicks on its own calendar. Hiding a popover no longer strips the time mask from
   other pickers' time boxes. Clicking the field of an open picker keeps it open instead of
   starting a hide and a show at once, which left nothing visible.
   Tests: the *Event listeners* group.
4. **Modals and offcanvas.** The popover was always appended to `<body>`. Inside a Bootstrap
   modal or offcanvas, their focus trap took focus back from the popover's time box, so the time
   could not be typed. The popover now lives inside the nearest `.modal`/`.offcanvas`, and closes
   when its offcanvas closes (Bootstrap already did this for modals).
   Tests: the *Modals and offcanvas* group.
5. **Keyboard.** Escape closes an open calendar and leaves focus on its field; inside a modal
   the first Escape closes only the calendar. Enter in the time box of an inline picker commits
   the time instead of submitting the surrounding form.
   Tests: *Escape closes the calendar…*, *Escape inside a modal…*, *Enter in the time box…*.
6. **Housekeeping.** `setDatePersian` no longer logs to the console. The webpack build no
   longer starts in watch mode (`npm run webpack` never exited, so it could not run in CI;
   `npm run webpackwatch` keeps the old behaviour), and the banner reports the real version
   instead of `4.4.0`.

Guards that pass on both builds and must keep passing: Nowruz and leap Esfand conversion and
month length in six time zones (Tehran, UTC, Tokyo, Los Angeles, UTC+14, UTC−11), linked
from/to restrictions, min/max limits, the year list Cancel button inside a form, a picker in a
scrolled modal staying attached to its field, and no horizontal overflow at 320/360/390px.

Not changed: calendar arithmetic, generated markup, CSS, options and public method signatures.

## Build

Node 22 (CI) or the version in use locally; dependencies are pinned by `package-lock.json`.

```bash
npm ci --ignore-scripts
npm run build          # tsc --noEmit, then webpack (production) into dist/
npx playwright install chromium firefox webkit
npm test               # Chromium, Firefox, WebKit, iPhone 13 and Pixel 7 emulation
```

`--ignore-scripts` is enough: esbuild's binary comes from its optional platform package.
`playwright` (1.64.0) is the only added dependency, for the regression suite.

`src/` is checked out with LF on every OS (`.gitattributes`), so the source maps, which embed
the sources, are identical on Windows and Linux. CI fails if the committed `dist/*.js` or
`dist/*.css` differ from a fresh build.

## Built files

SHA-256 of `dist/` as built from commit `553d6778fb22d4d7787472a05d1d43dd32554cc7` (unchanged by
later documentation-only commits). CI rebuilds on Linux and fails if the JS or CSS differ.

| File | SHA-256 |
| --- | --- |
| `mds.bs.datetimepicker.js` | `24fa03d378598a3c8b4ed1900a5dc415baec88916727687cfaf3002d92c040ed` |
| `mds.bs.datetimepicker.js.map` | `b4398815e48f8c230b41954df4cfbb38d86643f77af7c588eb49e015196f2efb` |
| `mds.bs.datetimepicker.style.css` | `3a6d67d6b00a7b5381ef49755b6c3db58f39f005d0e1da258a6a254e95725838` |
| `mds.bs.datetimepicker.style.css.map` | `1829e63a6f5018845bcfbc51f6331624954adaefcb2c0bc7edd082b8de459f5f` |

The source maps reference only `webpack://md.bootstrappersiandatetimepicker/...` paths and embed
the MIT-licensed sources; they contain no machine paths.

## Checking a patch

To see which tests fail without the patches, serve the upstream files as `/dist`:

```powershell
git show v5.0.1:dist/mds.bs.datetimepicker.js > $env:TEMP\v501\mds.bs.datetimepicker.js
git show v5.0.1:dist/mds.bs.datetimepicker.style.css > $env:TEMP\v501\mds.bs.datetimepicker.style.css
$env:MDS_DIST_DIR = "$env:TEMP\v501"; $env:MDS_TEST_PORT = '4180'; npx playwright test
```

## Updating from upstream

1. `git fetch upstream --tags` and read the release notes and `git log v5.0.1..<new tag>`.
2. Create a new branch from the new tag and cherry-pick or re-apply these patches; do not
   merge the default branch.
3. `npm ci --ignore-scripts && npm run build && npm test` on the unpatched tag first, to see
   which reproductions upstream has fixed, then on the patched branch.
4. Drop a patch only when its reproduction passes on unpatched upstream.
5. Bump the build metadata (`+rased.2`), rebuild, commit `dist/`, push, and update the commit
   recorded in the consuming project.
