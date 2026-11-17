/**
 * dsh-session-boxes — Host half.
 *
 * Durable, custom-named "boxes" that classify workspace sessions without
 * changing the workspace they belong to. A session may sit in several boxes
 * at once. Box definitions and memberships live in one JSON file under the DSH
 * home, so they survive restarts, window reloads, and web-server port changes.
 * The browser half reads and writes them through a same-origin JSON route; the
 * `session_boxes` tool exposes the same data to agents.
 *
 * @module dsh-session-boxes
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Cordis plugin name. */
export const name = 'dsh-session-boxes'

/** Required Host services; the web route additionally waits for `webServer`. */
export const inject = ['tools']

/** Same-origin route the browser half talks to. */
const ROUTE = '/session-boxes'
/** File format version. */
const FILE_VERSION = 1
/** Request-body ceiling for the browser route. */
const MAX_BODY_BYTES = 256 * 1024
/** Upper bound on boxes; far beyond any practical sidebar. */
const MAX_BOXES = 100
/** Longest accepted box name, in characters. */
const MAX_NAME_LENGTH = 40
/** Longest accepted session id (session ids are UUIDs, far shorter). */
const MAX_SESSION_ID_LENGTH = 200
/** Upper bound on boxes a single session may join. */
const MAX_MEMBERSHIPS = 100
/** Palette ids the browser half knows how to paint. */
const COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'pink', 'cyan', 'gray']
const COLOR_SET = new Set(COLORS)
const HEADER_KEYS = ['count', 'pinned', 'subs', 'stars', 'todos', 'add', 'menu']
const DEFAULT_HEADER = Object.freeze({
  count: true,
  pinned: true,
  subs: true,
  stars: true,
  todos: true,
  add: true,
  menu: true,
})
const BOX_ID_PATTERN = /^b_[a-z0-9]{6,32}$/

/** Copy a header config, filling missing or invalid keys from the base. */
function readHeader(value, base = DEFAULT_HEADER, fallback = DEFAULT_HEADER) {
  const header = { ...base }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of HEADER_KEYS) {
      if (typeof value[key] === 'boolean') header[key] = value[key]
      else if (Object.hasOwn(value, key)) header[key] = fallback[key]
    }
  }
  return header
}

/** One warning sink that reports each distinct failure once. */
function createLogger() {
  const seen = new Set()
  return (message, error) => {
    const key = error === undefined ? message : `${message}: ${error?.code ?? error?.message ?? String(error)}`
    if (seen.has(key)) return
    seen.add(key)
    if (error !== undefined) console.warn(`[session-boxes] ${message}`, error)
    else console.warn(`[session-boxes] ${message}`)
  }
}

/** A fresh empty state. */
function emptyState() {
  return { boxes: [], memberships: {}, pins: {}, ungroupedCollapsed: false }
}

/** Trim and validate a box name. */
function readName(value) {
  if (typeof value !== 'string') return { ok: false, error: 'name must be a string' }
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length === 0) return { ok: false, error: 'name must not be empty' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `name must be at most ${MAX_NAME_LENGTH} characters` }
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: 'name must not contain control characters' }
  return { ok: true, name }
}

/** Validate a session id. */
function readSessionId(value) {
  if (typeof value !== 'string') return { ok: false, error: 'sessionId must be a string' }
  const sessionId = value.trim()
  if (sessionId.length === 0) return { ok: false, error: 'sessionId must not be empty' }
  if (sessionId.length > MAX_SESSION_ID_LENGTH) return { ok: false, error: `sessionId must be at most ${MAX_SESSION_ID_LENGTH} characters` }
  return { ok: true, sessionId }
}

