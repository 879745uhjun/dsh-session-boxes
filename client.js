/**
 * dsh-session-boxes — browser half.
 *
 * Groups the sessions of the workspace sidebar into custom-named, collapsible
 * "boxes" without changing the workspace they belong to. The native session
 * rows keep their stars, menus, status dots, and hover cards; the grouping is a
 * view layer:
 *  - every workspace section gets box headers inserted between its rows and a
 *    CSS `order` on each row so the boxes read top to bottom;
 *  - a session may sit in several boxes, so secondary boxes get an inert clone
 *    of the native row that opens the same session;
 *  - box headers rename inline, change color, collapse, reorder, and delete
 *    through a small settings dialog;
 *  - a hover action and a row-menu item move one session in or out of boxes;
 *  - boxes and memberships are durable Host data read and written through the
 *    same-origin `/session-boxes` JSON route.
 *
 * Visible copy comes from the Client locale service; styling uses theme tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-boxes',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState, useSyncExternalStore } = React

    let MenuItemButton = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      if (primitives && typeof primitives.MenuItemButton === 'function') MenuItemButton = primitives.MenuItemButton
    } catch {
      MenuItemButton = null
    }

    const NS = 'session-boxes'
    const ENDPOINT = '/session-boxes'
    const UNGROUPED = '__ungrouped__'
    const COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'pink', 'cyan', 'gray']
    const COLOR_HEX = {
      blue: '#4C8DFF',
      green: '#3FB950',
      amber: '#D29922',
      red: '#F85149',
      purple: '#A371F7',
      pink: '#DB61A2',
      cyan: '#39C5CF',
      gray: '#8B949E',
    }
    const SESSION_PREFIX = 'session:'
    const WORKSPACE_PREFIX = 'workspace:'
    const OVERFLOW_PREFIX = 'overflow:'

    const ZH = {
      'action.title': '移入分组箱子',
      'menu.item': '移入分组箱子…',
      'dialog.session.title': '分组箱子',
      'dialog.session.hint': '一个会话只会在一个箱子或子箱子里显示；选择新位置会移动它。',
      'dialog.session.empty': '还没有箱子。先创建一个，再把会话放进去。',
      'dialog.box.title': '箱子设置',
      'dialog.box.name': '名称',
      'dialog.box.color': '颜色',
      'dialog.box.order': '顺序',
      'dialog.box.up': '上移',
      'dialog.box.down': '下移',
      'dialog.box.delete': '删除箱子',
      'dialog.box.deleteConfirm': '删除「{name}」？子箱子会移到顶层，会话不会被删除。',
      'dialog.box.deleteYes': '确认删除',
      'dialog.box.cancel': '取消',
      'dialog.box.parent': '父箱子',
      'dialog.box.parentTop': '顶层',
      'dialog.box.parentLocked': '这个箱子已经有子箱子，不能再移到别的箱子里。',
      'dialog.box.addSub': '新建子箱子',
      'dialog.box.memberHint': '一个会话只会出现在一个箱子或子箱子里；勾选会把它移动到这里。',
      'dialog.box.members': '箱子里的会话',
      'dialog.box.search': '搜索会话',
      'dialog.box.noSessions': '这个工作区还没有会话。',
      'dialog.box.noMatch': '没有匹配的会话。',
      'dialog.create.placeholder': '新箱子名称',
      'dialog.create.action': '新建箱子',
      'dialog.create.title': '新建箱子',
      'dialog.create.subTitle': '新建子箱子',
      'dialog.create.confirm': '创建',
      'manager.open': '管理分组箱子',
      'manager.title': '分组箱子',
      'manager.empty': '还没有箱子。先建一个，再从会话的「...」菜单把会话放进去。',
      'manager.settings': '设置',
      'manager.count': '{n} 个会话',
      'manager.create': '新建箱子',
      'manager.newSub': '新建子箱子',
      'manager.childCount': '{n} 个子箱子',
      'dialog.close': '关闭',
      'dialog.done': '完成',
      'header.ungrouped': '未分组',
      'header.add': '添加会话',
      'header.settings': '箱子设置',
      'header.collapse': '折叠',
      'header.expand': '展开',
      'header.drop': '拖到这里加入',
      'header.count': '{n} 个会话',
      'header.pinned': '{n} 个置顶',
      'header.subs': '{n} 个子箱子',
      'pin.toggle': '在箱子内置顶',
      'pin.untoggle': '取消箱子内置顶',
      'pin.hint': '点右侧图钉把会话固定到箱子顶部；不会影响原生置顶。',
      'pin.row': '箱内置顶：{name}',
      'menu.unpinBox': '取消在「{name}」箱内置顶',
      'error.save': '保存失败，请重试',
      'error.load': '分组数据暂时不可用',
      'color.blue': '蓝色',
      'color.green': '绿色',
      'color.amber': '琥珀色',
      'color.red': '红色',
      'color.purple': '紫色',
      'color.pink': '粉色',
      'color.cyan': '青色',
      'color.gray': '灰色',
    }

    const EN = {
      'action.title': 'Move to a session box',
      'menu.item': 'Move to session box…',
      'dialog.session.title': 'Session boxes',
      'dialog.session.hint': 'A session appears in only one box or sub-box; choosing a new place moves it.',
      'dialog.session.empty': 'No boxes yet. Create one, then put this session in it.',
      'dialog.box.title': 'Box settings',
      'dialog.box.name': 'Name',
      'dialog.box.color': 'Color',
      'dialog.box.order': 'Order',
      'dialog.box.up': 'Move up',
      'dialog.box.down': 'Move down',
      'dialog.box.delete': 'Delete box',
      'dialog.box.deleteConfirm': 'Delete “{name}”? Its sub-boxes move to the top level; sessions are not deleted.',
      'dialog.box.deleteYes': 'Delete',
      'dialog.box.cancel': 'Cancel',
      'dialog.box.parent': 'Parent box',
      'dialog.box.parentTop': 'Top level',
      'dialog.box.parentLocked': 'This box already has sub-boxes, so it cannot move under another box.',
      'dialog.box.addSub': 'New sub-box',
      'dialog.box.memberHint': 'A session appears in only one box or sub-box; checking here moves it.',
      'dialog.box.members': 'Sessions in this box',
      'dialog.box.search': 'Search sessions',
      'dialog.box.noSessions': 'This workspace has no sessions yet.',
      'dialog.box.noMatch': 'No matching sessions.',
      'dialog.create.placeholder': 'New box name',
      'dialog.create.action': 'New box',
      'dialog.create.title': 'New box',
      'dialog.create.subTitle': 'New sub-box',
      'dialog.create.confirm': 'Create',
      'manager.open': 'Manage session boxes',
      'manager.title': 'Session boxes',
      'manager.empty': 'No boxes yet. Create one, then add sessions from a row’s “...” menu.',
      'manager.settings': 'Settings',
      'manager.count': '{n} sessions',
      'manager.create': 'New box',
      'manager.newSub': 'New sub-box',
      'manager.childCount': '{n} sub-boxes',
      'dialog.close': 'Close',
      'dialog.done': 'Done',
      'header.ungrouped': 'Ungrouped',
      'header.add': 'Add sessions',
      'header.settings': 'Box settings',
      'header.collapse': 'Collapse',
      'header.expand': 'Expand',
      'header.drop': 'Drop here to add',
      'header.count': '{n} sessions',
      'header.pinned': '{n} pinned',
      'header.subs': '{n} sub-boxes',
      'pin.toggle': 'Pin inside this box',
      'pin.untoggle': 'Unpin inside this box',
      'pin.hint': 'Use the pin on the right to keep a session at the top of this box; the native global pin is untouched.',
      'pin.row': 'Pinned in {name}',
      'menu.unpinBox': 'Unpin inside “{name}”',
      'error.save': 'Could not save. Try again.',
      'error.load': 'Box data is unavailable',
      'color.blue': 'Blue',
      'color.green': 'Green',
      'color.amber': 'Amber',
      'color.red': 'Red',
      'color.purple': 'Purple',
      'color.pink': 'Pink',
      'color.cyan': 'Cyan',
      'color.gray': 'Gray',
    }

    /* ------------------------------------------------------------------ *
     * Small utilities
     * ------------------------------------------------------------------ */

    function createStore(initial) {
      let state = initial
      const listeners = new Set()
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set(next) {
          state = typeof next === 'function' ? next(state) : next
          for (const listener of listeners) listener()
        },
      }
    }

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

    function resequenceTree(boxes) {
      const ordered = treeOrder(boxes)
      ordered.forEach((box, index) => {
        box.order = index
      })
      return ordered
    }

    function normalizeState(raw) {
      const boxes = []
      const seen = new Set()
      const source = Array.isArray(raw?.boxes) ? raw.boxes : []
      for (const entry of source) {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
        if (typeof entry.id !== 'string' || entry.id.length === 0 || seen.has(entry.id)) continue
        const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : entry.id
        seen.add(entry.id)
        boxes.push({
          id: entry.id,
          name,
          color: COLORS.includes(entry.color) ? entry.color : 'blue',
          collapsed: entry.collapsed === true,
          parentId: typeof entry.parentId === 'string' ? entry.parentId : null,
          order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : boxes.length,
        })
      }
      boxes.sort((left, right) => left.order - right.order)
      const byId = new Map(boxes.map((box) => [box.id, box]))
      for (const box of boxes) {
        const parent = box.parentId === null ? undefined : byId.get(box.parentId)
        box.parentId = parent !== undefined && parent.parentId === null && parent.id !== box.id ? parent.id : null
      }
      const orderedBoxes = resequenceTree(boxes)
      const known = new Set(orderedBoxes.map((box) => box.id))
      const memberships = {}
      if (raw?.memberships !== null && typeof raw?.memberships === 'object' && !Array.isArray(raw?.memberships)) {
        for (const [sessionId, boxIds] of Object.entries(raw.memberships)) {
          if (typeof sessionId !== 'string' || sessionId.length === 0 || !Array.isArray(boxIds)) continue
          const kept = []
          for (const boxId of boxIds) {
            if (typeof boxId !== 'string' || !known.has(boxId) || kept.includes(boxId)) continue
            kept.push(boxId)
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
            if (typeof sessionId !== 'string' || kept.includes(sessionId)) continue
            const membership = memberships[sessionId]
            if (!Array.isArray(membership) || !membership.includes(boxId)) continue
            kept.push(sessionId)
          }
          if (kept.length > 0) pins[boxId] = kept
        }
      }
      return { boxes: orderedBoxes, memberships, pins, ungroupedCollapsed: raw?.ungroupedCollapsed === true }
    }

    function errorMessage(error) {
      if (error === null || error === undefined) return 'unknown error'
      if (typeof error === 'string') return error
      return typeof error.message === 'string' ? error.message : String(error)
    }

    let resolveSessionTitle = () => ''

    function domTitleOf(row) {
      for (const element of row.querySelectorAll('[class*="title"]')) {
        const text = (element.textContent ?? '').trim()
        if (text.length > 0) return text
      }
      return ''
    }

    function titleOfSession(row, sessionId) {
      const fromService = resolveSessionTitle(sessionId)
      if (typeof fromService === 'string' && fromService.trim().length > 0) return fromService.trim()
      const fromDom = domTitleOf(row)
      if (fromDom.length > 0) return fromDom
      return sessionId
    }

    /* ------------------------------------------------------------------ *
     * Durable box data (Host-backed, optimistic writes)
     * ------------------------------------------------------------------ */

    const dataStore = createStore({
      status: 'loading',
      boxes: [],
      memberships: {},
      pins: {},
      ungroupedCollapsed: false,
      revision: 0,
      error: null,
    })

    let refreshPromise = null
    let mutationChain = Promise.resolve()

    function publish(raw, error) {
      const normalized = normalizeState(raw)
      const current = dataStore.getSnapshot()
      dataStore.set({
        status: 'ready',
        boxes: normalized.boxes,
        memberships: normalized.memberships,
        pins: normalized.pins,
        ungroupedCollapsed: normalized.ungroupedCollapsed,
        revision: current.revision + 1,
        error,
      })
    }

    async function refresh() {
      if (refreshPromise !== null) return refreshPromise
      refreshPromise = (async () => {
        try {
          const response = await fetch(ENDPOINT, { headers: { accept: 'application/json' }, cache: 'no-store' })
          const payload = await response.json().catch(() => null)
          if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`)
          publish(payload.state, null)
        } catch (error) {
          const current = dataStore.getSnapshot()
          dataStore.set({
            ...current,
            status: current.status === 'ready' ? 'ready' : 'error',
            error: errorMessage(error),
          })
        } finally {
          refreshPromise = null
        }
      })()
      return refreshPromise
    }

    async function post(action, payload) {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? `HTTP ${response.status}`)
      return body
    }

    function enqueue(task) {
      const run = mutationChain.then(task, task)
      mutationChain = run.then(() => undefined, () => undefined)
      return run
    }

    function commit(action, payload, optimistic) {
      const before = dataStore.getSnapshot()
      if (typeof optimistic === 'function') {
        const next = optimistic({
          boxes: before.boxes.map((box) => ({ ...box })),
          memberships: Object.fromEntries(Object.entries(before.memberships).map(([id, ids]) => [id, [...ids]])),
          pins: Object.fromEntries(Object.entries(before.pins ?? {}).map(([id, ids]) => [id, [...ids]])),
          ungroupedCollapsed: before.ungroupedCollapsed,
        })
        dataStore.set({ ...before, ...next, revision: before.revision + 1, error: null })
      }
      return enqueue(async () => {
        try {
          const body = await post(action, payload)
          publish(body.state, null)
          return { ok: true, state: body.state, boxId: body.boxId }
        } catch (error) {
          const message = errorMessage(error)
          await refresh()
          dataStore.set({ ...dataStore.getSnapshot(), error: message })
          return { ok: false, error: message }
        }
      })
    }

    function membershipIds(sessionId) {
      const state = dataStore.getSnapshot()
      return (state.memberships[sessionId] ?? []).filter((boxId) => state.boxes.some((box) => box.id === boxId))
    }

    function setMembership(sessionId, boxId, on) {
      const current = membershipIds(sessionId)
      const next = on ? [boxId] : current.filter((id) => id !== boxId)
      if (on) expandBox(boxId)
      const state = dataStore.getSnapshot()
      const memberships = { ...state.memberships }
      if (next.length === 0) delete memberships[sessionId]
      else memberships[sessionId] = next
      const pins = { ...state.pins }
      for (const [pinnedBoxId, pinnedIds] of Object.entries(pins)) {
        if (next.includes(pinnedBoxId)) continue
        const kept = pinnedIds.filter((id) => id !== sessionId)
        if (kept.length === 0) delete pins[pinnedBoxId]
        else pins[pinnedBoxId] = kept
      }
      return commit('setMemberships', { sessionId, boxIds: next }, (optimistic) => ({ ...optimistic, memberships, pins }))
    }

    function addMembership(sessionId, boxId) {
      const current = membershipIds(sessionId)
      if (current.includes(boxId)) return Promise.resolve({ ok: true })
      return setMembership(sessionId, boxId, true)
    }

    function clearMemberships(sessionId) {
      const state = dataStore.getSnapshot()
      if (state.ungroupedCollapsed) void setUngroupedCollapsed(false)
      const memberships = { ...state.memberships }
      delete memberships[sessionId]
      const pins = { ...state.pins }
      for (const [pinnedBoxId, pinnedIds] of Object.entries(pins)) {
        const kept = pinnedIds.filter((id) => id !== sessionId)
        if (kept.length === 0) delete pins[pinnedBoxId]
        else pins[pinnedBoxId] = kept
      }
      return commit('clear', { sessionId }, (optimistic) => ({ ...optimistic, memberships, pins }))
    }

    function setLocation(sessionId, boxId) {
      return boxId === null ? clearMemberships(sessionId) : setMembership(sessionId, boxId, true)
    }

    function setBoxPin(boxId, sessionId, pinned) {
      const state = dataStore.getSnapshot()
      const current = (state.pins ?? {})[boxId] ?? []
      const next = pinned
        ? [sessionId, ...current.filter((id) => id !== sessionId)]
        : current.filter((id) => id !== sessionId)
      const pins = { ...state.pins }
      if (next.length > 0) pins[boxId] = next
      else delete pins[boxId]
      return commit('setBoxPin', { boxId, sessionId, pinned }, (optimistic) => ({ ...optimistic, pins }))
    }

    function pinInBox(boxId, sessionId) {
      return setBoxPin(boxId, sessionId, true)
    }

    function unpinInBox(boxId, sessionId) {
      return setBoxPin(boxId, sessionId, false)
    }

    async function createBox(name, color = 'blue', parentId = null) {
      const result = await commit('create', { name, color, parentId }, null)
      return result
    }

    function updateBox(boxId, patch) {
      const boxes = resequenceTree(dataStore.getSnapshot().boxes.map((box) => (box.id === boxId ? { ...box, ...patch } : { ...box })))
      return commit('update', { boxId, ...patch }, (state) => ({ ...state, boxes }))
    }

    function deleteBox(boxId) {
      const state = dataStore.getSnapshot()
      const remaining = state.boxes.filter((box) => box.id !== boxId).map((box) => ({ ...box }))
      for (const box of remaining) {
        if (box.parentId === boxId) box.parentId = null
      }
      const boxes = resequenceTree(remaining)
      const memberships = {}
      for (const [sessionId, ids] of Object.entries(state.memberships)) {
        const kept = ids.filter((id) => id !== boxId)
        if (kept.length > 0) memberships[sessionId] = kept
      }
      const pins = { ...state.pins }
      delete pins[boxId]
      return commit('delete', { boxId }, () => ({ boxes, memberships, pins, ungroupedCollapsed: state.ungroupedCollapsed }))
    }

    function reorderSiblingBoxes(state, boxId, toIndex) {
      const box = state.boxes.find((entry) => entry.id === boxId)
      if (box === undefined) return null
      const siblings = state.boxes
        .filter((entry) => entry.parentId === box.parentId)
        .sort((left, right) => left.order - right.order)
      const from = siblings.indexOf(box)
      if (from < 0) return null
      const to = Math.max(0, Math.min(siblings.length - 1, toIndex))
      const boxes = state.boxes.map((entry) => ({ ...entry }))
      const target = boxes.find((entry) => entry.id === boxId)
      const list = boxes
        .filter((entry) => entry.parentId === target.parentId)
        .sort((left, right) => left.order - right.order)
      list.splice(from, 1)
      list.splice(to, 0, target)
      list.forEach((entry, index) => {
        entry.order = index
      })
      return { boxes: resequenceTree(boxes), to }
    }

    function moveBox(boxId, delta) {
      const state = dataStore.getSnapshot()
      const box = state.boxes.find((entry) => entry.id === boxId)
      if (box === undefined) return Promise.resolve({ ok: false, error: 'box not found' })
      const siblings = state.boxes
        .filter((entry) => entry.parentId === box.parentId)
        .sort((left, right) => left.order - right.order)
      const index = siblings.indexOf(box)
      const to = Math.max(0, Math.min(siblings.length - 1, index + delta))
      if (to === index) return Promise.resolve({ ok: true })
      const reordered = reorderSiblingBoxes(state, boxId, to)
      if (reordered === null) return Promise.resolve({ ok: false, error: 'box not found' })
      return commit('move', { boxId, toIndex: reordered.to }, (current) => ({ ...current, boxes: reordered.boxes }))
    }

    function moveBoxTo(boxId, toIndex) {
      if (!Number.isInteger(toIndex)) return Promise.resolve({ ok: false, error: 'toIndex is invalid' })
      const state = dataStore.getSnapshot()
      const reordered = reorderSiblingBoxes(state, boxId, toIndex)
      if (reordered === null) return Promise.resolve({ ok: false, error: 'box not found' })
      return commit('move', { boxId, toIndex: reordered.to }, (current) => ({ ...current, boxes: reordered.boxes }))
    }

    function setCollapsed(boxId, collapsed) {
      const boxes = dataStore.getSnapshot().boxes.map((box) => (box.id === boxId ? { ...box, collapsed } : box))
      return commit('update', { boxId, collapsed }, (state) => ({ ...state, boxes }))
    }

    function expandBox(boxId) {
      const state = dataStore.getSnapshot()
      const box = state.boxes.find((entry) => entry.id === boxId)
      if (box === undefined) return
      if (box.collapsed) void setCollapsed(boxId, false)
      if (box.parentId !== null) {
        const parent = state.boxes.find((entry) => entry.id === box.parentId)
        if (parent !== undefined && parent.collapsed) void setCollapsed(parent.id, false)
      }
    }

    function setUngroupedCollapsed(collapsed) {
      return commit('setUngroupedCollapsed', { collapsed }, (state) => ({ ...state, ungroupedCollapsed: collapsed }))
    }

    /* ------------------------------------------------------------------ *
     * Dialog state
     * ------------------------------------------------------------------ */

    const dialogStore = createStore(null)

    function openDialog(request) {
      dialogStore.set(request)
    }

    function closeDialog() {
      dialogStore.set(null)
    }

    /* ------------------------------------------------------------------ *
     * Grouping engine (plain DOM; keeps every native row feature alive)
     * ------------------------------------------------------------------ */

    function createDomEngine(options) {
      const store = options.store
      const getT = options.getT ?? (() => (key) => key)
      const getPinned = options.getPinned ?? (() => [])
      const isBlank = options.isBlank ?? (() => false)
      const openSessionDialog = options.openSessionDialog ?? (() => {})
      const openBoxDialog = options.openBoxDialog ?? (() => {})
      const openNewBox = options.openNewBox ?? (() => {})
      const openManager = options.openManager ?? (() => {})
      const autoExpand = options.autoExpand !== false
      const actions = {
        setCollapsed: options.setCollapsed ?? setCollapsed,
        setUngroupedCollapsed: options.setUngroupedCollapsed ?? setUngroupedCollapsed,
        addMembership: options.addMembership ?? addMembership,
        clearMemberships: options.clearMemberships ?? clearMemberships,
        setLocation: options.setLocation ?? setLocation,
        updateBox: options.updateBox ?? updateBox,
        moveBoxTo: options.moveBoxTo ?? moveBoxTo,
      }

      let running = false
      let observer = null
      let unsubscribe = null
      let timer = 0
      let interval = 0
      let resizeTimer = 0
      const tracked = new Set()
      const autoExpanded = new WeakSet()
      const userCollapsed = new WeakSet()
      let autoClicking = false

      function t(key, vars) {
        return getT()(key, vars)
      }

      function schedule() {
        if (!running || timer !== 0) return
        timer = window.setTimeout(() => {
          timer = 0
          apply()
        }, 120)
      }

      function onResize() {
        if (resizeTimer !== 0) window.clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => {
          resizeTimer = 0
          schedule()
        }, 160)
      }

      function onDocumentClick(event) {
        if (autoClicking) return
        const target = event.target
        if (!(target instanceof Element)) return
        const overflow = target.closest('[data-row-key^="overflow:"]')
        if (overflow !== null && overflow.parentElement !== null) userCollapsed.add(overflow.parentElement)
      }

      function start() {
        if (running) return
        running = true
        observer = new MutationObserver((records) => {
          let relevant = false
          for (const record of records) {
            if (record.type !== 'childList') continue
            const target = record.target
            if (target instanceof Element && target.closest('.dsb-h') !== null) continue
            relevant = true
            break
          }
          if (relevant) schedule()
        })
        observer.observe(document.body, { childList: true, subtree: true })
        document.addEventListener('click', onDocumentClick, true)
        window.addEventListener('resize', onResize)
        unsubscribe = store.subscribe(() => schedule())
        interval = window.setInterval(() => {
          if (store.getSnapshot().boxes.length > 0) schedule()
        }, 1500)
        schedule()
      }

      function stop() {
        if (!running) return
        running = false
        if (observer !== null) observer.disconnect()
        observer = null
        if (unsubscribe !== null) unsubscribe()
        unsubscribe = null
        document.removeEventListener('click', onDocumentClick, true)
        window.removeEventListener('resize', onResize)
        if (timer !== 0) window.clearTimeout(timer)
        if (interval !== 0) window.clearInterval(interval)
        if (resizeTimer !== 0) window.clearTimeout(resizeTimer)
        timer = 0
        interval = 0
        resizeTimer = 0
        for (const button of document.querySelectorAll('[data-dsb-manage="1"]')) button.remove()
        cleanupAll()
      }

      function unitKey(unit) {
        if (!(unit instanceof HTMLElement)) return null
        const own = unit.dataset.rowKey
        if (typeof own === 'string' && own.length > 0) return { key: own, row: unit }
        const row = unit.querySelector('[data-row-key]')
        if (row instanceof HTMLElement && typeof row.dataset.rowKey === 'string' && row.dataset.rowKey.length > 0) {
          return { key: row.dataset.rowKey, row }
        }
        return null
      }

      function directUnits(section) {
        const units = []
        for (const child of section.children) {
          const found = unitKey(child)
          if (found !== null) units.push({ unit: child, row: found.row, key: found.key })
        }
        return units
      }

      function sessionUnits(section) {
        return directUnits(section).filter((entry) => entry.key.startsWith(SESSION_PREFIX))
      }

      function directOverflow(section) {
        for (const entry of directUnits(section)) {
          if (entry.key.startsWith(OVERFLOW_PREFIX)) return entry.unit
        }
        return null
      }

      function sectionOf(header) {
        let node = header.parentElement
        let depth = 0
        while (node !== null && depth < 5) {
          if (sessionUnits(node).length > 0) return node
          node = node.parentElement
          depth += 1
        }
        return null
      }

      function ensureFlex(section) {
        if (section.dataset.dsbFlex === '1') return
        section.dataset.dsbFlex = '1'
        section.dataset.dsbDisplay = section.style.display
        section.dataset.dsbDirection = section.style.flexDirection
        section.style.display = 'flex'
        section.style.flexDirection = 'column'
      }

      function setHidden(element, hidden) {
        if (hidden) {
          element.style.display = 'none'
          element.setAttribute('aria-hidden', 'true')
        } else {
          element.style.display = ''
          element.removeAttribute('aria-hidden')
        }
      }

      function setOrder(element, value) {
        const text = String(value)
        if (element.style.order !== text) element.style.order = text
      }

      function setRowBox(unit, boxId, color, first, last, pinned, depth, pinStart) {
        unit.setAttribute('data-dsb-row-box', boxId)
        unit.style.setProperty('--dsb-color', COLOR_HEX[color] ?? COLOR_HEX.blue)
        if (first) unit.setAttribute('data-dsb-row-first', '1')
        else unit.removeAttribute('data-dsb-row-first')
        if (last) unit.setAttribute('data-dsb-row-last', '1')
        else unit.removeAttribute('data-dsb-row-last')
        if (pinned) unit.setAttribute('data-dsb-pinned', '1')
        else unit.removeAttribute('data-dsb-pinned')
        if (pinStart) unit.setAttribute('data-dsb-pin-start', '1')
        else unit.removeAttribute('data-dsb-pin-start')
        if (depth > 0) unit.setAttribute('data-dsb-depth', String(depth))
        else unit.removeAttribute('data-dsb-depth')
      }

      function clearRowBox(unit) {
        unit.removeAttribute('data-dsb-row-box')
        unit.removeAttribute('data-dsb-row-first')
        unit.removeAttribute('data-dsb-row-last')
        unit.removeAttribute('data-dsb-pinned')
        unit.removeAttribute('data-dsb-pin-start')
        unit.removeAttribute('data-dsb-depth')
        unit.style.removeProperty('--dsb-color')
        unit.style.removeProperty('--dsb-parent-color')
      }

      function chevron() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 12 12')
        svg.setAttribute('class', 'dsb-h__chev')
        svg.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M2.5 4.25 6 7.75l3.5-3.5')
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', 'currentColor')
        path.setAttribute('stroke-width', '1.4')
        path.setAttribute('stroke-linecap', 'round')
        path.setAttribute('stroke-linejoin', 'round')
        svg.appendChild(path)
        return svg
      }

      function pinIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 12 12')
        svg.setAttribute('width', '10')
        svg.setAttribute('height', '10')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M3.8 1.6h4.4M6 1.6v3.2L7.8 7H4.2L6 4.8V1.6M6 7v3.4')
        path.setAttribute('stroke', 'currentColor')
        path.setAttribute('stroke-width', '1.15')
        path.setAttribute('stroke-linecap', 'round')
        path.setAttribute('stroke-linejoin', 'round')
        svg.appendChild(path)
        return svg
      }

      function headerFor(section, boxId) {
        for (const child of section.children) {
          if (child instanceof HTMLElement && child.classList.contains('dsb-h') && child.dataset.dsbBox === boxId) return child
        }
        return null
      }

      function updateHeader(header, descriptor) {
        const toggle = header.querySelector('[data-dsb-role="toggle"]')
        const dot = header.querySelector('[data-dsb-role="dot"]')
        const name = header.querySelector('[data-dsb-role="name"]')
        const count = header.querySelector('[data-dsb-role="count"]')
        const add = header.querySelector('[data-dsb-role="add"]')
        const more = header.querySelector('[data-dsb-role="more"]')
        const color = COLOR_HEX[descriptor.color] ?? COLOR_HEX.blue
        header.style.setProperty('--dsb-color', color)
        if (toggle !== null) toggle.setAttribute('aria-expanded', descriptor.collapsed ? 'false' : 'true')
        if (dot !== null) dot.style.background = color
        if (name !== null && header.dataset.renaming !== '1') {
          if (name.textContent !== descriptor.name) name.textContent = descriptor.name
          name.title = descriptor.name
        }
        if (count !== null) {
          const text = String(descriptor.count)
          if (count.textContent !== text) count.textContent = text
          count.title = t('header.count', { n: text })
        }
        if (add !== null) add.title = t('header.add')
        if (more !== null) more.title = t('header.settings')
        const pinBadge = header.querySelector('[data-dsb-role="pin"]')
        const pinCount = header.querySelector('[data-dsb-role="pinCount"]')
        if (pinBadge !== null) {
          const pinnedCount = descriptor.pinnedCount ?? 0
          pinBadge.style.display = pinnedCount > 0 ? '' : 'none'
          pinBadge.title = t('header.pinned', { n: String(pinnedCount) })
          if (pinCount !== null && pinCount.textContent !== String(pinnedCount)) pinCount.textContent = String(pinnedCount)
        }
        const depth = descriptor.depth ?? 0
        const childCount = descriptor.childCount ?? 0
        header.dataset.dsbDepth = String(depth)
        header.classList.toggle('dsb-h--sub', depth > 0)
        const subs = header.querySelector('[data-dsb-role="subs"]')
        const subsCount = header.querySelector('[data-dsb-role="subsCount"]')
        if (subs !== null) {
          subs.style.display = childCount > 0 ? '' : 'none'
          subs.title = t('header.subs', { n: String(childCount) })
          if (subsCount !== null && subsCount.textContent !== String(childCount)) subsCount.textContent = String(childCount)
        }
        header.classList.toggle('is-collapsed', descriptor.collapsed)
        header.classList.toggle('is-empty', descriptor.count === 0 && childCount === 0)
        header.classList.toggle('is-head-only', descriptor.count === 0 && childCount > 0)
        header.setAttribute('aria-label', descriptor.name)
        header.dataset.dsbCollapsed = descriptor.collapsed ? '1' : '0'
      }

      function toggleBox(boxId) {
        const current = store.getSnapshot().boxes.find((entry) => entry.id === boxId)
        if (current !== undefined) void actions.setCollapsed(boxId, !current.collapsed)
      }

      function bindBoxName(header, boxId, name) {
        let timer = 0
        name.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (header.dataset.dragging === '1') return
          if (timer !== 0) {
            window.clearTimeout(timer)
            timer = 0
            return
          }
          timer = window.setTimeout(() => {
            timer = 0
            toggleBox(boxId)
          }, 180)
        })
        name.addEventListener('dblclick', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (timer !== 0) {
            window.clearTimeout(timer)
            timer = 0
          }
          beginRename(header, boxId)
        })
      }

      function beginRename(header, boxId) {
        if (header.dataset.renaming === '1') return
        const name = header.querySelector('[data-dsb-role="name"]')
        const box = store.getSnapshot().boxes.find((entry) => entry.id === boxId)
        if (name === null || box === undefined) return
        header.dataset.renaming = '1'
        const input = document.createElement('input')
        input.className = 'dsb-h__input'
        input.value = box.name
        input.maxLength = 40
        input.setAttribute('aria-label', t('dialog.box.name'))
        name.replaceWith(input)
        input.focus()
        input.select()
        let done = false
        const finish = (commitName) => {
          if (done) return
          done = true
          const value = input.value.trim()
          const span = document.createElement('span')
          span.className = 'dsb-h__name'
          span.dataset.dsbRole = 'name'
          span.textContent = commitName && value.length > 0 ? value : box.name
          bindBoxName(header, boxId, span)
          input.replaceWith(span)
          delete header.dataset.renaming
          if (commitName && value.length > 0 && value !== box.name) void actions.updateBox(boxId, { name: value })
        }
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            finish(true)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            finish(false)
          } else {
            event.stopPropagation()
          }
        })
        input.addEventListener('blur', () => finish(true))
        input.addEventListener('click', (event) => event.stopPropagation())
        input.addEventListener('pointerdown', (event) => event.stopPropagation())
      }

      function bindBoxDrag(header, boxId) {
        header.draggable = true
        header.addEventListener('dragstart', (event) => {
          if (event.target instanceof Element && event.target.closest('input,button') !== null) {
            event.preventDefault()
            return
          }
          if (event.dataTransfer === null) return
          event.stopPropagation()
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('application/x-dsh-box', boxId)
          header.classList.add('is-dragging')
          header.dataset.dragging = '1'
        })
        header.addEventListener('dragend', () => {
          header.classList.remove('is-dragging')
          window.setTimeout(() => {
            delete header.dataset.dragging
          }, 250)
          for (const node of document.querySelectorAll('.dsb-h.is-drop-before, .dsb-h.is-drop-after')) {
            node.classList.remove('is-drop-before', 'is-drop-after')
          }
        })
      }

      function bindDrop(header, boxId) {
        header.addEventListener('dragover', (event) => {
          if (event.dataTransfer === null) return
          const types = Array.from(event.dataTransfer.types)
          if (types.includes('application/x-dsh-box')) {
            if (boxId === UNGROUPED) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'move'
            const rect = header.getBoundingClientRect()
            const before = event.clientY < rect.top + rect.height / 2
            header.classList.toggle('is-drop-before', before)
            header.classList.toggle('is-drop-after', !before)
            return
          }
          if (!types.includes('text/plain')) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'copy'
          header.classList.add('is-drop')
        })
        header.addEventListener('dragleave', (event) => {
          if (event.relatedTarget instanceof Node && header.contains(event.relatedTarget)) return
          header.classList.remove('is-drop', 'is-drop-before', 'is-drop-after')
        })
        header.addEventListener('drop', (event) => {
          event.preventDefault()
          event.stopPropagation()
          header.classList.remove('is-drop', 'is-drop-before', 'is-drop-after')
          if (event.dataTransfer === null) return
          const types = Array.from(event.dataTransfer.types)
          if (types.includes('application/x-dsh-box')) {
            if (boxId === UNGROUPED) return
            const dragged = event.dataTransfer.getData('application/x-dsh-box')
            if (dragged.length === 0 || dragged === boxId) return
            const boxes = store.getSnapshot().boxes
            const draggedBox = boxes.find((entry) => entry.id === dragged)
            const targetBox = boxes.find((entry) => entry.id === boxId)
            if (draggedBox === undefined || targetBox === undefined) return
            if (draggedBox.parentId !== targetBox.parentId) return
            const siblings = boxes
              .filter((entry) => entry.parentId === targetBox.parentId)
              .sort((left, right) => left.order - right.order)
            const remaining = siblings.filter((entry) => entry.id !== dragged)
            const targetIndex = remaining.findIndex((entry) => entry.id === boxId)
            if (targetIndex < 0) return
            const rect = header.getBoundingClientRect()
            const before = event.clientY < rect.top + rect.height / 2
            void actions.moveBoxTo(dragged, before ? targetIndex : targetIndex + 1)
            return
          }
          const sessionId = event.dataTransfer.getData('text/plain')
          if (sessionId.length === 0) return
          if (document.querySelector(`[data-row-key="${SESSION_PREFIX}${sessionId}"]`) === null) return
          if (boxId === UNGROUPED) void actions.clearMemberships(sessionId)
          else void actions.setLocation(sessionId, boxId)
        })
      }

      function folderIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 12 12')
        svg.setAttribute('width', '10')
        svg.setAttribute('height', '10')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M1.5 3.2h3l1 1.1h5v4.9a.8.8 0 0 1-.8.8H2.3a.8.8 0 0 1-.8-.8V3.2Z')
        path.setAttribute('stroke', 'currentColor')
        path.setAttribute('stroke-width', '1.15')
        path.setAttribute('stroke-linejoin', 'round')
        svg.appendChild(path)
        return svg
      }

      function ensureBoxHeader(section, box, depth) {
        let header = headerFor(section, box.id)
        if (header !== null) return header
        header = document.createElement('div')
        header.className = depth > 0 ? 'dsb-h dsb-h--sub' : 'dsb-h'
        header.dataset.dsbBox = box.id
        header.dataset.dsbDepth = String(depth)
        header.setAttribute('role', 'presentation')

        const chevronButton = document.createElement('button')
        chevronButton.type = 'button'
        chevronButton.className = 'dsb-h__chevBtn'
        chevronButton.dataset.dsbRole = 'toggle'
        chevronButton.appendChild(chevron())
        const dot = document.createElement('span')
        dot.className = 'dsb-h__dot'
        dot.dataset.dsbRole = 'dot'
        const name = document.createElement('span')
        name.className = 'dsb-h__name'
        name.dataset.dsbRole = 'name'
        name.title = box.name
        const count = document.createElement('span')
        count.className = 'dsb-h__count'
        count.dataset.dsbRole = 'count'

        const actionBar = document.createElement('span')
        actionBar.className = 'dsb-h__actions'
        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'dsb-h__action'
        add.dataset.dsbRole = 'add'
        add.textContent = '+'
        const more = document.createElement('button')
        more.type = 'button'
        more.className = 'dsb-h__action'
        more.dataset.dsbRole = 'more'
        more.textContent = '⋯'
        actionBar.append(add, more)
        const pinBadge = document.createElement('span')
        pinBadge.className = 'dsb-h__pin'
        pinBadge.dataset.dsbRole = 'pin'
        pinBadge.style.display = 'none'
        pinBadge.appendChild(pinIcon())
        const pinCount = document.createElement('span')
        pinCount.dataset.dsbRole = 'pinCount'
        pinBadge.appendChild(pinCount)
        const subs = document.createElement('span')
        subs.className = 'dsb-h__subs'
        subs.dataset.dsbRole = 'subs'
        subs.style.display = 'none'
        subs.appendChild(folderIcon())
        const subsCount = document.createElement('span')
        subsCount.dataset.dsbRole = 'subsCount'
        subs.appendChild(subsCount)
        header.append(chevronButton, dot, name, count, pinBadge, subs, actionBar)

        chevronButton.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleBox(box.id)
        })
        bindBoxName(header, box.id, name)
        add.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          openBoxDialog(box.id, collectSessions(section))
        })
        more.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          openBoxDialog(box.id, collectSessions(section))
        })
        bindDrop(header, box.id)
        bindBoxDrag(header, box.id)
        section.appendChild(header)
        return header
      }

      function ensureUngroupedHeader(section) {
        let header = headerFor(section, UNGROUPED)
        if (header !== null) return header
        header = document.createElement('div')
        header.className = 'dsb-h dsb-h--ungrouped'
        header.dataset.dsbBox = UNGROUPED
        header.setAttribute('role', 'presentation')

        const chevronButton = document.createElement('button')
        chevronButton.type = 'button'
        chevronButton.className = 'dsb-h__chevBtn'
        chevronButton.dataset.dsbRole = 'toggle'
        chevronButton.appendChild(chevron())
        const dot = document.createElement('span')
        dot.className = 'dsb-h__dot'
        dot.dataset.dsbRole = 'dot'
        dot.style.background = COLOR_HEX.gray
        const name = document.createElement('span')
        name.className = 'dsb-h__name'
        name.dataset.dsbRole = 'name'
        const count = document.createElement('span')
        count.className = 'dsb-h__count'
        count.dataset.dsbRole = 'count'

        const actionBar = document.createElement('span')
        actionBar.className = 'dsb-h__actions'
        const add = document.createElement('button')
        add.type = 'button'
        add.className = 'dsb-h__action'
        add.dataset.dsbRole = 'add'
        add.textContent = '+'
        add.title = t('dialog.create.action')
        actionBar.append(add)
        header.append(chevronButton, dot, name, count, actionBar)

        const toggleUngrouped = () => {
          void actions.setUngroupedCollapsed(!store.getSnapshot().ungroupedCollapsed)
        }
        chevronButton.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleUngrouped()
        })
        name.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleUngrouped()
        })
        add.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          openNewBox()
        })
        bindDrop(header, UNGROUPED)
        section.appendChild(header)
        return header
      }

      function updateUngroupedHeader(header, count, collapsed) {
        const name = header.querySelector('[data-dsb-role="name"]')
        const countEl = header.querySelector('[data-dsb-role="count"]')
        const toggle = header.querySelector('[data-dsb-role="toggle"]')
        header.style.setProperty('--dsb-color', COLOR_HEX.gray)
        if (name !== null) name.textContent = t('header.ungrouped')
        if (countEl !== null) {
          const text = String(count)
          if (countEl.textContent !== text) countEl.textContent = text
          countEl.title = t('header.count', { n: text })
        }
        if (toggle !== null) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
        header.classList.toggle('is-collapsed', collapsed)
        header.classList.toggle('is-empty', count === 0)
      }

      function collectSessions(section) {
        const sessions = []
        for (const entry of sessionUnits(section)) {
          const id = entry.key.slice(SESSION_PREFIX.length)
          sessions.push({ id, title: titleOfSession(entry.row, id) })
        }
        return sessions
      }

      function rowSignature(unit) {
        return unit.innerHTML
      }

      function buildClone(sourceUnit, sessionId, boxId) {
        const clone = sourceUnit.cloneNode(true)
        const row = clone instanceof HTMLElement && clone.matches('[data-row-key]')
          ? clone
          : clone.querySelector('[data-row-key]')
        if (row instanceof HTMLElement) {
          row.removeAttribute('data-row-key')
          row.setAttribute('tabindex', '-1')
        }
        clone.querySelectorAll('[data-context-menu-trigger]').forEach((element) => element.removeAttribute('data-context-menu-trigger'))
        clone.querySelectorAll('[class*="rowActions"]').forEach((element) => element.remove())
        clone.querySelectorAll('[draggable]').forEach((element) => element.setAttribute('draggable', 'false'))
        clone.classList.add('dsb-clone')
        clone.dataset.dsbCloneOf = sessionId
        clone.dataset.dsbBox = boxId
        clone.dataset.dsbKey = `${boxId}::${sessionId}`
        clone.dataset.dsbSig = rowSignature(sourceUnit)
        clone.setAttribute('draggable', 'false')
        clone.setAttribute('tabindex', '-1')
        clone.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const target = document.querySelector(`[data-row-key="${SESSION_PREFIX}${sessionId}"]`)
          if (target instanceof HTMLElement) target.click()
        })
        return clone
      }

      function cloneFor(section, key) {
        for (const child of section.children) {
          if (child instanceof HTMLElement && child.classList.contains('dsb-clone') && child.dataset.dsbKey === key) return child
        }
        return null
      }

      function ensureClone(section, sourceUnit, sessionId, boxId) {
        const key = `${boxId}::${sessionId}`
        const existing = cloneFor(section, key)
        if (existing !== null && existing.dataset.dsbSig === rowSignature(sourceUnit)) {
          return existing
        }
        const fresh = buildClone(sourceUnit, sessionId, boxId)
        if (existing !== null) existing.replaceWith(fresh)
        else section.appendChild(fresh)
        return fresh
      }

      function removeStale(section, usedHeaders, usedClones) {
        for (const child of Array.from(section.children)) {
          if (!(child instanceof HTMLElement)) continue
          if (child.classList.contains('dsb-h') && !usedHeaders.has(child)) child.remove()
          if (child.classList.contains('dsb-clone') && !usedClones.has(child)) child.remove()
        }
      }

      function pinRankFor(state, boxId) {
        return new Map(((state.pins ?? {})[boxId] ?? []).map((id, index) => [id, index]))
      }

      function sortPinned(list, rank, nativePinned) {
        return [...list].sort((left, right) => {
          const leftRank = rank.has(left.sessionId)
            ? rank.get(left.sessionId)
            : (nativePinned.has(left.sessionId) ? 100000 : Number.MAX_SAFE_INTEGER)
          const rightRank = rank.has(right.sessionId)
            ? rank.get(right.sessionId)
            : (nativePinned.has(right.sessionId) ? 100000 : Number.MAX_SAFE_INTEGER)
          return leftRank - rightRank
        })
      }

      function applySection(section, state, pinned, showEmptyBoxes) {
        const entries = sessionUnits(section)
        if (entries.length === 0) {
          cleanupSection(section)
          return
        }
        const width = section.getBoundingClientRect().width
        if (width > 0 && width < 120) {
          cleanupSection(section)
          return
        }
        ensureFlex(section)
        for (const entry of entries) clearRowBox(entry.unit)
        for (const node of section.querySelectorAll('[data-dsb-subtree-last]')) node.removeAttribute('data-dsb-subtree-last')

        const topRows = []
        const ungroupedRows = []
        const byBox = new Map(state.boxes.map((box) => [box.id, []]))
        for (const entry of entries) {
          const sessionId = entry.key.slice(SESSION_PREFIX.length)
          if (isBlank(sessionId)) {
            topRows.push(entry)
            continue
          }
          const memberIds = (state.memberships[sessionId] ?? []).filter((boxId) => byBox.has(boxId))
          if (memberIds.length === 0) {
            if (pinned.has(sessionId)) topRows.push(entry)
            else ungroupedRows.push(entry)
            continue
          }
          const box = state.boxes.find((candidate) => memberIds.includes(candidate.id))
          if (box === undefined) ungroupedRows.push(entry)
          else byBox.get(box.id).push({ ...entry, sessionId })
        }

        let order = 0
        for (const entry of topRows) {
          setHidden(entry.unit, false)
          setOrder(entry.unit, order)
          order += 1
        }

        const usedHeaders = new Set()
        const topBoxes = state.boxes.filter((box) => !box.parentId)
        for (const box of topBoxes) {
          const children = state.boxes.filter((child) => child.parentId === box.id)
          const direct = byBox.get(box.id) ?? []
          const visibleChildren = children.filter((child) => (byBox.get(child.id) ?? []).length > 0 || showEmptyBoxes)
          if (direct.length === 0 && visibleChildren.length === 0 && !showEmptyBoxes) {
            const stale = headerFor(section, box.id)
            if (stale !== null) stale.remove()
            for (const child of children) {
              const childStale = headerFor(section, child.id)
              if (childStale !== null) childStale.remove()
            }
            continue
          }
          const directPins = pinRankFor(state, box.id)
          const directMembers = sortPinned(direct, directPins, pinned)
          const parentColor = COLOR_HEX[box.color] ?? COLOR_HEX.blue
          const header = ensureBoxHeader(section, box, 0)
          header.style.removeProperty('--dsb-parent-color')
          usedHeaders.add(header)
          setOrder(header, order)
          order += 1
          updateHeader(header, {
            name: box.name,
            color: box.color,
            collapsed: box.collapsed,
            count: directMembers.length,
            pinnedCount: directMembers.filter((member) => directPins.has(member.sessionId)).length,
            childCount: children.length,
            depth: 0,
          })
          let lastItem = header
          for (const [index, member] of directMembers.entries()) {
            setRowBox(member.unit, box.id, box.color, index === 0, index === directMembers.length - 1, directPins.has(member.sessionId), 0, directPins.has(member.sessionId) && index === 0)
            member.unit.style.removeProperty('--dsb-parent-color')
            setOrder(member.unit, order)
            order += 1
            setHidden(member.unit, box.collapsed)
            if (!box.collapsed) lastItem = member.unit
          }
          for (const child of visibleChildren) {
            const childPins = pinRankFor(state, child.id)
            const childMembers = sortPinned(byBox.get(child.id) ?? [], childPins, pinned)
            const childHeader = ensureBoxHeader(section, child, 1)
            childHeader.style.setProperty('--dsb-parent-color', parentColor)
            usedHeaders.add(childHeader)
            setOrder(childHeader, order)
            order += 1
            updateHeader(childHeader, {
              name: child.name,
              color: child.color,
              collapsed: child.collapsed,
              count: childMembers.length,
              pinnedCount: childMembers.filter((member) => childPins.has(member.sessionId)).length,
              childCount: 0,
              depth: 1,
            })
            setHidden(childHeader, box.collapsed)
            if (!box.collapsed) lastItem = childHeader
            for (const [index, member] of childMembers.entries()) {
              setRowBox(member.unit, child.id, child.color, index === 0, index === childMembers.length - 1, childPins.has(member.sessionId), 1, childPins.has(member.sessionId) && index === 0)
              member.unit.style.setProperty('--dsb-parent-color', parentColor)
              setOrder(member.unit, order)
              order += 1
              setHidden(member.unit, box.collapsed || child.collapsed)
              if (!box.collapsed && !child.collapsed) lastItem = member.unit
            }
          }
          lastItem.setAttribute('data-dsb-subtree-last', '1')
        }

        const showUngrouped = ungroupedRows.length > 0 || showEmptyBoxes
        if (showUngrouped) {
          const header = ensureUngroupedHeader(section)
          usedHeaders.add(header)
          setOrder(header, order)
          order += 1
          updateUngroupedHeader(header, ungroupedRows.length, state.ungroupedCollapsed)
          for (const [index, entry] of ungroupedRows.entries()) {
            setRowBox(entry.unit, UNGROUPED, 'gray', index === 0, index === ungroupedRows.length - 1, false, 0, false)
            setOrder(entry.unit, order)
            order += 1
            setHidden(entry.unit, state.ungroupedCollapsed)
          }
        } else {
          const stale = headerFor(section, UNGROUPED)
          if (stale !== null) stale.remove()
        }

        for (const child of section.children) {
          if (!(child instanceof HTMLElement)) continue
          if (child.classList.contains('dsb-h') || child.classList.contains('dsb-clone')) continue
          if (child.getAttribute('role') === 'group') {
            setOrder(child, -999000)
            continue
          }
          const found = unitKey(child)
          if (found !== null && found.key.startsWith(WORKSPACE_PREFIX)) {
            setOrder(child, -1000000)
          } else if (found !== null && found.key.startsWith(OVERFLOW_PREFIX)) {
            setOrder(child, 1000000)
          } else if (found === null) {
            setOrder(child, 999000)
          }
        }

        removeStale(section, usedHeaders, new Set())
        maybeAutoExpand(section)
      }

      function maybeAutoExpand(section) {
        if (!autoExpand) return
        if (autoExpanded.has(section) || userCollapsed.has(section)) return
        const overflow = directOverflow(section)
        if (overflow === null) return
        let tries = 0
        const step = () => {
          if (!running || !section.isConnected || tries >= 60) {
            autoExpanded.add(section)
            return
          }
          const button = directOverflow(section)
          if (button === null || button.getAttribute('aria-expanded') === 'true') {
            autoExpanded.add(section)
            return
          }
          tries += 1
          autoClicking = true
          try {
            button.click()
          } finally {
            autoClicking = false
          }
          window.setTimeout(step, 45)
        }
        window.setTimeout(step, 60)
      }

      function cleanupSection(section) {
        for (const child of Array.from(section.children)) {
          if (child instanceof HTMLElement && (child.classList.contains('dsb-h') || child.classList.contains('dsb-clone'))) child.remove()
        }
        for (const child of Array.from(section.children)) {
          if (child instanceof HTMLElement) child.style.order = ''
        }
        for (const entry of directUnits(section)) {
          clearRowBox(entry.unit)
          setHidden(entry.unit, false)
        }
        if (section.dataset.dsbFlex === '1') {
          section.style.display = section.dataset.dsbDisplay ?? ''
          section.style.flexDirection = section.dataset.dsbDirection ?? ''
          delete section.dataset.dsbFlex
          delete section.dataset.dsbDisplay
          delete section.dataset.dsbDirection
        }
        tracked.delete(section)
      }

      function cleanupAll() {
        for (const section of Array.from(tracked)) cleanupSection(section)
        for (const element of Array.from(document.querySelectorAll('.dsb-h, .dsb-clone'))) element.remove()
      }

      function boxIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 16 16')
        svg.setAttribute('width', '15')
        svg.setAttribute('height', '15')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('aria-hidden', 'true')
        const body = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        body.setAttribute('d', 'M2.5 5A1.5 1.5 0 0 1 4 3.5h2.2l1.1 1.2H12A1.5 1.5 0 0 1 13.5 6.2v4.3A1.5 1.5 0 0 1 12 12H4a1.5 1.5 0 0 1-1.5-1.5V5Z')
        body.setAttribute('stroke', 'currentColor')
        body.setAttribute('stroke-width', '1.3')
        body.setAttribute('stroke-linejoin', 'round')
        const lines = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        lines.setAttribute('d', 'M5.4 8h5.2M5.4 10h3.4')
        lines.setAttribute('stroke', 'currentColor')
        lines.setAttribute('stroke-width', '1.3')
        lines.setAttribute('stroke-linecap', 'round')
        svg.append(body, lines)
        return svg
      }

      function ensureManageButton() {
        let actions = null
        for (const header of document.querySelectorAll('[class*="sectionHeader"]')) {
          const candidate = header.querySelector('[class*="headerActions"]')
          if (candidate !== null) {
            actions = candidate
            break
          }
        }
        if (actions === null) return
        let button = actions.querySelector('[data-dsb-manage="1"]')
        if (button === null) {
          button = document.createElement('button')
          button.type = 'button'
          button.className = 'dsb-headerButton'
          button.dataset.dsbManage = '1'
          button.appendChild(boxIcon())
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            openManager()
          })
          actions.insertBefore(button, actions.firstChild)
        }
        const label = t('manager.open')
        if (button.title !== label) button.title = label
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label)
      }

      function apply() {
        if (!running) return
        ensureManageButton()
        const state = store.getSnapshot()
        if (state.boxes.length === 0) {
          cleanupAll()
          return
        }
        const pinned = new Set(getPinned())
        const headers = document.querySelectorAll('[data-row-key^="workspace:"]')
        const found = new Set()
        for (const header of headers) {
          const section = sectionOf(header)
          if (section === null) continue
          found.add(section)
          tracked.add(section)
        }
        const showEmptyBoxes = found.size <= 1
        for (const section of found) applySection(section, state, pinned, showEmptyBoxes)
        for (const section of Array.from(tracked)) {
          if (!section.isConnected) {
            tracked.delete(section)
            continue
          }
          if (!found.has(section)) cleanupSection(section)
        }
      }

      return { start, stop, apply, schedule }
    }

    /* ------------------------------------------------------------------ *
     * React components
     * ------------------------------------------------------------------ */

    function CloseGlyph() {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M2.5 2.5l7 7M9.5 2.5l-7 7', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      )
    }

    function TrashGlyph() {
      return h(
        'svg',
        { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M2.5 3.5h7M4.5 3.5v-1h3v1M3.5 3.5l.4 6h4.2l.4-6',
          stroke: 'currentColor',
          strokeWidth: 1.1,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function BoxMenuIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M2.5 5A1.5 1.5 0 0 1 4 3.5h2.2l1.1 1.2H12A1.5 1.5 0 0 1 13.5 6.2v4.3A1.5 1.5 0 0 1 12 12H4a1.5 1.5 0 0 1-1.5-1.5V5Z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M5.4 8h5.2M5.4 10h3.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
      )
    }

    function useBoxes() {
      return useSyncExternalStore(dataStore.subscribe, dataStore.getSnapshot)
    }

    function useDialog() {
      return useSyncExternalStore(dialogStore.subscribe, dialogStore.getSnapshot)
    }

    function ColorDot({ color }) {
      return h('span', { className: 'dsb-dot', style: { background: COLOR_HEX[color] ?? COLOR_HEX.blue } })
    }

    function PinGlyph() {
      return h(
        'svg',
        { width: 11, height: 11, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3.8 1.6h4.4M6 1.6v3.2L7.8 7H4.2L6 4.8V1.6M6 7v3.4',
          stroke: 'currentColor',
          strokeWidth: 1.15,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function CheckRow({ checked, color, name, meta, onChange, trailing }) {
      return h(
        'label',
        { className: checked ? 'dsb-check is-on' : 'dsb-check' },
        h('input', { type: 'checkbox', checked, onChange: (event) => onChange(event.target.checked) }),
        h(ColorDot, { color }),
        h('span', { className: 'dsb-check__name', title: name, children: name }),
        meta === undefined ? null : h('span', { className: 'dsb-check__meta', children: meta }),
        trailing === undefined ? null : trailing,
      )
    }

    function LocationRow({ selected, color, name, depth, onSelect }) {
      return h(
        'label',
        {
          className: selected ? 'dsb-check is-on' : 'dsb-check',
          style: { paddingLeft: `${8 + (depth ?? 0) * 14}px` },
        },
        h('input', {
          type: 'radio',
          name: 'dsb-session-location',
          checked: selected,
          onChange: onSelect,
        }),
        h(ColorDot, { color }),
        h('span', { className: 'dsb-check__name', title: name, children: name }),
      )
    }

    function Modal({ title, onClose, children, wide, t }) {
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [onClose])
      return h(
        React.Fragment,
        null,
        h('div', { className: 'dsb-backdrop', onClick: onClose }),
        h(
          'div',
          {
            className: wide ? 'dsb-modal dsb-modal--wide' : 'dsb-modal',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': title,
            onClick: (event) => event.stopPropagation(),
          },
          h(
            'div',
            { className: 'dsb-modal__head' },
            h('span', { className: 'dsb-modal__title', children: title }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsb-modal__close',
                'aria-label': t('dialog.close'),
                title: t('dialog.close'),
                onClick: onClose,
              },
              h(CloseGlyph),
            ),
          ),
          h('div', { className: 'dsb-modal__body' }, children),
        ),
      )
    }

    function SessionDialog({ request, state, t }) {
      const [newName, setNewName] = useState('')
      const [busy, setBusy] = useState(false)
      const currentIds = state.memberships[request.sessionId] ?? []
      const current = state.boxes.find((box) => currentIds.includes(box.id))
      const currentId = current === undefined ? null : current.id
      const select = (boxId) => {
        void setLocation(request.sessionId, boxId)
      }
      const create = async () => {
        const name = newName.trim()
        if (name.length === 0 || busy) return
        setBusy(true)
        const result = await createBox(name, 'blue')
        if (result.ok && typeof result.boxId === 'string') {
          await setLocation(request.sessionId, result.boxId)
          setNewName('')
        }
        setBusy(false)
      }
      return h(
        Modal,
        { title: t('dialog.session.title'), onClose: closeDialog, t },
        h('p', { className: 'dsb-hint', children: t('dialog.session.hint') }),
        h(
          'div',
          { className: 'dsb-list' },
          h(LocationRow, {
            selected: currentId === null,
            color: 'gray',
            name: t('header.ungrouped'),
            depth: 0,
            onSelect: () => select(null),
          }),
          state.boxes.map((box) => h(LocationRow, {
            key: box.id,
            selected: currentId === box.id,
            color: box.color,
            name: box.name || box.id,
            depth: box.parentId ? 1 : 0,
            onSelect: () => select(box.id),
          })),
        ),
        state.boxes.length === 0 ? h('p', { className: 'dsb-empty', children: t('dialog.session.empty') }) : null,
        h(
          'div',
          { className: 'dsb-create' },
          h('input', {
            className: 'dsb-input',
            value: newName,
            maxLength: 40,
            placeholder: t('dialog.create.placeholder'),
            'aria-label': t('dialog.create.placeholder'),
            onChange: (event) => setNewName(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void create()
              }
            },
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dsb-button',
              disabled: busy || newName.trim().length === 0,
              onClick: () => {
                void create()
              },
            },
            t('dialog.create.action'),
          ),
        ),
        state.error === null ? null : h('p', { className: 'dsb-error', children: t('error.save') }),
        h(
          'div',
          { className: 'dsb-foot' },
          h('button', { type: 'button', className: 'dsb-primary', onClick: closeDialog }, t('dialog.done')),
        ),
      )
    }

    function BoxDialog({ request, state, t }) {
      const box = state.boxes.find((entry) => entry.id === request.boxId)
      const [name, setName] = useState(box === undefined ? '' : box.name)
      const [search, setSearch] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)
      const boxId = box === undefined ? null : box.id
      useEffect(() => {
        if (box !== undefined) setName(box.name)
      }, [boxId])
      useEffect(() => {
        if (box === undefined) closeDialog()
      }, [box])
      if (box === undefined) return null
      const siblings = state.boxes
        .filter((entry) => entry.parentId === box.parentId)
        .sort((left, right) => left.order - right.order)
      const index = siblings.findIndex((entry) => entry.id === box.id)
      const childrenCount = state.boxes.filter((entry) => entry.parentId === box.id).length
      const parentOptions = state.boxes.filter((entry) => !entry.parentId && entry.id !== box.id)
      const sessions = request.sessions ?? []
      const needle = search.trim().toLowerCase()
      const pinRank = new Map(((state.pins ?? {})[box.id] ?? []).map((id, index) => [id, index]))
      const filtered = (needle.length === 0
        ? sessions
        : sessions.filter((session) => session.title.toLowerCase().includes(needle))).slice()
      filtered.sort((left, right) => {
        const leftRank = pinRank.has(left.id) ? pinRank.get(left.id) : Number.MAX_SAFE_INTEGER
        const rightRank = pinRank.has(right.id) ? pinRank.get(right.id) : Number.MAX_SAFE_INTEGER
        return leftRank - rightRank
      })
      const commitName = () => {
        const value = name.trim()
        if (value.length === 0 || value === box.name) {
          setName(box.name)
          return
        }
        void updateBox(box.id, { name: value })
      }
      const isMember = (sessionId) => (state.memberships[sessionId] ?? []).includes(box.id)
      return h(
        Modal,
        { title: t('dialog.box.title'), onClose: closeDialog, wide: true, t },
        h(
          'div',
          { className: 'dsb-field' },
          h('label', { className: 'dsb-field__label', children: t('dialog.box.name') }),
          h('input', {
            className: 'dsb-input',
            value: name,
            maxLength: 40,
            onChange: (event) => setName(event.target.value),
            onBlur: commitName,
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitName()
                event.currentTarget.blur()
              }
            },
          }),
        ),
        h(
          'div',
          { className: 'dsb-field' },
          h('span', { className: 'dsb-field__label', children: t('dialog.box.color') }),
          h(
            'div',
            { className: 'dsb-swatches' },
            COLORS.map((color) => h('button', {
              key: color,
              type: 'button',
              className: box.color === color ? 'dsb-swatch is-on' : 'dsb-swatch',
              style: { background: COLOR_HEX[color] },
              title: t(`color.${color}`),
              'aria-label': t(`color.${color}`),
              'aria-pressed': box.color === color,
              onClick: () => {
                void updateBox(box.id, { color })
              },
            })),
          ),
        ),
        h(
          'div',
          { className: 'dsb-field' },
          h('span', { className: 'dsb-field__label', children: t('dialog.box.parent') }),
          h(
            'select',
            {
              className: 'dsb-input',
              value: box.parentId ?? '',
              disabled: childrenCount > 0,
              onChange: (event) => {
                void updateBox(box.id, { parentId: event.target.value === '' ? null : event.target.value })
              },
            },
            h('option', { value: '', children: t('dialog.box.parentTop') }),
            parentOptions.map((entry) => h('option', { key: entry.id, value: entry.id, children: entry.name })),
          ),
          childrenCount > 0 ? h('p', { className: 'dsb-hint', children: t('dialog.box.parentLocked') }) : null,
          box.parentId === null ? h('button', {
            type: 'button',
            className: 'dsb-button',
            onClick: () => {
              openDialog({ kind: 'new', parentId: box.id })
            },
          }, t('dialog.box.addSub')) : null,
        ),
        h(
          'div',
          { className: 'dsb-field dsb-field--row' },
          h('span', { className: 'dsb-field__label', children: t('dialog.box.order') }),
          h(
            'span',
            { className: 'dsb-order' },
            h('button', {
              type: 'button',
              className: 'dsb-button',
              disabled: index <= 0,
              onClick: () => {
                void moveBox(box.id, -1)
              },
            }, `↑ ${t('dialog.box.up')}`),
            h('button', {
              type: 'button',
              className: 'dsb-button',
              disabled: index < 0 || index >= siblings.length - 1,
              onClick: () => {
                void moveBox(box.id, 1)
              },
            }, `↓ ${t('dialog.box.down')}`),
          ),
        ),
        h('h3', { className: 'dsb-section-title', children: t('dialog.box.members') }),
        sessions.length === 0 ? null : h('p', { className: 'dsb-hint', children: t('dialog.box.memberHint') }),
        sessions.length === 0 ? null : h('p', { className: 'dsb-hint', children: t('pin.hint') }),
        sessions.length > 8
          ? h('input', {
            className: 'dsb-input',
            value: search,
            placeholder: t('dialog.box.search'),
            'aria-label': t('dialog.box.search'),
            onChange: (event) => setSearch(event.target.value),
          })
          : null,
        sessions.length === 0
          ? h('p', { className: 'dsb-empty', children: t('dialog.box.noSessions') })
          : filtered.length === 0
            ? h('p', { className: 'dsb-empty', children: t('dialog.box.noMatch') })
            : h(
              'div',
              { className: 'dsb-list dsb-list--scroll' },
              filtered.map((session) => {
                const pinned = pinRank.has(session.id)
                return h(CheckRow, {
                  key: session.id,
                  checked: isMember(session.id),
                  color: box.color,
                  name: session.title || session.id,
                  onChange: (on) => {
                    void setMembership(session.id, box.id, on)
                  },
                  trailing: h('button', {
                    type: 'button',
                    className: pinned ? 'dsb-pin is-on' : 'dsb-pin',
                    style: { '--dsb-color': COLOR_HEX[box.color] },
                    title: pinned ? t('pin.untoggle') : t('pin.toggle'),
                    'aria-label': pinned ? t('pin.untoggle') : t('pin.toggle'),
                    'aria-pressed': pinned,
                    onClick: (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void (pinned ? unpinInBox(box.id, session.id) : pinInBox(box.id, session.id))
                    },
                  }, h(PinGlyph)),
                })
              }),
            ),
        state.error === null ? null : h('p', { className: 'dsb-error', children: t('error.save') }),
        h(
          'div',
          { className: 'dsb-foot dsb-foot--between' },
          confirmDelete
            ? h(
              'span',
              { className: 'dsb-confirm' },
              h('span', { children: t('dialog.box.deleteConfirm', { name: box.name }) }),
              h('button', {
                type: 'button',
                className: 'dsb-danger',
                onClick: () => {
                  void deleteBox(box.id)
                  closeDialog()
                },
              }, t('dialog.box.deleteYes')),
              h('button', {
                type: 'button',
                className: 'dsb-button',
                onClick: () => setConfirmDelete(false),
              }, t('dialog.box.cancel')),
            )
            : h('button', {
              type: 'button',
              className: 'dsb-danger dsb-danger--ghost',
              onClick: () => setConfirmDelete(true),
            }, t('dialog.box.delete')),
          h('button', { type: 'button', className: 'dsb-primary', onClick: closeDialog }, t('dialog.done')),
        ),
      )
    }

    function NewBoxDialog({ request, t }) {
      const parentId = request?.parentId ?? null
      const [name, setName] = useState('')
      const [color, setColor] = useState('blue')
      const [busy, setBusy] = useState(false)
      const create = async () => {
        const value = name.trim()
        if (value.length === 0 || busy) return
        setBusy(true)
        const result = await createBox(value, color, parentId)
        setBusy(false)
        if (result.ok) closeDialog()
      }
      return h(
        Modal,
        { title: parentId === null ? t('dialog.create.title') : t('dialog.create.subTitle'), onClose: closeDialog, t },
        h('input', {
          className: 'dsb-input',
          value: name,
          maxLength: 40,
          autoFocus: true,
          placeholder: t('dialog.create.placeholder'),
          'aria-label': t('dialog.create.placeholder'),
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void create()
            }
          },
        }),
        h(
          'div',
          { className: 'dsb-swatches' },
          COLORS.map((entry) => h('button', {
            key: entry,
            type: 'button',
            className: color === entry ? 'dsb-swatch is-on' : 'dsb-swatch',
            style: { background: COLOR_HEX[entry] },
            title: t(`color.${entry}`),
            'aria-label': t(`color.${entry}`),
            'aria-pressed': color === entry,
            onClick: () => setColor(entry),
          })),
        ),
        h(
          'div',
          { className: 'dsb-foot' },
          h('button', {
            type: 'button',
            className: 'dsb-primary',
            disabled: busy || name.trim().length === 0,
            onClick: () => {
              void create()
            },
          }, t('dialog.create.confirm')),
        ),
      )
    }

    function collectVisibleSessions() {
      const sessions = []
      const seen = new Set()
      for (const row of document.querySelectorAll('[data-row-key^="session:"]')) {
        if (!(row instanceof HTMLElement)) continue
        const key = row.dataset.rowKey
        if (typeof key !== 'string' || !key.startsWith(SESSION_PREFIX)) continue
        const id = key.slice(SESSION_PREFIX.length)
        if (seen.has(id)) continue
        seen.add(id)
        sessions.push({ id, title: titleOfSession(row, id) })
      }
      return sessions
    }

    function countMembers(state, boxId) {
      let count = 0
      for (const ids of Object.values(state.memberships)) {
        if (ids.includes(boxId)) count += 1
      }
      return count
    }

    function BoxManagerDialog({ t }) {
      const state = useBoxes()
      const [name, setName] = useState('')
      const [color, setColor] = useState('blue')
      const [busy, setBusy] = useState(false)
      const [confirmId, setConfirmId] = useState(null)
      const create = async () => {
        const value = name.trim()
        if (value.length === 0 || busy) return
        setBusy(true)
        const result = await createBox(value, color)
        setBusy(false)
        if (result.ok) setName('')
      }
      const openSettings = (boxId) => {
        openDialog({ kind: 'box', boxId, sessions: collectVisibleSessions() })
      }
      return h(
        Modal,
        { title: t('manager.title'), onClose: closeDialog, wide: true, t },
        h(
          'div',
          { className: 'dsb-manager-create' },
          h('input', {
            className: 'dsb-input',
            value: name,
            maxLength: 40,
            placeholder: t('dialog.create.placeholder'),
            'aria-label': t('dialog.create.placeholder'),
            onChange: (event) => setName(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void create()
              }
            },
          }),
          h(
            'div',
            { className: 'dsb-swatches dsb-swatches--compact' },
            COLORS.map((entry) => h('button', {
              key: entry,
              type: 'button',
              className: color === entry ? 'dsb-swatch is-on' : 'dsb-swatch',
              style: { background: COLOR_HEX[entry] },
              title: t(`color.${entry}`),
              'aria-label': t(`color.${entry}`),
              'aria-pressed': color === entry,
              onClick: () => setColor(entry),
            })),
          ),
          h('button', {
            type: 'button',
            className: 'dsb-primary',
            disabled: busy || name.trim().length === 0,
            onClick: () => {
              void create()
            },
          }, t('manager.create')),
        ),
        state.boxes.length === 0
          ? h('p', { className: 'dsb-empty', children: t('manager.empty') })
          : h(
            'div',
            { className: 'dsb-list dsb-list--scroll' },
            state.boxes.map((box) => {
              const depth = box.parentId ? 1 : 0
              const siblings = state.boxes
                .filter((entry) => entry.parentId === box.parentId)
                .sort((left, right) => left.order - right.order)
              const index = siblings.findIndex((entry) => entry.id === box.id)
              const childCount = state.boxes.filter((entry) => entry.parentId === box.id).length
              const countText = childCount > 0
                ? `${t('manager.count', { n: String(countMembers(state, box.id)) })} · ${t('manager.childCount', { n: String(childCount) })}`
                : t('manager.count', { n: String(countMembers(state, box.id)) })
              return h(
                'div',
                {
                  key: box.id,
                  className: 'dsb-manage-row',
                  style: { paddingLeft: `${6 + depth * 16}px` },
                },
                h(ColorDot, { color: box.color }),
                h('span', { className: 'dsb-manage-name', title: box.name || box.id, children: box.name || box.id }),
                h('span', { className: 'dsb-manage-count', children: countText }),
                h(
                  'span',
                  { className: 'dsb-manage-actions' },
                  h('button', {
                    type: 'button',
                    className: 'dsb-mini',
                    disabled: index <= 0,
                    title: t('dialog.box.up'),
                    'aria-label': t('dialog.box.up'),
                    onClick: () => {
                      void moveBox(box.id, -1)
                    },
                  }, '↑'),
                  h('button', {
                    type: 'button',
                    className: 'dsb-mini',
                    disabled: index < 0 || index >= siblings.length - 1,
                    title: t('dialog.box.down'),
                    'aria-label': t('dialog.box.down'),
                    onClick: () => {
                      void moveBox(box.id, 1)
                    },
                  }, '↓'),
                  depth === 0
                    ? h('button', {
                      type: 'button',
                      className: 'dsb-mini',
                      title: t('manager.newSub'),
                      'aria-label': t('manager.newSub'),
                      onClick: () => {
                        openDialog({ kind: 'new', parentId: box.id })
                      },
                    }, '+')
                    : null,
                  h('button', {
                    type: 'button',
                    className: 'dsb-button',
                    onClick: () => openSettings(box.id),
                  }, t('manager.settings')),
                  confirmId === box.id
                    ? h(
                      'span',
                      { className: 'dsb-confirm' },
                      h('button', {
                        type: 'button',
                        className: 'dsb-danger',
                        onClick: () => {
                          setConfirmId(null)
                          void deleteBox(box.id)
                        },
                      }, t('dialog.box.deleteYes')),
                      h('button', {
                        type: 'button',
                        className: 'dsb-button',
                        onClick: () => setConfirmId(null),
                      }, t('dialog.box.cancel')),
                    )
                    : h('button', {
                      type: 'button',
                      className: 'dsb-danger dsb-danger--ghost',
                      title: t('dialog.box.delete'),
                      'aria-label': t('dialog.box.delete'),
                      onClick: () => setConfirmId(box.id),
                    }, h(TrashGlyph)),
                ),
              )
            }),
          ),
        state.error ? h('p', { className: 'dsb-error', children: t('error.save') }) : null,
        h(
          'div',
          { className: 'dsb-foot' },
          h('button', { type: 'button', className: 'dsb-primary', onClick: closeDialog }, t('dialog.done')),
        ),
      )
    }

    function BoxOverlay({ t }) {
      const request = useDialog()
      const state = useBoxes()
      if (request === null) return null
      if (request.kind === 'session') return h(SessionDialog, { request, state, t })
      if (request.kind === 'box') return h(BoxDialog, { request, state, t })
      if (request.kind === 'new') return h(NewBoxDialog, { request, t })
      if (request.kind === 'manager') return h(BoxManagerDialog, { t })
      return null
    }

    function BoxMenuItem({ sessionId, displayTitle, useMenuOpenState, t }) {
      const state = useBoxes()
      const useMenu = typeof useMenuOpenState === 'function' ? useMenuOpenState : () => [false, () => {}]
      const [, setMenuOpen] = useMenu()
      const box = state.boxes.find((entry) => (state.memberships[sessionId] ?? []).includes(entry.id))
      const pinned = box !== undefined && ((state.pins ?? {})[box.id] ?? []).includes(sessionId)
      const open = () => {
        setMenuOpen(false)
        openDialog({
          kind: 'session',
          sessionId,
          title: typeof displayTitle === 'string' ? displayTitle : '',
        })
      }
      const unpin = () => {
        if (box === undefined) return
        setMenuOpen(false)
        void unpinInBox(box.id, sessionId)
      }
      if (MenuItemButton !== null) {
        return h(
          React.Fragment,
          null,
          h(MenuItemButton, { icon: h(BoxMenuIcon), onSelect: open }, t('menu.item')),
          pinned
            ? h(MenuItemButton, {
              icon: h('span', { style: { color: COLOR_HEX[box.color] ?? COLOR_HEX.blue } }, h(PinGlyph)),
              onSelect: unpin,
            }, t('menu.unpinBox', { name: box.name }))
            : null,
        )
      }
      return h(
        React.Fragment,
        null,
        h('button', {
          type: 'button',
          role: 'menuitem',
          className: 'dsb-menu-item',
          onClick: open,
        }, h(BoxMenuIcon), h('span', { children: t('menu.item') })),
        pinned
          ? h('button', {
            type: 'button',
            role: 'menuitem',
            className: 'dsb-menu-item',
            onClick: unpin,
          }, h('span', { style: { color: COLOR_HEX[box.color] ?? COLOR_HEX.blue } }, h(PinGlyph)), h('span', { children: t('menu.unpinBox', { name: box.name }) }))
          : null,
      )
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    const CSS = [
      '.dsb-menu-item{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:6px 10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;text-align:left;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}',
      '.dsb-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsb-h{display:flex;align-items:center;gap:6px;box-sizing:border-box;height:30px;flex:none;margin-top:8px !important;margin-right:0;margin-bottom:0;margin-left:0;padding:0 6px 0 calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,0px) + var(--dsh-workspace-indent,0px));border-radius:10px 10px 0 0;background:color-mix(in srgb, var(--dsb-color,#8B949E) 18%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsb-color,#8B949E) 45%, transparent),inset 3px 0 0 var(--dsb-parent-color, var(--dsb-color,#8B949E));color:var(--dsw-alias-label-primary);font-size:12px;line-height:16px;font-weight:600;user-select:none;position:relative;transition:background-color .12s ease}',
      '.dsb-h{cursor:grab}',
      '.dsb-h__chevBtn,.dsb-h__name,.dsb-h__action{cursor:pointer}',
      '.dsb-h.is-dragging{opacity:.55;cursor:grabbing}',
      '.dsb-h.is-drop-before::before,.dsb-h.is-drop-after::after{content:"";position:absolute;left:4px;right:4px;height:2px;border-radius:2px;background:var(--dsb-color,#8B949E);z-index:3;pointer-events:none}',
      '.dsb-h.is-drop-before::before{top:-5px}',
      '.dsb-h.is-drop-after::after{bottom:-5px}',
      '.dsb-h:hover{background:color-mix(in srgb, var(--dsb-color,#8B949E) 24%, transparent)}',
      '.dsb-h.is-head-only{border-radius:10px 10px 0 0;margin-bottom:0}',
      '.dsb-h.is-collapsed,.dsb-h.is-empty{border-radius:10px;margin-bottom:6px}',
      '.dsb-h[data-dsb-depth="1"]{margin-top:0 !important;height:28px;font-size:11.5px;padding-left:calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,0px) + var(--dsh-workspace-indent,0px) + 18px);border-radius:0;background:color-mix(in srgb, var(--dsb-color,#8B949E) 12%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 38%, transparent),inset 3px 0 0 var(--dsb-parent-color, var(--dsb-color,#8B949E))}',
      '.dsb-h[data-dsb-depth="1"] .dsb-h__dot{width:9px;height:9px}',
      '.dsb-h[data-dsb-depth="1"].is-collapsed,.dsb-h[data-dsb-depth="1"].is-empty{border-radius:0;margin-bottom:0}',
      '.dsb-h[data-dsb-subtree-last]{border-radius:0 0 10px 10px;margin-bottom:6px}',
      '.dsb-h[data-dsb-depth="1"][data-dsb-subtree-last]{border-radius:0 0 10px 10px;margin-bottom:6px}',
      '.dsb-h.is-empty{background:color-mix(in srgb, var(--dsb-color,#8B949E) 6%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--dsb-color,#8B949E) 22%, transparent)}',
      '.dsb-h.is-drop{background:color-mix(in srgb, var(--dsb-color,#8B949E) 30%, transparent);box-shadow:inset 0 0 0 1.5px var(--dsb-color,#8B949E)}',
      '.dsb-h--ungrouped{color:var(--dsw-alias-label-secondary);font-weight:500;background:color-mix(in srgb, #8B949E 6%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb, #8B949E 24%, transparent)}',
      '.dsb-h--ungrouped:hover{background:color-mix(in srgb, #8B949E 12%, transparent)}',
      '.dsb-h__chevBtn{display:inline-flex;align-items:center;justify-content:center;width:16px;height:22px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsb-h__chevBtn:focus-visible{outline:2px solid var(--dsb-color,#8B949E);outline-offset:-2px}',
      '.dsb-h__chev{flex:none;width:12px;height:12px;color:currentColor;transition:transform .15s ease}',
      '.dsb-h.is-collapsed .dsb-h__chev{transform:rotate(-90deg)}',
      '.dsb-h__dot{flex:none;width:10px;height:10px;border-radius:3px;background:var(--dsb-color,#8B949E);position:relative;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}',
      '.dsb-h__dot::after{content:"";position:absolute;left:1px;right:1px;top:3px;height:1px;border-radius:1px;background:rgba(255,255,255,.65)}',
      '.dsb-h__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-weight:600}',
      '.dsb-h__count{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:color-mix(in srgb, var(--dsb-color,#8B949E) 20%, transparent);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:500}',
      '.dsb-h__pin{flex:none;display:inline-flex;align-items:center;gap:2px;height:16px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:color-mix(in srgb, var(--dsb-color,#8B949E) 22%, transparent);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:500}',
      '.dsb-h__subs{flex:none;display:inline-flex;align-items:center;gap:2px;height:16px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:color-mix(in srgb, var(--dsb-color,#8B949E) 14%, transparent);color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-weight:500}',
      '.dsb-h__input{min-width:0;flex:1;height:20px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-button-elevated-fill,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-weight:600;padding:0 4px;outline:none}',
      '.dsb-h__actions{flex:none;display:none;align-items:center;gap:2px}',
      '.dsb-h:hover .dsb-h__actions,.dsb-h:focus-within .dsb-h__actions{display:flex}',
      '.dsb-h__action{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:1;cursor:pointer}',
      '.dsb-h__action:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsb-color,#8B949E) 22%, transparent)}',
      '[data-dsb-row-box]{box-sizing:border-box;position:relative;margin-top:0 !important;background:color-mix(in srgb, var(--dsb-color,#8B949E) 7%, transparent);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 62%, transparent),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 32%, transparent)}',
      '[data-dsb-row-box][data-dsb-depth="1"]{padding-left:18px;background:color-mix(in srgb, var(--dsb-color,#8B949E) 5%, transparent);box-shadow:inset 3px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 62%, transparent),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 32%, transparent)}',
      '[data-dsb-row-box][data-dsb-depth="1"]::before{content:"";position:absolute;left:15px;top:0;bottom:0;width:2px;border-radius:1px;background:color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent);pointer-events:none}',
      '[data-dsb-row-box][data-dsb-subtree-last]{margin-bottom:6px !important;border-radius:0 0 10px 10px;box-shadow:inset 3px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 62%, transparent),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 32%, transparent),inset 0 -1px 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 32%, transparent)}',
      '[data-dsb-row-box="__ungrouped__"]{background:color-mix(in srgb, #8B949E 4%, transparent);box-shadow:inset 3px 0 0 color-mix(in srgb, #8B949E 35%, transparent),inset -1px 0 0 color-mix(in srgb, #8B949E 20%, transparent)}',
      '[data-dsb-row-box="__ungrouped__"][data-dsb-subtree-last]{box-shadow:inset 3px 0 0 color-mix(in srgb, #8B949E 35%, transparent),inset -1px 0 0 color-mix(in srgb, #8B949E 20%, transparent),inset 0 -1px 0 color-mix(in srgb, #8B949E 20%, transparent)}',
      '.dsb-pin{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.dsb-pin:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsb-pin.is-on{color:var(--dsb-color,#8B949E);background:color-mix(in srgb, var(--dsb-color,#8B949E) 16%, transparent)}',
      '[data-dsb-row-box][data-dsb-pinned="1"]{background:color-mix(in srgb, var(--dsb-color,#8B949E) 14%, transparent);box-shadow:inset 6px 0 0 color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent),inset 3px 0 0 var(--dsb-parent-color, var(--dsb-color,#8B949E)),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 45%, transparent)}',
      '[data-dsb-row-box][data-dsb-pinned="1"][data-dsb-pin-start="1"]{box-shadow:inset 0 2px 0 color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent),inset 6px 0 0 color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent),inset 3px 0 0 var(--dsb-parent-color, var(--dsb-color,#8B949E)),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 45%, transparent)}',
      '[data-dsb-row-box][data-dsb-pinned="1"][data-dsb-subtree-last]{box-shadow:inset 6px 0 0 color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent),inset 3px 0 0 var(--dsb-parent-color, var(--dsb-color,#8B949E)),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 45%, transparent),inset 0 -1px 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 45%, transparent)}',
      '[data-dsb-row-box][data-dsb-pinned="1"][data-dsb-pin-start="1"][data-dsb-subtree-last]{box-shadow:inset 0 2px 0 color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent),inset 6px 0 0 color-mix(in srgb, var(--dsb-color,#8B949E) 55%, transparent),inset 3px 0 0 var(--dsb-parent-color, var(--dsb-color,#8B949E)),inset -1px 0 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 45%, transparent),inset 0 -1px 0 color-mix(in srgb, var(--dsb-parent-color, var(--dsb-color,#8B949E)) 45%, transparent)}',
      '.dsb-clone{cursor:pointer}',
      '.dsb-clone:hover{background-color:color-mix(in srgb, var(--dsb-color,#8B949E) 12%, transparent)}',
      '.dsb-headerButton{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsb-headerButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsb-headerButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '[class*="rail"] .dsb-headerButton{width:36px;height:36px;border-radius:var(--dsw-radius-md,8px)}',
      '[class*="headerActions"]:has(> [data-dsb-manage="1"]):not([class*="headerActionsHidden"]){max-width:128px}',
      '.dsb-manager-create{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsb-manager-create .dsb-input{flex:1;min-width:140px;width:auto}',
      '.dsb-swatches--compact{gap:4px}',
      '.dsb-swatches--compact .dsb-swatch{width:14px;height:14px}',
      '.dsb-manage-row{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:var(--dsw-radius-sm,6px)}',
      '.dsb-manage-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsb-manage-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dsb-manage-count{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dsb-manage-actions{display:flex;align-items:center;gap:3px;flex:none}',
      '.dsb-mini{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:.5px solid var(--dsw-alias-border-l2,#444);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}',
      '.dsb-mini:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsb-mini:disabled{opacity:.35;cursor:default}',
      '.dsb-backdrop{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.3)}',
      '.dsb-modal{position:fixed;z-index:9601;left:50%;top:50%;transform:translate(-50%,-50%);width:min(430px,calc(100vw - 32px));max-height:min(680px,calc(100vh - 64px));display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-overlay,#1f2023);color:var(--dsw-alias-label-primary,#eee);border:.5px solid var(--dsw-alias-border-l2,#444);border-radius:var(--dsw-radius-lg,12px);box-shadow:var(--dsw-elevation-prominent,0 16px 48px rgba(0,0,0,.45));font-family:var(--dsw-font-family,inherit);font-size:13px;line-height:18px;overflow:hidden}',
      '.dsb-modal--wide{width:min(520px,calc(100vw - 32px))}',
      '.dsb-modal__head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px;flex:none}',
      '.dsb-modal__title{flex:1;min-width:0;font-weight:600;font-size:14px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsb-modal__close{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dsb-modal__close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsb-modal__body{display:flex;flex-direction:column;gap:10px;padding:2px 14px 14px;min-height:0;overflow:auto}',
      '.dsb-hint{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}',
      '.dsb-empty{margin:0;padding:10px 0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',
      '.dsb-list{display:flex;flex-direction:column;gap:1px;min-height:0;width:100%;align-items:stretch}',
      '.dsb-list--scroll{max-height:260px;overflow:auto;padding-right:2px}',
      '.dsb-check{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;padding:6px 8px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}',
      '.dsb-check:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsb-check input{flex:none;margin:0;accent-color:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4C8DFF))}',
      '.dsb-check__name{min-width:80px;flex:1 1 auto;white-space:normal;overflow-wrap:anywhere;line-height:18px}',
      '.dsb-check__meta{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dsb-dot{flex:none;width:8px;height:8px;border-radius:50%}',
      '.dsb-create{display:flex;align-items:center;gap:6px}',
      '.dsb-input{box-sizing:border-box;width:100%;height:30px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4,#555);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}',
      '.dsb-input:focus{border-color:var(--dsw-alias-state-business-primary,#4C8DFF)}',
      '.dsb-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dsb-create .dsb-input{flex:1;width:auto;min-width:0}',
      '.dsb-button{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2,#444);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-elevated-fill,var(--dsw-alias-bg-layer-2,transparent));color:var(--dsw-alias-label-primary,#eee);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.dsb-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsb-button:disabled{opacity:.45;cursor:default}',
      '.dsb-primary{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 14px;border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4C8DFF));color:var(--dsw-alias-label-primary-foreground,#fff);font:inherit;font-size:12px;font-weight:500;cursor:pointer}',
      '.dsb-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#4C8DFF))}',
      '.dsb-primary:disabled{opacity:.45;cursor:default}',
      '.dsb-danger{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border:0;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-state-error-primary,#F85149);color:var(--dsw-alias-label-primary-foreground,#fff);font:inherit;font-size:12px;cursor:pointer}',
      '.dsb-danger--ghost{background:transparent;color:var(--dsw-alias-state-error-primary,#F85149);border:.5px solid color-mix(in srgb, var(--dsw-alias-state-error-primary,#F85149) 45%, transparent)}',
      '.dsb-danger--ghost:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary,#F85149) 12%, transparent)}',
      '.dsb-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:4px;flex:none}',
      '.dsb-foot--between{justify-content:space-between}',
      '.dsb-confirm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsb-field{display:flex;flex-direction:column;gap:4px}',
      '.dsb-field--row{flex-direction:row;align-items:center;justify-content:space-between;gap:8px}',
      '.dsb-field__label{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsb-swatches{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.dsb-swatch{width:18px;height:18px;padding:0;border:0;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}',
      '.dsb-swatch.is-on{box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay,#1f2023),0 0 0 3.5px var(--dsw-alias-label-primary,#eee)}',
      '.dsb-order{display:flex;align-items:center;gap:6px}',
      '.dsb-section-title{margin:4px 0 0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.dsb-error{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary,#F85149)}',
    ].join('')

    /* ------------------------------------------------------------------ *
     * Client plugin
     * ------------------------------------------------------------------ */

    const testApi = {
      createStore,
      createDomEngine,
      normalizeState,
      COLORS,
      COLOR_HEX,
      dataStore,
      dialogStore,
      openDialog,
      closeDialog,
      setMembership,
      clearMemberships,
      createBox,
      updateBox,
      deleteBox,
      moveBox,
      setCollapsed,
      setUngroupedCollapsed,
      refresh,
      CSS,
    }
    if (typeof window !== 'undefined' && window.__DSH_SESSION_BOXES_TEST__ === true) {
      window.__DSH_SESSION_BOXES_TEST_API__ = testApi
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin-css', 'dsh-session-boxes/client.css')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => {
            style.remove()
          }
        }, 'session-boxes: styles')

        ctx.effect(
          () => ctx.locale.register(NS, {
            zh: ZH,
            en: EN,
            ja: EN,
            es: EN,
            fr: EN,
            de: EN,
            ru: EN,
            pt: EN,
          }),
          'session-boxes: dictionaries',
        )

        ctx.effect(() => {
          const sync = () => {
            if (document.visibilityState === 'hidden') return
            void refresh()
          }
          window.addEventListener('focus', sync)
          document.addEventListener('visibilitychange', sync)
          const retry = window.setInterval(() => {
            if (dataStore.getSnapshot().status !== 'ready') void refresh()
          }, 4000)
          void refresh()
          return () => {
            window.removeEventListener('focus', sync)
            document.removeEventListener('visibilitychange', sync)
            window.clearInterval(retry)
          }
        }, 'session-boxes: data sync')

        const tRef = { current: ctx.locale.bind(NS) }
        resolveSessionTitle = (sessionId) => {
          const sessions = ctx.get('sessions')
          const summary = sessions?.list?.getSnapshot?.()?.byId?.[sessionId]
          const value = summary?.projectionValues?.title ?? summary?.title ?? summary?.displayTitle
          return typeof value === 'string' ? value : ''
        }
        const engine = createDomEngine({
          store: dataStore,
          getT: () => tRef.current,
          getPinned: () => {
            const workspaces = ctx.get('workspaces')
            const snapshot = workspaces?.list?.getSnapshot?.()
            return Array.isArray(snapshot?.pinnedSessionIds) ? snapshot.pinnedSessionIds : []
          },
          isBlank: (sessionId) => {
            const sessions = ctx.get('sessions')
            const summary = sessions?.list?.getSnapshot?.()?.byId?.[sessionId]
            return summary?.blank === true
          },
          openSessionDialog: (sessionId, title) => {
            openDialog({ kind: 'session', sessionId, title })
          },
          openBoxDialog: (boxId, sessions) => {
            openDialog({ kind: 'box', boxId, sessions })
          },
          openNewBox: () => {
            openDialog({ kind: 'new' })
          },
          openManager: () => {
            openDialog({ kind: 'manager' })
          },
        })

        function BoxController({ t }) {
          tRef.current = t
          useEffect(() => {
            engine.start()
            return () => {
              engine.stop()
            }
          }, [])
          useEffect(() => {
            engine.schedule()
          }, [t])
          return null
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-boxes-menu',
          order: 120,
          locale: NS,
        }, BoxMenuItem))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-boxes-controller',
          order: 4,
          locale: NS,
        }, BoxController))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-boxes-overlay',
          order: 55,
          locale: NS,
        }, BoxOverlay))
      },
    }
  },
})
