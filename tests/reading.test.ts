/** Deterministic storage and anchoring regressions; every test owns its table. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { makeAnchor, resolveAnchor, recordKey, sourceSchema, recordSchema, commandSchema, type ReadingRecord } from '../src/schema.ts'
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


test('collecting an existing highlight draft saves the current question and conversation-based title', async () => {
  const { table, repository } = tableFixture()
  const draft = await repository.mutate(mark())
  const updatedSource = { ...source, title: 'Plugin design · Useful idea', question: 'How should I keep useful ideas?' }
  const saved = await repository.mutate({ kind: 'collect', source: updatedSource, saved: true })
  assert.equal(saved.title, updatedSource.title)
  assert.equal(saved.question, updatedSource.question)
  assert.equal(saved.markdown, draft.markdown)
  assert.deepEqual(saved.highlights, draft.highlights)
  const reopened = new ReadingRepository(table)
  const persisted = (await reopened.list())[0]!
  assert.equal(persisted.question, updatedSource.question)
  const actual = { title: persisted.title, question: persisted.question, markdown: persisted.markdown, highlights: persisted.highlights.map(({ color, anchor }) => ({ color, quote: anchor.quote, start: anchor.start, end: anchor.end })) }
  const expected = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./expected/collection.json', import.meta.url), 'utf8'))
  assert.deepEqual(actual, expected)
})

test('custom titles survive uncollection and recollection with current question context', async () => {
  const { repository } = tableFixture()
  await repository.mutate({ kind: 'collect', source, saved: true })
  await repository.mutate({ kind: 'rename', key: recordKey(source), title: 'My own title' })
  await repository.mutate({ kind: 'collect', source, saved: false })
  const saved = await repository.mutate({ kind: 'collect', source: { ...source, title: 'Changed conversation · Reply', question: 'The original question' }, saved: true })
  assert.equal(saved.title, 'My own title')
  assert.equal(saved.question, 'The original question')
})

test('legacy collections remain readable and keep their titles on recollection', async () => {
  const { records, table } = tableFixture()
  const legacy = { ...source, title: 'Previously chosen title', highlights: [], savedAt: 1, updatedAt: 1, revision: 1 }
  assert.equal(recordSchema.parse(legacy).question, undefined)
  records.set(recordKey(source), legacy)
  const repository = new ReadingRepository(table)
  assert.equal((await repository.list())[0]?.question, undefined)
  await repository.mutate({ kind: 'collect', source, saved: false })
  const saved = await repository.mutate({ kind: 'collect', source: { ...source, title: 'New default title', question: 'Original question' }, saved: true })
  assert.equal(saved.title, legacy.title)
})

test('collecting a changed reply does not replace saved question or highlights', async () => {
  const { repository } = tableFixture()
  await repository.mutate(mark())
  await assert.rejects(repository.mutate({ kind: 'collect', source: { ...source, markdown: 'Changed reply', question: 'Changed question' }, saved: true }), /message-changed/)
  const after = (await repository.list())[0]!
  assert.equal(after.savedAt, null)
  assert.equal(after.question, undefined)
  assert.equal(after.highlights.length, 1)
})


test('quote restoration tolerates Markdown separator newlines without guessing between repeated passages', () => {
  const original = 'Before first block.Second block after.'
  const anchor = makeAnchor(original, 7, 31)
  const rendered = 'Before first block.\nSecond block after.'
  const span = resolveAnchor(rendered, anchor)!
  assert.equal(rendered.slice(span.start, span.end), 'first block.\nSecond block')
  const multiline = makeAnchor('first block.\r\nSecond block', 0, 26)
  assert.deepEqual(resolveAnchor('first block.Second block', multiline), { start: 0, end: 24 })
  assert.equal(resolveAnchor('first\nblock first\nblock', { start: 0, end: 10, quote: 'firstblock', prefix: '', suffix: '' }), undefined)
  assert.equal(resolveAnchor('ab', { start: 0, end: 3, quote: 'a b', prefix: '', suffix: '' }), undefined)
})