/** Copy and validate the stored state, dropping anything unexpected. */
function normalizeState(raw) {
  const boxes = []
  const seen = new Set()
  const sourceBoxes = Array.isArray(raw?.boxes) ? raw.boxes : []
  for (const entry of sourceBoxes) {
    if (boxes.length >= MAX_BOXES) break
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const id = entry.id
    if (typeof id !== 'string' || !BOX_ID_PATTERN.test(id) || seen.has(id)) continue
    const name = readName(entry.name)
    if (!name.ok) continue
    seen.add(id)
    boxes.push({
      id,
      name: name.name,
      color: COLOR_SET.has(entry.color) ? entry.color : 'blue',
      collapsed: entry.collapsed === true,
      parentId: typeof entry.parentId === 'string' ? entry.parentId : null,
      order: Number.isFinite(Number(entry.order)) ? Math.floor(Number(entry.order)) : boxes.length,
      header: readHeader(entry.header),
    })
  }
  const byId = new Map(boxes.map((box) => [box.id, box]))
  for (const box of boxes) {
    const parent = box.parentId === null ? undefined : byId.get(box.parentId)
    box.parentId = parent !== undefined && parent.parentId === null && parent.id !== box.id ? parent.id : null
  }
  boxes.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
  const orderedBoxes = resequenceTree(boxes)

  const known = new Set(boxes.map((box) => box.id))
  const memberships = {}
  if (raw?.memberships !== null && typeof raw?.memberships === 'object' && !Array.isArray(raw?.memberships)) {
    for (const [sessionId, boxIds] of Object.entries(raw.memberships)) {
      if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) continue
      if (!Array.isArray(boxIds)) continue
      const kept = []
      for (const boxId of boxIds) {
        if (typeof boxId !== 'string' || !known.has(boxId) || kept.includes(boxId)) continue
        kept.push(boxId)
        if (kept.length >= MAX_MEMBERSHIPS) break
      }
      if (kept.length > 0) memberships[sessionId] = kept
    }
  }

  const pins = {}
  if (raw?.pins !== null && typeof raw?.pins === 'object' && !Array.isArray(raw?.pins)) {
    for (const [boxId, sessionIds] of Object.entries(raw.pins)) {
      if (!known.has(boxId) || !Array.isArray(sessionIds)) continue
      const kept = []
      for (const sessionId of sessionIds) {
        if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > MAX_SESSION_ID_LENGTH) continue
        if (kept.includes(sessionId)) continue
        const membership = memberships[sessionId]
        if (!Array.isArray(membership) || !membership.includes(boxId)) continue
        kept.push(sessionId)
        if (kept.length >= MAX_MEMBERSHIPS) break
      }
      if (kept.length > 0) pins[boxId] = kept
    }
  }

  return {
    boxes: orderedBoxes,
    memberships,
    pins,
    ungroupedCollapsed: raw?.ungroupedCollapsed === true,
  }
}

/** A deep copy safe for mutation. */
function cloneState(state) {
  const memberships = {}
  for (const [sessionId, boxIds] of Object.entries(state.memberships)) memberships[sessionId] = [...boxIds]
  const pins = {}
  for (const [boxId, sessionIds] of Object.entries(state.pins ?? {})) pins[boxId] = [...sessionIds]
  return {
    boxes: state.boxes.map((box) => ({ ...box, header: readHeader(box.header) })),
    memberships,
    pins,
    ungroupedCollapsed: state.ungroupedCollapsed,
  }
}

/** Sibling order of the whole box tree: each parent followed by its children. */
function treeOrder(boxes) {
  const byParent = new Map()
  for (const box of boxes) {
    const key = box.parentId ?? null
    const list = byParent.get(key)
    if (list === undefined) byParent.set(key, [box])
    else list.push(box)
  }
  for (const list of byParent.values()) {
    list.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
  }
  const ordered = []
  const walk = (parentId) => {
    const list = byParent.get(parentId)
    if (list === undefined) return
    for (const box of list) {
      ordered.push(box)
      walk(box.id)
    }
  }
  walk(null)
  return ordered
}

