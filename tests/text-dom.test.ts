/** DOM text ownership and native-resource cleanup against isolated documents. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { indexText, rangeAt, TextHighlighter } from '../src/client/text-dom.ts'
import { makeAnchor, sourceSchema, type ReadingRecord } from '../src/schema.ts'

test('indexes rendered Markdown across inline nodes without toolbar or reasoning text', () => {
  const dom = new JSDOM('<div id="reply"><p>Hello <strong>important</strong> idea.</p><button>Copy</button><div data-variant="think">private reasoning</div></div>')
  try {
    const root = dom.window.document.getElementById('reply')!
    const index = indexText([root])
    assert.equal(index.text, 'Hello important idea.')
    assert.equal(rangeAt(index, 6, 20)?.toString(), 'important idea')
  } finally { dom.window.close() }
})

test('unsupported browsers still release observers and publish no selection after unload', () => {
  const dom = new JSDOM('<body><p>Reply</p></body>')
  try {
    const seen: unknown[] = []
    const highlighter = new TextHighlighter(dom.window.document, value => { seen.push(value) })
    assert.equal(highlighter.supported, false)
    highlighter.dispose()
    const after = seen.length
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
    assert.equal(seen.length, after)
  } finally { dom.window.close() }
})


test('saved replies paint existing cross-block highlights on the original text after Markdown adds separator newlines', () => {
  const dom = new JSDOM('<div id="chat"><div><p>First <strong>important</strong> line.</p></div><div><p>Second point.</p></div></div><div id="reader"><p>First <strong>important</strong> line.</p>\n<p>Second point.</p></div>')
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  class NativeHighlight extends Set<Range> {
    constructor(...ranges: Range[]) { super(ranges) }
  }
  const registry = new Map<string, NativeHighlight>()
  Object.defineProperties(dom.window, {
    Highlight: { value: NativeHighlight }, CSS: { value: { highlights: registry } },
    requestAnimationFrame: { value: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId } },
    cancelAnimationFrame: { value: (id: number) => { frames.delete(id) } },
  })
  const highlighter = new TextHighlighter(dom.window.document, () => {})
  try {
    const chat = dom.window.document.getElementById('chat')!
    const reader = dom.window.document.getElementById('reader')!
    const original = indexText([chat]).text
    const source = sourceSchema.parse({ sessionId: 'cross-block-session', messageId: 'reply', nodeKey: 'reply', seq: 1, markdown: 'First **important** line.\n\nSecond point.', plainText: original, title: 'Cross-block reply' })
    const record: ReadingRecord = { ...source, highlights: [{ id: '00000000-0000-4000-8000-000000000001', color: 'yellow', anchor: makeAnchor(original, 6, original.length) }], savedAt: 1, updatedAt: 1, revision: 1 }
    highlighter.bind(reader, record, true)
    highlighter.update([record])
    for (const [id, callback] of frames) { frames.delete(id); callback(0) }
    const ranges = [...(registry.get('reading-yellow') ?? [])]
    assert.equal(ranges.length, 1)
    assert.equal(ranges[0]!.toString(), 'important line.\nSecond point.')
    assert(reader.contains(ranges[0]!.startContainer))
    assert(reader.contains(ranges[0]!.endContainer))
    highlighter.unbind(reader)
    for (const [id, callback] of frames) { frames.delete(id); callback(0) }
    assert.equal(registry.get('reading-yellow')?.size, 0)
  } finally { highlighter.dispose(); dom.window.close() }
  assert.equal(frames.size, 0)
  assert.equal(registry.size, 0)
})
