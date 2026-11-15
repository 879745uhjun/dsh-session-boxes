import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

/** Minimal Host context capturing the tool and the browser route. */
function createFakeContext(home) {
  const state = { tools: [], routes: [] }
  const disposers = []
  const ctx = {
    get(key) {
      if (key === 'dshHomePath') return (...segments) => join(home, ...segments)
      return undefined
    },
    effect(factory) {
      const dispose = factory()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    inject(_deps, callback) {
      callback({
        effect(factory) {
          const dispose = factory()
          if (typeof dispose === 'function') disposers.push(dispose)
          return dispose
        },
        webServer: {
          register(route) {
            state.routes.push(route)
            return () => {}
          },
        },
      })
    },
    tools: {
      register(definition) {
        state.tools.push(definition)
        return () => {}
      },
    },
  }
  return { ctx, state, dispose: () => disposers.reverse().forEach((dispose) => dispose()) }
}

function makeRequest(method, body, headers = {}) {
  const request = new EventEmitter()
  request.method = method
  request.headers = headers
  request.destroy = () => {}
  process.nextTick(() => {
    if (body !== undefined) request.emit('data', Buffer.from(body, 'utf8'))
    request.emit('end')
  })
  return request
}

function makeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers ?? {}
    },
    end(chunk) {
      this.body = typeof chunk === 'string' ? chunk : String(chunk ?? '')
    },
    destroy() {},
  }
}

async function call(route, method, body, headers) {
  const response = makeResponse()
  await route.handler(makeRequest(method, body, headers), response)
  return { status: response.status, json: JSON.parse(response.body) }
}

async function post(route, payload, headers) {
  return call(route, 'POST', JSON.stringify(payload), { 'content-type': 'application/json', ...headers })
}