/** Resequence box order after inserts, deletes, moves, or reparenting. */
function resequenceTree(boxes) {
  const ordered = treeOrder(boxes)
  ordered.forEach((box, index) => {
    box.order = index
  })
  return ordered
}

/** Find one box by id. */
function findBox(state, boxId) {
  return state.boxes.find((box) => box.id === boxId)
}

/** Read a box id payload. */
function readBoxId(value) {
  if (typeof value !== 'string' || !BOX_ID_PATTERN.test(value)) return { ok: false, error: 'boxId is invalid' }
  return { ok: true, boxId: value }
}

/** Read an optional parent id; only one level of sub-boxes is allowed. */
function readParentId(value, state) {
  if (value === undefined || value === null) return { ok: true, parentId: null }
  const boxId = readBoxId(value)
  if (!boxId.ok) return boxId
  const parent = findBox(state, boxId.boxId)
  if (parent === undefined) return { ok: false, error: 'parent box not found' }
  if (parent.parentId !== null) return { ok: false, error: 'sub-boxes cannot be nested deeper' }
  return { ok: true, parentId: parent.id }
}

/**
 * Apply one mutation to a state copy.
 * @returns `{ ok: true, state }` or `{ ok: false, error }`.
 */
function applyMutation(current, action, payload) {
  const state = cloneState(current)
  const body = payload ?? {}

  if (action === 'create') {
    if (state.boxes.length >= MAX_BOXES) return { ok: false, error: `at most ${MAX_BOXES} boxes are allowed` }
    const name = readName(body.name)
    if (!name.ok) return name
    const color = body.color === undefined ? 'blue' : body.color
    if (!COLOR_SET.has(color)) return { ok: false, error: 'color is invalid' }
    const parent = readParentId(body.parentId, state)
    if (!parent.ok) return parent
    const box = {
      id: `b_${randomBytes(5).toString('hex')}`,
      name: name.name,
      color,
      collapsed: false,
      parentId: parent.parentId,
      order: state.boxes.length,
      header: readHeader(body.header),
    }
    state.boxes.push(box)
    state.boxes = resequenceTree(state.boxes)
    return { ok: true, state, boxId: box.id }
  }

  if (action === 'update') {
    const boxId = readBoxId(body.boxId)
    if (!boxId.ok) return boxId
    const box = findBox(state, boxId.boxId)
    if (box === undefined) return { ok: false, error: 'box not found' }
    if (body.name !== undefined) {
      const name = readName(body.name)
      if (!name.ok) return name
      box.name = name.name
    }
    if (body.color !== undefined) {
      if (!COLOR_SET.has(body.color)) return { ok: false, error: 'color is invalid' }
      box.color = body.color
    }
    if (body.collapsed !== undefined) {
      if (typeof body.collapsed !== 'boolean') return { ok: false, error: 'collapsed must be a boolean' }
      box.collapsed = body.collapsed
    }
    if (body.header !== undefined) {
      box.header = readHeader(body.header, box.header, DEFAULT_HEADER)
    }
    if (body.parentId !== undefined) {
      const parent = readParentId(body.parentId, state)
      if (!parent.ok) return parent
      if (parent.parentId === box.id) return { ok: false, error: 'a box cannot be its own parent' }
      if (parent.parentId !== box.parentId) {
        if (state.boxes.some((child) => child.parentId === box.id)) {
          return { ok: false, error: 'a box with sub-boxes cannot become a sub-box' }
        }
        box.parentId = parent.parentId
        box.order = state.boxes.length
        state.boxes = resequenceTree(state.boxes)
      }
    }
    return { ok: true, state }
  }

  if (action === 'move') {
    const boxId = readBoxId(body.boxId)
    if (!boxId.ok) return boxId
    const box = findBox(state, boxId.boxId)
    if (box === undefined) return { ok: false, error: 'box not found' }
    const siblings = state.boxes
      .filter((entry) => entry.parentId === box.parentId)
      .sort((left, right) => left.order - right.order)
    const from = siblings.indexOf(box)
    let to
    if (body.toIndex !== undefined) {
      if (!Number.isInteger(body.toIndex) || body.toIndex < 0 || body.toIndex >= siblings.length) {
        return { ok: false, error: 'toIndex is out of range' }
      }
      to = body.toIndex
    } else if (body.delta !== undefined) {
      if (!Number.isInteger(body.delta) || Math.abs(body.delta) > MAX_BOXES) return { ok: false, error: 'delta is invalid' }
      to = Math.max(0, Math.min(siblings.length - 1, from + body.delta))
    } else {
      return { ok: false, error: 'move needs toIndex or delta' }
    }
    siblings.splice(from, 1)
    siblings.splice(to, 0, box)
    siblings.forEach((entry, position) => {
      entry.order = position
    })
    state.boxes = resequenceTree(state.boxes)
    return { ok: true, state }
  }

  if (action === 'delete') {
    const boxId = readBoxId(body.boxId)
    if (!boxId.ok) return boxId
    const index = state.boxes.findIndex((box) => box.id === boxId.boxId)
    if (index < 0) return { ok: false, error: 'box not found' }
    for (const child of state.boxes) {
      if (child.parentId === boxId.boxId) child.parentId = null
    }
    state.boxes.splice(index, 1)
    state.boxes = resequenceTree(state.boxes)
    delete state.pins[boxId.boxId]
    for (const [sessionId, boxIds] of Object.entries(state.memberships)) {
      const kept = boxIds.filter((id) => id !== boxId.boxId)
      if (kept.length === 0) delete state.memberships[sessionId]
      else state.memberships[sessionId] = kept
    }
    return { ok: true, state }
  }

  if (action === 'setMemberships') {
    const sessionId = readSessionId(body.sessionId)
    if (!sessionId.ok) return sessionId
    if (!Array.isArray(body.boxIds)) return { ok: false, error: 'boxIds must be an array' }
    const known = new Set(state.boxes.map((box) => box.id))
    const kept = []
    for (const boxId of body.boxIds) {
      if (typeof boxId !== 'string' || !known.has(boxId) || kept.includes(boxId)) continue
      kept.push(boxId)
      if (kept.length >= MAX_MEMBERSHIPS) break
    }
    if (kept.length === 0) delete state.memberships[sessionId.sessionId]
    else state.memberships[sessionId.sessionId] = kept
    for (const [pinnedBoxId, pinnedIds] of Object.entries(state.pins)) {
      if (kept.includes(pinnedBoxId)) continue
      const filtered = pinnedIds.filter((id) => id !== sessionId.sessionId)
      if (filtered.length === 0) delete state.pins[pinnedBoxId]
      else state.pins[pinnedBoxId] = filtered
    }
    return { ok: true, state }
  }

  if (action === 'addMembership') {
    const sessionId = readSessionId(body.sessionId)
    if (!sessionId.ok) return sessionId
    const boxId = readBoxId(body.boxId)
    if (!boxId.ok) return boxId
    if (findBox(state, boxId.boxId) === undefined) return { ok: false, error: 'box not found' }
    const currentIds = state.memberships[sessionId.sessionId] ?? []
    if (!currentIds.includes(boxId.boxId)) {
      if (currentIds.length >= MAX_MEMBERSHIPS) return { ok: false, error: `at most ${MAX_MEMBERSHIPS} boxes per session are allowed` }
      state.memberships[sessionId.sessionId] = [...currentIds, boxId.boxId]
    }
    return { ok: true, state }
  }

  if (action === 'removeMembership') {
    const sessionId = readSessionId(body.sessionId)
    if (!sessionId.ok) return sessionId
    const boxId = readBoxId(body.boxId)
    if (!boxId.ok) return boxId
    const currentIds = state.memberships[sessionId.sessionId] ?? []
    const kept = currentIds.filter((id) => id !== boxId.boxId)
    if (kept.length === 0) delete state.memberships[sessionId.sessionId]
    else state.memberships[sessionId.sessionId] = kept
    const pinned = state.pins[boxId.boxId] ?? []
    const keptPins = pinned.filter((id) => id !== sessionId.sessionId)
    if (keptPins.length === 0) delete state.pins[boxId.boxId]
    else state.pins[boxId.boxId] = keptPins
    return { ok: true, state }
  }

  if (action === 'clear') {
    const sessionId = readSessionId(body.sessionId)
    if (!sessionId.ok) return sessionId
    delete state.memberships[sessionId.sessionId]
    for (const [pinnedBoxId, pinnedIds] of Object.entries(state.pins)) {
      const kept = pinnedIds.filter((id) => id !== sessionId.sessionId)
      if (kept.length === 0) delete state.pins[pinnedBoxId]
      else state.pins[pinnedBoxId] = kept
    }
    return { ok: true, state }
  }

  if (action === 'setBoxPin') {
    const boxId = readBoxId(body.boxId)
    if (!boxId.ok) return boxId
    const sessionId = readSessionId(body.sessionId)
    if (!sessionId.ok) return sessionId
    if (typeof body.pinned !== 'boolean') return { ok: false, error: 'pinned must be a boolean' }
    if (findBox(state, boxId.boxId) === undefined) return { ok: false, error: 'box not found' }
    const membership = state.memberships[sessionId.sessionId] ?? []
    if (!membership.includes(boxId.boxId)) return { ok: false, error: 'session is not in that box' }
    const current = state.pins[boxId.boxId] ?? []
    if (body.pinned) {
      state.pins[boxId.boxId] = [sessionId.sessionId, ...current.filter((id) => id !== sessionId.sessionId)]
    } else {
      const kept = current.filter((id) => id !== sessionId.sessionId)
      if (kept.length === 0) delete state.pins[boxId.boxId]
      else state.pins[boxId.boxId] = kept
    }
    return { ok: true, state }
  }

  if (action === 'setUngroupedCollapsed') {
    if (typeof body.collapsed !== 'boolean') return { ok: false, error: 'collapsed must be a boolean' }
    state.ungroupedCollapsed = body.collapsed
    return { ok: true, state }
  }

  return { ok: false, error: `unknown action "${String(action)}"` }
}

