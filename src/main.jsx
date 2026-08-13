import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, BriefcaseBusiness, Check, Download, FileText, GitBranch, History, Home,
  LockKeyhole, Menu, MessageCircle, MoreHorizontal, MoveUpRight, Orbit,
  Paperclip, Plus, Send, ShieldCheck, Sparkles, UserRound, X
} from 'lucide-react'
import avatar from './assets/resume-avatar.png'
import logo from './assets/zt-logo.png'
import mammoth from 'mammoth/mammoth.browser'
import { createChatSession, createSessionTitle, loadVisitorState, saveVisitorState } from './lib/chat-session.js'
import { getInitialLanguage, LANGUAGE_OPTIONS, resumeDocumentByLanguage, siteCopy } from './lib/i18n.js'
import { renderMarkdown } from './lib/markdown.js'
import { getStreamBatchSize } from './lib/streaming.js'
import './styles.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const DESKTOP_DOWNLOAD_URL = 'https://github.com/niuzipai-gif/zt-ai-web/releases/latest/download/ZT.buddy-Desktop-0.2.1-x64.exe'

const projects = [
  { title: 'AI 选品与开品工作流', tag: 'AI 产品开发', desc: '结合飞书多维表格与多个选品逻辑，搭建从筛选、评估到开品的完整流程。月均精铺 8 个以上，开品速度约为其他同事的 2 倍。', metric: '8+ / 月', icon: Orbit },
  { title: '半小时套图生产方案', tag: 'AI × 内容生产', desc: '结合 LinkFox 等工具研究快速做图流程，半小时完成一套精美图片，为团队释放 3 个设计师的产能。', metric: '30 min / 套', icon: Sparkles },
  { title: '跨境电商利润闭环', tag: '业务系统化', desc: '围绕 Amazon 精铺业务，把选品、开品与利润跟踪串成可复用的执行链路，月度净利润毛利保持 2 万元以上。', metric: '¥2W+ / 月', icon: BriefcaseBusiness },
]

const resumeMetrics = [
  { value: '8+', label: '每月精铺品数', note: '持续推进精铺开品' },
  { value: '约 2 倍', label: '开品速度', note: '相较其他同事' },
  { value: '30 分钟', label: '一套图片产出', note: '快速做图方案' },
  { value: '≥ 2 万元', label: '月度利润贡献', note: '负责品持续不亏损' },
]

const resumeWork = [
  {
    date: '2026-04 至 2027-04',
    company: '深圳市坤信科技有限公司',
    role: 'AI 产品开发',
    detail: '负责 AI 产品开发与 Amazon 精铺跨境电商流程落地；每月精铺 8 个品以上，负责品月度利润贡献 ≥ 2 万元且持续不亏损。',
    current: true,
  },
  {
    date: '2025-09 至 2026-01',
    company: '冠仕医疗供应链有限公司',
    role: '采购',
    detail: '负责找货、采购、发货、供应商议价；月均降本 1-2 万元，推动 21 家供应商进入 ERP 长期合作。',
  },
  {
    date: '2023-07 至 09',
    company: '柔宇科技',
    role: '数据分析（实习生）',
    detail: '负责电商销售数据采集监控，使用 Python 爬取清洗并建立销售数据库；使用 SPSS 分析销售趋势、预测季度销量。',
  },
]

