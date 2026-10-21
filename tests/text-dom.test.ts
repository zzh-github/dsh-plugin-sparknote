/** DOM text ownership and native-resource cleanup against isolated documents. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { indexText, rangeAt, TextHighlighter } from '../src/client/text-dom.ts'

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
