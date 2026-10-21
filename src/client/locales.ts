/** Typed Chinese and English product copy. */
export const en = {
  panel: 'Collection', intro: 'Keep the replies and ideas you want to revisit.', collect: 'Collect reply', uncollect: 'Remove from collection', collected: 'Reply collected', removed: 'Removed from collection; highlights kept',
  search: 'Search saved replies', empty: 'Your collection is empty', emptyHelp: 'Highlight a reply as you read, then collect it from its action row.', noResults: 'No matching replies',
  back: 'Back to collection', source: 'Open source conversation', rename: 'Rename', title: 'Title', cancel: 'Cancel', save: 'Save', renamed: 'Title saved',
  yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', highlight: 'Highlight selection', erase: 'Remove highlight', highlighted: 'Highlight saved', erased: 'Highlight removed',
  loadError: 'Could not load your collection', saveError: 'Could not save your changes', retry: 'Retry', loading: 'Loading collection', close: 'Close',
  unsupported: 'This browser does not support text highlights. Use a current Chrome, Edge, Firefox, or Safari.',
  saved: 'Collected', draft: 'Highlight draft', highlights: 'Highlights', orphan: 'Some marked text could not be located. Its saved quote is preserved below.',
  question: 'Your question', answer: 'Reply', untitledConversation: 'Untitled conversation', loadQuestion: 'Load the question above this reply before collecting', questionUnavailable: 'This older collection has no saved question. The reply and highlights remain available.', questionWithoutText: 'The user message contains no text. Attachments are not copied into collections.',
  sourceError: 'Could not open the source conversation. The saved reply is still available.', copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes',
} as const
export const zh: Record<keyof typeof en, string> = {
  panel: '收藏夹', intro: '留下值得回看的回复和想法', collect: '收藏回复', uncollect: '取消收藏', collected: '已收藏回复', removed: '已取消收藏，划线仍保留',
  search: '搜索已收藏的回复', empty: '还没有收藏', emptyHelp: '阅读回复时选中文字划线，再点击回复下方的收藏按钮', noResults: '没有找到匹配的收藏',
  back: '返回收藏夹', source: '打开原对话', rename: '重命名', title: '标题', cancel: '取消', save: '保存', renamed: '已保存标题',
  yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色', highlight: '划线标记', erase: '删除划线', highlighted: '已保存划线', erased: '已删除划线',
  loadError: '无法加载收藏夹', saveError: '无法保存修改', retry: '重试', loading: '正在加载收藏夹', close: '关闭',
  unsupported: '此浏览器不支持文字高亮，请使用新版 Chrome、Edge、Firefox 或 Safari',
  saved: '已收藏', draft: '划线草稿', highlights: '划线', orphan: '部分划线无法在正文中定位，原文摘录仍保留在下方',
  question: '用户问题', answer: '回复', untitledConversation: '未命名对话', loadQuestion: '请先向上加载这条回复对应的用户问题，再收藏', questionUnavailable: '此旧收藏未保存用户问题，回复和划线仍可查看', questionWithoutText: '用户消息不含文字；收藏暂不复制附件',
  sourceError: '无法打开原对话，仍可查看已保存的回复', copy: '复制', copied: '已复制', footnotes: '脚注',
}
export type CopyKey = keyof typeof en