const resumeDetailSections = [
  {
    index: '01',
    title: '选品与开品流程设计',
    items: [
      ['业务问题', '针对选品判断分散、信息难追踪、开品环节依赖个人经验等问题，重新梳理从机会发现到产品落地的业务链路。'],
      ['流程搭建', '以飞书多维表格作为业务中台，设计需求收集、竞品分析、关键词验证、利润测算、供应链核验、决策记录、开品任务和结果追踪等字段与节点。'],
      ['逻辑沉淀', '将多套选品逻辑转化为统一的判断顺序和可复用的检查清单，让选品结论、关键证据、供应商信息与后续任务能够持续追踪。'],
      ['协同方式', '把选品、采购、图片、Listing 内容和利润跟踪串联起来，减少信息反复整理，支持团队按同一套标准推进精铺项目。'],
    ],
  },
  {
    index: '02',
    title: 'AI 做图提效方案',
    items: [
      ['方案研究', '结合 LinkFox 等工具研究商品图快速生产方式，拆解素材整理、产品卖点提炼、提示词与画面要求、生成筛选、尺寸检查和交付归档等环节。'],
      ['流程标准化', '沉淀可复用的图片模板、素材清单和交付检查项，使不同产品能够按照统一标准快速完成套图，降低反复沟通成本。'],
      ['团队价值', '将原本依赖个人经验的做图工作拆成清晰的分工和交付节点，提升设计资源利用率，并为后续批量化内容生产提供基础。'],
    ],
  },
  {
    index: '03',
    title: 'AI 产品开发与业务落地',
    items: [
      ['需求拆解', '能够把业务目标拆解为字段、流程、工具、交付物和验收标准，优先解决影响效率与利润的关键环节。'],
      ['工具落地', '熟悉飞书多维表格、SellerSprite、LinkFox 及 AI 辅助编程，能够把工具组合成可执行、可复盘的工作方案。'],
      ['结果意识', '关注流程上线后的实际使用效果，通过数据记录、任务追踪和结果回看持续优化，而不是只停留在工具试用层面。'],
    ],
  },
]

const resumeProjects = [
  { date: '2023-09 至 2024-02', title: '日本手机退差价项目', body: '负责与日本方苹果客服进行日语沟通，统筹每台手机的退差价操作、进度跟踪与结果核对；完成数百台业务，单台差价约 15,000 日元，累计带来近 200 万日元净利润。' },
  { date: '2025-03 至 07', title: '中日高差价商品转卖与销售', body: '亲赴日本并结合跨境物流开展中日高差价商品转卖与销售，参与货源判断、采购协调、跨境运输和销售推进。' },
]

const transferableMethods = [
  ['流程产品化', '把一次性经验沉淀为字段、规则、模板和检查清单，形成团队可以直接使用的工作资产。'],
  ['效率工程化', '优先识别高频、重复、依赖人工判断的环节，再用 AI 和工具完成标准化、批量化与质量检查。'],
  ['结果可验收', '以流程是否真正被使用、交付质量是否稳定、业务协作是否顺畅作为验收标准，持续根据结果复盘优化。'],
]

function TypingTitle({ className = '' }) {
  const phrase = 'ZT.AI'
  const [text, setText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const done = text === phrase
    const empty = text === ''
    // Let the finished wordmark breathe before erasing, then hold the empty state
    // long enough for the restart to read as intentional rather than jittery.
    const delay = done && !deleting ? 2000 : empty && deleting ? 1000 : deleting ? 75 : 125
    const timer = setTimeout(() => {
      if (done && !deleting) setDeleting(true)
      else if (empty && deleting) setDeleting(false)
      else setText(deleting ? phrase.slice(0, text.length - 1) : phrase.slice(0, text.length + 1))
    }, delay)
    return () => clearTimeout(timer)
  }, [text, deleting])

  return <div className={`typing-line ${className}`}><span>{text}</span><i /></div>
}

function Avatar({ size = 'large' }) {
  return <div className={`avatar-frame avatar-${size}`}><img src={avatar} alt="蔡宙廷简历头像" /><span className="avatar-ring" /></div>
}

function Brand({ compact = false, copy }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><img className="brand-logo" src={logo} alt="ZT.AI logo" /><span className="brand-word">ZT<span className="brand-dot">.</span>AI</span>{!compact && <small>{copy?.digitalTwin || 'digital twin'}</small>}</div>
}

function LanguageSwitch({ language, setLanguage, copy }) {
  return <div className="language-switch" aria-label={copy.languageAria}>
    <span>{copy.languageLabel}</span>
    {LANGUAGE_OPTIONS.map(([code, label]) => <button key={code} className={language === code ? 'active' : ''} onClick={() => setLanguage(code)}>{label}</button>)}
  </div>
}

function ModelSwitch({ model, setModel }) {
  return <div className="model-switch" aria-label="对话模型切换">
    <span className="control-label">MODEL</span>
    {[['MINIMAX', 'M3'], ['DEEPSEEK', 'V4 FLASH']].map(([item, version]) => <button key={item} className={model === item ? 'active' : ''} onClick={() => setModel(item)} title={`${item} ${version}`}>{item}<small>{version}</small></button>)}
  </div>
}

