const EVIDENCE_LABELS = Object.freeze({
  zh: { 'image-match': '图片匹配', 'image-match-page': '图片匹配网页', 'image-full-match': '完整匹配', 'image-partial-match': '部分匹配', 'image-similar': '视觉相似', 'image-reverse-match': '反向搜图', 'web-entity': '网页实体', 'text-search': '文字检索' },
  en: { 'image-match': 'Image match', 'image-match-page': 'Matched page', 'image-full-match': 'Full match', 'image-partial-match': 'Partial match', 'image-similar': 'Visually similar', 'image-reverse-match': 'Reverse image', 'web-entity': 'Web entity', 'text-search': 'Web search' },
  ja: { 'image-match': '画像一致', 'image-match-page': '一致ページ', 'image-full-match': '完全一致', 'image-partial-match': '部分一致', 'image-similar': '視覚的に類似', 'image-reverse-match': '画像検索', 'web-entity': 'ウェブエンティティ', 'text-search': 'ウェブ検索' },
})

export function researchSummary(research = {}) {
  return {
    count: Array.isArray(research.sources) ? research.sources.length : 0,
    expanded: Boolean(research.expanded),
    queryCount: Number(research.searchedQueryCount) || 0,
    provider: String(research.provider || '公开检索'),
  }
}

export function evidenceLabel(type, language = 'zh') {
  return EVIDENCE_LABELS[language]?.[String(type || '').trim()] || EVIDENCE_LABELS.zh[String(type || '').trim()] || (language === 'en' ? 'Public source' : language === 'ja' ? '公開ソース' : '公开来源')
}
