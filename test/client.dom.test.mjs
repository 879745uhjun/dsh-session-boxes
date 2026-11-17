/**
 * Browser-side grouping engine tests.
 *
 * Loads the real `client.js` bundle into Chromium with a stubbed Module Loader
 * and a fake React, then drives the exported DOM engine against a mock sidebar
 * that mirrors the ui-workspace markup (`data-row-key`, `.groupSection`, native
 * overflow button). No DSH runtime is needed.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const requireFromPlaywright = createRequire('D:/Deepseek work/workplace/pw-test/')
const { chromium } = requireFromPlaywright('playwright-core')

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = join(here, '..', 'client.js')

function assertThemePalette() {
  const source = readFileSync(clientPath, 'utf8')
  const lines = source.split('\n')
  const lightLine = lines.find((line) => line.includes(':root{--dshc-'))
  const darkLine = lines.find((line) => line.includes('body[data-ds-dark-theme]{--dshc-'))
  assert.ok(lightLine, 'light palette definition exists')
  assert.ok(darkLine, 'dark palette definition exists')

  const palette = new Set([lightLine, darkLine])
  const rest = lines.filter((line) => !palette.has(line)).join('\n')
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(rest), false, 'no bare hex outside the palette definitions')

  const light = {
    blue: '#0969DA',
    green: '#1A7F37',
    amber: '#9A6700',
    red: '#CF222E',
    purple: '#8250DF',
    cyan: '#1B7C83',
    pink: '#BF3989',
    gray: '#6E7781',
  }
  const dark = {
    blue: '#4C8DFF',
    green: '#3FB950',
    amber: '#D29922',
    red: '#F85149',
    purple: '#A371F7',
    cyan: '#39C5CF',
    pink: '#DB61A2',
    gray: '#8B949E',
  }
  for (const [color, value] of Object.entries(light)) {
    assert.match(lightLine, new RegExp(`--dshc-${color}:${value}(?:;|})`), `light ${color}`)
    assert.match(darkLine, new RegExp(`--dshc-${color}:${dark[color]}(?:;|})`), `dark ${color}`)
  }
  assert.equal((lightLine.match(/--dshc-/g) ?? []).length, 8)
  assert.equal((darkLine.match(/--dshc-/g) ?? []).length, 8)
  assert.match(lightLine, /--dsb-head-bg:18%/)
  assert.match(lightLine, /--dsb-head-border:45%/)
  assert.match(darkLine, /--dsb-head-bg:24%/)
  assert.match(darkLine, /--dsb-head-border:52%/)
  assert.equal(source.includes('prefers-color-scheme'), false, 'theme detection must use body[data-ds-dark-theme]')
  assert.equal(source.includes('COLOR_HEX'), false, 'color hex map must be gone')
  const colorsLine = lines.find((line) => line.includes('const COLORS ='))
  assert.ok(colorsLine, 'COLORS declaration exists')
  assert.equal(/#[0-9a-fA-F]/.test(colorsLine), false, 'COLORS keeps names only')
  assert.ok(source.includes('var(--dsb-color, var(--dshc-gray))'))
  console.log('client theme palette static test passed')
}
assertThemePalette()

const PAGE_CSS = `
  body { margin: 0; font: 13px/18px sans-serif; background: #fff; color: #111; }
  #sidebar { width: 320px; }
  .groupSection { position: relative; }
  .projectRow, .sessionRow { display: flex; align-items: center; height: 32px; box-sizing: border-box; }
  .projectRow { height: 34px; }
  .title { flex: 1; min-width: 0; }
  .rowActions { display: flex; }
`

function row(id, title) {
  return `<div class="sessionRow" data-row-key="session:${id}"><span class="title">${title}</span><span class="time">now</span><div class="rowActions"><button type="button" data-context-menu-trigger="1">…</button></div></div>`
}

function section(key, title, rows, withOverflow) {
  return `<div class="groupSection" data-section="${key}">
    <div class="projectRow" data-row-key="workspace:${key}"><span class="title">${title}</span></div>
    ${rows.map(([id, text]) => row(id, text)).join('')}
    ${withOverflow ? `<button type="button" class="sessionOverflowButton" data-row-key="overflow:${key}">Show more</button>` : ''}
  </div>`
}

function html(sections) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head>
    <body><div id="sidebar"><div class="sectionHeader"><div class="headerActions"><button type="button" class="iconButton">+</button></div></div><div class="list">${sections.join('')}</div></div></body></html>`
}

async function openPage(markup) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
  await page.setContent(markup)
  await page.evaluate(() => {
    window.__DSH_SESSION_BOXES_TEST__ = true
    window.__ModuleLoader__ = {
      load(definition) {
        window.__definition = definition
      },
    }
  })
  await page.addScriptTag({ path: clientPath })
  await page.evaluate(() => {
    const fakeReact = {
      createElement() {
        return null
      },
      Fragment: {},
      useEffect() {},
      useRef() {},
      useState() {},
      useSyncExternalStore() {},
    }
    window.__plugin = window.__definition.factory((id) => {
      if (id === 'react') return fakeReact
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
      throw new Error(`unexpected require: ${id}`)
    })
    if (window.__DSH_SESSION_BOXES_TEST_API__ === undefined) throw new Error('test API missing')
  })
  return { browser, page }
}

async function wait(page, ms = 300) {
  await page.waitForTimeout(ms)
}

const baseBoxes = [
  { id: 'b_front', name: '前端', color: 'blue', collapsed: false, order: 0 },
  { id: 'b_study', name: '学习', color: 'green', collapsed: false, order: 1 },
]

async function installStore(page, { boxes = baseBoxes, memberships = {}, pins = {}, pinned = [], blank = [], stats = { stars: {}, todos: {} } } = {}) {
  await page.evaluate(({ boxes, memberships, pins, pinned, blank, stats }) => {
    const api = window.__DSH_SESSION_BOXES_TEST_API__
    api.statsStore.set({
      stars: stats?.stars ?? {},
      todos: stats?.todos ?? {},
      revision: 1,
    })
    const store = api.createStore({
      status: 'ready',
      boxes,
      memberships,
      pins,
      ungroupedCollapsed: false,
      revision: 1,
      error: null,
    })
    window.__store = store
    window.__fetchCalls = 0
    window.fetch = async () => {
      window.__fetchCalls += 1
      return {
        ok: true,
        json: async () => ({ ok: true, state: store.getSnapshot() }),
      }
    }
    window.__boxDialog = null
    window.__sessionDialog = null
    window.__newBoxDialog = 0
    window.__managerOpened = 0
    const bump = (next) => {
      const snapshot = store.getSnapshot()
      store.set({ ...snapshot, ...next, revision: snapshot.revision + 1 })
    }
    window.__bump = bump
    window.__engine = api.createDomEngine({
      store,
      getT: () => (key) => key,
      getPinned: () => pinned,
      isBlank: (id) => blank.includes(id),
      openBoxDialog: (boxId, sessions) => {
        window.__boxDialog = { boxId, sessions }
      },
      openSessionDialog: (sessionId, title) => {
        window.__sessionDialog = { sessionId, title }
      },
      openNewBox: () => {
        window.__newBoxDialog += 1
      },
      openManager: () => {
        window.__managerOpened += 1
      },
      setCollapsed: (boxId, collapsed) => {
        bump({ boxes: store.getSnapshot().boxes.map((box) => (box.id === boxId ? { ...box, collapsed } : box)) })
      },
      setUngroupedCollapsed: (collapsed) => {
        bump({ ungroupedCollapsed: collapsed })
      },
      addMembership: (sessionId, boxId) => {
        const ids = store.getSnapshot().memberships[sessionId] ?? []
        if (!ids.includes(boxId)) {
          bump({ memberships: { ...store.getSnapshot().memberships, [sessionId]: [...ids, boxId] } })
        }
      },
      clearMemberships: (sessionId) => {
        const memberships = { ...store.getSnapshot().memberships }
        delete memberships[sessionId]
        bump({ memberships })
      },
      setLocation: (sessionId, boxId) => {
        const snapshot = store.getSnapshot()
        const memberships = { ...snapshot.memberships }
        if (boxId === null) delete memberships[sessionId]
        else memberships[sessionId] = [boxId]
        const pins = { ...snapshot.pins }
        for (const [pinnedBoxId, ids] of Object.entries(pins)) {
          if (pinnedBoxId === boxId) continue
          const kept = ids.filter((id) => id !== sessionId)
          if (kept.length === 0) delete pins[pinnedBoxId]
          else pins[pinnedBoxId] = kept
        }
        bump({ memberships, pins })
      },
      updateBox: (boxId, patch) => {
        bump({ boxes: store.getSnapshot().boxes.map((box) => (box.id === boxId ? { ...box, ...patch } : box)) })
      },
      moveBoxTo: (boxId, toIndex) => {
        const snapshot = store.getSnapshot()
        const box = snapshot.boxes.find((entry) => entry.id === boxId)
        if (box === undefined) return
        const boxes = snapshot.boxes.filter((entry) => entry.id !== boxId)
        boxes.splice(toIndex, 0, box)
        boxes.forEach((entry, index) => {
          entry.order = index
        })
        bump({ boxes })
      },
      autoExpand: false,
    })
    window.__engine.start()
  }, { boxes, memberships, pins, pinned, blank, stats })
  await wait(page)
}

async function firstScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha'], ['s2', 'Beta'], ['s3', 'Gamma']], true),
  ]))
  try {
    await installStore(page, {
      memberships: { s1: ['b_front'], s2: ['b_front', 'b_study'], s3: [] },
    })
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.setAttribute('data-test-css', '1')
      style.textContent = window.__DSH_SESSION_BOXES_TEST_API__.CSS
      document.head.appendChild(style)
    })

    const layout = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const byBox = {}
      for (const header of section.querySelectorAll(':scope > .dsb-h')) {
        byBox[header.dataset.dsbBox] = Number(header.style.order)
      }
      const rows = {}
      for (const node of section.querySelectorAll(':scope > [data-row-key^="session:"]')) {
        rows[node.dataset.rowKey] = { order: Number(node.style.order), display: node.style.display }
      }
      const cards = {}
      for (const id of ['s1', 's2', 's3']) {
        const row = section.querySelector(`[data-row-key="session:${id}"]`)
        const unit = row === null ? null : row.closest('[data-dsb-row-box]')
        cards[id] = unit === null ? null : {
          box: unit.getAttribute('data-dsb-row-box'),
          first: unit.hasAttribute('data-dsb-row-first'),
          last: unit.hasAttribute('data-dsb-row-last'),
          color: unit.style.getPropertyValue('--dsb-color'),
        }
      }
      return {
        display: section.style.display,
        direction: section.style.flexDirection,
        headers: Array.from(section.querySelectorAll(':scope > .dsb-h')).map((node) => node.dataset.dsbBox),
        byBox,
        rows,
        cards,
        managerButton: document.querySelector('[data-dsb-manage="1"]') !== null,
        workspaceOrder: Number(section.querySelector('[data-row-key^="workspace:"]').style.order),
        overflowOrder: Number(section.querySelector('[data-row-key^="overflow:"]').style.order),
        cloneCount: section.querySelectorAll('.dsb-clone').length,
        realS2Count: section.querySelectorAll('[data-row-key="session:s2"]').length,
        headerNames: Array.from(section.querySelectorAll('.dsb-h__name')).map((node) => node.textContent),
      }
    })

    assert.equal(layout.display, 'flex')
    assert.equal(layout.direction, 'column')
    assert.deepEqual(layout.headers.sort(), ['__ungrouped__', 'b_front', 'b_study'])
    assert.equal(layout.managerButton, true)
    assert.equal(layout.cards.s1.box, 'b_front')
    assert.equal(layout.cards.s1.first, true)
    assert.equal(layout.cards.s2.box, 'b_front')
    assert.equal(layout.cards.s2.last, true)
    assert.equal(layout.cards.s3.box, '__ungrouped__')
    assert.ok(layout.cards.s1.color.length > 0)
    assert.equal(layout.cloneCount, 0)

    const cardStyles = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const header = section.querySelector('[data-dsb-box="b_front"]')
      const first = section.querySelector('[data-row-key="session:s1"]').closest('[data-dsb-row-box]')
      const last = section.querySelector('[data-row-key="session:s2"]').closest('[data-dsb-row-box]')
      const h = getComputedStyle(header)
      const f = getComputedStyle(first)
      const l = getComputedStyle(last)
      return {
        headerBg: h.backgroundColor,
        headerShadow: h.boxShadow,
        headerTopRadius: h.borderTopLeftRadius,
        headerBottomRadius: h.borderBottomLeftRadius,
        rowBg: f.backgroundColor,
        rowShadow: f.boxShadow,
        rowMarginTop: f.marginTop,
        lastBottomRadius: l.borderBottomLeftRadius,
        lastMarginBottom: l.marginBottom,
      }
    })
    assert.notEqual(cardStyles.headerBg, 'rgba(0, 0, 0, 0)')
    assert.match(cardStyles.headerShadow, /inset/)
    assert.equal(cardStyles.headerTopRadius, '10px')
    assert.equal(cardStyles.headerBottomRadius, '0px')
    assert.notEqual(cardStyles.rowBg, 'rgba(0, 0, 0, 0)')
    assert.match(cardStyles.rowShadow, /inset/)
    assert.equal(cardStyles.rowMarginTop, '0px')
    assert.equal(cardStyles.lastBottomRadius, '10px')
    assert.equal(cardStyles.lastMarginBottom, '6px')
    assert.equal(layout.workspaceOrder, -1000000)
    assert.equal(layout.overflowOrder, 1000000)
    assert.ok(layout.byBox.b_front < layout.rows['session:s1'].order)
    assert.ok(layout.rows['session:s1'].order < layout.rows['session:s2'].order)
    assert.ok(layout.rows['session:s2'].order < layout.byBox.b_study)
    assert.ok(layout.byBox.b_study < layout.byBox.__ungrouped__)
    assert.ok(layout.byBox.__ungrouped__ < layout.rows['session:s3'].order)
    assert.ok(layout.rows['session:s3'].order < layout.overflowOrder)
    assert.equal(layout.cloneCount, 0)
    assert.equal(layout.realS2Count, 1)
    assert.deepEqual(layout.headerNames.sort(), ['header.ungrouped', '前端', '学习'])

    // The workspace section header hosts the box-manager button.
    const manager = await page.evaluate(() => {
      const button = document.querySelector('[data-dsb-manage="1"]')
      if (button === null) return null
      const parentClass = button.parentElement === null ? '' : button.parentElement.className
      button.click()
      return { parentClass, opened: window.__managerOpened }
    })
    assert.ok(manager !== null)
    assert.match(manager.parentClass, /headerActions/)
    assert.equal(manager.opened, 1)

    // Collapse the front box: its rows hide.
    await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="toggle"]').click()
    })
    await wait(page)
    const collapsed = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const s1 = section.querySelector('[data-row-key="session:s1"]')
      const s2 = section.querySelector('[data-row-key="session:s2"]')
      return {
        s1: s1.style.display,
        s2: s2.style.display,
        headerCollapsed: section.querySelector('[data-dsb-box="b_front"]').classList.contains('is-collapsed'),
      }
    })
    assert.equal(collapsed.s1, 'none')
    assert.equal(collapsed.s2, 'none')
    assert.equal(collapsed.headerCollapsed, true)

    // Expand again.
    await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="toggle"]').click()
    })
    await wait(page)
    const expanded = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      return {
        s1: section.querySelector('[data-row-key="session:s1"]').style.display,
        s2: section.querySelector('[data-row-key="session:s2"]').style.display,
      }
    })
    assert.equal(expanded.s1, '')
    assert.equal(expanded.s2, '')

    // Inline rename opens on double click; Escape leaves the stored name alone.
    const rename = await page.evaluate(() => {
      const name = document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="name"]')
      name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      const input = document.querySelector('[data-dsb-box="b_front"] .dsb-h__input')
      input.value = '临时名字'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      return {
        hasInput: document.querySelector('[data-dsb-box="b_front"] .dsb-h__input') !== null,
        name: document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="name"]').textContent,
        fetchCalls: window.__fetchCalls,
      }
    })
    assert.equal(rename.hasInput, false)
    assert.equal(rename.name, '前端')
    assert.equal(rename.fetchCalls, 0)

    // The add button opens the box dialog with this section's sessions.
    const addDialog = await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_study"] [data-dsb-role="add"]').click()
      return window.__boxDialog
    })
    assert.equal(addDialog.boxId, 'b_study')
    assert.deepEqual(addDialog.sessions.map((session) => session.id), ['s1', 's2', 's3'])

    // Membership changes flow through the store into the view.
    await page.evaluate(() => {
      const snapshot = window.__store.getSnapshot()
      window.__store.set({
        ...snapshot,
        memberships: { s1: ['b_front'], s2: [], s3: [] },
        revision: snapshot.revision + 1,
      })
    })
    await wait(page)
    const afterRemoval = await page.evaluate(() => ({
      clones: document.querySelectorAll('.dsb-clone').length,
      ungroupedRows: Array.from(document.querySelectorAll('[data-section="w1"] > [data-row-key^="session:"]'))
        .filter((node) => node.style.display !== 'none')
        .map((node) => node.dataset.rowKey),
    }))
    assert.equal(afterRemoval.clones, 0)
    assert.ok(afterRemoval.ungroupedRows.includes('session:s2'))

    // Deleting every box restores the native section untouched.
    await page.evaluate(() => {
      const snapshot = window.__store.getSnapshot()
      window.__store.set({
        ...snapshot,
        boxes: [],
        memberships: {},
        revision: snapshot.revision + 1,
      })
    })
    await wait(page)
    const cleaned = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      return {
        display: section.style.display,
        headers: section.querySelectorAll('.dsb-h').length,
        clones: section.querySelectorAll('.dsb-clone').length,
        orders: Array.from(section.children).map((node) => node.style.order),
        rowDisplay: Array.from(section.querySelectorAll('[data-row-key^="session:"]')).map((node) => node.style.display),
      }
    })
    assert.equal(cleaned.display, '')
    assert.equal(cleaned.headers, 0)
    assert.equal(cleaned.clones, 0)
    assert.ok(cleaned.orders.every((order) => order === ''))
    assert.ok(cleaned.rowDisplay.every((display) => display === ''))

    console.log('client scenario 1 passed')
  } finally {
    await browser.close()
  }
}

async function multiSectionScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha'], ['s2', 'Beta']], false),
    section('w2', 'Other', [['s9', 'Solo']], false),
  ]))
  try {
    await installStore(page, {
      memberships: { s1: ['b_front'], s2: ['b_study'] },
    })
    const result = await page.evaluate(() => {
      const w1 = document.querySelector('[data-section="w1"]')
      const w2 = document.querySelector('[data-section="w2"]')
      return {
        w1: Array.from(w1.querySelectorAll(':scope > .dsb-h')).map((node) => node.dataset.dsbBox),
        w2: Array.from(w2.querySelectorAll(':scope > .dsb-h')).map((node) => node.dataset.dsbBox),
        w2Rows: Array.from(w2.querySelectorAll('[data-row-key^="session:"]')).map((node) => node.dataset.rowKey),
      }
    })
    assert.deepEqual(result.w1.sort(), ['b_front', 'b_study'])
    assert.deepEqual(result.w2.sort(), ['__ungrouped__'])
    assert.deepEqual(result.w2Rows, ['session:s9'])
    console.log('client scenario 2 passed')
  } finally {
    await browser.close()
  }
}

async function pinnedAndBlankScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha'], ['s2', 'Beta'], ['s3', 'Pinned'], ['s4', 'Blank'], ['s5', 'Pinned loose']], false),
  ]))
  try {
    await installStore(page, {
      memberships: { s1: ['b_front'], s2: ['b_study'], s3: ['b_front'] },
      pinned: ['s3', 's5'],
      blank: ['s4'],
    })
    const result = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const front = section.querySelector('[data-dsb-box="b_front"]')
      const blank = section.querySelector('[data-row-key="session:s4"]')
      const s1 = section.querySelector('[data-row-key="session:s1"]')
      const s3 = section.querySelector('[data-row-key="session:s3"]')
      const s5 = section.querySelector('[data-row-key="session:s5"]')
      const ungrouped = section.querySelector('[data-dsb-box="__ungrouped__"]')
      const boxOf = (row) => {
        const unit = row.closest('[data-dsb-row-box]')
        return unit === null ? null : unit.getAttribute('data-dsb-row-box')
      }
      return {
        s3Order: Number(s3.style.order),
        s1Order: Number(s1.style.order),
        s5Order: Number(s5.style.order),
        blankOrder: Number(blank.style.order),
        frontOrder: Number(front.style.order),
        ungroupedOrder: Number(ungrouped.style.order),
        s3Box: boxOf(s3),
        s5Box: boxOf(s5),
        s3Clone: section.querySelector('.dsb-clone[data-dsb-clone-of="s3"]') !== null,
        s3InUngrouped: ungrouped !== null && Number(s3.style.order) > Number(ungrouped.style.order),
      }
    })
    assert.ok(result.blankOrder < result.frontOrder)
    assert.ok(result.s3Order > result.frontOrder)
    assert.ok(result.s3Order < result.s1Order)
    assert.ok(result.s5Order < result.frontOrder)
    assert.equal(result.s3Box, 'b_front')
    assert.equal(result.s5Box, null)
    assert.equal(result.s3Clone, false)
    assert.equal(result.s3InUngrouped, false)
    console.log('client scenario 3 passed')
  } finally {
    await browser.close()
  }
}

function wrappedSection(key, title, rows) {
  return `<div class="groupSection" data-section="${key}">
    <span class="hoverRoot"><div class="projectRow" data-row-key="workspace:${key}"><span class="title">${title}</span></div></span>
    ${rows.map(([id, text]) => `<span class="hoverRoot">${row(id, text)}</span>`).join('')}
    <button type="button" class="sessionOverflowButton" data-row-key="overflow:${key}">Show more</button>
  </div>`
}

async function wrappedRowScenario() {
  const { browser, page } = await openPage(html([
    wrappedSection('w1', 'Workplace', [['s1', 'Alpha'], ['s2', 'Beta'], ['s3', 'Gamma']]),
  ]))
  try {
    await installStore(page, {
      memberships: { s1: ['b_front'], s2: ['b_front'], s3: [] },
    })
    const result = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const unitOf = (id) => document.querySelector(`[data-row-key="session:${id}"]`).parentElement
      return {
        display: section.style.display,
        workspaceUnitOrder: Number(document.querySelector('[data-row-key="workspace:w1"]').parentElement.style.order),
        s1Order: Number(unitOf('s1').style.order),
        s2Order: Number(unitOf('s2').style.order),
        s3Order: Number(unitOf('s3').style.order),
        cloneCount: section.querySelectorAll('.dsb-clone').length,
        headers: Array.from(section.querySelectorAll(':scope > .dsb-h')).map((node) => node.dataset.dsbBox),
        overflowOrder: Number(section.querySelector('[data-row-key^="overflow:"]').style.order),
      }
    })
    assert.equal(result.display, 'flex')
    assert.equal(result.workspaceUnitOrder, -1000000)
    assert.equal(result.overflowOrder, 1000000)
    assert.ok(result.s1Order < result.s2Order)
    assert.equal(result.cloneCount, 0)
    assert.deepEqual(result.headers.sort(), ['__ungrouped__', 'b_front', 'b_study'])

    // Collapse hides the wrapper span, not the inner native row.
    await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="toggle"]').click()
    })
    await wait(page)
    const collapsed = await page.evaluate(() => {
      const unit = document.querySelector('[data-row-key="session:s1"]').parentElement
      return { display: unit.style.display, ariaHidden: unit.getAttribute('aria-hidden') }
    })
    assert.equal(collapsed.display, 'none')
    assert.equal(collapsed.ariaHidden, 'true')

    // Cleanup restores the wrapper.
    await page.evaluate(() => {
      const snapshot = window.__store.getSnapshot()
      window.__store.set({ ...snapshot, boxes: [], memberships: {}, revision: snapshot.revision + 1 })
    })
    await wait(page)
    const cleaned = await page.evaluate(() => {
      const unit = document.querySelector('[data-row-key="session:s1"]').parentElement
      const section = document.querySelector('[data-section="w1"]')
      return {
        display: unit.style.display,
        order: unit.style.order,
        headers: section.querySelectorAll('.dsb-h').length,
        clones: section.querySelectorAll('.dsb-clone').length,
      }
    })
    assert.equal(cleaned.display, '')
    assert.equal(cleaned.order, '')
    assert.equal(cleaned.headers, 0)
    assert.equal(cleaned.clones, 0)
    console.log('client scenario 5 passed')
  } finally {
    await browser.close()
  }
}

async function applyScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha']], false),
  ]))
  try {
    const result = await page.evaluate(() => {
      const definition = window.__plugin
      const registrations = []
      const disposers = []
      const dictionaries = {}
      const fakeCtx = {
        effect(factory) {
          const dispose = factory()
          if (typeof dispose === 'function') disposers.push(dispose)
          return dispose
        },
        locale: {
          register(namespace, dicts) {
            dictionaries[namespace] = dicts
            return () => {}
          },
          bind(namespace) {
            return (key) => `${namespace}:${key}`
          },
        },
        slots: {
          inject(_name, callback) {
            callback()
          },
          register(options, component) {
            registrations.push({ options, component })
            return () => {}
          },
        },
        get(key) {
          if (key === 'contextMenus') {
            return {
              register(contribution) {
                window.__contextContribution = contribution
                return () => {}
              },
            }
          }
          return undefined
        },
      }
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ ok: true, state: { boxes: [], memberships: {}, ungroupedCollapsed: false } }),
      })
      definition.apply(fakeCtx)
      const contribution = window.__contextContribution
      const menuActions = contribution === undefined || contribution === null
        ? []
        : contribution.resolve({ sessionId: 's1', displayTitle: 'Alpha' }, new AbortController().signal)
      window.__DSH_SESSION_BOXES_TEST_API__.dataStore.set({
        status: 'ready',
        boxes: [{ id: 'b1', name: 'Box', color: 'blue', collapsed: false, parentId: null, order: 0 }],
        memberships: { s1: ['b1'] },
        pins: { b1: ['s1'] },
        ungroupedCollapsed: false,
        revision: 1,
        error: null,
      })
      const menuActionsWithBox = contribution === undefined || contribution === null
        ? []
        : contribution.resolve({ sessionId: 's1', displayTitle: 'Alpha' }, new AbortController().signal)
      document.documentElement.style.setProperty('--dsw-alias-button-primary-fill', 'rgb(18, 52, 86)')
      document.documentElement.style.setProperty('--dsw-alias-label-primary-foreground', 'rgb(171, 205, 239)')
      const button = document.createElement('button')
      button.className = 'dsb-primary'
      button.textContent = 'x'
      document.body.appendChild(button)
      const buttonStyle = getComputedStyle(button)
      const list = document.createElement('div')
      list.className = 'dsb-list dsb-list--scroll'
      const label = document.createElement('label')
      label.className = 'dsb-check'
      const input = document.createElement('input')
      input.type = 'checkbox'
      const dot = document.createElement('span')
      dot.className = 'dsb-dot'
      const name = document.createElement('span')
      name.className = 'dsb-check__name'
      name.textContent = '测试会话'
      const pin = document.createElement('button')
      pin.type = 'button'
      pin.className = 'dsb-pin'
      pin.textContent = 'P'
      label.append(input, dot, name, pin)
      list.append(label)
      const modal = document.createElement('div')
      modal.className = 'dsb-modal dsb-modal--wide'
      const body = document.createElement('div')
      body.className = 'dsb-modal__body'
      body.append(list)
      modal.append(body)
      document.body.append(modal)
      const labelStyle = getComputedStyle(label)
      const nameStyle = getComputedStyle(name)
      const labelRect = label.getBoundingClientRect()
      const nameRect = name.getBoundingClientRect()
      const pinRect = pin.getBoundingClientRect()
      const modalRect = modal.getBoundingClientRect()
      const hasCheckRule = Array.from(document.styleSheets).some((sheet) => {
        try {
          return Array.from(sheet.cssRules).some((rule) => rule.selectorText === '.dsb-check')
        } catch {
          return false
        }
      })
      return {
        slots: registrations.map((entry) => entry.options.name),
        ids: registrations.map((entry) => entry.options.id),
        hasZh: dictionaries['session-boxes']?.zh !== undefined,
        hasEn: dictionaries['session-boxes']?.en !== undefined,
        style: document.querySelector('style[data-plugin-css="dsh-session-boxes/client.css"]') !== null,
        disposers: disposers.length,
        components: registrations.map((entry) => typeof entry.component),
        buttonBg: buttonStyle.backgroundColor,
        buttonColor: buttonStyle.color,
        hasCheckRule,
        checkDisplay: labelStyle.display,
        checkWidth: labelRect.width,
        nameWidth: nameRect.width,
        nameFlex: nameStyle.flexGrow,
        pinLeft: pinRect.left,
        nameRight: nameRect.right,
        modalWidth: modalRect.width,
        pinRight: pinRect.right,
        modalRight: modalRect.right,
        contextTarget: contribution?.target,
        contextOrder: contribution?.order,
        menuLabel: menuActions[0]?.label,
        menuChildLabel: menuActions[0]?.children?.[0]?.label,
        menuChildIcon: menuActions[0]?.children?.[0]?.icon?.key,
        menuChildren: menuActions[0]?.children?.length,
        menuPinLabel: menuActionsWithBox[0]?.children?.[1]?.label,
        menuPinIcon: menuActionsWithBox[0]?.children?.[1]?.icon?.key,
      }
    })
    assert.deepEqual(result.slots.sort(), [
      'contextMenu.icon',
      'contextMenu.icon',
      'shell.overlay',
      'shell.overlay',
    ])
    assert.equal(result.hasZh, true)
    assert.equal(result.hasEn, true)
    assert.equal(result.style, true)
    assert.ok(result.disposers >= 3)
    assert.ok(result.components.every((type) => type === 'function'))
    assert.equal(result.buttonBg, 'rgb(18, 52, 86)')
    assert.equal(result.buttonColor, 'rgb(171, 205, 239)')
    assert.equal(result.contextTarget, 'session')
    assert.equal(result.contextOrder, 500)
    assert.equal(result.menuLabel, 'session-boxes:menu.settings')
    assert.equal(result.menuChildLabel, 'session-boxes:menu.item')
    assert.equal(result.menuChildIcon, 'session-boxes.box')
    assert.equal(result.menuChildren, 1)
    assert.equal(result.menuPinLabel, 'session-boxes:menu.unpinBox')
    assert.equal(result.menuPinIcon, 'session-boxes.pin')
    assert.equal(result.hasCheckRule, true)
    assert.equal(result.checkDisplay, 'flex')
    assert.equal(result.nameFlex, '1')
    assert.ok(result.nameWidth > 100)
    assert.ok(result.pinLeft > result.nameRight)
    assert.ok(result.checkWidth > 300)
    assert.ok(result.pinRight > result.modalRight - 40)
    console.log('client scenario 6 passed')
  } finally {
    await browser.close()
  }
}

async function pinAndDragScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha'], ['s2', 'Beta'], ['s3', 'Gamma']], false),
  ]))
  try {
    await installStore(page, {
      memberships: { s1: ['b_front'], s2: ['b_front'], s3: ['b_study'] },
      pins: { b_front: ['s2'] },
    })
    const pinned = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const unitOf = (id) => document.querySelector(`[data-row-key="session:${id}"]`).closest('[data-dsb-row-box]')
      const header = section.querySelector('[data-dsb-box="b_front"]')
      const badge = header.querySelector('[data-dsb-role="pin"]')
      return {
        s1Order: Number(unitOf('s1').style.order),
        s2Order: Number(unitOf('s2').style.order),
        s2Pinned: unitOf('s2').getAttribute('data-dsb-pinned'),
        s1Pinned: unitOf('s1').getAttribute('data-dsb-pinned'),
        s2First: unitOf('s2').hasAttribute('data-dsb-row-first'),
        s1Last: unitOf('s1').hasAttribute('data-dsb-row-last'),
        badgeDisplay: badge.style.display,
        badgeCount: badge.querySelector('[data-dsb-role="pinCount"]').textContent,
        draggable: header.getAttribute('draggable'),
      }
    })
    assert.ok(pinned.s2Order < pinned.s1Order)
    assert.equal(pinned.s2Pinned, '1')
    assert.equal(pinned.s1Pinned, null)
    assert.equal(pinned.s2First, true)
    assert.equal(pinned.s1Last, true)
    assert.equal(pinned.badgeDisplay, '')
    assert.equal(pinned.badgeCount, '1')
    assert.equal(pinned.draggable, 'true')

    // Dragging the second box header onto the top half of the first reorders boxes.
    await page.evaluate(() => {
      const header = document.querySelector('[data-dsb-box="b_front"]')
      const rect = header.getBoundingClientRect()
      const transfer = new DataTransfer()
      transfer.setData('application/x-dsh-box', 'b_study')
      header.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + 2,
        dataTransfer: transfer,
      }))
    })
    await wait(page)
    const order = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      return Array.from(section.querySelectorAll(':scope > .dsb-h'))
        .sort((left, right) => Number(left.style.order) - Number(right.style.order))
        .map((node) => node.dataset.dsbBox)
    })
    assert.deepEqual(order, ['b_study', 'b_front', '__ungrouped__'])

    // A session dragged onto a box header still adds membership.
    await page.evaluate(() => {
      const header = document.querySelector('[data-dsb-box="b_front"]')
      const transfer = new DataTransfer()
      transfer.setData('text/plain', 's3')
      header.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientY: 0,
        dataTransfer: transfer,
      }))
    })
    await wait(page)
    const dropped = await page.evaluate(() => ({
      membership: window.__store.getSnapshot().memberships.s3,
      clones: document.querySelectorAll('.dsb-clone[data-dsb-clone-of="s3"]').length,
    }))
    assert.deepEqual(dropped.membership, ['b_front'])
    assert.equal(dropped.clones, 0)

    // Pinning another session updates the order and badge without a reload.
    await page.evaluate(() => {
      const snapshot = window.__store.getSnapshot()
      window.__store.set({
        ...snapshot,
        pins: { b_front: ['s1', 's2'] },
        revision: snapshot.revision + 1,
      })
    })
    await wait(page)
    const repinned = await page.evaluate(() => {
      const unitOf = (id) => document.querySelector(`[data-row-key="session:${id}"]`).closest('[data-dsb-row-box]')
      const badge = document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="pin"]')
      return {
        s1Order: Number(unitOf('s1').style.order),
        s2Order: Number(unitOf('s2').style.order),
        s1Pinned: unitOf('s1').getAttribute('data-dsb-pinned'),
        badgeCount: badge.querySelector('[data-dsb-role="pinCount"]').textContent,
      }
    })
    assert.ok(repinned.s1Order < repinned.s2Order)
    assert.equal(repinned.s1Pinned, '1')
    assert.equal(repinned.badgeCount, '2')
    console.log('client scenario 7 passed')
  } finally {
    await browser.close()
  }
}

async function subfolderScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha'], ['s2', 'Beta'], ['s3', 'Gamma']], false),
  ]))
  try {
    await installStore(page, {
      boxes: [
        { id: 'b_front', name: '前端', color: 'blue', collapsed: false, parentId: null, order: 0 },
        { id: 'b_sub', name: '组件', color: 'green', collapsed: false, parentId: 'b_front', order: 1 },
        { id: 'b_study', name: '学习', color: 'amber', collapsed: false, parentId: null, order: 2 },
      ],
      memberships: { s1: ['b_front'], s2: ['b_sub'], s3: ['b_study'] },
      pins: { b_sub: ['s2'] },
    })
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.setAttribute('data-test-css', '1')
      style.textContent = window.__DSH_SESSION_BOXES_TEST_API__.CSS
      document.head.appendChild(style)
    })
    const result = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const header = (id) => section.querySelector(`[data-dsb-box="${id}"]`)
      const unit = (id) => document.querySelector(`[data-row-key="session:${id}"]`).closest('[data-dsb-row-box]')
      const parentHeader = header('b_front')
      const childHeader = header('b_sub')
      const childUnit = unit('s2')
      return {
        order: Array.from(section.querySelectorAll(':scope > .dsb-h'))
          .sort((left, right) => Number(left.style.order) - Number(right.style.order))
          .map((node) => node.dataset.dsbBox),
        parentDepth: parentHeader.dataset.dsbDepth,
        parentSubs: parentHeader.querySelector('[data-dsb-role="subsCount"]').textContent,
        parentSubsDisplay: parentHeader.querySelector('[data-dsb-role="subs"]').style.display,
        parentCount: parentHeader.querySelector('[data-dsb-role="count"]').textContent,
        childDepth: childHeader.dataset.dsbDepth,
        childCount: childHeader.querySelector('[data-dsb-role="count"]').textContent,
        childPin: childHeader.querySelector('[data-dsb-role="pinCount"]').textContent,
        s1Box: unit('s1').getAttribute('data-dsb-row-box'),
        s1Depth: unit('s1').getAttribute('data-dsb-depth'),
        s2Box: unit('s2').getAttribute('data-dsb-row-box'),
        s2Depth: unit('s2').getAttribute('data-dsb-depth'),
        s3Box: unit('s3').getAttribute('data-dsb-row-box'),
        clones: section.querySelectorAll('.dsb-clone').length,
        parentLeft: parentHeader.getBoundingClientRect().left,
        childHeaderLeft: childHeader.getBoundingClientRect().left,
        childUnitLeft: childUnit.getBoundingClientRect().left,
        parentPaddingLeft: parseFloat(getComputedStyle(parentHeader).paddingLeft),
        childHeaderPaddingLeft: parseFloat(getComputedStyle(childHeader).paddingLeft),
        childHeaderMarginLeft: getComputedStyle(childHeader).marginLeft,
        childUnitMarginLeft: getComputedStyle(childUnit).marginLeft,
        childUnitPaddingLeft: getComputedStyle(childUnit).paddingLeft,
        parentTopRadius: getComputedStyle(parentHeader).borderTopLeftRadius,
        parentBottomRadius: getComputedStyle(parentHeader).borderBottomLeftRadius,
        childTopRadius: getComputedStyle(childHeader).borderTopLeftRadius,
        childLastBottomRadius: getComputedStyle(childUnit).borderBottomLeftRadius,
        childLastMarker: childUnit.hasAttribute('data-dsb-subtree-last'),
        parentLastMarker: parentHeader.hasAttribute('data-dsb-subtree-last'),
      }
    })
    assert.deepEqual(result.order, ['b_front', 'b_sub', 'b_study', '__ungrouped__'])
    assert.equal(result.parentDepth, '0')
    assert.equal(result.parentSubs, '1')
    assert.equal(result.parentSubsDisplay, '')
    assert.equal(result.parentCount, '1')
    assert.equal(result.childDepth, '1')
    assert.equal(result.childCount, '1')
    assert.equal(result.childPin, '1')
    assert.equal(result.s1Box, 'b_front')
    assert.equal(result.s1Depth, null)
    assert.equal(result.s2Box, 'b_sub')
    assert.equal(result.s2Depth, '1')
    assert.equal(result.s3Box, 'b_study')
    assert.equal(result.clones, 0)
    assert.equal(result.childHeaderLeft, result.parentLeft)
    assert.equal(result.childUnitLeft, result.parentLeft)
    assert.equal(result.childHeaderMarginLeft, '0px')
    assert.equal(result.childUnitMarginLeft, '0px')
    assert.ok(result.childHeaderPaddingLeft > result.parentPaddingLeft)
    assert.equal(result.childUnitPaddingLeft, '18px')
    assert.equal(result.parentTopRadius, '10px')
    assert.equal(result.parentBottomRadius, '0px')
    assert.equal(result.childTopRadius, '0px')
    assert.equal(result.childLastBottomRadius, '10px')
    assert.equal(result.childLastMarker, true)
    assert.equal(result.parentLastMarker, false)

    // Collapsing the parent hides its direct row and the whole child card.
    await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="toggle"]').click()
    })
    await wait(page)
    const parentCollapsed = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const unit = (id) => document.querySelector(`[data-row-key="session:${id}"]`).closest('[data-dsb-row-box]')
      return {
        s1: unit('s1').style.display,
        s2: unit('s2').style.display,
        childHeader: section.querySelector('[data-dsb-box="b_sub"]').style.display,
        parentClass: section.querySelector('[data-dsb-box="b_front"]').className,
      }
    })
    assert.equal(parentCollapsed.s1, 'none')
    assert.equal(parentCollapsed.s2, 'none')
    assert.equal(parentCollapsed.childHeader, 'none')
    assert.match(parentCollapsed.parentClass, /is-collapsed/)

    // Expanding the parent restores the child card; collapsing the child hides only its rows.
    await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_front"] [data-dsb-role="toggle"]').click()
    })
    await wait(page)
    await page.evaluate(() => {
      document.querySelector('[data-dsb-box="b_sub"] [data-dsb-role="toggle"]').click()
    })
    await wait(page)
    const childCollapsed = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const unit = (id) => document.querySelector(`[data-row-key="session:${id}"]`).closest('[data-dsb-row-box]')
      return {
        s1: unit('s1').style.display,
        s2: unit('s2').style.display,
        childHeader: section.querySelector('[data-dsb-box="b_sub"]').style.display,
        childClass: section.querySelector('[data-dsb-box="b_sub"]').className,
      }
    })
    assert.equal(childCollapsed.s1, '')
    assert.equal(childCollapsed.s2, 'none')
    assert.equal(childCollapsed.childHeader, '')
    assert.match(childCollapsed.childClass, /is-collapsed/)
    console.log('client scenario 8 passed')
  } finally {
    await browser.close()
  }
}

async function aggregateStatsScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [
      ['s1', 'Alpha'],
      ['s2', 'Beta'],
      ['s3', 'Gamma'],
      ['s4', 'Delta'],
      ['s5', 'Epsilon'],
    ], false),
  ]))
  try {
    await installStore(page, {
      boxes: [
        { id: 'b_front', name: 'Front', color: 'blue', collapsed: false, parentId: null, order: 0 },
        { id: 'b_sub', name: 'Sub', color: 'green', collapsed: false, parentId: 'b_front', order: 1 },
        { id: 'b_other', name: 'Other', color: 'amber', collapsed: false, parentId: null, order: 2 },
      ],
      memberships: { s1: ['b_front'], s2: ['b_sub'], s3: ['b_other'], s4: ['b_front'], s5: ['b_sub'] },
      stats: {
        stars: { s1: 5, s2: 3, s3: 4, s4: 5, s5: 3 },
        todos: { s1: true, s2: false, s3: true, s4: true, s5: false },
      },
    })
    const result = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const api = window.__DSH_SESSION_BOXES_TEST_API__
      const header = (id) => section.querySelector(`[data-dsb-box="${id}"]`)
      const stat = (id, role) => header(id).querySelector(`[data-dsb-role="${role}"]`)
      const fiveState = {
        boxes: [{ id: 'b_five', name: 'Five', color: 'blue', collapsed: false, parentId: null, order: 0 }],
        memberships: {
          t1: ['b_five'], t2: ['b_five'], t3: ['b_five'], t4: ['b_five'], t5: ['b_five'],
        },
        pins: {},
      }
      const zero = api.computeBoxStats(fiveState, 'b_five', {
        stars: {},
        todos: { t1: false, t2: false, t3: false, t4: false, t5: false },
      })
      const all = api.computeBoxStats(fiveState, 'b_five', {
        stars: {},
        todos: { t1: true, t2: true, t3: true, t4: true, t5: true },
      })
      const empty = api.computeBoxStats({
        boxes: [{ id: 'b_empty', name: 'Empty', color: 'blue', collapsed: false, parentId: null, order: 0 }],
        memberships: {},
        pins: {},
      }, 'b_empty', { stars: {}, todos: {} })
      return {
        parentStars: stat('b_front', 'statStars').textContent,
        parentTodos: stat('b_front', 'statTodos').textContent,
        parentDisplay: header('b_front').querySelector('[data-dsb-role="stats"]').style.display,
        childStars: stat('b_sub', 'statStars').textContent,
        childTodos: stat('b_sub', 'statTodos').textContent,
        otherStars: stat('b_other', 'statStars').textContent,
        otherTodos: stat('b_other', 'statTodos').textContent,
        zeroTodos: zero.todos,
        zeroStars: zero.stars,
        allTodos: all.todos,
        emptyStars: empty.stars,
        emptyTodos: empty.todos,
        headerCount: section.querySelectorAll(':scope > .dsb-h').length,
      }
    })
    assert.equal(result.parentStars, '★ 4.0')
    assert.equal(result.parentTodos, '☑ 2/4')
    assert.equal(result.parentDisplay, '')
    assert.equal(result.childStars, '★ 3.0')
    assert.equal(result.childTodos, '☑ 0/2')
    assert.equal(result.otherStars, '★ 4.0')
    assert.equal(result.otherTodos, '☑ 1/1')
    assert.equal(result.zeroTodos, '0/5')
    assert.equal(result.allTodos, '5/5')
    assert.equal(result.zeroStars, null)
    assert.equal(result.emptyStars, null)
    assert.equal(result.emptyTodos, null)
    assert.ok(result.headerCount >= 3)

    // Ratings disappearing hides only the star segment; todos keep working.
    await page.evaluate(() => {
      window.__DSH_SESSION_BOXES_TEST_API__.statsStore.set({
        stars: {},
        todos: { s1: true, s4: true },
        revision: 2,
      })
    })
    await wait(page)
    const noRatings = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const header = (id) => section.querySelector(`[data-dsb-box="${id}"]`)
      return {
        starDisplay: header('b_front').querySelector('[data-dsb-role="statStars"]').style.display,
        todoText: header('b_front').querySelector('[data-dsb-role="statTodos"]').textContent,
      }
    })
    assert.equal(noRatings.starDisplay, 'none')
    assert.equal(noRatings.todoText, '☑ 2/2')

    // 404 on stars and broken JSON on todos: both segments disappear, headers stay.
    await page.evaluate(async () => {
      window.fetch = async (url) => {
        if (String(url).includes('session-stars')) return { ok: false, status: 404 }
        return {
          ok: true,
          json: async () => {
            throw new Error('bad json')
          },
        }
      }
      await window.__DSH_SESSION_BOXES_TEST_API__.refreshStats()
    })
    await wait(page)
    const degraded = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const header = (id) => section.querySelector(`[data-dsb-box="${id}"]`)
      const stats = header('b_front').querySelector('[data-dsb-role="stats"]')
      const name = header('b_front').querySelector('[data-dsb-role="name"]')
      return {
        statsDisplay: stats.style.display,
        starDisplay: header('b_front').querySelector('[data-dsb-role="statStars"]').style.display,
        todoDisplay: header('b_front').querySelector('[data-dsb-role="statTodos"]').style.display,
        name: name.textContent,
        headers: section.querySelectorAll(':scope > .dsb-h').length,
        stars: window.__DSH_SESSION_BOXES_TEST_API__.statsStore.getSnapshot().stars,
        todos: window.__DSH_SESSION_BOXES_TEST_API__.statsStore.getSnapshot().todos,
      }
    })
    assert.equal(degraded.statsDisplay, 'none')
    assert.equal(degraded.starDisplay, 'none')
    assert.equal(degraded.todoDisplay, 'none')
    assert.equal(degraded.name, 'Front')
    assert.ok(degraded.headers >= 3)
    assert.deepEqual(degraded.stars, {})
    assert.deepEqual(degraded.todos, {})
    console.log('client scenario 9 passed')
  } finally {
    await browser.close()
  }
}

async function autoExpandScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha']], true),
  ]))
  try {
    await page.evaluate((boxes) => {
      const api = window.__DSH_SESSION_BOXES_TEST_API__
      const store = api.createStore({
        status: 'ready',
        boxes,
        memberships: { s1: ['b_front'] },
        pins: {},
        ungroupedCollapsed: false,
        revision: 1,
        error: null,
      })
      window.__overflowClicks = 0
      const overflow = document.querySelector('[data-row-key^="overflow:"]')
      overflow.addEventListener('click', () => {
        window.__overflowClicks += 1
        overflow.remove()
      })
      const engine = api.createDomEngine({
        store,
        getT: () => (key) => key,
        autoExpand: true,
      })
      engine.start()
    }, baseBoxes)
    await page.waitForTimeout(600)
    const clicks = await page.evaluate(() => window.__overflowClicks)
    assert.ok(clicks >= 1, `expected the overflow control to be clicked, got ${clicks}`)
    console.log('client scenario 4 passed')
  } finally {
    await browser.close()
  }
}

async function headerConfigScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [
      ['s1', 'Alpha'],
      ['s2', 'Beta'],
      ['s3', 'Gamma'],
      ['s4', 'Delta'],
    ], false),
  ]))
  try {
    await installStore(page, {
      boxes: [
        { id: 'b_full', name: 'Full', color: 'blue', collapsed: false, parentId: null, order: 0 },
        { id: 'b_sub', name: 'Sub', color: 'green', collapsed: false, parentId: 'b_full', order: 1 },
        { id: 'b_compact', name: 'Compact', color: 'amber', collapsed: false, parentId: null, order: 2, header: { count: true, pinned: false, subs: false, stars: false, todos: false, add: false, menu: true } },
        { id: 'b_off', name: 'Off', color: 'red', collapsed: false, parentId: null, order: 3, header: { count: false, pinned: false, subs: false, stars: false, todos: false, add: false, menu: false } },
      ],
      memberships: { s1: ['b_full'], s2: ['b_sub'], s3: ['b_compact'], s4: ['b_off'] },
      pins: { b_full: ['s1'] },
      stats: {
        stars: { s1: 5, s2: 3, s3: 4, s4: 2 },
        todos: { s1: true, s2: true, s3: true, s4: true },
      },
    })
    const result = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const api = window.__DSH_SESSION_BOXES_TEST_API__
      const header = (id) => section.querySelector(`[data-dsb-box="${id}"]`)
      const role = (id, name) => header(id).querySelector(`[data-dsb-role="${name}"]`)
      const nameWidth = (id) => header(id).querySelector('[data-dsb-role="name"]').getBoundingClientRect().width
      const has = (id, name) => role(id, name) !== null
      const invalid = api.normalizeState({
        boxes: [{
          id: 'b_invalid',
          name: 'Invalid',
          color: 'blue',
          collapsed: false,
          parentId: null,
          order: 0,
          header: { count: 'yes', pinned: 0, subs: false, stars: null, todos: true, add: 1, menu: false },
        }],
        memberships: {},
        pins: {},
      })
      const old = api.normalizeState({
        boxes: [{ id: 'b_old', name: 'Old', color: 'blue', collapsed: false, parentId: null, order: 0 }],
        memberships: {},
        pins: {},
      })
      const defaultBefore = api.readNewBoxHeader()
      api.writeNewBoxHeader(api.compactHeader())
      const defaultCompact = api.readNewBoxHeader()
      api.writeNewBoxHeader(api.DEFAULT_HEADER)
      return {
        full: {
          count: has('b_full', 'count'),
          pinned: has('b_full', 'pin'),
          subs: has('b_full', 'subs'),
          stats: has('b_full', 'stats'),
          add: has('b_full', 'add'),
          menu: has('b_full', 'more'),
          pinDisplay: role('b_full', 'pin').style.display,
          subsDisplay: role('b_full', 'subs').style.display,
        },
        compact: {
          count: has('b_compact', 'count'),
          pinned: has('b_compact', 'pin'),
          subs: has('b_compact', 'subs'),
          stats: has('b_compact', 'stats'),
          add: has('b_compact', 'add'),
          menu: has('b_compact', 'more'),
        },
        off: {
          count: has('b_off', 'count'),
          pinned: has('b_off', 'pin'),
          subs: has('b_off', 'subs'),
          stats: has('b_off', 'stats'),
          add: has('b_off', 'add'),
          menu: has('b_off', 'more'),
          chevron: has('b_off', 'toggle'),
        },
        fullNameWidth: nameWidth('b_full'),
        compactNameWidth: nameWidth('b_compact'),
        compactHeader: api.compactHeader(),
        invalidHeader: invalid.boxes[0].header,
        oldHeader: old.boxes[0].header,
        defaultBefore,
        defaultCompact,
        effectiveOff: api.effectiveHeader({ count: false, pinned: false, subs: false, stars: false, todos: false, add: false, menu: false }),
      }
    })
    assert.deepEqual(result.full, {
      count: true,
      pinned: true,
      subs: true,
      stats: true,
      add: true,
      menu: true,
      pinDisplay: '',
      subsDisplay: '',
    })
    assert.deepEqual(result.compact, { count: true, pinned: false, subs: false, stats: false, add: false, menu: true })
    assert.deepEqual(result.off, { count: false, pinned: false, subs: false, stats: false, add: false, menu: true, chevron: true })
    assert.ok(result.compactNameWidth > result.fullNameWidth, 'compact header leaves more room for the name')
    assert.deepEqual(result.compactHeader, { count: true, pinned: false, subs: false, stars: false, todos: false, add: false, menu: true })
    assert.deepEqual(result.invalidHeader, { count: true, pinned: true, subs: false, stars: true, todos: true, add: true, menu: false })
    assert.deepEqual(result.oldHeader, { count: true, pinned: true, subs: true, stars: true, todos: true, add: true, menu: true })
    assert.deepEqual(result.defaultBefore, { count: true, pinned: true, subs: true, stars: true, todos: true, add: true, menu: true })
    assert.deepEqual(result.defaultCompact, { count: true, pinned: false, subs: false, stars: false, todos: false, add: false, menu: true })
    assert.deepEqual(result.effectiveOff, { count: false, pinned: false, subs: false, stars: false, todos: false, add: false, menu: true })

    // Collapsed and expanded headers use the same per-box configuration.
    await page.evaluate(() => {
      const boxes = window.__store.getSnapshot().boxes.map((box) => box.id === 'b_compact' ? { ...box, collapsed: true } : box)
      window.__bump({ boxes })
    })
    await wait(page)
    const collapsed = await page.evaluate(() => {
      const header = document.querySelector('[data-section="w1"] [data-dsb-box="b_compact"]')
      return {
        count: header.querySelector('[data-dsb-role="count"]') !== null,
        menu: header.querySelector('[data-dsb-role="more"]') !== null,
        chevron: header.querySelector('[data-dsb-role="toggle"]') !== null,
      }
    })
    assert.deepEqual(collapsed, { count: true, menu: true, chevron: true })

    // Writing a config rebuilds the header without hidden placeholders.
    await page.evaluate(() => {
      const boxes = window.__store.getSnapshot().boxes.map((box) => box.id === 'b_full'
        ? { ...box, header: { count: false, pinned: false, subs: false, stars: false, todos: false, add: false, menu: false } }
        : box)
      window.__bump({ boxes })
    })
    await wait(page)
    const updated = await page.evaluate(() => {
      const section = document.querySelector('[data-section="w1"]')
      const header = section.querySelector('[data-dsb-box="b_full"]')
      return {
        count: header.querySelector('[data-dsb-role="count"]') !== null,
        pin: header.querySelector('[data-dsb-role="pin"]') !== null,
        subs: header.querySelector('[data-dsb-role="subs"]') !== null,
        stats: header.querySelector('[data-dsb-role="stats"]') !== null,
        add: header.querySelector('[data-dsb-role="add"]') !== null,
        menu: header.querySelector('[data-dsb-role="more"]') !== null,
        chevron: header.querySelector('[data-dsb-role="toggle"]') !== null,
      }
    })
    assert.deepEqual(updated, { count: false, pin: false, subs: false, stats: false, add: false, menu: true, chevron: true })
    console.log('client scenario 11 passed')
  } finally {
    await browser.close()
  }
}

async function themePaletteScenario() {
  const { browser, page } = await openPage(html([
    section('w1', 'Workplace', [['s1', 'Alpha']], false),
  ]))
  try {
    const result = await page.evaluate(() => {
      const api = window.__DSH_SESSION_BOXES_TEST_API__
      const style = document.createElement('style')
      style.textContent = api.CSS
      document.head.appendChild(style)
      const probe = document.createElement('span')
      probe.className = 'dsb-h'
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:100px;background:var(--dshc-blue);transition:none'
      probe.style.setProperty('--dsb-color', 'var(--dshc-blue)')
      document.body.appendChild(probe)
      const read = () => ({
        color: getComputedStyle(probe).backgroundColor,
        header: getComputedStyle(probe).boxShadow,
      })
      const light = read()
      document.body.setAttribute('data-ds-dark-theme', '')
      const dark = read()
      document.body.removeAttribute('data-ds-dark-theme')
      probe.remove()
      style.remove()
      return { light, dark }
    })
    assert.equal(result.light.color, 'rgb(9, 105, 218)')
    assert.equal(result.dark.color, 'rgb(76, 141, 255)')
    assert.notEqual(result.light.header, result.dark.header)
    console.log('client scenario 10 passed')
  } finally {
    await browser.close()
  }
}

await firstScenario()
await multiSectionScenario()
await pinnedAndBlankScenario()
await wrappedRowScenario()
await applyScenario()
await pinAndDragScenario()
await subfolderScenario()
await aggregateStatsScenario()
await autoExpandScenario()
await headerConfigScenario()
await themePaletteScenario()
console.log('all client DOM tests passed')