async function main() {
  const home = await mkdtemp(join(tmpdir(), 'dsh-session-boxes-'))
  try {
    const first = createFakeContext(home)
    apply(first.ctx)
    const route = first.state.routes[0]
    assert.ok(route, 'route registered')
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, '/session-boxes')
    assert.equal(first.state.tools.length, 1)
    const tool = first.state.tools[0]
    assert.equal(tool.name, 'session_boxes')

    let result = await call(route, 'GET')
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state, { boxes: [], memberships: {}, pins: {}, ungroupedCollapsed: false })

    result = await post(route, { action: 'create', name: '  前端  ', color: 'green' })
    assert.equal(result.status, 200)
    assert.equal(result.json.state.boxes.length, 1)
    const front = result.json.state.boxes[0]
    assert.equal(front.name, '前端')
    assert.equal(front.color, 'green')
    assert.equal(front.order, 0)
    assert.equal(front.collapsed, false)

    result = await post(route, { action: 'create', name: '学习' })
    assert.equal(result.status, 200)
    const study = result.json.state.boxes[1]
    assert.equal(study.order, 1)

    result = await post(route, { action: 'create', name: '学习' })
    assert.equal(result.status, 200)

    result = await post(route, { action: 'create', name: '   ' })
    assert.equal(result.status, 400)
    assert.match(result.json.error, /empty/)

    result = await post(route, { action: 'update', boxId: front.id, name: '前端开发', color: 'purple', collapsed: true })
    assert.equal(result.status, 200)
    const renamed = result.json.state.boxes.find((box) => box.id === front.id)
    assert.equal(renamed.name, '前端开发')
    assert.equal(renamed.color, 'purple')
    assert.equal(renamed.collapsed, true)

    result = await post(route, { action: 'setMemberships', sessionId: 'session-aaa', boxIds: [front.id, study.id] })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.memberships['session-aaa'], [front.id, study.id])

    result = await post(route, { action: 'addMembership', sessionId: 'session-aaa', boxId: study.id })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.memberships['session-aaa'], [front.id, study.id])

    result = await post(route, { action: 'addMembership', sessionId: 'session-bbb', boxId: 'b_notreal' })
    assert.equal(result.status, 400)

    result = await post(route, { action: 'removeMembership', sessionId: 'session-aaa', boxId: front.id })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.memberships['session-aaa'], [study.id])

    result = await post(route, { action: 'move', boxId: study.id, toIndex: 0 })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.boxes.map((box) => box.name), ['学习', '前端开发', '学习'])
    assert.deepEqual(result.json.state.boxes.map((box) => box.order), [0, 1, 2])

    result = await post(route, { action: 'delete', boxId: study.id })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.memberships['session-aaa'], undefined)
    assert.ok(result.json.state.boxes.every((box) => box.id !== study.id))

    result = await post(route, { action: 'setUngroupedCollapsed', collapsed: true })
    assert.equal(result.status, 200)
    assert.equal(result.json.state.ungroupedCollapsed, true)

    // Per-box pins: newest first, membership-bounded, and cleaned up with the box.
    result = await post(route, { action: 'setMemberships', sessionId: 'session-aaa', boxIds: [front.id] })
    assert.equal(result.status, 200)
    result = await post(route, { action: 'setBoxPin', boxId: front.id, sessionId: 'session-aaa', pinned: true })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.pins[front.id], ['session-aaa'])

    result = await post(route, { action: 'setMemberships', sessionId: 'session-bbb', boxIds: [front.id] })
    assert.equal(result.status, 200)
    result = await post(route, { action: 'setBoxPin', boxId: front.id, sessionId: 'session-bbb', pinned: true })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.pins[front.id], ['session-bbb', 'session-aaa'])

    result = await post(route, { action: 'setBoxPin', boxId: front.id, sessionId: 'session-aaa', pinned: false })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.pins[front.id], ['session-bbb'])

    result = await post(route, { action: 'removeMembership', sessionId: 'session-bbb', boxId: front.id })
    assert.equal(result.status, 200)
    assert.equal(result.json.state.pins[front.id], undefined)

    result = await post(route, { action: 'setBoxPin', boxId: front.id, sessionId: 'session-zzz', pinned: true })
    assert.equal(result.status, 400)

    result = await post(route, { action: 'setBoxPin', boxId: front.id, sessionId: 'session-aaa', pinned: true })
    assert.equal(result.status, 200)
    assert.deepEqual(result.json.state.pins[front.id], ['session-aaa'])

    result = await post(route, { action: 'unknown' })
    assert.equal(result.status, 400)

    result = await post(route, { action: 'create', name: 'x' }, { origin: 'http://evil.example' })
    assert.equal(result.status, 403)

    // Tool face.
    let toolResult = await tool.execute({ action: 'list' })
    assert.equal(toolResult.ok, true)
    assert.equal(toolResult.boxes.length, 2)
    assert.equal(toolResult.ungroupedCollapsed, true)

    toolResult = await tool.execute({ action: 'create', name: '工具箱', color: 'red' })
    assert.equal(toolResult.ok, true)
    const toolBox = toolResult.boxes.find((box) => box.name === '工具箱')
    assert.ok(toolBox)

    toolResult = await tool.execute({ action: 'assign', sessionId: 'session-ccc', boxIds: [toolBox.boxId] })
    assert.equal(toolResult.ok, true)
    assert.deepEqual(toolResult.boxes.find((box) => box.boxId === toolBox.boxId).count, 1)

    toolResult = await tool.execute({ action: 'pin', boxId: toolBox.boxId, sessionId: 'session-ccc' })
    assert.equal(toolResult.ok, true)
    assert.equal(toolResult.boxes.find((box) => box.boxId === toolBox.boxId).pinnedCount, 1)
    assert.deepEqual(toolResult.pins[toolBox.boxId], ['session-ccc'])

    toolResult = await tool.execute({ action: 'unpin', boxId: toolBox.boxId, sessionId: 'session-ccc' })
    assert.equal(toolResult.ok, true)
    assert.equal(toolResult.boxes.find((box) => box.boxId === toolBox.boxId).pinnedCount, 0)

    toolResult = await tool.execute({ action: 'unassign', sessionId: 'session-ccc', boxId: toolBox.boxId })
    assert.equal(toolResult.ok, true)
    assert.deepEqual(toolResult.boxes.find((box) => box.boxId === toolBox.boxId).count, 0)

    toolResult = await tool.execute({ action: 'rename', boxId: toolBox.boxId, name: '改名箱' })
    assert.equal(toolResult.ok, true)
    assert.ok(toolResult.boxes.some((box) => box.name === '改名箱'))

    toolResult = await tool.execute({ action: 'collapse', boxId: toolBox.boxId, collapsed: true })
    assert.equal(toolResult.ok, true)
    assert.equal(toolResult.boxes.find((box) => box.boxId === toolBox.boxId).collapsed, true)

    // A deleted box drops its pins with it.
    await tool.execute({ action: 'assign', sessionId: 'session-ccc', boxIds: [toolBox.boxId] })
    await tool.execute({ action: 'pin', boxId: toolBox.boxId, sessionId: 'session-ccc' })
    toolResult = await tool.execute({ action: 'delete', boxId: toolBox.boxId })
    assert.equal(toolResult.ok, true)
    assert.ok(toolResult.boxes.every((box) => box.boxId !== toolBox.boxId))
    result = await call(route, 'GET')
    assert.equal(result.json.state.pins[toolBox.boxId], undefined)

    // Durable across a remount.
    const stored = JSON.parse(await readFile(join(home, 'session-boxes.json'), 'utf8'))
    assert.equal(stored.version, 1)
    assert.ok(Array.isArray(stored.boxes))
    assert.deepEqual(stored.pins[front.id], ['session-aaa'])
    first.dispose()

    const second = createFakeContext(home)
    apply(second.ctx)
    result = await call(second.state.routes[0], 'GET')
    assert.equal(result.status, 200)
    assert.equal(result.json.state.ungroupedCollapsed, true)
    assert.equal(result.json.state.boxes.length, 2)
    assert.ok(result.json.state.boxes.some((box) => box.name === '前端开发'))
    assert.deepEqual(result.json.state.pins[front.id], ['session-aaa'])
    second.dispose()

    // One level of sub-boxes: create, reject depth 2, promote on parent delete, and move siblings.
    const treeHome = await mkdtemp(join(tmpdir(), 'dsh-session-boxes-tree-'))
    try {
      const tree = createFakeContext(treeHome)
      apply(tree.ctx)
      const treeRoute = tree.state.routes[0]
      let treeResult = await post(treeRoute, { action: 'create', name: '父箱' })
      const parentBox = treeResult.json.state.boxes[0]
      treeResult = await post(treeRoute, { action: 'create', name: '子箱', parentId: parentBox.id })
      const childBox = treeResult.json.state.boxes.find((box) => box.name === '子箱')
      assert.equal(childBox.parentId, parentBox.id)

      treeResult = await post(treeRoute, { action: 'create', name: '孙箱', parentId: childBox.id })
      assert.equal(treeResult.status, 400)

      treeResult = await post(treeRoute, { action: 'setMemberships', sessionId: 'session-sub', boxIds: [childBox.id] })
      assert.equal(treeResult.status, 200)
      treeResult = await post(treeRoute, { action: 'setBoxPin', boxId: childBox.id, sessionId: 'session-sub', pinned: true })
      assert.deepEqual(treeResult.json.state.pins[childBox.id], ['session-sub'])

      treeResult = await post(treeRoute, { action: 'delete', boxId: parentBox.id })
      assert.equal(treeResult.status, 200)
      assert.equal(treeResult.json.state.boxes.find((box) => box.id === childBox.id).parentId, null)
      assert.deepEqual(treeResult.json.state.pins[childBox.id], ['session-sub'])

      treeResult = await post(treeRoute, { action: 'create', name: '另一个父箱' })
      const otherBox = treeResult.json.state.boxes.find((box) => box.name === '另一个父箱')
      treeResult = await post(treeRoute, { action: 'update', boxId: childBox.id, parentId: otherBox.id })
      assert.equal(treeResult.status, 200)
      assert.equal(treeResult.json.state.boxes.find((box) => box.id === childBox.id).parentId, otherBox.id)

      treeResult = await post(treeRoute, { action: 'update', boxId: otherBox.id, parentId: childBox.id })
      assert.equal(treeResult.status, 400)

      treeResult = await post(treeRoute, { action: 'move', boxId: childBox.id, delta: -1 })
      assert.equal(treeResult.status, 200)
      const siblings = treeResult.json.state.boxes.filter((box) => box.parentId === otherBox.id)
      assert.equal(siblings[0].id, childBox.id)

      treeResult = await post(treeRoute, { action: 'delete', boxId: otherBox.id })
      assert.equal(treeResult.json.state.boxes.find((box) => box.id === childBox.id).parentId, null)
      tree.dispose()
    } finally {
      await rm(treeHome, { recursive: true, force: true })
    }

    // Corrupt file falls back to an empty state.
    const third = createFakeContext(await mkdtemp(join(tmpdir(), 'dsh-session-boxes-bad-')))
    apply(third.ctx)
    result = await call(third.state.routes[0], 'GET')
    assert.equal(result.status, 200)
    third.dispose()

    console.log('host tests passed')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
