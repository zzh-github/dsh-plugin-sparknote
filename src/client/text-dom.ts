/** DSH rc.2 DOM adapter; highlights never insert nodes into React-owned Markdown. */
import { makeAnchor, recordKey, resolveAnchor, type Source, type Color, type Anchor, type SparkNoteRecord } from '../schema.ts'

interface TextPiece { node: Text; start: number; end: number }
export interface TextIndex { text: string; pieces: TextPiece[] }
const excluded = 'button, [data-variant="think"], [aria-hidden="true"], .katex-mathml, script, style'

/** @param roots Message containers. @returns Searchable text without controls or hidden reasoning. */
export function indexText(roots: readonly HTMLElement[]): TextIndex {
  let text = ''
  const pieces: TextPiece[] = []
  for (const root of roots) {
    const walker = root.ownerDocument.createTreeWalker(root, 4)
    let current = walker.nextNode()
    while (current !== null) {
      if (current instanceof root.ownerDocument.defaultView!.Text && current.parentElement?.closest(excluded) === null) {
        pieces.push({ node: current, start: text.length, end: text.length + current.length })
        text += current.data
      }
      current = walker.nextNode()
    }
  }
  return { text, pieces }
}

/** @param index Indexed text nodes. @param start Inclusive offset. @param end Exclusive offset. @returns DOM range, when both endpoints remain mounted. */
export function rangeAt(index: TextIndex, start: number, end: number): Range | undefined {
  const first = index.pieces.find(piece => piece.end > start)
  const last = index.pieces.find(piece => piece.end >= end && piece.start < end)
  if (first === undefined || last === undefined) return undefined
  const range = first.node.ownerDocument.createRange()
  range.setStart(first.node, start - first.start)
  range.setEnd(last.node, end - last.start)
  return range
}

export interface SelectionTarget { source: Source; anchor: Anchor; highlightId?: string; x: number; y: number }
interface Binding { source: Source; roots: () => HTMLElement[] }
interface HighlightRegistry { set(name: string, highlight: object): void; delete(name: string): void }
type HighlightWindow = Window & Pick<typeof globalThis, 'Element' | 'MutationObserver'> & { Highlight?: new (...ranges: Range[]) => object; CSS?: { highlights?: HighlightRegistry } }

/** Owns text bindings, native highlighting, and input listeners for one browser plugin instance. */
export class TextHighlighter {
  private readonly bindings = new Map<HTMLElement, Binding>()
  private records = new Map<string, SparkNoteRecord>()
  private frame: number | undefined
  private disposed = false
  private readonly win: HighlightWindow
  private readonly observer: MutationObserver
  readonly supported: boolean
  /** @param document Browser document. @param publish Updates the toolbar selection; null dismisses it. */
  constructor(private readonly document: Document, private readonly publish: (selection: SelectionTarget | null) => void) {
    this.win = document.defaultView as HighlightWindow
    this.supported = this.win.Highlight !== undefined && this.win.CSS?.highlights !== undefined
    this.observer = new this.win.MutationObserver(() => this.schedulePaint())
    document.addEventListener('selectionchange', this.selectionChanged)
    document.addEventListener('click', this.clicked)
    document.addEventListener('keydown', this.keydown)
    document.addEventListener('scroll', this.scrolled, true)
    this.win.addEventListener('resize', this.scrolled)
  }

  /** @param element Stable action or reader root. @param source Message data. @param reader Whether the element is a saved reader. */
  bind(element: HTMLElement, source: Source, reader = false): void {
    this.bindings.set(element, { source, roots: reader ? () => [element] : () => {
      const flow = element.closest('[data-chat-flow]')
      if (flow === null) return []
      return [...flow.querySelectorAll<HTMLElement>('[data-chat-flow-kind="assistant-step"]')].filter(root => root.dataset.chatNodeKey === source.nodeKey && root.dataset.chatGroupPart !== 'reasoning')
    } })
    this.observeRoots()
    this.schedulePaint()
  }
  /** @param element Detached contribution. */
  unbind(element: HTMLElement): void { this.bindings.delete(element); this.observeRoots(); this.schedulePaint() }
  /** @param records Latest committed Host records. */
  update(records: readonly SparkNoteRecord[]): void { this.records = new Map(records.map(record => [recordKey(record), record])); this.schedulePaint() }

  private observeRoots(): void {
    this.observer.disconnect()
    for (const binding of this.bindings.values()) for (const root of binding.roots()) {
      this.observer.observe(root, { childList: true, subtree: true, characterData: true })
    }
  }