async function consumeSse(response, onEvent) {
  if (!response.ok || !response.body) throw new Error(`聊天网关不可用（${response.status}）`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const consumeFrame = frame => {
    const lines = frame.split(/\r?\n/)
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message.delta'
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('')
    if (!data) return
    try { onEvent(event, JSON.parse(data)) } catch { /* ignore malformed provider frames */ }
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      frames.forEach(consumeFrame)
    }
    if (buffer.trim()) consumeFrame(buffer)
  } finally {
    reader.releaseLock()
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function prepareImage(file) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.onerror = () => resolve(reader.result)
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

async function prepareAttachment(file) {
  const attachment = { id: `${file.name}-${file.lastModified}-${Math.random()}`, name: file.name, type: file.type || 'application/octet-stream', size: file.size }
  if (file.type.startsWith('image/')) attachment.preview = await prepareImage(file)
  else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(file.name)) attachment.text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.slice(0, 16000)
  else if (file.type.startsWith('text/') || /\.(md|markdown|txt|json|csv|js|jsx|ts|tsx|py|html|css)$/i.test(file.name)) attachment.text = (await file.text()).slice(0, 16000)
  return attachment
}

function MarkdownMessage({ text }) {
  return <div className="markdown-message" dangerouslySetInnerHTML={{ __html: renderMarkdown(text || '') }} />
}

function AttachmentList({ attachments = [], compact = false }) {
  if (!attachments.length) return null
  return <div className={`attachment-list ${compact ? 'is-compact' : ''}`}>{attachments.map(file => <div className="attachment-chip" key={file.id}>{file.preview ? <img src={file.preview} alt={file.name} /> : <FileText size={14} />}<span title={file.name}>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}</div>
}

function visitorShortId(visitorId) {
  return String(visitorId || 'visitor').replace(/^visitor-/, '').slice(-6).toUpperCase()
}

function ChatHistoryDrawer({ visitorId, sessions, activeSessionId, onSelectSession, onNewChat, onClose, copy }) {
  return <>
    <button className="drawer-backdrop" onClick={onClose} aria-label={copy.historyTitle} />
    <aside className="chat-history-drawer" aria-label="聊天记录抽屉">
      <div className="drawer-header"><div><span className="eyebrow">{copy.historyEyebrow}</span><h3>{copy.historyTitle}</h3></div><button className="drawer-close" onClick={onClose} aria-label={copy.historyTitle}><X size={17} /></button></div>
      <button className="drawer-new-chat" onClick={onNewChat}><Plus size={15} />{copy.newChat}</button>
      <span className="drawer-section-label">{copy.historySection}</span>
      <div className="drawer-session-list">{sessions.map(session => <button key={session.id} className={`drawer-session ${session.id === activeSessionId ? 'active' : ''}`} onClick={() => onSelectSession(session.id)}><strong>{session.title || copy.newChat}</strong><span>{new Date(session.updatedAt || session.createdAt).toLocaleDateString()} · {session.messages.length} {copy.sessionCount}</span></button>)}</div>
      <div className="drawer-privacy"><span /><div><strong>{copy.privacyTitle}</strong><p>访客 ID · {visitorShortId(visitorId)}<br />{copy.privacyBody}</p></div></div>
    </aside>
  </>
}

function ChatBox({ session, visitorId, sessions, onSessionChange, onSelectSession, onNewChat, copy, resumeDocument, language }) {
  const messages = session.messages || []
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [activeMessageId, setActiveMessageId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const messagesRef = useRef(null)
  const streamQueueRef = useRef([])
  const streamFinishedRef = useRef(false)

  const model = session.model || 'MINIMAX'
  const updateMessages = updater => onSessionChange(session.id, current => {
    const nextMessages = typeof updater === 'function' ? updater(current.messages || []) : updater
    return { ...current, messages: nextMessages, title: createSessionTitle(nextMessages), updatedAt: Date.now() }
  })
  const setModel = nextModel => onSessionChange(session.id, current => ({ ...current, model: nextModel, updatedAt: Date.now() }))

  useEffect(() => {
    setInput('')
    setAttachments([])
    setActiveMessageId(null)
    streamQueueRef.current = []
    streamFinishedRef.current = false
  }, [session.id])

  useEffect(() => {
    if (!activeMessageId) return undefined
    const timer = window.setInterval(() => {
      if (streamQueueRef.current.length) {
        const batch = streamQueueRef.current.splice(0, getStreamBatchSize(streamQueueRef.current.length)).join('')
        updateMessages(items => items.map(message => message.id === activeMessageId
          ? { ...message, text: `${message.text}${batch}`, status: 'streaming' }
          : message))
      } else if (streamFinishedRef.current) {
        updateMessages(items => items.map(message => message.id === activeMessageId ? { ...message, status: 'done' } : message))
        setActiveMessageId(null)
      }
    }, 30)
    return () => window.clearInterval(timer)
  }, [activeMessageId])

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: activeMessageId ? 'auto' : 'smooth',
    })
  }, [messages, activeMessageId])

  const handleFiles = async event => {
    const files = Array.from(event.target.files || []).slice(0, 4)
    if (files.length) {
      const prepared = await Promise.all(files.map(prepareAttachment))
      setAttachments(current => [...current, ...prepared].slice(0, 4))
    }
    event.target.value = ''
  }

  const removeAttachment = id => setAttachments(current => current.filter(file => file.id !== id))

  const send = () => {
    const value = input.trim()
    if ((!value && !attachments.length) || activeMessageId) return
    const now = Date.now()
    const attachmentText = attachments.map(file => `[附件：${file.name}，类型：${file.type}，大小：${formatBytes(file.size)}]${file.text ? `\n${file.text}` : ''}`).join('\n')
    const contentText = [value || copy.sendFallback, attachmentText].filter(Boolean).join('\n\n')
    const imageParts = attachments.filter(file => file.preview).map(file => ({ type: 'image_url', image_url: { url: file.preview } }))
    const content = imageParts.length ? [{ type: 'text', text: contentText }, ...imageParts] : contentText
    const userMessage = { id: `user-${now}`, role: 'user', text: value || copy.sendFallback, content, attachments, status: 'done' }
    const responseId = `response-${now}`
    const history = [...messages, userMessage].map(message => ({ role: message.role === 'zt' ? 'assistant' : message.role, content: message.content || message.text })).filter(message => message.content)
    streamQueueRef.current = []
    streamFinishedRef.current = false
    updateMessages(items => [...items, userMessage, { id: responseId, role: 'zt', text: '', status: 'thinking' }])
    setActiveMessageId(responseId)
    setInput('')
    setAttachments([])
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, language, visitorId, conversationId: session.id, messages: history, attachments: userMessage.attachments.map(({ name, type, size }) => ({ name, type, size })) }) })
        await consumeSse(response, (event, data) => {
          if (event === 'message.delta' && data.text) streamQueueRef.current.push(...String(data.text))
          if (event === 'media.started') streamQueueRef.current.push(...copy.mediaPreparing)
          if (event === 'media.completed' && data.url) {
            updateMessages(items => items.map(message => message.id === responseId
              ? { ...message, media: { kind: data.kind, url: data.url }, status: 'streaming' }
              : message))
            streamQueueRef.current.push(...copy.mediaCompleted)
          }
          if (event === 'message.error') streamQueueRef.current.push(...`${copy.responseError}${data.message ? `: ${data.message}` : ''}`)
          if (event === 'message.done') streamFinishedRef.current = true
        })
        streamFinishedRef.current = true
      } catch (error) {
        streamQueueRef.current.push(...`${copy.gatewayError}${error.message ? ` (${error.message})` : ''}`)
        streamFinishedRef.current = true
      }
    })()
  }
  const renderMedia = media => {
    if (!media?.url || !/^https?:\/\//i.test(media.url)) return null
    if (media.kind === 'video') return <div className="media-output"><video controls preload="metadata" src={media.url} /><a href={media.url} target="_blank" rel="noreferrer">打开视频</a></div>
    return <div className="media-output"><a href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt="ZT.AI 创作结果" /></a><a href={media.url} target="_blank" rel="noreferrer">打开原图</a></div>
  }
  const renderMessage = message => message.status === 'thinking'
    ? <span className="typing-indicator" aria-label="ZT.AI 正在思考"><i /><i /><i /></span>
    : <><MarkdownMessage text={message.text} /><AttachmentList attachments={message.attachments} /></>
  return <section className="chat-card">
    <div className="chat-topline"><div><span className="eyebrow">{copy.eyebrow} · {visitorShortId(visitorId)}</span><h2>{copy.title}</h2></div><div className="chat-top-actions"><button className="chat-history-button" onClick={() => setHistoryOpen(true)}><History size={14} />{copy.history}</button><button className="chat-new-button" onClick={onNewChat}><Plus size={14} />{copy.newChat}</button><a className="resume-inline-download" href={resumeDocument.url} download={resumeDocument.name}><FileText size={13} />{copy.resume}</a><span className="free-pill"><span />{copy.free}</span></div></div>
    {messages.length ? <div className="messages" ref={messagesRef}>{messages.map((message, index) => <div key={message.id ?? `${message.role}-${index}`} className={`message-row ${message.role === 'user' ? 'from-user' : ''}`}><div className={`message-bubble ${message.status === 'thinking' ? 'is-thinking' : ''}`}><span className="message-label">{message.role === 'zt' ? 'ZT.AI' : copy.visitor}</span>{renderMessage(message)}{renderMedia(message.media)}</div></div>)}</div> : <div className="empty-chat" ref={messagesRef}><span className="empty-chat-mark"><MessageCircle size={20} /></span><span className="eyebrow">{copy.emptyEyebrow}</span><h3>{copy.emptyTitle}</h3><p>{copy.emptyBody}</p><button onClick={() => setInput(copy.startPrompt)}>{copy.emptyAction} <ArrowUpRight size={14} /></button></div>}
    {attachments.length > 0 && <div className="pending-attachments"><AttachmentList attachments={attachments} compact />{attachments.map(file => <button key={file.id} onClick={() => removeAttachment(file.id)} aria-label={`移除 ${file.name}`}><X size={13} /></button>)}</div>}
    <div className="chat-compose"><label className="attach-button" title={copy.upload}><Paperclip size={16} /><input type="file" multiple accept="image/*,.txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css,.pdf,.doc,.docx" onChange={handleFiles} disabled={Boolean(activeMessageId)} /></label><input value={input} disabled={Boolean(activeMessageId)} onChange={event => setInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && send()} placeholder={activeMessageId ? copy.generating : copy.placeholder} /><button onClick={send} disabled={Boolean(activeMessageId) || (!input.trim() && !attachments.length)} aria-label={copy.send}><Send size={16} /></button></div>
    <div className="chat-footer"><ModelSwitch model={model} setModel={setModel} /><span className="chat-note"><MessageCircle size={14} /> {copy.publicNote}</span></div>
    {historyOpen && <ChatHistoryDrawer visitorId={visitorId} sessions={sessions} activeSessionId={session.id} copy={copy} onSelectSession={id => { onSelectSession(id); setHistoryOpen(false) }} onNewChat={() => { onNewChat(); setHistoryOpen(false) }} onClose={() => setHistoryOpen(false)} />}
  </section>
}

