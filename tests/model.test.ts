/** Client request races use explicit barriers, without global fetch interception. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LibraryModel } from '../src/client/model.ts'
import { sourceSchema, type ReadingRecord } from '../src/schema.ts'

const source = sourceSchema.parse({ sessionId: 'session-one', messageId: 'message-one', nodeKey: 'assistant:1', seq: 7, markdown: 'Reading idea', plainText: 'Reading idea', title: 'Reading idea' })
const record: ReadingRecord = { ...source, highlights: [], savedAt: 1, updatedAt: 1, revision: 1 }

test('a late baseline cannot erase a newer committed collection', async () => {
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  const model = new LibraryModel({ call: async (_channel, endpoint) => {
    if (endpoint === 'list') { entered(); await gate; return { ok: true, value: [] } }
    return { ok: true, value: record }
  } })
  try {
    const load = model.load()
    await started
    assert.equal(await model.change({ kind: 'collect', source, saved: true }, 'collected'), true)
    release()
    await load
    assert.equal(model.state.getSnapshot().records[0]?.savedAt, 1)
  } finally { release(); model.dispose() }
})

test('late replies publish nothing after plugin unload', async () => {
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  const model = new LibraryModel({ call: async () => { entered(); await gate; return { ok: true, value: [record] } } })
  const load = model.load()
  await started
  model.dispose()
  const snapshot = model.state.getSnapshot()
  release()
  await load
  assert.equal(model.state.getSnapshot(), snapshot)
})

test('a rejected save retains visible data and Retry commits the original operation', async () => {
  let attempts = 0
  const updated = { ...record, title: 'Renamed collection', revision: 2 }
  const model = new LibraryModel({ call: async (_channel, endpoint) => {
    if (endpoint === 'list') return { ok: true, value: [record] }
    attempts += 1
    return attempts === 1 ? { ok: false, error: { code: 'storage-failed', message: 'disk full', details: {} } } : { ok: true, value: updated }
  } })
  let unsubscribe = () => {}
  try {
    await model.load()
    assert.equal(await model.change({ kind: 'rename', key: JSON.stringify([source.sessionId, source.messageId]), title: updated.title }, 'renamed'), false)
    assert.equal(model.state.getSnapshot().records[0]?.title, record.title)
    assert.equal(model.state.getSnapshot().notice?.key, 'saveError')
    const committed = new Promise<void>(resolve => {
      unsubscribe = model.state.subscribe(() => {
        if (model.state.getSnapshot().records[0]?.title === updated.title && model.state.getSnapshot().pending === 0) resolve()
      })
    })
    model.retryLast()
    await committed
    assert.equal(attempts, 2)
  } finally { unsubscribe(); model.dispose() }
})
