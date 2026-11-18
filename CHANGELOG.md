# Changelog

## 0.7.0

- Add a global header configuration (`header` at the state root) plus a per-box
  `headerOverride`. Boxes without an override follow the global header; box
  settings can uncheck “Use global header” to configure one box separately.
- The manager edits the global header and has **Make all follow global**; new
  boxes inherit the global header. Compact mode still means chevron + count +
  menu.
- Migration: a 0.6.0 box with a non-default header and no `headerOverride` is
  treated as an override; default/missing headers join the global setting.
- `session_boxes` returns the global header, exposes `headerOverride`, and adds
  `setGlobalHeader`; schema/root-key assertions updated.
- Host and DOM tests cover global inheritance, per-box override, migration,
  persistence, and the existing default/compact/all-off behavior.

## 0.6.0

- Per-box `header` config: count, pinned, subs, stars, todos, add, and menu can be
  hidden independently; the chevron is always kept and hidden items are not
  rendered at all. Missing fields mean all items (old data needs no migration);
  invalid values fall back to the default.
- Box settings has seven checkboxes and a **Compact mode** button (chevron + count
  + menu). The manager stores a default for new boxes and can apply it to all
  boxes; new boxes use the saved default.
- The `session_boxes` tool accepts and returns `header`, and its schema exposes
  the seven boolean fields.
- Host and DOM tests cover defaults, hidden/no-placeholder, compact/all-off, old
  data, invalid values, collapsed headers, and persistence.

## 0.5.1

- Move the box palette from JS hex constants to paired `--dshc-*` CSS variables:
  light values on `:root`, dark values under `body[data-ds-dark-theme]`.
  `COLORS` keeps names only; `COLOR_HEX` is gone.
- Use `var(--dsb-color, var(--dshc-gray))` for headers, dots, swatches, and drop
  indicators; remove hardcoded hex fallbacks from the stylesheet.
- Raise the header overlay mix in dark mode (18%→24%, 45%→52%); light mode stays
  18%/45%.
- Add a static palette assertion (no bare hex outside the palette, all eight
  light/dark pairs, no `prefers-color-scheme`) and a runtime light/dark check.

## 0.5.0

- Box headers show aggregate badges: average member stars (`★ 4.2`) from
  `GET /session-stars`, and completed / total todos (`☑ 3/7`) from
  `GET /session-todos`. A parent box includes its sub-box members.
- Both segments hide independently when they have no data; a 404, 1.5 s timeout,
  or bad JSON leaves the header unchanged. The routes are read-only same-origin
  GETs; the other plugins are never imported.
- Stats load on mount and refetch on window focus; membership and order changes
  recompute from the cached snapshot. No polling and no SSE.
- `npm test` now runs both the Host test and the Chromium DOM test.

## 0.4.10

- The `session_boxes` agent tool now registers its `parameters` as a JSON Schema
  object root (`type` / `properties` / root-level `required: ['action']`) instead
  of a bare property table. A bare table is forwarded verbatim to the model API,
  where a property named after a schema keyword (`title`, `default`, `enum`, …)
  fails the whole request with HTTP 400, and a property-level `required: true` is
  rejected as well. The shape is pinned by assertions in `test/host.test.mjs`.

## 0.4.9

- The session row menu now exposes one **Box settings** entry; “Move to session
  box…” and the box-scoped pin/unpin action live in its submenu.
- The submenu uses the shared context-menu service, so it gets native keyboard
  navigation, icons, and viewport positioning.

## 0.4.8

- The session row menu now offers a box-scoped **Pin inside <box>** item when the
  session belongs to a box, matching the existing unpin item. Pinning is still
  available from the box settings member list.

## 0.4.7

- Removed the trailing pin icon from per-box pinned rows so it no longer takes
  horizontal space.
- Pinned rows now use a stronger tint, a double colored left spine, and a top
  accent line; the box header keeps the pin count and the row menu keeps the
  box-scoped unpin action.

## 0.4.6

- A per-box pinned session now shows a pin marker in its own row, not only in the
  box header.
- The session row menu offers a box-scoped “Unpin inside <box>” item when the
  session is pinned in its current box, so it can be released and reordered.
- Pinned sessions that belong to a box are grouped inside that box; pinned
  sessions without a box stay on top.

## 0.4.5

- Pinned sessions can now be moved into boxes and sub-boxes. Membership takes
  precedence over the native pin; pinned sessions with no box still stay on top.
- A pinned session inside a box sorts first in that box and keeps its native pin
  marker.
- Moving a session into a collapsed box (or a box inside a collapsed parent)
  expands the target so the move is visible.
- Session titles in the box-settings member list and the location dialog now use
  the full row width, wrap instead of truncating, and fall back to the session id
  when no title is available.
- The “Move to session box…” row-menu item now carries the plugin's box icon.

## 0.4.0

- One-level sub-boxes (folders) with create, rename, recolor, parent change,
  sibling reorder, and promotion of children when a parent is deleted.
- The parent card frame now runs continuously around its sub-boxes; sub-boxes are
  inset inside the same frame instead of floating as separate cards.
- Sessions live in exactly one box or sub-box; choosing a new location moves the
  session instead of duplicating a mirrored row.
- Per-box pinning: pin a session to the top of one box without touching the
  native global pin.
- Box headers are draggable to reorder siblings; the manager and box settings
  also expose up/down and a parent selector.
- Theme-aware primary/secondary/danger buttons using DSH theme tokens.
- Box manager button in the workspace section header; manager supports creating
  top-level boxes and sub-boxes, settings, reorder, and delete.

## 0.1.0

- Initial release: durable custom session boxes in the workspace sidebar,
  custom names and colors, drag or menu assignment, collapse, and the
  `session_boxes` agent tool.