/** Ordered rating-like rows for the agent tool. */
function boxRows(state) {
  return state.boxes.map((box) => ({
    boxId: box.id,
    name: box.name,
    color: box.color,
    order: box.order,
    collapsed: box.collapsed,
    parentId: box.parentId ?? null,
    depth: box.parentId === null || box.parentId === undefined ? 0 : 1,
    header: readHeader(box.header),
    childCount: state.boxes.filter((child) => child.parentId === box.id).length,
    count: Object.values(state.memberships).filter((boxIds) => boxIds.includes(box.id)).length,
    pinnedCount: (state.pins[box.id] ?? []).length,
  }))
}

/**
 * One durable boxes state backed by a single JSON file.
 * Reads are served from memory after the first load; writes are serialized
 * and published atomically (temporary file, then rename).
 */
function createStore(file, log) {
  let state = emptyState()
  let loaded = null
  let writeChain = Promise.resolve()

  function load() {
    if (loaded !== null) return loaded
    loaded = (async () => {
      try {
        const text = await readFile(file, 'utf8')
        state = normalizeState(JSON.parse(text))
      } catch (error) {
        if (error?.code !== 'ENOENT') log(`could not read ${file}`, error)
      }
    })()
    return loaded
  }

  function persist() {
    const body = JSON.stringify({
      version: FILE_VERSION,
      updatedAt: Date.now(),
      boxes: state.boxes,
      memberships: state.memberships,
      pins: state.pins,
      ungroupedCollapsed: state.ungroupedCollapsed,
    }, null, 2)
    writeChain = writeChain
      .then(async () => {
        await mkdir(dirname(file), { recursive: true })
        const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
        await writeFile(temporary, body, 'utf8')
        await rename(temporary, file)
      })
      .catch((error) => {
        log(`could not write ${file}`, error)
      })
    return writeChain
  }

  return {
    load,
    snapshot: () => cloneState(state),
    async mutate(action, payload) {
      await load()
      const result = applyMutation(state, action, payload)
      if (!result.ok) return result
      state = result.state
      await persist()
      return { ok: true, state: cloneState(state), boxId: result.boxId }
    },
  }
}

