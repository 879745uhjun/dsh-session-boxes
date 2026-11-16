# Changelog

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