  private readonly selectionChanged = (): void => {
    if (!this.supported || this.document.activeElement?.closest('[data-sparknote-toolbar]')) return
    const selection = this.document.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) { this.publish(null); return }
    const range = selection.getRangeAt(0)
    for (const binding of this.bindings.values()) {
      const roots = binding.roots()
      if (!roots.some(root => root.contains(range.startContainer)) || !roots.some(root => root.contains(range.endContainer))) continue
      const index = indexText(roots)
      const startPiece = index.pieces.find(piece => piece.node === range.startContainer)
      const endPiece = index.pieces.find(piece => piece.node === range.endContainer)
      if (startPiece === undefined || endPiece === undefined) continue
      const start = startPiece.start + range.startOffset, end = endPiece.start + range.endOffset
      if (end <= start || index.text.slice(start, end).trim() === '') continue
      const rect = range.getBoundingClientRect()
      this.publish({ source: { ...binding.source, plainText: index.text }, anchor: makeAnchor(index.text, start, end), x: rect.left, y: rect.bottom })
      return
    }
    this.publish(null)
  }

  private readonly clicked = (event: MouseEvent): void => {
    if (!(event.target instanceof this.win.Element) || event.target.closest('button,a,[data-sparknote-toolbar]') !== null) return
    if (!this.document.getSelection()?.isCollapsed) return
    const caretDocument = this.document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
    const position = caretDocument.caretPositionFromPoint?.(event.clientX, event.clientY)
    const caret = caretDocument.caretRangeFromPoint?.(event.clientX, event.clientY)
    const node = position?.offsetNode ?? caret?.startContainer
    const offset = position?.offset ?? caret?.startOffset
    if (node === undefined || offset === undefined) return
    for (const binding of this.bindings.values()) {
      const index = indexText(binding.roots())
      const piece = index.pieces.find(candidate => candidate.node === node)
      if (piece === undefined) continue
      const at = piece.start + offset
      const record = this.records.get(recordKey(binding.source))
      const highlight = record?.highlights.find(item => { const span = resolveAnchor(index.text, item.anchor); return span !== undefined && span.start <= at && at < span.end })
      if (highlight !== undefined) this.publish({ source: { ...binding.source, plainText: index.text }, anchor: highlight.anchor, highlightId: highlight.id, x: event.clientX, y: event.clientY })
      return
    }
  }
  private readonly keydown = (event: KeyboardEvent): void => { if (event.key === 'Escape') this.publish(null) }
  private readonly scrolled = (): void => { this.publish(null) }
  private schedulePaint(): void {
    if (this.disposed || this.frame !== undefined || !this.supported) return
    this.frame = this.win.requestAnimationFrame(() => { this.frame = undefined; this.paint() })
  }
  private paint(): void {
    const registry = this.win.CSS?.highlights, Constructor = this.win.Highlight
    if (registry === undefined || Constructor === undefined) return
    const ranges: Record<Color, Range[]> = { yellow: [], green: [], blue: [], pink: [] }
    for (const [element, binding] of this.bindings) {
      if (!element.isConnected) continue
      const record = this.records.get(recordKey(binding.source))
      if (record === undefined || record.highlights.length === 0) continue
      const index = indexText(binding.roots())
      for (const highlight of record.highlights) {
        const span = resolveAnchor(index.text, highlight.anchor)
        const range = span === undefined ? undefined : rangeAt(index, span.start, span.end)
        if (range !== undefined) ranges[highlight.color].push(range)
      }
    }
    for (const color of Object.keys(ranges) as Color[]) registry.set(`sparknote-${color}`, new Constructor(...ranges[color]))
  }
  /** Remove all native listeners, observers, animation frames, and highlight registrations. */
  dispose(): void {
    this.disposed = true
    this.observer.disconnect()
    this.document.removeEventListener('selectionchange', this.selectionChanged)
    this.document.removeEventListener('click', this.clicked)
    this.document.removeEventListener('keydown', this.keydown)
    this.document.removeEventListener('scroll', this.scrolled, true)
    this.win.removeEventListener('resize', this.scrolled)
    if (this.frame !== undefined) this.win.cancelAnimationFrame(this.frame)
    for (const color of ['yellow', 'green', 'blue', 'pink']) this.win.CSS?.highlights?.delete(`sparknote-${color}`)
    this.bindings.clear()
    this.publish(null)
  }
}
