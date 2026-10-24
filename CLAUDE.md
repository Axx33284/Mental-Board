# CLAUDE.md

## Read `MAP.md` first

The app is `src/js/*.js` (26 scripts) and `src/css/*.css` (9 sheets), with
`src/main.js`, `src/store.js` (the My Boards folder), `src/sdocx.js` (Samsung
Notes files) and `src/preload.js`. `MAP.md`
§4 and §5 say which file holds what — use them instead of grepping the whole
tree. It also covers how to run, how the one-copy build works, and the traps
that have already bitten a session.

**Update `MAP.md` in the same change whenever you move code between files or
add a feature.**

## Hard rules for this repo

- Plain HTML/CSS/JS on Electron. No framework, no bundler, no build step. Do
  not introduce one.
- **Everything the app ships lives in `src/`.** `tools/` and `admin/` are never
  packaged. A new runtime file goes in `src/`; a new script does not.
- Mutate `state` → call the matching `render*()`/`draw*()` → call `saveSoon()`.
  Nothing is reactive.
- Every board is a folder in `Documents\My Boards` and is written on its own
  (`src/store.js`, MAP.md §3). `boardPayload()` serialises the whole board and
  `settingsPayload()` the settings, so a new field persists automatically. Add
  it to `makeBoard()` / `defaults()` and heal it in `adoptBoard()` / `adopt()`.
- A file a board carries is `mbf://<boardId>/<name>`, served by main from the
  board's own `files\` folder. Never write a path into a note.
- **The two load orders in `index.html` are load-bearing.** The scripts share one
  global scope and may only read a `const` from a file above them at load time;
  the stylesheets are one append-only cascade split into nine, so `mental.css`
  beats `tokens.css` because of where its `<link>` sits. Add CSS to the end of
  the last sheet (`mental.css`). Nothing may keep a second copy of either order
  — the checks parse `index.html` through `tools/app-source.js`.
- Notes and frames live in **world** coordinates. Never write screen pixels
  into `state`. `toWorld()` / `toScreen()` are the only converters, and
  `toScreen()` is viewport-relative (the titlebar is 38px).
- The editor is `document.execCommand`. Before "fixing" its output, read
  `MAP.md` §7 — the three worst behaviours already have named workarounds
  (`normalizeBody`, `insertTodo`, `escapeList`).
- Verify UI changes by actually launching the app (MAP.md §6), not by reasoning
  about the CSS. Use a throwaway `--user-data-dir` so real user data is safe.
- The user's boards live in `Documents\My Boards\` (and a 1.x `board.json` may
  still sit in `%APPDATA%/Mental Board/`). Never delete or rewrite either while
  testing — `npm run sandbox` keeps its own `My Boards` inside `.sandbox\`.

## Two rules 1.4 exists because of

Both of these were violated in 1.3 and cost the user their notes. Neither is
theoretical.

- **A store call that returns a status must have that status acted on.**
  `mbData.save()` catches its own errors and returns `{ ok, errors: [{ id,
  error }] }` per board — it never throws, so wrapping it in `try/catch` and
  assuming success is how a silent write failure disabled saving for a whole
  session. See `writeNow()` and `MAP.md` §7.
- **There is exactly one copy of the built app, at `App/Mental Board.exe`.**
  No installer, no auto-updater, no portable target, no publish feed, and no
  shortcut — the build must not create one. Two builds on one machine are not
  merely confusing: they share the single-instance lock (it is keyed to the
  pinned userData path), so the older one silently swallows the newer one's
  launch — it is not inert, it is a running app wearing the new one's launch.
  If you are tempted to add any of them back, read `MAP.md` §6 first.