/** Answer one JSON response with no-store caching. */
function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  response.end(body)
}

/** Read a bounded UTF-8 request body. */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

/** Refuse a cross-site POST; same-origin requests and plain HTTP clients pass. */
function isAcceptableOrigin(request) {
  const origin = request.headers.origin
  if (origin === undefined) return true
  if (origin === 'null') return false
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

/** The browser-facing JSON route: GET the state, POST one mutation. */
function createRouteHandler(store, log) {
  return async function handleSessionBoxes(request, response) {
    try {
      if (!isAcceptableOrigin(request)) {
        sendJson(response, 403, { ok: false, error: 'cross-origin request refused' })
        return
      }
      if (request.method === 'GET') {
        await store.load()
        sendJson(response, 200, { ok: true, state: store.snapshot() })
        return
      }
      if (request.method === 'POST') {
        let payload
        try {
          payload = JSON.parse(await readBody(request, MAX_BODY_BYTES))
        } catch (error) {
          sendJson(response, 400, {
            ok: false,
            error: error.message === 'request body is too large' ? error.message : 'invalid JSON body',
          })
          return
        }
        const action = payload?.action
        if (typeof action !== 'string' || action.length === 0) {
          sendJson(response, 400, { ok: false, error: 'action must be a non-empty string' })
          return
        }
        const result = await store.mutate(action, payload)
        if (!result.ok) {
          sendJson(response, 400, { ok: false, error: result.error })
          return
        }
        sendJson(response, 200, { ok: true, state: result.state, boxId: result.boxId })
        return
      }
      response.writeHead(405, { allow: 'GET, POST', 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
    } catch (error) {
      log('request failed', error)
      try {
        sendJson(response, 500, { ok: false, error: 'internal error' })
      } catch {
        response.destroy()
      }
    }
  }
}

/** The `session_boxes` agent tool over the same store. */
function createTool(store) {
  return {
    name: 'session_boxes',
    description: 'Read or change the user\'s custom session boxes in the workspace sidebar. Boxes classify sessions without moving them between workspaces; one session may sit in several boxes. Use action "list" to read boxes, memberships, and per-box pins; "create" to add a box; "rename"/"update" to edit it (including the optional header visibility object); "delete" to remove it; "move" to reorder; "assign" to set a session\'s boxes; "unassign" to remove one box; "clear" to empty a session; "pin"/"unpin" to pin a session to the top of one box without touching the native global pin; and "collapse" to fold or unfold a box.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'rename', 'update', 'delete', 'move', 'assign', 'unassign', 'clear', 'pin', 'unpin', 'collapse'],
          description: 'Operation to perform.',
        },
        boxId: { type: 'string', description: 'Target box id; required by rename, update, delete, move, unassign, pin, unpin, and collapse.' },
        parentId: { type: 'string', description: 'Optional parent box id for create or update; omit or null for a top-level box. Only one level of sub-boxes is allowed.' },
        name: { type: 'string', description: 'Box name for create, rename, and update.' },
        color: { type: 'string', enum: COLORS, description: 'Palette id for create and update.' },
        sessionId: { type: 'string', description: 'Target session id for assign, unassign, clear, pin, and unpin.' },
        boxIds: { type: 'array', items: { type: 'string' }, description: 'Complete box id list for assign.' },
        toIndex: { type: 'number', description: 'Zero-based destination for move.' },
        collapsed: { type: 'boolean', description: 'Folded state for collapse.' },
        header: {
          type: 'object',
          description: 'Optional per-box header visibility. Omitted keys keep their current value; a missing header means all items are shown.',
          properties: {
            count: { type: 'boolean', description: 'Show the session count badge.' },
            pinned: { type: 'boolean', description: 'Show the per-box pinned count.' },
            subs: { type: 'boolean', description: 'Show the sub-box count.' },
            stars: { type: 'boolean', description: 'Show the average member stars.' },
            todos: { type: 'boolean', description: 'Show the completed / total todos.' },
            add: { type: 'boolean', description: 'Show the add-sub-box button.' },
            menu: { type: 'boolean', description: 'Show the box menu button.' },
          },
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const action = args?.action
      await store.load()
      if (action === 'list') {
        const state = store.snapshot()
        return {
          ok: true,
          action: 'list',
          boxes: boxRows(state),
          ungroupedCollapsed: state.ungroupedCollapsed,
          memberships: state.memberships,
          pins: state.pins,
        }
      }
      if (action === 'assign') {
        const result = await store.mutate('setMemberships', { sessionId: args?.sessionId, boxIds: args?.boxIds })
        return result.ok
          ? { ok: true, action, sessionId: args?.sessionId, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'unassign') {
        const result = await store.mutate('removeMembership', { sessionId: args?.sessionId, boxId: args?.boxId })
        return result.ok
          ? { ok: true, action, sessionId: args?.sessionId, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'clear') {
        const result = await store.mutate('clear', { sessionId: args?.sessionId })
        return result.ok
          ? { ok: true, action, sessionId: args?.sessionId, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'create') {
        const result = await store.mutate('create', { name: args?.name, color: args?.color, parentId: args?.parentId, header: args?.header })
        return result.ok
          ? { ok: true, action, boxId: result.boxId, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'rename') {
        const result = await store.mutate('update', { boxId: args?.boxId, name: args?.name })
        return result.ok
          ? { ok: true, action, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'update') {
        const result = await store.mutate('update', { boxId: args?.boxId, name: args?.name, color: args?.color, parentId: args?.parentId, header: args?.header })
        return result.ok
          ? { ok: true, action, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'delete') {
        const result = await store.mutate('delete', { boxId: args?.boxId })
        return result.ok
          ? { ok: true, action, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'move') {
        const result = await store.mutate('move', { boxId: args?.boxId, toIndex: args?.toIndex })
        return result.ok
          ? { ok: true, action, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      if (action === 'pin' || action === 'unpin') {
        const result = await store.mutate('setBoxPin', {
          boxId: args?.boxId,
          sessionId: args?.sessionId,
          pinned: action === 'pin',
        })
        return result.ok
          ? { ok: true, action, boxes: boxRows(result.state), pins: result.state.pins }
          : { ok: false, error: result.error }
      }
      if (action === 'collapse') {
        const result = await store.mutate('update', { boxId: args?.boxId, collapsed: args?.collapsed })
        return result.ok
          ? { ok: true, action, boxes: boxRows(result.state) }
          : { ok: false, error: result.error }
      }
      return { ok: false, error: `unknown action "${String(action)}"` }
    },
  }
}

/**
 * Register the durable boxes file, its browser route, and the agent tool.
 * @param ctx - Host context carrying the tool registry.
 */
export function apply(ctx) {
  const homePath = ctx.get('dshHomePath')
  const file = typeof homePath === 'function'
    ? homePath('session-boxes.json')
    : join(homedir(), '.dsh', 'session-boxes.json')
  const log = createLogger()
  const store = createStore(file, log)

  ctx.effect(() => ctx.tools.register(createTool(store)), 'session-boxes: agent tool')

  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ROUTE, handler: createRouteHandler(store, log) }),
      'session-boxes: browser route',
    )
  })
}
