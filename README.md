# dsh-session-boxes

Custom-named session boxes and one-level sub-boxes for the DeepSeek Harness workspace sidebar.

English | [中文](README.zh.md)

## What it does

Sessions in one workspace can be classified into named, colored boxes without changing the workspace they belong to. A top-level box can contain one level of sub-boxes (folders), so “前端” can hold “组件” and “构建” inside it. The native sidebar rows keep their stars, status dots, hover cards, pin and archive actions, and menus; the plugin inserts collapsible box headers between the rows and orders the rows under those headers.

A session lives in exactly one box or sub-box at a time. Moving it elsewhere removes it from the previous box, so it never appears twice and no mirrored rows are needed.

- **Boxes and one-level sub-boxes** — create, rename inline, recolor, reorder, delete; a parent delete promotes its sub-boxes to the top level. The parent frame runs continuously around its sub-boxes: sub-boxes are inset inside the same card instead of floating as separate cards.
- **Single location** — choose one box or sub-box from the row menu; “Ungrouped” clears the location. The old location is replaced.
- **Per-box pin** — pin a session to the top of one box or sub-box from that box's settings; it does not touch the native global pin. Pinned rows sort first, carry a colored pin badge in the box header, and use a stronger tint, a double colored spine, and a top accent instead of an extra row icon, so they stay recognizable without taking horizontal space. The row's “...” menu offers **Unpin inside <box>** so a pinned session can be released and reordered.
- **Drag to reorder** — drag a box header onto another header at the same level to change the custom order. Sub-boxes reorder among their siblings; the manager and box settings also have up/down buttons.
- **Drag sessions** — drag a session row onto a box header to move it there; drop it on **Ungrouped** to clear its location.
- **Manager** — the box button in the workspace section header (beside search, view options, and add workspace) opens a manager for the whole tree: create top-level boxes, add a sub-box with `+`, rename/recolor/reorder/delete, and open a box's settings.
- **Theme-aware controls** — buttons, inputs, and badges use the DSH theme tokens, so they stay readable in dark and light themes.
- **Durable** — boxes, sub-boxes, memberships, and per-box pins live in `~/.dsh/session-boxes.json` on the Host.
- **Agent tool** — `session_boxes` can list, create (with `parentId`), rename, delete, move, assign, pin, unpin, and collapse boxes.

Blank **New Session** rows, and pinned sessions that have no box, stay on top. A pinned session that belongs to a box is shown inside that box and sorts first, keeping its native pin marker. The native “Show more” watermark expands automatically while boxes are in use; choosing “Show less” yourself is respected.

## Install

This package is a DSH bundle (`dsh.bundle.patch`). Install the directory with the Plugin Manager:

1. Ask the DSH agent to install this bundle from the project directory (it calls `plugin_manager` with `action: install_bundle` and the absolute package path).
2. Reload the Web UI page.

## Use

- **Move a session**: open the row's `...` menu → **Move to session box…** → choose one box or sub-box (or Ungrouped). A new top-level box can be created from the same dialog.
- **Manage the tree**: click the box button in the workspace section header. Use `+` on a top-level row to create a sub-box; “设置” opens name, color, parent, order, delete, members, and pin controls.
- **Reorder boxes**: drag a box header onto another header at the same level, or use the manager's ↑/↓ buttons. In a box's settings, the parent selector moves a child between levels.
- **Pin inside a box**: open the box's `⋯` settings and click the pin at the right of a member. The session moves to the top of that box only.
- **Collapse**: click the chevron (or the box name). Collapsing a parent hides its direct rows and its sub-box cards.

## Notes and limitations

- Sub-boxes are limited to one level; a box with sub-boxes cannot itself become a sub-box.
- Grouping applies to the default **WorkSpace** / **Workspace Tree** sidebar views. The flat “In one list” view and the search result list keep their native order.
- A box with no members in the current workspace is shown only while one workspace section is visible.
- Sessions are never moved between workspaces or deleted by this plugin.

## Data

`~/.dsh/session-boxes.json`:

```json
{
  "version": 1,
  "boxes": [
    { "id": "b_ab12cd34ef", "name": "前端", "color": "blue", "collapsed": false, "parentId": null, "order": 0 },
    { "id": "b_ff00aa11bb", "name": "组件", "color": "green", "collapsed": false, "parentId": "b_ab12cd34ef", "order": 1 }
  ],
  "memberships": { "session-…": ["b_ff00aa11bb"] },
  "pins": { "b_ff00aa11bb": ["session-…"] },
  "ungroupedCollapsed": false
}
```

## Development

```sh
node test/host.test.mjs        # Host store, tree mutations, route, tool
node test/client.dom.test.mjs  # grouping engine in Chromium (Playwright)
```

The Host test covers the durable store, one-level tree validation, promotion on delete, sibling moves, per-box pins, validation, the JSON route, the cross-origin fence, the agent tool, and persistence across remounts. The DOM test loads the real `client.js` with a stubbed Module Loader and a mock sidebar that mirrors the ui-workspace markup, including its hover-card wrapper.

## License

MIT
