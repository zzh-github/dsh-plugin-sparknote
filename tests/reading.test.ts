/** Deterministic storage and anchoring regressions; every test owns its table. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { makeAnchor, resolveAnchor, recordKey, sourceSchema, commandSchema, type ReadingRecord } from '../src/schema.ts'
import { ReadingRepository, type RecordTable } from '../src/repository.ts'

const source = sourceSchema.parse({ sessionId: 'session-one', messageId: 'message-one', nodeKey: 'assistant:1', seq: 7, markdown: '**Useful** idea', plainText: 'Useful idea', title: 'Useful idea' })
function tableFixture() {
  const records = new Map<string, ReadingRecord>()
  const table: RecordTable = { get: key => records.get(key), entries: () => records.entries(), put: async (key, value) => { records.set(key, structuredClone(value)) } }
  return { records, table, repository: new ReadingRepository(table) }
}
const mark = () => ({ kind: 'highlight' as const, source, highlight: { id: randomUUID(), color: 'yellow' as const, anchor: makeAnchor(source.plainText, 0, 6) } })

test('highlights survive collection, recoloring, uncollection, and reopening', async () => {
  const { table, repository } = tableFixture()
  const command = mark()
  const draft = await repository.mutate(command)
  assert.equal(draft.savedAt, null)
  assert.equal(draft.highlights.length, 1)
  const saved = await repository.mutate({ kind: 'collect', source, saved: true })
  assert.equal(typeof saved.savedAt, 'number')
  const reopened = new ReadingRepository(table)
  assert.deepEqual(await reopened.list(), [saved])
  await reopened.mutate({ kind: 'recolor', key: recordKey(source), id: command.highlight.id, color: 'blue' })
  const removed = await reopened.mutate({ kind: 'collect', source, saved: false })
  assert.equal(removed.savedAt, null)
  assert.equal(removed.highlights[0]?.color, 'blue')
  assert.equal(removed.markdown, source.markdown)
  const cleared = await reopened.mutate({ kind: 'remove-highlight', key: recordKey(source), id: command.highlight.id })
  assert.deepEqual(cleared.highlights, [])
})

test('overlapping calls wait for durable writes and preserve both clients’ highlights', async () => {
  const { table } = tableFixture()
  let release!: () => void
  let entered!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  let writes = 0
  const repository = new ReadingRepository({ ...table, put: async (key, value) => { writes += 1; if (writes === 1) { entered(); await barrier }; await table.put(key, value) } })
  const first = repository.mutate(mark())
  await started
  const second = repository.mutate(mark())
  assert.equal(writes, 1)
  release()
  await Promise.all([first, second])
  assert.equal((await repository.list())[0]?.highlights.length, 2)
})

test('failed persistence retains old state and does not poison the write queue', async () => {
  const { table, records } = tableFixture()
  let fail = true
  const repository = new ReadingRepository({ ...table, put: async (key, value) => { if (fail) throw new Error('disk full'); await table.put(key, value) } })
  await assert.rejects(repository.mutate(mark()), /disk full/)
  assert.equal(records.size, 0)
  fail = false
  const command = mark()
  await repository.mutate(command)
  await repository.mutate(command)
  assert.equal((await repository.list())[0]?.highlights.length, 1)
})

test('invalid wire anchors and colors are rejected', async () => {
  const { repository } = tableFixture()
  const command = mark()
  assert.equal(commandSchema.safeParse({ ...command, highlight: { ...command.highlight, color: 'invisible' } }).success, false)
  assert.equal(commandSchema.safeParse({ ...command, highlight: { ...command.highlight, anchor: { ...command.highlight.anchor, end: -1 } } }).success, false)
  await assert.rejects(repository.mutate({ ...command, highlight: { ...command.highlight, anchor: { ...command.highlight.anchor, quote: 'Wrong!' } } }), /invalid-anchor/)
})

test('quote context disambiguates repeated phrases after reflow', () => {
  const text = 'First useful idea. Second useful idea.'
  const start = text.lastIndexOf('useful')
  const anchor = makeAnchor(text, start, start + 6)
  assert.deepEqual(resolveAnchor(text, anchor), { start, end: start + 6 })
  assert.equal(resolveAnchor('useful useful', { start: 0, end: 6, quote: 'useful', prefix: 'absent', suffix: 'absent' }), undefined)
  assert.equal(resolveAnchor('changed', anchor), undefined)
})

test('record keys distinguish session and message pairs', () => {
  assert.notEqual(recordKey({ ...source, sessionId: sourceSchema.shape.sessionId.parse('a:b'), messageId: sourceSchema.shape.messageId.parse('c') }), recordKey({ ...source, sessionId: sourceSchema.shape.sessionId.parse('a'), messageId: sourceSchema.shape.messageId.parse('b:c') }))
})

test('the Host entry validates its storage declaration at import', async () => {
  const plugin = await import('../src/index.ts')
  assert.deepEqual(plugin.inject, ['storageDomain', 'connection'])
})
