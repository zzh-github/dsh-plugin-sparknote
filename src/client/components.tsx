/** Pure slot components for reply actions, the collection, and the selection toolbar. */
import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ICON_REGULAR_STROKE, extractMarkdownPlainText, MarkdownText, Modal, Toast, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { LibraryFace, ActionFace, OverlayFace } from './index.tsx'
import { sourceSchema, recordKey, type ReadingRecord, type Color } from '../schema.ts'
import { collectionTitle, questionForReply } from './source.ts'

type CopyProps = PropsLocale<'readingCollection'>
type LibraryProps = InjectFace<LibraryFace> & CopyProps

/** @param props Icon dimensions and saved state. @returns Five-point collection star matching the Host icon stroke. */
export function CollectionStar({ size = 16, filled = false }: { size?: number; filled?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={ICON_REGULAR_STROKE} strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1.5 10 5.6 14.5 6.2 11.25 9.4 12 14 8 11.85 4 14 4.75 9.4 1.5 6.2 6 5.6Z" />
  </svg>
}

/** @param props Sidebar icon dimensions. @returns Collection navigation icon. */
export function CollectionIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <CollectionStar size={size} /> }

/** @param props Message identity, Chat source, and library commands. @returns Collection toggle for a completed text reply. */
export function ReplyAction(props: PropsRuntime<'conversation.chat.assistant-actions'> & InjectFace<ActionFace> & CopyProps) {
  const { messageId, sessionId, useChat, useSessions, useLibrary, attach, detach, change, t } = props
  const node = useChat(snapshot => [...snapshot.nodes.values()].find(candidate => {
    const node = candidate as ChatNode
    return node.kind === 'assistant-step' && node.data.finalNode?.messageId === messageId
  }) as ChatNode<'assistant-step'> | undefined)
  const conversationTitle = useSessions(state => state.byId[sessionId]?.title)?.trim() || t('untitledConversation')
  const question = useChat(snapshot => node === undefined ? undefined : questionForReply(snapshot.nodes.values() as readonly ChatNode[], node))
  const source = useMemo(() => {
    if (node?.data.finalNode === undefined) return null
    const markdown = node.data.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n\n')
    if (markdown.trim() === '') return null
    return sourceSchema.parse({ sessionId, messageId, nodeKey: node.key, seq: node.data.finalNode.seq, markdown, plainText: '', question, title: collectionTitle(conversationTitle, extractMarkdownPlainText(markdown, { mode: 'first-paragraph' })) })
  }, [node, messageId, sessionId, conversationTitle, question])
  const record = useLibrary(state => source === null ? undefined : state.records.find(item => recordKey(item) === recordKey(source)))
  const pending = useLibrary(state => state.pending > 0 || state.status === 'loading')
  const previous = useRef<HTMLElement | null>(null)
  const bind = useCallback((element: HTMLButtonElement | null) => {
    if (previous.current !== null) detach(previous.current)
    previous.current = element
    if (element !== null && source !== null) attach(element, source)
  }, [attach, detach, source])
  if (source === null) return null
  const saved = record?.savedAt != null
  const label = t(saved ? 'uncollect' : question === undefined ? 'loadQuestion' : 'collect')
  return <Tooltip label={label} side="top" portal>
    <button ref={bind} type="button" className="rc-action" data-reading-collect="" aria-label={label} aria-pressed={saved} disabled={pending || (!saved && question === undefined)}
      onClick={() => { void change({ kind: 'collect', source, saved: !saved }, saved ? 'removed' : 'collected') }}>
      <CollectionStar filled={saved} />
    </button>
  </Tooltip>
}

function Reader({ record, attach, detach, t }: Pick<LibraryProps, 'attach' | 'detach' | 't'> & { record: ReadingRecord }) {
  const previous = useRef<HTMLElement | null>(null)
  const bind = useCallback((element: HTMLDivElement | null) => {
    if (previous.current !== null) detach(previous.current)
    previous.current = element
    if (element !== null) attach(element, record, true)
  }, [attach, detach, record])
  const labels = useMemo(() => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }), [t])
  return <div ref={bind} className="rc-reader" data-reading-reader=""><MarkdownText text={record.markdown} labels={labels} /></div>
}