function PublicProfile({ copy }) {
  return <section className="profile-card">
    <div className="profile-top"><Avatar /><span className="status-dot"><span />{copy.status}</span></div>
    <div className="profile-name"><h1>蔡宙廷</h1><p>{copy.role}</p><p className="muted">{copy.target}</p></div>
    <div className="tag-row">{copy.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
    <div className="profile-copy"><span className="eyebrow">{copy.eyebrow}</span><p>{copy.about}</p></div>
    <div className="profile-signature"><span>{copy.signature}</span><strong>{copy.greeting}</strong></div>
  </section>
}

function ProjectsPage({ copy }) {
  return <section className="page-section projects-page"><div className="section-heading"><div><span className="eyebrow">{copy.eyebrow}</span><h2>{copy.title}</h2></div><span className="section-count">{copy.count}</span></div><div className="project-grid">{copy.cards.map(([title, tag, desc, metric], index) => { const Icon = [Orbit, Sparkles, BriefcaseBusiness][index]; return <article className="project-card" key={title}><div className="project-icon"><Icon size={18} /></div><div className="project-number">0{index + 1}</div><span className="project-tag">{tag}</span><h3>{title}</h3><p>{desc}</p><div className="project-bottom"><strong>{metric}</strong><span>{copy.view} <ArrowUpRight size={14} /></span></div></article> })}</div><a className="github-card" href="https://github.com/niuzipai-gif?tab=repositories" target="_blank" rel="noreferrer"><div className="github-icon"><GitBranch size={22} /></div><div><span className="eyebrow">{copy.githubEyebrow}</span><h3>{copy.githubTitle}</h3><p>{copy.githubBody}</p></div><span className="github-link-icon" aria-label={copy.githubTitle}><ArrowUpRight size={17} /></span></a></section>
}

function ResumePage({ copy, resumeDocument }) {
  return <section className="page-section resume-page"><div className="section-heading"><div><span className="eyebrow">{copy.eyebrow}</span><h2>{copy.title}</h2></div><a className="resume-heading-download" href={resumeDocument.url} download={resumeDocument.name} aria-label={copy.download}><FileText size={18} /></a></div><div className="resume-hero"><Avatar size="small" /><div><span className="eyebrow">{copy.roleEyebrow}</span><strong>{copy.identity}</strong><p>{copy.basics}</p><p className="resume-contact">18664695946 · niuzip@gmail.com</p></div></div><div className="resume-target"><span className="eyebrow">{copy.targetEyebrow}</span><strong>{copy.targetTitle}</strong><p>{copy.targetBody}</p></div><div className="resume-metrics">{copy.metrics.map(([value, label, note]) => <div className="resume-metric" key={label}><strong>{value}</strong><span>{label}</span><small>{note}</small></div>)}</div><section className="resume-block"><div className="resume-block-heading"><span className="eyebrow">{copy.workEyebrow}</span><h3>{copy.workTitle}</h3></div><div className="resume-work-list">{copy.work.map(([date, company, role, detail, current]) => <article className={`resume-work-item ${current ? 'is-current' : ''}`} key={`${company}-${date}`}><div className="resume-work-marker" /><div><span className="resume-date">{date}</span><div className="resume-work-title"><h4>{company}</h4><strong>{role}</strong></div><p>{detail}</p></div></article>)}</div></section><section className="resume-block resume-detail-block"><div className="resume-block-heading"><span className="eyebrow">{copy.kunxinEyebrow}</span><h3>{copy.kunxinTitle}</h3></div>{copy.details.map(([index, title, items]) => <article className="resume-detail-section" key={index}><div className="resume-detail-number">{index}</div><div><h4>{title}</h4>{items.map(([label, body]) => <p key={label}><strong>{label}：</strong>{body}</p>)}</div></article>)}</section><section className="resume-block"><div className="resume-block-heading"><span className="eyebrow">{copy.projectEyebrow}</span><h3>{copy.projectTitle}</h3></div><div className="resume-project-list">{copy.projectList.map(([date, title, body]) => <article className="resume-project-item" key={title}><span className="resume-date">{date}</span><h4>{title}</h4><p>{body}</p></article>)}</div></section><div className="resume-two-column"><section className="resume-block compact-block"><div className="resume-block-heading"><span className="eyebrow">{copy.skillsEyebrow}</span><h3>{copy.skillsTitle}</h3></div><div className="skill-list">{copy.skills.map(skill => <span key={skill}>{skill}</span>)}</div><p className="resume-small-copy">{copy.skillsBody}</p></section><section className="resume-block compact-block"><div className="resume-block-heading"><span className="eyebrow">{copy.educationEyebrow}</span><h3>{copy.educationTitle}</h3></div><span className="resume-date">{copy.educationDate}</span><h4>{copy.educationSchool}</h4><p>{copy.educationDegree}</p><p className="resume-small-copy">{copy.educationBody}</p></section></div><section className="resume-block methods-block"><div className="resume-block-heading"><span className="eyebrow">{copy.methodsEyebrow}</span><h3>{copy.methodsTitle}</h3></div><div className="methods-grid">{copy.methods.map(([title, body]) => <article key={title}><strong>{title}</strong><p>{body}</p></article>)}</div></section><div className="resume-lock"><ShieldCheck size={18} /><div><strong>{copy.openTitle}</strong><p>{copy.openBody}</p></div><a className="resume-download" href={resumeDocument.url} download={resumeDocument.name}>{copy.download}</a></div></section>
}

function HomePage({ onChat, copy }) {
  return <section className="home-page"><div className="home-noise" /><div className="home-orbit orbit-one" /><div className="home-orbit orbit-two" /><div className="home-content"><div className="home-kicker"><span className="live-dot" /> {copy.kicker}</div><div className="home-brand"><img className="hero-logo" src={logo} alt="ZT.AI logo" /><TypingTitle className="hero-typing" /></div><div className="home-reflection"><span>{copy.reflection[0]}</span><span>{copy.reflection[1]}</span><i aria-hidden="true"><span>{copy.reflection[0]}</span><span>{copy.reflection[1]}</span></i></div><div className="home-actions"><button className="primary-button" onClick={onChat}>{copy.chat} <ArrowUpRight size={17} /></button><button className="text-button" onClick={() => document.getElementById('root').dispatchEvent(new CustomEvent('navigate', { detail: 'projects' }))}>{copy.projects} <MoveUpRight size={16} /></button></div></div></section>
}

function App() {
  const [page, setPage] = useState('home')
  const [visitorState, setVisitorState] = useState(() => loadVisitorState(localStorage))
  const [menuOpen, setMenuOpen] = useState(false)
  const [language, setLanguage] = useState(() => getInitialLanguage(localStorage))
  const copy = siteCopy[language]
  const pages = copy.nav
  const resumeDocument = { url: `${import.meta.env.BASE_URL}${resumeDocumentByLanguage[language].path}`, name: resumeDocumentByLanguage[language].name }
  const activeSession = visitorState.sessions.find(session => session.id === visitorState.activeSessionId) || visitorState.sessions[0]
  useEffect(() => { saveVisitorState(localStorage, visitorState) }, [visitorState])
  useEffect(() => { try { localStorage.setItem('zt-ai:language', language) } catch {} }, [language])
  const selectSession = id => setVisitorState(current => current.sessions.some(session => session.id === id) ? { ...current, activeSessionId: id } : current)
  const newChat = () => { const session = createChatSession({ model: 'MINIMAX' }); setVisitorState(current => ({ ...current, activeSessionId: session.id, sessions: [session, ...current.sessions] })) }
  const updateSession = (sessionId, updater) => setVisitorState(current => {
    if (current.activeSessionId !== sessionId) return current
    return { ...current, sessions: current.sessions.map(session => session.id === sessionId ? updater(session) : session) }
  })
  useEffect(() => { const handler = event => setPage(event.detail); document.getElementById('root').addEventListener('navigate', handler); return () => document.getElementById('root').removeEventListener('navigate', handler) }, [])
  const navigate = value => { setPage(value); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return <div className={`app-shell page-${page}`}>
    <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-label={language === 'zh' ? '打开菜单' : 'Open menu'}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><Brand compact copy={copy} /><nav className={menuOpen ? 'open' : ''}>{Object.entries(pages).map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav><div className="topbar-right"><a className="desktop-download" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" aria-label={copy.desktopDownload}><Download size={14} /><span>{copy.desktopDownload}</span></a><LanguageSwitch language={language} setLanguage={setLanguage} copy={copy} /><span className="availability"><span /> {copy.availability}</span><button className="more-button" aria-label="More"><MoreHorizontal size={20} /></button></div></header>
    <main className="main-content">
      {page === 'home' && <HomePage copy={copy.home} onChat={() => navigate('chat')} />}
      {page === 'chat' && <div className="chat-layout"><PublicProfile copy={copy.profile} /><ChatBox copy={copy.chat} language={language} resumeDocument={resumeDocument} session={activeSession} visitorId={visitorState.visitorId} sessions={visitorState.sessions} onSessionChange={updateSession} onSelectSession={selectSession} onNewChat={newChat} /></div>}
      {page === 'projects' && <ProjectsPage copy={copy.projects} />}
      {page === 'resume' && <ResumePage copy={copy.resume} resumeDocument={resumeDocument} />}
    </main>
    <footer className="mobile-nav">{[['home', Home], ['chat', MessageCircle], ['projects', BriefcaseBusiness], ['resume', UserRound]].map(([key, Icon]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}><Icon size={18} /><span>{pages[key]}</span></button>)}</footer>
  </div>
}

const root = globalThis.__ztaiReactRoot ?? createRoot(document.getElementById('root'))
globalThis.__ztaiReactRoot = root
root.render(<App />)
