import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, BriefcaseBusiness, Check, FileText, GitBranch, Home,
  LockKeyhole, Menu, MessageCircle, MoreHorizontal, MoveUpRight, Orbit,
  Paperclip, Send, ShieldCheck, Sparkles, UserRound, X
} from 'lucide-react'
import avatar from './assets/resume-avatar.jpeg'
import logo from './assets/zt-logo.png'
import mammoth from 'mammoth/mammoth.browser'
import { loadSessionState, saveSessionState } from './lib/chat-session.js'
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

function ChatBox({ model, setModel }) {
  const savedSession = loadSessionState()
  const [messages, setMessages] = useState(() => savedSession?.messages?.length ? savedSession.messages : chatSeed)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [activeMessageId, setActiveMessageId] = useState(null)
  const messagesRef = useRef(null)
  const streamQueueRef = useRef([])
  const streamFinishedRef = useRef(false)

  useEffect(() => { saveSessionState(localStorage, { messages, model }) }, [messages, model])

  useEffect(() => {
    if (!activeMessageId) return undefined
    const timer = window.setInterval(() => {
      if (streamQueueRef.current.length) {
        const character = streamQueueRef.current.shift()
        setMessages(items => items.map(message => message.id === activeMessageId
          ? { ...message, text: `${message.text}${character}`, status: 'streaming' }
          : message))
      } else if (streamFinishedRef.current) {
        setMessages(items => items.map(message => message.id === activeMessageId ? { ...message, status: 'done' } : message))
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
    setMessages(items => [...items, userMessage, { id: responseId, role: 'zt', text: '', status: 'thinking' }])
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
            setMessages(items => items.map(message => message.id === responseId
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
    <div className="chat-topline"><div><span className="eyebrow">OPEN CHAT</span><h2>和 ZT.AI 聊聊</h2></div><div className="chat-top-actions"><a className="resume-inline-download" href={resumeDoc} download>简历文件</a><span className="free-pill"><span />无需登录 · 免费</span></div></div>
    <div className="messages" ref={messagesRef}>{messages.map((message, index) => <div key={message.id ?? `${message.role}-${index}`} className={`message-row ${message.role === 'user' ? 'from-user' : ''}`}><div className={`message-bubble ${message.status === 'thinking' ? 'is-thinking' : ''}`}><span className="message-label">{message.role === 'zt' ? 'ZT.AI' : '访客'}</span>{renderMessage(message)}{renderMedia(message.media)}</div></div>)}</div>
    {attachments.length > 0 && <div className="pending-attachments"><AttachmentList attachments={attachments} compact />{attachments.map(file => <button key={file.id} onClick={() => removeAttachment(file.id)} aria-label={`移除 ${file.name}`}><X size={13} /></button>)}</div>}
    <div className="chat-compose"><label className="attach-button" title="上传文件或图片"><Paperclip size={16} /><input type="file" multiple accept="image/*,.txt,.md,.markdown,.json,.csv,.js,.jsx,.ts,.tsx,.py,.html,.css,.pdf,.doc,.docx" onChange={handleFiles} disabled={Boolean(activeMessageId)} /></label><input value={input} disabled={Boolean(activeMessageId)} onChange={event => setInput(event.target.value)} onKeyDown={event => event.key === 'Enter' && send()} placeholder={activeMessageId ? 'ZT.AI 正在生成回答…' : '向 ZT.AI 提问，或先上传文件/图片'} /><button onClick={send} disabled={Boolean(activeMessageId) || (!input.trim() && !attachments.length)} aria-label="发送"><Send size={16} /></button></div>
    <div className="chat-footer"><ModelSwitch model={model} setModel={setModel} /><span className="chat-note"><MessageCircle size={14} /> 公开对话 · 内容来自 ZT.AI</span></div>
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
  return <section className="page-section projects-page"><div className="section-heading"><div><span className="eyebrow">SELECTED WORK</span><h2>精选项目</h2></div><span className="section-count">03 / 03</span></div><div className="project-grid">{projects.map(({ title, tag, desc, metric, icon: Icon }, index) => <article className="project-card" key={title}><div className="project-icon"><Icon size={18} /></div><div className="project-number">0{index + 1}</div><span className="project-tag">{tag}</span><h3>{title}</h3><p>{desc}</p><div className="project-bottom"><strong>{metric}</strong><span>查看项目 <ArrowUpRight size={14} /></span></div></article>)}</div><div className="github-card"><div className="github-icon"><GitBranch size={22} /></div><div><span className="eyebrow">OPEN SOURCE EVIDENCE</span><h3>GitHub 精选仓库</h3><p>精选公开项目与可验证的开发记录，欢迎在对话中了解我的技术实践。</p></div><button aria-label="查看 GitHub"><ArrowUpRight size={17} /></button></div></section>
}

function ResumePage() {
  return <section className="page-section resume-page"><div className="section-heading"><div><span className="eyebrow">PROFILE DATA</span><h2>简历摘要</h2></div><FileText size={18} /></div><div className="resume-hero"><Avatar size="small" /><div><strong>AI 产品开发 · 蔡宙廷</strong><p>目标方向：AI 产品经理 / FDE / 电商 FDE</p></div></div><div className="timeline"><div><span>2026.04 — 2027.04</span><h3>深圳市坤信科技有限公司</h3><p>AI 产品开发 · Amazon 精铺跨境电商</p></div><div><span>核心能力</span><h3>业务问题 → AI 工作流 → 可验收结果</h3><p>选品流程、内容生产、利润跟踪、工具接入与项目落地。</p></div></div><div className="resume-lock"><ShieldCheck size={18} /><div><strong>公开摘要已开放</strong><p>在公开对话中了解我的经历、项目和未来方向。</p></div><a className="resume-download" href={resumeDoc} download>下载完整简历</a></div></section>
}

function HomePage({ onChat }) {
  return <section className="home-page"><div className="home-noise" /><div className="home-orbit orbit-one" /><div className="home-orbit orbit-two" /><div className="home-content"><div className="home-kicker"><span className="live-dot" /> PERSONAL AI AGENT · 2026</div><div className="home-brand"><img className="hero-logo" src={logo} alt="ZT.AI 标志" /><TypingTitle className="hero-typing" /></div><div className="home-reflection"><span>让经历被理解，让能力被看见</span><span>从真实业务中生长，用 AI 连接更多可能</span><i aria-hidden="true"><span>让经历被理解，让能力被看见</span><span>从真实业务中生长，用 AI 连接更多可能</span></i></div><div className="home-actions"><button className="primary-button" onClick={onChat}>和 ZT.AI 聊聊 <ArrowUpRight size={17} /></button><button className="text-button" onClick={() => document.getElementById('root').dispatchEvent(new CustomEvent('navigate', { detail: 'projects' }))}>查看精选项目 <MoveUpRight size={16} /></button></div></div></section>
}

function App() {
  const [page, setPage] = useState('home')
  const [model, setModel] = useState(() => loadSessionState()?.model || 'MINIMAX')
  const [menuOpen, setMenuOpen] = useState(false)
  const pages = useMemo(() => ({ home: '首页', chat: '公开聊天', projects: '精选项目', resume: '简历摘要' }), [])
  useEffect(() => { const handler = event => setPage(event.detail); document.getElementById('root').addEventListener('navigate', handler); return () => document.getElementById('root').removeEventListener('navigate', handler) }, [])
  const navigate = value => { setPage(value); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return <div className={`app-shell page-${page}`}>
    <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(value => !value)} aria-label="打开菜单">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><Brand compact /><nav className={menuOpen ? 'open' : ''}>{Object.entries(pages).map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav><div className="topbar-right"><span className="availability"><span /> Available for conversation</span><button className="more-button"><MoreHorizontal size={20} /></button></div></header>
    <main className="main-content">
      {page === 'home' && <HomePage onChat={() => navigate('chat')} />}
      {page === 'chat' && <div className="chat-layout"><PublicProfile /><ChatBox model={model} setModel={setModel} /></div>}
      {page === 'projects' && <ProjectsPage />}
      {page === 'resume' && <ResumePage />}
    </main>
    <footer className="mobile-nav">{[['home', Home], ['chat', MessageCircle], ['projects', BriefcaseBusiness], ['resume', UserRound]].map(([key, Icon]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => navigate(key)}><Icon size={18} /><span>{pages[key]}</span></button>)}</footer>
  </div>
}

const root = globalThis.__ztaiReactRoot ?? createRoot(document.getElementById('root'))
globalThis.__ztaiReactRoot = root
root.render(<App />)