/** @param props Library data and explicit mutation/navigation callbacks. @returns Searchable collection or its selected reader. */
export function CollectionPanel({ useLibrary, change, load, attach, detach, openSource, supported, t }: LibraryProps & PropsRuntime<'main'>) {
  const state = useLibrary(value => value)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState('')
  const record = state.records.find(item => recordKey(item) === selected && item.savedAt !== null)
  const saved = useMemo(() => state.records.filter(item => item.savedAt !== null).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)), [state.records])
  const needle = query.toLocaleLowerCase().trim()
  const filtered = saved.filter(item => `${item.title}\n${item.question ?? ''}\n${item.markdown}\n${item.highlights.map(mark => mark.anchor.quote).join('\n')}`.toLocaleLowerCase().includes(needle))
  return <section className="rc-page" aria-label={t('panel')}>
    <header className="rc-heading"><div><h1>{record?.title ?? t('panel')}</h1><p>{t('intro')}</p></div>
      {record !== undefined && <Button size="sm" onClick={() => { setSelected(null) }}>{t('back')}</Button>}
    </header>
    {!supported && <p role="status">{t('unsupported')}</p>}
    {state.status === 'error' && <div className="rc-notice" role="alert">{t('loadError')} <Button size="sm" onClick={() => { void load() }}>{t('retry')}</Button></div>}
    {state.status === 'loading' && <div className="rc-skeleton" aria-label={t('loading')}><div /><div /><div /></div>}
    {record === undefined ? <>
      <input className="rc-search" type="search" aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => { setQuery(event.target.value) }} />
      {state.status !== 'loading' && filtered.length === 0 && <div className="rc-empty"><CollectionStar size={28} /><h2>{t(saved.length === 0 ? 'empty' : 'noResults')}</h2>{saved.length === 0 && <p>{t('emptyHelp')}</p>}</div>}
      <div className="rc-grid">{filtered.map(item => <button type="button" className="rc-card" key={recordKey(item)} onClick={() => { setSelected(recordKey(item)) }}>
        <h2>{item.title}</h2><p>{item.highlights[0]?.anchor.quote ?? item.markdown.slice(0, 180)}</p>
        <div className="rc-meta"><span>{new Date(item.savedAt!).toLocaleDateString()}</span><span>{t('highlights')} · {item.highlights.length}</span></div>
      </button>)}</div>
    </> : <>
      <div className="rc-tools"><Button size="sm" onClick={() => { openSource(record) }}>{t('source')}</Button>
        <Button size="sm" onClick={() => { setTitle(record.title); setRenaming(true) }}>{t('rename')}</Button>
        <Button size="sm" disabled={state.pending > 0} onClick={() => { void change({ kind: 'collect', source: record, saved: false }, 'removed') }}>{t('uncollect')}</Button>
      </div>
      <section className="rc-question" aria-label={t('question')}><h2>{t('question')}</h2>
        {record.question === undefined ? <p>{t('questionUnavailable')}</p> : record.question.trim() === '' ? <p>{t('questionWithoutText')}</p> : <MarkdownText text={record.question} labels={{ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }} />}
      </section>
      <h2 className="rc-answer-heading">{t('answer')}</h2>
      <Reader record={record} attach={attach} detach={detach} t={t} />
      {record.highlights.length > 0 && <section className="rc-quotes" aria-label={t('highlights')}><h2>{t('highlights')}</h2>
        {record.highlights.map(mark => <div className="rc-quote" key={mark.id}><blockquote data-reading-color={mark.color}>{mark.anchor.quote}</blockquote>
          <ColorButtons t={t} disabled={state.pending > 0} selected={mark.color} apply={color => { void change({ kind: 'recolor', key: recordKey(record), id: mark.id, color }, 'highlighted') }} />
          <Button size="sm" disabled={state.pending > 0} onClick={() => { void change({ kind: 'remove-highlight', key: recordKey(record), id: mark.id }, 'erased') }}>{t('erase')}</Button>
        </div>)}
      </section>}
      <Modal open={renaming} title={t('rename')} closeLabel={t('close')} onClose={() => { setRenaming(false) }} footer={<><Button onClick={() => { setRenaming(false) }}>{t('cancel')}</Button><Button variant="primary" disabled={title.trim() === '' || state.pending > 0} onClick={() => { void change({ kind: 'rename', key: recordKey(record), title }, 'renamed').then(ok => { if (ok) setRenaming(false) }) }}>{t('save')}</Button></>}>
        <label className="rc-title-field">{t('title')}<input data-modal-autofocus value={title} maxLength={300} onChange={event => { setTitle(event.target.value) }} /></label>
      </Modal>
    </>}
  </section>
}

const colors: readonly Color[] = ['yellow', 'green', 'blue', 'pink']
function ColorButtons({ t, apply, disabled, selected }: { t: CopyProps['t']; apply: (color: Color) => void; disabled: boolean; selected?: Color }) {
  return <div className="rc-colors" role="group" aria-label={t('highlight')}>{colors.map(color => <Tooltip key={color} label={t(color)} side="top" portal>
    <button type="button" className="rc-swatch" data-reading-color={color} aria-label={t(color)} aria-pressed={selected === color} disabled={disabled} onClick={() => { apply(color) }} />
  </Tooltip>)}</div>
}

/** @param props Current text selection and operation feedback. @returns Portaled editing controls and operation toast. */
export function SelectionOverlay({ useSelection, useLibrary, applyColor, erase, dismissSelection, retry, dismissNotice, t }: InjectFace<OverlayFace> & CopyProps & PropsRuntime<'shell.overlay'>) {
  const selection = useSelection(value => value)
  const pending = useLibrary(state => state.pending > 0 || state.status === 'loading')
  const notice = useLibrary(state => state.notice)
  const toolbar = selection === null ? null : <div data-reading-toolbar="" className="rc-toolbar" role="toolbar" aria-label={t('highlight')}
    style={{ left: Math.max(8, Math.min(selection.x, window.innerWidth - 280)), top: Math.max(8, Math.min(selection.y + 8, window.innerHeight - 64)) }}
    onPointerDown={event => { event.preventDefault() }} onKeyDown={event => { if (event.key === 'Escape') dismissSelection() }}>
    <ColorButtons t={t} disabled={pending} apply={color => { applyColor(selection, color) }} />
    {selection.highlightId !== undefined && <Button size="sm" disabled={pending} onClick={() => { erase(selection) }}>{t('erase')}</Button>}
    <Button size="sm" onClick={dismissSelection} aria-label={t('close')}>×</Button>
  </div>
  return <>{toolbar !== null && createPortal(toolbar, document.body)}{notice !== null && <Toast key={notice.id} text={t(notice.key)} tone={notice.failed ? undefined : 'success'}
    actions={notice.failed ? [{ label: t('retry'), prefix: '', onClick: retry }] : undefined} onDone={dismissNotice} />}</>
}
