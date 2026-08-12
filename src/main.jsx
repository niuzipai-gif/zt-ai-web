import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, BriefcaseBusiness, Check, FileText, GitBranch, History, Home,
  LockKeyhole, Menu, MessageCircle, MoreHorizontal, MoveUpRight, Orbit,
  Paperclip, Plus, Send, ShieldCheck, Sparkles, UserRound, X
} from 'lucide-react'
import avatar from './assets/resume-avatar.png'
import logo from './assets/zt-logo.png'
import mammoth from 'mammoth/mammoth.browser'
import { createChatSession, createSessionTitle, loadVisitorState, saveVisitorState } from './lib/chat-session.js'
import { renderMarkdown } from './lib/markdown.js'
import './styles.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const resumeDoc = `${import.meta.env.BASE_URL}resume.docx`
const greeting = '你好，我是 ZT.AI, 是蔡宙廷的 AI 数字分身, 我能替小蔡为你做什么吗？'

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

const chatSeed = [
  { id: 'seed-1', role: 'zt', text: greeting, status: 'done' },
  { id: 'seed-2', role: 'user', text: '你为什么想做 AI 产品经理或 FDE？', status: 'done' },
  { id: 'seed-3', role: 'zt', text: '因为我更擅长把真实业务问题拆成可执行的流程、工具和结果。我目前在 Amazon 精铺业务中研发选品与开品流程，也在用 AI 和 LinkFox 提升内容生产效率。', status: 'done' },
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

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><img className="brand-logo" src={logo} alt="ZT.AI 标志" /><span className="brand-word">ZT<span className="brand-dot">.</span>AI</span>{!compact && <small>digital twin</small>}</div>
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

function ChatHistoryDrawer({ visitorId, sessions, activeSessionId, onSelectSession, onNewChat, onClose }) {
  return <>
    <button className="drawer-backdrop" onClick={onClose} aria-label="关闭聊天记录" />
    <aside className="chat-history-drawer" aria-label="聊天记录抽屉">
      <div className="drawer-header"><div><span className="eyebrow">PRIVATE SESSIONS</span><h3>聊天记录</h3></div><button className="drawer-close" onClick={onClose} aria-label="关闭"><X size={17} /></button></div>
      <button className="drawer-new-chat" onClick={onNewChat}><Plus size={15} />新建聊天</button>
      <span className="drawer-section-label">当前访客的聊天</span>
      <div className="drawer-session-list">{sessions.map(session => <button key={session.id} className={`drawer-session ${session.id === activeSessionId ? 'active' : ''}`} onClick={() => onSelectSession(session.id)}><strong>{session.title || '新建聊天'}</strong><span>{new Date(session.updatedAt || session.createdAt).toLocaleDateString('zh-CN')} · {session.messages.length} 条消息</span></button>)}</div>
      <div className="drawer-privacy"><span /><div><strong>记录仅属于当前访客</strong><p>访客 ID · {visitorShortId(visitorId)}<br />不会与其他访问者共享聊天内容。</p></div></div>
    </aside>
  </>
}

function ChatBox({ session, visitorId, sessions, onSessionChange, onSelectSession, onNewChat }) {
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
        const character = streamQueueRef.current.shift()
        updateMessages(items => items.map(message => message.id === activeMessageId
          ? { ...message, text: `${message.text}${character}`, status: 'streaming' }
          : message))
      } else if (streamFinishedRef.current) {
        updateMessages(items => items.map(message => message.id === activeMessageId ? { ...message, status: 'done' } : message))
        setActiveMessageId(null)
      }
    }, 30)
    return () => window.clearInterval(timer)
  }, [activeMessageId])

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

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
    const contentText = [value || '请查看我上传的附件。', attachmentText].filter(Boolean).join('\n\n')
    const imageParts = attachments.filter(file => file.preview).map(file => ({ type: 'image_url', image_url: { url: file.preview } }))
    const content = imageParts.length ? [{ type: 'text', text: contentText }, ...imageParts] : contentText
    const userMessage = { id: `user-${now}`, role: 'user', text: value || '请查看我上传的附件。', content, attachments, status: 'done' }
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
        const response = await fetch(`${API_BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: history, attachments: userMessage.attachments.map(({ name, type, size }) => ({ name, type, size })) }) })
        await consumeSse(response, (event, data) => {
          if (event === 'message.delta' && data.text) streamQueueRef.current.push(...String(data.text))
          if (event === 'media.started') streamQueueRef.current.push(...'正在准备创作，请稍候…')
          if (event === 'media.completed' && data.url) {
            updateMessages(items => items.map(message => message.id === responseId
              ? { ...message, media: { kind: data.kind, url: data.url }, status: 'streaming' }
              : message))
            streamQueueRef.current.push(...'创作结果已完成：')
          }
          if (event === 'message.error') streamQueueRef.current.push(...`这次对话没有完成：${data.message || '请稍后重试。'}`)
          if (event === 'message.done') streamFinishedRef.current = true
        })
        streamFinishedRef.current = true
      } catch (error) {
        streamQueueRef.current.push(...`暂时无法连接 ZT.AI 网关：${error.message || '请稍后重试。'}`)
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
    <div className="chat-topline"><div><span className="eyebrow">OPEN CHAT · {visitorShortId(visitorId)}</span><h2>和 ZT.AI 聊聊</h2></div><div className="chat-top-actions"><button className="chat-history-button" onClick={() => setHistoryOpen(true)}><History size={14} />聊天记录</button><button className="chat-new-button" onClick={onNewChat}><Plus size={14} />新建聊天</button><a className="resume-inline-download" href={resumeDoc} download>简历文件</a><span className="free-pill"><span />无需登录 · 免费</span></div></div>
    {messages.length ? <div className="messages" ref={messagesRef}>{messages.map((message, index) => <div key={message.id ?? `${message.role}-${index}`} className={`message-row ${message.role === 'user' ? 'from-user' : ''}`}><div className={`message-bubble ${message.status === 'thinking' ? 'is-thinking' : ''}`}><span className="message-label">{message.role === 'zt' ? 'ZT.AI' : '访客'}</span>{renderMessage(message)}{renderMedia(message.media)}</div></div>)}</div> : <div className="empty-chat" ref={messagesRef}><span className="empty-chat-mark"><MessageCircle size={20} /></span><span className="eyebrow">NEW PRIVATE SESSION</span><h3>你好，我是 ZT.AI</h3><p>我是蔡宙廷的 AI 数字分身。你可以问我项目经历、AI 产品开发或 FDE 方向。</p><button onClick={() => setInput('请介绍一下蔡宙廷目前的 AI 产品开发经历')}>从一个问题开始 <ArrowUpRight size={14} /></button></div>}
    {attachments.length > 0 && <div className="pending-attachments"><AttachmentList attachments={attachments} compact />{attachments.map(file => <button key={file.id} onClick={() => removeAttachment(file.id)} aria-label={`移除 ${file.name}`}><X size={13} /></button>)}</div>}
    <div className="chat-compose"><label className="attach-button" title="上传文件或图片"><Paperclip size={16} /><input type="file" multiple accept="image/*,.txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css,.pdf,.doc,.docx" onChange={handleFiles} disabled={Boolean(activeMessageId)} /></label><input value={input} disabled={Boolean(activeMessageId)} onChange={event => setInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && send()} placeholder={activeMessageId ? 'ZT.AI 正在生成回答…' : '向 ZT.AI 提问，或先上传文件/图片'} /><button onClick={send} disabled={Boolean(activeMessageId) || (!input.trim() && !attachments.length)} aria-label="发送"><Send size={16} /></button></div>
    <div className="chat-footer"><ModelSwitch model={model} setModel={setModel} /><span className="chat-note"><MessageCircle size={14} /> 公开对话 · 内容来自 ZT.AI</span></div>
    {historyOpen && <ChatHistoryDrawer visitorId={visitorId} sessions={sessions} activeSessionId={session.id} onSelectSession={id => { onSelectSession(id); setHistoryOpen(false) }} onNewChat={() => { onNewChat(); setHistoryOpen(false) }} onClose={() => setHistoryOpen(false)} />}
  </section>
}

function PublicProfile() {
  return <section className="profile-card">
    <div className="profile-top"><Avatar /><span className="status-dot"><span />公开访问</span></div>
    <div className="profile-name"><h1>蔡宙廷</h1><p>AI 产品开发 · Amazon 精铺业务</p><p className="muted">目标方向：AI 产品经理 / FDE / 电商 FDE</p></div>
    <div className="tag-row"><span>AI 工作流</span><span>飞书多维表格</span><span>GitHub</span><span>Python</span></div>
    <div className="profile-copy"><span className="eyebrow">ABOUT</span><p>能把业务目标拆成流程、工具和可验收结果，在选品、开品、内容生产和利润跟踪之间搭建可复用的 AI 工作流。</p></div>
    <div className="profile-signature"><span>ZT.AI 是蔡宙廷的 AI 数字分身</span><strong>{greeting}</strong></div>
  </section>
}

function ProjectsPage() {
  return <section className="page-section projects-page"><div className="section-heading"><div><span className="eyebrow">SELECTED WORK</span><h2>精选项目</h2></div><span className="section-count">03 / 03</span></div><div className="project-grid">{projects.map(({ title, tag, desc, metric, icon: Icon }, index) => <article className="project-card" key={title}><div className="project-icon"><Icon size={18} /></div><div className="project-number">0{index + 1}</div><span className="project-tag">{tag}</span><h3>{title}</h3><p>{desc}</p><div className="project-bottom"><strong>{metric}</strong><span>查看项目 <ArrowUpRight size={14} /></span></div></article>)}</div><a className="github-card" href="https://github.com/niuzipai-gif?tab=repositories" target="_blank" rel="noreferrer"><div className="github-icon"><GitBranch size={22} /></div><div><span className="eyebrow">OPEN SOURCE EVIDENCE</span><h3>GitHub 精选仓库</h3><p>精选公开项目与可验证的开发记录，欢迎在对话中了解我的技术实践。</p></div><span className="github-link-icon" aria-label="打开 GitHub"><ArrowUpRight size={17} /></span></a></section>
}

function ResumePage() {
  return <section className="page-section resume-page"><div className="section-heading"><div><span className="eyebrow">PROFILE DATA</span><h2>简历摘要</h2></div><a className="resume-heading-download" href={resumeDoc} download aria-label="下载完整简历"><FileText size={18} /></a></div><div className="resume-hero"><Avatar size="small" /><div><span className="eyebrow">AI PRODUCT DEVELOPMENT</span><strong>蔡宙廷</strong><p>23 岁 · 汉族 · 群众 · 数字经济（本科）</p><p className="resume-contact">18664695946 · niuzipai@gmail.com</p></div></div><div className="resume-target"><span className="eyebrow">TARGET ROLE</span><strong>AI 产品经理 / FDE / 电商 FDE</strong><p>把真实业务问题拆成可落地的 AI 流程与工具，兼顾数据、效率和商业结果，并为整个团队赋能。</p></div><div className="resume-metrics">{resumeMetrics.map(item => <div className="resume-metric" key={item.label}><strong>{item.value}</strong><span>{item.label}</span><small>{item.note}</small></div>)}</div><section className="resume-block"><div className="resume-block-heading"><span className="eyebrow">WORK EXPERIENCE</span><h3>工作经历</h3></div><div className="resume-work-list">{resumeWork.map(item => <article className={`resume-work-item ${item.current ? 'is-current' : ''}`} key={`${item.company}-${item.date}`}><div className="resume-work-marker" /><div><span className="resume-date">{item.date}</span><div className="resume-work-title"><h4>{item.company}</h4><strong>{item.role}</strong></div><p>{item.detail}</p></div></article>)}</div></section><section className="resume-block resume-detail-block"><div className="resume-block-heading"><span className="eyebrow">KUNXIN CASE STUDY</span><h3>坤信科技｜AI 产品开发工作详述</h3></div>{resumeDetailSections.map(section => <article className="resume-detail-section" key={section.index}><div className="resume-detail-number">{section.index}</div><div><h4>{section.title}</h4>{section.items.map(([label, body]) => <p key={label}><strong>{label}：</strong>{body}</p>)}</div></article>)}</section><section className="resume-block"><div className="resume-block-heading"><span className="eyebrow">PROJECT EXPERIENCE</span><h3>项目经历</h3></div><div className="resume-project-list">{resumeProjects.map(item => <article className="resume-project-item" key={item.title}><span className="resume-date">{item.date}</span><h4>{item.title}</h4><p>{item.body}</p></article>)}</div></section><div className="resume-two-column"><section className="resume-block compact-block"><div className="resume-block-heading"><span className="eyebrow">SKILLS & CERTIFICATES</span><h3>技能证书</h3></div><div className="skill-list"><span>日语 N1</span><span>CET-4</span><span>Python</span><span>SQL / MySQL</span><span>SPSS</span><span>AI 辅助编程</span><span>飞书多维表格</span><span>SellerSprite</span><span>LinkFox</span><span>剪映 / PS / AE</span></div><p className="resume-small-copy">具备日语口语、读写及商务沟通能力；可快速阅读英文产品与技术资料；熟悉数据分析与自动化。</p></section><section className="resume-block compact-block"><div className="resume-block-heading"><span className="eyebrow">EDUCATION</span><h3>教育背景</h3></div><span className="resume-date">2022.09 — 2026.06</span><h4>广东白云学院</h4><p>数字经济（本科）</p><p className="resume-small-copy">主修：Python 数据分析、MySQL、SPSS、Power BI、Tableau、国际市场营销</p></section></div><section className="resume-block methods-block"><div className="resume-block-heading"><span className="eyebrow">WORKING METHOD</span><h3>可迁移的工作方法</h3></div><div className="methods-grid">{transferableMethods.map(([title, body]) => <article key={title}><strong>{title}</strong><p>{body}</p></article>)}</div></section><div className="resume-lock"><ShieldCheck size={18} /><div><strong>公开摘要已开放</strong><p>欢迎在公开对话中继续了解我的经历、项目和未来方向。</p></div><a className="resume-download" href={resumeDoc} download>下载完整简历</a></div></section>
}

function HomePage({ onChat }) {
  return <section className="home-page"><div className="home-noise" /><div className="home-orbit orbit-one" /><div className="home-orbit orbit-two" /><div className="home-content"><div className="home-kicker"><span className="live-dot" /> PERSONAL AI AGENT · 2026</div><div className="home-brand"><img className="hero-logo" src={logo} alt="ZT.AI 标志" /><TypingTitle className="hero-typing" /></div><div className="home-reflection"><span>让经历被理解，让能力被看见</span><span>从真实业务中生长，用 AI 连接更多可能</span><i aria-hidden="true"><span>让经历被理解，让能力被看见</span><span>从真实业务中生长，用 AI 连接更多可能</span></i></div><div className="home-actions"><button className="primary-button" onClick={onChat}>和 ZT.AI 聊聊 <ArrowUpRight size={17} /></button><button className="text-button" onClick={() => document.getElementById('root').dispatchEvent(new CustomEvent('navigate', { detail: 'projects' }))}>查看精选项目 <MoveUpRight size={16} /></button></div></div></section>
}

function App() {
  const [page, setPage] = useState('home')
  const [visitorState, setVisitorState] = useState(() => loadVisitorState(localStorage))
  const [menuOpen, setMenuOpen] = useState(false)
  const pages = useMemo(() => ({ home: '首页', chat: '公开聊天', projects: '精选项目', resume: '简历摘要' }), [])
  const activeSession = visitorState.sessions.find(session => session.id === visitorState.activeSessionId) || visitorState.sessions[0]
  useEffect(() => { saveVisitorState(localStorage, visitorState) }, [visitorState])
  const selectSession = id => setVisitorState(current => current.sessions.some(session => session.id === id) ? { ...current, activeSessionId: id } : current)
  const newChat = () => { const session = createChatSession({ model: 'MINIMAX' }); setVisitorState(current => ({ ...current, activeSessionId: session.id, sessions: [session, ...current.sessions] })) }
  const updateSession = (sessionId, updater) => setVisitorState(current => {
    if (current.activeSessionId !== sessionId) return current
    return { ...current, sessions: current.sessions.map(session => session.id === sessionId ? updater(session) : session) }
  })
  useEffect(() => { const handler = event => setPage(event.detail); document.getElementById('root').addEventListener('navigate', handler); return () => document.getElementById('root').removeEventListener('navigate', handler) }, [])
  const navigate = value => { setPage(value); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return <div className={`app-shell page-${page}`}>
    <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-label="打开菜单">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><Brand compact /><nav className={menuOpen ? 'open' : ''}>{Object.entries(pages).map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav><div className="topbar-right"><span className="availability"><span /> Available for conversation</span><button className="more-button"><MoreHorizontal size={20} /></button></div></header>
    <main className="main-content">
      {page === 'home' && <HomePage onChat={() => navigate('chat')} />}
      {page === 'chat' && <div className="chat-layout"><PublicProfile /><ChatBox session={activeSession} visitorId={visitorState.visitorId} sessions={visitorState.sessions} onSessionChange={updateSession} onSelectSession={selectSession} onNewChat={newChat} /></div>}
      {page === 'projects' && <ProjectsPage />}
      {page === 'resume' && <ResumePage />}
    </main>
    <footer className="mobile-nav">{[['home', Home], ['chat', MessageCircle], ['projects', BriefcaseBusiness], ['resume', UserRound]].map(([key, Icon]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}><Icon size={18} /><span>{pages[key]}</span></button>)}</footer>
  </div>
}

const root = globalThis.__ztaiReactRoot ?? createRoot(document.getElementById('root'))
globalThis.__ztaiReactRoot = root
root.render(<App />)
