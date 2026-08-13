export const LANGUAGE_OPTIONS = [
  ['zh', '中文'],
  ['en', 'English'],
  ['ja', '日本語'],
]

export function getInitialLanguage(storage = globalThis.localStorage, navigatorLanguage = globalThis.navigator?.language) {
  try {
    const saved = storage?.getItem('zt-ai:language')
    if (LANGUAGE_OPTIONS.some(([code]) => code === saved)) return saved
  } catch {
    // Storage can be unavailable in private browsing.
  }
  if (String(navigatorLanguage || '').toLowerCase().startsWith('ja')) return 'ja'
  if (String(navigatorLanguage || '').toLowerCase().startsWith('en')) return 'en'
  return 'zh'
}

export const siteCopy = {
  zh: {
    nav: { home: '首页', chat: '公开聊天', projects: '精选项目', resume: '简历摘要' },
    availability: 'Available for conversation',
    digitalTwin: 'digital twin',
    languageLabel: '语言',
    languageAria: '切换网页语言',
    greeting: '你好，我是 ZT.AI，是蔡宙廷的 AI 数字分身，我能替小蔡为你做什么吗？',
    home: {
      kicker: 'PERSONAL AI AGENT · 2026',
      reflection: ['让经历被理解，让能力被看见', '从真实业务中生长，用 AI 连接更多可能'],
      chat: '和 ZT.AI 聊聊',
      projects: '查看精选项目',
    },
    profile: {
      status: '公开访问',
      role: 'AI 产品开发 · Amazon 精铺业务',
      target: '目标方向：AI 产品经理 / FDE / 电商 FDE',
      tags: ['AI 工作流', '飞书多维表格', 'GitHub', 'Python'],
      eyebrow: 'ABOUT',
      about: '能把业务目标拆成流程、工具和可验收结果，在选品、开品、内容生产和利润跟踪之间搭建可复用的 AI 工作流。',
      signature: 'ZT.AI 是蔡宙廷的 AI 数字分身',
    },
    chat: {
      eyebrow: 'OPEN CHAT',
      title: '和 ZT.AI 聊聊',
      history: '聊天记录',
      newChat: '新建聊天',
      resume: '简历文件',
      free: '无需登录 · 免费',
      visitor: '访客',
      emptyEyebrow: 'NEW PRIVATE SESSION',
      emptyTitle: '你好，我是 ZT.AI',
      emptyBody: '我是蔡宙廷的 AI 数字分身。你可以问我项目经历、AI 产品开发或 FDE 方向。',
      emptyAction: '从一个问题开始',
      placeholder: '向 ZT.AI 提问，或先上传文件/图片',
      generating: 'ZT.AI 正在生成回答…',
      upload: '上传文件或图片',
      publicNote: '公开对话 · 内容来自 ZT.AI',
      model: 'MODEL',
      send: '发送',
      sendFallback: '请查看我上传的附件。',
      gatewayError: '暂时无法连接 ZT.AI 网关，请稍后再试。',
      responseError: '这次对话没有完成，请稍后重试。',
      mediaPreparing: '正在准备创作，请稍候…',
      mediaCompleted: '创作结果已完成：',
      historyEyebrow: 'PRIVATE SESSIONS',
      historyTitle: '聊天记录',
      historySection: '当前访客的聊天',
      privacyTitle: '记录仅属于当前访客',
      privacyBody: '为产品运维与成本估算，系统会记录访客 ID、脱敏网络信息、模型用量和对话内容；不会向其他访问者展示。',
      sessionCount: '条消息',
      startPrompt: '请介绍一下蔡宙廷目前的 AI 产品开发经历',
    },
    projects: {
      eyebrow: 'SELECTED WORK', title: '精选项目', count: '03 / 03', view: '查看项目',
      githubEyebrow: 'OPEN SOURCE EVIDENCE', githubTitle: 'GitHub 精选仓库',
      githubBody: '精选公开项目与可验证的开发记录，欢迎在对话中了解我的技术实践。',
      cards: [
        ['AI 选品与开品工作流', 'AI 产品开发', '结合飞书多维表格与多个选品逻辑，搭建从筛选、评估到开品的完整流程。月均精铺 8 个以上，开品速度约为其他同事的 2 倍。', '8+ / 月'],
        ['半小时套图生产方案', 'AI × 内容生产', '结合 LinkFox 等工具研究快速做图流程，半小时完成一套精美图片，为团队释放 3 个设计师的产能。', '30 min / 套'],
        ['跨境电商利润闭环', '业务系统化', '围绕 Amazon 精铺业务，把选品、开品与利润跟踪串成可复用的执行链路，月度净利润毛利保持 2 万元以上。', '¥2W+ / 月'],
      ],
    },
    resume: {
      eyebrow: 'PROFILE DATA', title: '简历摘要', download: '下载完整简历',
      roleEyebrow: 'AI PRODUCT DEVELOPMENT', identity: 'AI 产品开发 · 蔡宙廷',
      basics: '23 岁 · 汉族 · 群众 · 数字经济（本科）', targetEyebrow: 'TARGET ROLE',
      targetTitle: 'AI 产品经理 / FDE / 电商 FDE',
      targetBody: '把真实业务问题拆成可落地的 AI 流程与工具，兼顾数据、效率和商业结果，并为整个团队赋能。',
      metrics: [['8+', '每月精铺品数', '持续推进精铺开品'], ['约 2 倍', '开品速度', '相较其他同事'], ['30 分钟', '一套图片产出', '快速做图方案'], ['≥ 2 万元', '月度利润贡献', '负责品持续不亏损']],
      workEyebrow: 'WORK EXPERIENCE', workTitle: '工作经历',
      work: [
        ['2026-04 至 2027-04', '深圳市坤信科技有限公司', 'AI 产品开发', '负责 AI 产品开发与 Amazon 精铺跨境电商流程落地；每月精铺 8 个品以上，负责品月度利润贡献 ≥ 2 万元且持续不亏损。', true],
        ['2025-09 至 2026-01', '冠仕医疗供应链有限公司', '采购', '负责找货、采购、发货、供应商议价；月均降本 1-2 万元，推动 21 家供应商进入 ERP 长期合作。', false],
        ['2023-07 至 09', '柔宇科技', '数据分析（实习生）', '负责电商销售数据采集监控，使用 Python 爬取清洗并建立销售数据库；使用 SPSS 分析销售趋势、预测季度销量。', false],
      ],
      kunxinEyebrow: 'KUNXIN CASE STUDY', kunxinTitle: '坤信科技｜AI 产品开发工作详述',
      details: [
        ['01', '选品与开品流程设计', [['业务问题', '针对选品判断分散、信息难追踪、开品环节依赖个人经验等问题，重新梳理从机会发现到产品落地的业务链路。'], ['流程搭建', '以飞书多维表格作为业务中台，设计需求收集、竞品分析、关键词验证、利润测算、供应链核验、决策记录、开品任务和结果追踪等字段与节点。'], ['逻辑沉淀', '将多套选品逻辑转化为统一的判断顺序和可复用的检查清单，让选品结论、关键证据、供应商信息与后续任务能够持续追踪。'], ['协同方式', '把选品、采购、图片、Listing 内容和利润跟踪串联起来，减少信息反复整理，支持团队按同一套标准推进精铺项目。']]],
        ['02', 'AI 做图提效方案', [['方案研究', '结合 LinkFox 等工具研究商品图快速生产方式，拆解素材整理、产品卖点提炼、提示词与画面要求、生成筛选、尺寸检查和交付归档等环节。'], ['流程标准化', '沉淀可复用的图片模板、素材清单和交付检查项，使不同产品能够按照统一标准快速完成套图，降低反复沟通成本。'], ['团队价值', '将原本依赖个人经验的做图工作拆成清晰的分工和交付节点，提升设计资源利用率，并为后续批量化内容生产提供基础。']]],
        ['03', 'AI 产品开发与业务落地', [['需求拆解', '能够把业务目标拆解为字段、流程、工具、交付物和验收标准，优先解决影响效率与利润的关键环节。'], ['工具落地', '熟悉飞书多维表格、SellerSprite、LinkFox 及 AI 辅助编程，能够把工具组合成可执行、可复盘的工作方案。'], ['结果意识', '关注流程上线后的实际使用效果，通过数据记录、任务追踪和结果回看持续优化，而不是只停留在工具试用层面。']]],
      ],
      projectEyebrow: 'PROJECT EXPERIENCE', projectTitle: '项目经历',
      projectList: [['2023-09 至 2024-02', '日本手机退差价项目', '负责与日本方苹果客服进行日语沟通，统筹每台手机的退差价操作、进度跟踪与结果核对；完成数百台业务，单台差价约 15,000 日元，累计带来近 200 万日元净利润。'], ['2025-03 至 07', '中日高差价商品转卖与销售', '亲赴日本并结合跨境物流开展中日高差价商品转卖与销售，参与货源判断、采购协调、跨境运输和销售推进。']],
      skillsEyebrow: 'SKILLS & CERTIFICATES', skillsTitle: '技能证书', skills: ['日语 N1', 'CET-4', 'Python', 'SQL / MySQL', 'SPSS', 'AI 辅助编程', '飞书多维表格', 'SellerSprite', 'LinkFox', '剪映 / PS / AE'], skillsBody: '具备日语口语、读写及商务沟通能力；可快速阅读英文产品与技术资料；熟悉数据分析与自动化。',
      educationEyebrow: 'EDUCATION', educationTitle: '教育背景', educationDate: '2022.09 — 2026.06', educationSchool: '广东白云学院', educationDegree: '数字经济（本科）', educationBody: '主修：Python 数据分析、MySQL、SPSS、Power BI、Tableau、国际市场营销',
      methodsEyebrow: 'WORKING METHOD', methodsTitle: '可迁移的工作方法', methods: [['流程产品化', '把一次性经验沉淀为字段、规则、模板和检查清单，形成团队可以直接使用的工作资产。'], ['效率工程化', '优先识别高频、重复、依赖人工判断的环节，再用 AI 和工具完成标准化、批量化与质量检查。'], ['结果可验收', '以流程是否真正被使用、交付质量是否稳定、业务协作是否顺畅作为验收标准，持续根据结果复盘优化。']],
      openTitle: '公开摘要已开放', openBody: '欢迎在公开对话中继续了解我的经历、项目和未来方向。',
    },
  },
  en: {
    nav: { home: 'Home', chat: 'Open chat', projects: 'Selected work', resume: 'Resume' },
    availability: 'Available for conversation', digitalTwin: 'digital twin', languageLabel: 'Language', languageAria: 'Switch website language',
    greeting: 'Hello, I am ZT.AI, Cai Zhouting’s AI digital twin. What can I do for you on his behalf?',
    home: { kicker: 'PERSONAL AI AGENT · 2026', reflection: ['Make experience understood. Make capability visible.', 'Built from real business, connected by AI.'], chat: 'Talk to ZT.AI', projects: 'View selected work' },
    profile: { status: 'PUBLIC ACCESS', role: 'AI Product Development · Amazon Precision E-commerce', target: 'Focus: AI Product Manager / FDE / E-commerce FDE', tags: ['AI workflows', 'Feishu Bitable', 'GitHub', 'Python'], eyebrow: 'ABOUT', about: 'I turn business goals into workflows, tools, and measurable outcomes, building reusable AI systems across product selection, launch, content production, and profit tracking.', signature: 'ZT.AI is Cai Zhouting’s AI digital twin' },
    chat: { eyebrow: 'OPEN CHAT', title: 'Talk to ZT.AI', history: 'Chat history', newChat: 'New chat', resume: 'Resume file', free: 'No sign-in · Free', visitor: 'Visitor', emptyEyebrow: 'NEW PRIVATE SESSION', emptyTitle: 'Hello, I am ZT.AI', emptyBody: 'I am Cai Zhouting’s AI digital twin. Ask about his projects, AI product development, or FDE direction.', emptyAction: 'Start with a question', placeholder: 'Ask ZT.AI, or upload a file/image first', generating: 'ZT.AI is generating…', upload: 'Upload a file or image', publicNote: 'Open conversation · Usage is recorded for operations', model: 'MODEL', send: 'Send', sendFallback: 'Please review the attachment I uploaded.', gatewayError: 'ZT.AI gateway is temporarily unavailable. Please try again.', responseError: 'This conversation did not complete. Please try again.', mediaPreparing: 'Preparing the creation, please wait…', mediaCompleted: 'Creation completed:', historyEyebrow: 'PRIVATE SESSIONS', historyTitle: 'Chat history', historySection: 'Chats for this visitor', privacyTitle: 'Private to this visitor', privacyBody: 'For operations and cost estimates, ZT.AI records a visitor ID, masked network information, model usage and conversation content; it is not shown to other visitors.', sessionCount: 'messages', startPrompt: 'Introduce Cai Zhouting’s current AI product development experience' },
    projects: { eyebrow: 'SELECTED WORK', title: 'Selected work', count: '03 / 03', view: 'View project', githubEyebrow: 'OPEN SOURCE EVIDENCE', githubTitle: 'GitHub repositories', githubBody: 'Selected public projects and verifiable development records.', cards: [['AI product selection & launch workflow', 'AI Product Development', 'Built an end-to-end workflow with Feishu Bitable and multiple selection logics. Launches 8+ precision products per month at roughly twice the speed of peers.', '8+ / mo'], ['30-minute creative production system', 'AI × Content Production', 'Researched a fast product-image workflow with LinkFox and related tools, producing a polished image set in about 30 minutes and freeing the capacity of 3 designers.', '30 min / set'], ['Cross-border e-commerce profit loop', 'Business Systems', 'Connected product selection, launch, and profit tracking into a reusable Amazon precision-e-commerce execution loop, contributing at least RMB 20K in monthly gross profit.', '¥20K+ / mo']] },
    resume: { eyebrow: 'PROFILE DATA', title: 'Resume', download: 'Download resume', roleEyebrow: 'AI PRODUCT DEVELOPMENT', identity: 'AI Product Development · Cai Zhouting', basics: '23 · Han Chinese · Bachelor of Digital Economics', targetEyebrow: 'TARGET ROLE', targetTitle: 'AI Product Manager / FDE / E-commerce FDE', targetBody: 'Turn real business problems into deployable AI workflows and tools while balancing data, efficiency, and commercial outcomes.', metrics: [['8+', 'Precision launches / month', 'Consistent launch execution'], ['≈2×', 'Launch speed', 'Compared with peers'], ['30 min', 'Image set delivery', 'Fast creative workflow'], ['≥ RMB 20K', 'Monthly profit contribution', 'Assigned products remain profitable']], workEyebrow: 'WORK EXPERIENCE', workTitle: 'Work experience', work: [['Apr 2026 – Apr 2027', 'Shenzhen Kunxin Technology Co., Ltd.', 'AI Product Development', 'Responsible for AI product development and Amazon precision e-commerce workflow delivery; launch 8+ products monthly, with assigned products contributing at least RMB 20K in monthly gross profit while remaining profitable.', true], ['Sep 2025 – Jan 2026', 'Guanshi Medical Supply Chain Co., Ltd.', 'Procurement', 'Handled sourcing, purchasing, shipping, and supplier negotiation; reduced monthly costs by RMB 10K–20K and moved 21 suppliers into long-term ERP cooperation.', false], ['Jul – Sep 2023', 'Royole Technology', 'Data Analysis Intern', 'Collected and monitored e-commerce sales data, used Python for scraping and cleaning, built a sales database, and used SPSS to analyze trends and forecast quarterly volume.', false]], kunxinEyebrow: 'KUNXIN CASE STUDY', kunxinTitle: 'Kunxin Technology | AI Product Development', details: [['01', 'Product selection & launch workflow design', [['Business challenge', 'Rebuilt the workflow from opportunity discovery to product launch to address fragmented decisions, hard-to-track information, and reliance on individual experience.'], ['Workflow build', 'Used Feishu Bitable as the business hub, designing fields and checkpoints for demand intake, competitor analysis, keyword validation, profit modeling, supply-chain verification, decision records, launch tasks, and result tracking.'], ['Logic systemization', 'Converted multiple selection heuristics into a consistent decision sequence and reusable checklist, enabling continuous tracking of conclusions, evidence, supplier information, and follow-up tasks.'], ['Collaboration model', 'Connected product selection, procurement, creative production, Listing content, and profit tracking to reduce repetitive information handling and support shared execution standards.']]], ['02', 'AI-enabled creative production efficiency', [['Solution research', 'Combined LinkFox and related tools to study rapid product-image production, breaking down asset preparation, value-proposition extraction, prompts, visual requirements, generation review, dimension checks, and delivery archiving.'], ['Process standardization', 'Created reusable image templates, asset checklists, and delivery QA items so different products could complete image sets against a consistent standard.'], ['Team value', 'Broke an experience-dependent design task into clear ownership and delivery checkpoints, improving design-resource utilization and laying the groundwork for scaled content production.']]], ['03', 'AI product development & business delivery', [['Requirement breakdown', 'Break business goals into fields, workflows, tools, deliverables, and acceptance criteria, prioritizing the constraints that affect efficiency and profit.'], ['Tool implementation', 'Use Feishu Bitable, SellerSprite, LinkFox, and AI-assisted coding to combine tools into executable, reviewable workflows.'], ['Outcome focus', 'Track adoption, delivery quality, collaboration, and results after launch, continuously improving instead of stopping at tool experimentation.']]]], projectEyebrow: 'PROJECT EXPERIENCE', projectTitle: 'Project experience', projectList: [['Sep 2023 – Feb 2024', 'Mobile phone price-adjustment recovery project', 'Handled Japanese communication with Apple customer support, coordinated each recovery case, tracked progress, and reconciled results; completed several hundred cases, at approx. JPY 15,000 per case and nearly JPY 2M cumulative net profit.'], ['Mar – Jul 2025', 'Cross-border resale between China and Japan', 'Traveled to Japan and worked with cross-border logistics on high-price-difference product resale, contributing to sourcing judgment, purchasing coordination, transportation, and sales execution.']], skillsEyebrow: 'SKILLS & CERTIFICATES', skillsTitle: 'Skills & certificates', skills: ['Japanese N1', 'CET-4', 'Python', 'SQL / MySQL', 'SPSS', 'AI-assisted coding', 'Feishu Bitable', 'SellerSprite', 'LinkFox', 'CapCut / PS / AE'], skillsBody: 'Business-level Japanese communication, reading, and writing; able to quickly read English product and technical materials; familiar with data analysis and automation.', educationEyebrow: 'EDUCATION', educationTitle: 'Education', educationDate: 'Sep 2022 — Jun 2026', educationSchool: 'Guangdong Baiyun University', educationDegree: 'Digital Economics · Bachelor’s', educationBody: 'Coursework: Python Data Analysis, MySQL, SPSS, Power BI, Tableau, International Marketing', methodsEyebrow: 'WORKING METHOD', methodsTitle: 'Transferable working methods', methods: [['Productize processes', 'Turn one-off experience into fields, rules, templates, and checklists that the team can use directly.'], ['Engineer efficiency', 'Identify high-frequency, repetitive, judgment-heavy steps, then use AI and tools for standardization, batching, and QA.'], ['Make outcomes testable', 'Use adoption, delivery quality, and collaboration as acceptance criteria, then iterate from observed results.']], openTitle: 'Public summary is open', openBody: 'Continue the conversation to learn about my experience, projects, and direction.' },
  },
  ja: {
    nav: { home: 'ホーム', chat: '公開チャット', projects: 'プロジェクト', resume: 'プロフィール' },
    availability: 'Available for conversation', digitalTwin: 'digital twin', languageLabel: '言語', languageAria: 'ウェブサイトの言語を切り替え',
    greeting: 'こんにちは、ZT.AIです。蔡宙廷のAIデジタルツインとして、何をお手伝いしましょうか？',
    home: { kicker: 'PERSONAL AI AGENT · 2026', reflection: ['経験を理解し、能力を可視化する。', 'リアルな業務から生まれ、AIで可能性をつなぐ。'], chat: 'ZT.AIと話す', projects: 'プロジェクトを見る' },
    profile: { status: '公開アクセス', role: 'AIプロダクト開発 · Amazon精密型越境EC', target: '志向：AIプロダクトマネージャー / FDE / EC FDE', tags: ['AIワークフロー', 'Feishu多次元表', 'GitHub', 'Python'], eyebrow: 'ABOUT', about: '業務目標をプロセス、ツール、検証可能な成果に分解し、商品選定、ローンチ、コンテンツ制作、利益追跡をつなぐ再利用可能なAIワークフローを構築します。', signature: 'ZT.AIは蔡宙廷のAIデジタルツインです' },
    chat: { eyebrow: 'OPEN CHAT', title: 'ZT.AIと話す', history: 'チャット履歴', newChat: '新しいチャット', resume: '履歴書ファイル', free: 'ログイン不要 · 無料', visitor: '訪問者', emptyEyebrow: 'NEW PRIVATE SESSION', emptyTitle: 'こんにちは、ZT.AIです', emptyBody: '蔡宙廷のAIデジタルツインです。プロジェクト、AIプロダクト開発、FDEについて質問できます。', emptyAction: '質問から始める', placeholder: 'ZT.AIに質問、またはファイル/画像をアップロード', generating: 'ZT.AIが回答を生成中…', upload: 'ファイルまたは画像をアップロード', publicNote: '公開対話 · 運用のため利用状況を記録', model: 'MODEL', send: '送信', sendFallback: 'アップロードした添付ファイルをご確認ください。', gatewayError: 'ZT.AIゲートウェイに接続できません。しばらくしてから再試行してください。', responseError: 'この対話は完了できませんでした。もう一度お試しください。', mediaPreparing: '生成を準備しています。少々お待ちください…', mediaCompleted: '生成結果が完成しました：', historyEyebrow: 'PRIVATE SESSIONS', historyTitle: 'チャット履歴', historySection: 'この訪問者のチャット', privacyTitle: 'この訪問者だけの記録', privacyBody: '運用とコスト見積もりのため、訪問者ID、マスクされたネットワーク情報、モデル利用量、対話内容を記録します。他の訪問者には表示しません。', sessionCount: '件のメッセージ', startPrompt: '蔡宙廷の現在のAIプロダクト開発経験を紹介してください' },
    projects: { eyebrow: 'SELECTED WORK', title: 'プロジェクト', count: '03 / 03', view: '詳細を見る', githubEyebrow: 'OPEN SOURCE EVIDENCE', githubTitle: 'GitHubリポジトリ', githubBody: '公開プロジェクトと検証可能な開発記録をご覧いただけます。', cards: [['AI商品選定・ローンチワークフロー', 'AIプロダクト開発', 'Feishu多次元表と複数の選定ロジックを組み合わせ、選定から評価、ローンチまでの一連の流れを構築。月8商品以上、同僚の約2倍の速度で推進。', '8+ / 月'], ['30分の画像制作フロー', 'AI × コンテンツ制作', 'LinkFoxなどを活用した高速画像制作フローを研究し、約30分で高品質な画像セットを作成。デザイナー3名分の作業負荷を最適化。', '30 min / セット'], ['越境ECの利益管理ループ', '業務システム化', 'Amazon精密型越境ECにおける商品選定、ローンチ、利益追跡を再利用可能な実行ループに統合し、月間2万元以上の粗利に貢献。', '¥2W+ / 月']] },
    resume: { eyebrow: 'PROFILE DATA', title: 'プロフィール', download: '履歴書をダウンロード', roleEyebrow: 'AI PRODUCT DEVELOPMENT', identity: 'AIプロダクト開発 · 蔡宙廷', basics: '23歳 · 漢民族 · デジタル経済学 学士', targetEyebrow: 'TARGET ROLE', targetTitle: 'AIプロダクトマネージャー / FDE / EC FDE', targetBody: 'リアルな業務課題を実行可能なAIワークフローとツールに変換し、データ、効率、ビジネス成果を両立します。', metrics: [['8+', '月間ローンチ数', '継続的な商品開発'], ['約2倍', 'ローンチ速度', '同僚との比較'], ['30分', '画像セット制作', '高速クリエイティブフロー'], ['2万元以上', '月間粗利貢献', '担当商品は継続的に黒字']], workEyebrow: 'WORK EXPERIENCE', workTitle: '職務経歴', work: [['2026年4月〜2027年4月', '深圳市坤信科技有限公司', 'AIプロダクト開発', 'AIプロダクト開発とAmazon精密型越境ECの業務フロー実装を担当。月8商品以上をローンチし、担当商品の月間粗利は2万元以上、継続的に赤字を回避。', true], ['2025年9月〜2026年1月', '冠仕医療サプライチェーン有限公司', '購買', '仕入先開拓、購買、出荷、価格交渉を担当。月1〜2万元のコスト削減を実現し、21社をERPの長期取引先へ移行。', false], ['2023年7月〜9月', 'Royole Technology', 'データ分析インターン', 'EC販売データの収集・監視、Pythonによるスクレイピングとデータクリーニング、販売データベース構築、SPSSによるトレンド分析と四半期販売量予測を担当。', false]], kunxinEyebrow: 'KUNXIN CASE STUDY', kunxinTitle: '坤信科技｜AIプロダクト開発の詳細', details: [['01', '商品選定・ローンチプロセス設計', [['業務課題', '商品選定の判断が分散し、情報を追跡しにくく、新商品ローンチが個人の経験に依存していた課題に対し、機会発見から商品ローンチまでの業務フローを再構築。'], ['プロセス構築', 'Feishu多次元表を業務ハブとして、ニーズ収集、競合分析、キーワード検証、利益試算、サプライチェーン確認、意思決定記録、ローンチタスク、結果追跡のフィールドとチェックポイントを設計。'], ['ロジックの体系化', '複数の選定ロジックを一貫した判断順序と再利用可能なチェックリストに変換し、結論、根拠、仕入先情報、後続タスクを継続的に追跡可能にした。'], ['協業方法', '商品選定、購買、画像、Listingコンテンツ、利益追跡をつなぎ、情報整理の重複を減らし、共通基準で精密型ECプロジェクトを推進。']]], ['02', 'AI画像制作の効率化', [['ソリューション調査', 'LinkFoxなどのツールを組み合わせ、素材整理、訴求ポイント抽出、プロンプトと画面要件、生成物の選定、サイズ確認、納品アーカイブまで高速画像制作の方法を研究。'], ['プロセス標準化', '再利用可能な画像テンプレート、素材リスト、納品チェック項目を整備し、商品ごとの画像セットを共通基準で制作可能にした。'], ['チームへの価値', '経験に依存していた画像制作を明確な分担と納品工程に分解し、デザインリソースの活用効率を高め、コンテンツ量産の基盤を整備。']]], ['03', 'AIプロダクト開発と業務実装', [['要件分解', '業務目標をフィールド、プロセス、ツール、成果物、受入基準に分解し、効率と利益に影響する重要課題を優先。'], ['ツール実装', 'Feishu多次元表、SellerSprite、LinkFox、AI支援コーディングに精通し、ツールを実行可能で振り返り可能な業務設計に統合。'], ['成果志向', '導入後の利用状況、納品品質、協業、成果を記録し、ツールの試用で終わらせず継続的に改善。']]]], projectEyebrow: 'PROJECT EXPERIENCE', projectTitle: 'プロジェクト経験', projectList: [['2023年9月〜2024年2月', '日本携帯電話の価格差返金プロジェクト', '日本側のAppleカスタマーサポートと日本語で連携し、各端末の価格差返金、進捗、結果確認を統括。数百件を完了し、1件あたり約15,000円、累計約200万円の純利益を創出。'], ['2025年3月〜7月', '日中価格差商品の転売・販売', '日本へ赴き、越境物流と連携して日中の価格差商品を転売・販売。仕入れ判断、購買調整、越境輸送、販売推進に携わった。']], skillsEyebrow: 'SKILLS & CERTIFICATES', skillsTitle: 'スキル・資格', skills: ['日本語 N1', 'CET-4', 'Python', 'SQL / MySQL', 'SPSS', 'AI支援コーディング', 'Feishu多次元表', 'SellerSprite', 'LinkFox', 'CapCut / PS / AE'], skillsBody: '日本語の会話、読解、ビジネスコミュニケーションに対応。英語のプロダクト・技術資料を速やかに読み、データ分析と自動化に精通。', educationEyebrow: 'EDUCATION', educationTitle: '学歴', educationDate: '2022年9月〜2026年6月', educationSchool: '広東白雲学院', educationDegree: 'デジタル経済学（学士）', educationBody: '主な学習内容：Pythonデータ分析、MySQL、SPSS、Power BI、Tableau、国際マーケティング', methodsEyebrow: 'WORKING METHOD', methodsTitle: '応用可能な仕事の進め方', methods: [['プロセスのプロダクト化', '一度きりの経験をフィールド、ルール、テンプレート、チェックリストに落とし込み、チームで使える資産にする。'], ['効率のエンジニアリング', '頻度が高く、反復的で、人の判断に依存する工程を特定し、AIとツールで標準化、量産化、品質確認を行う。'], ['成果の検証', '実際の利用状況、納品品質、協業の円滑さを受入基準とし、結果を振り返って継続的に改善する。']], openTitle: '公開プロフィールを閲覧できます', openBody: '対話を通じて、経験、プロジェクト、今後の方向性をさらにご確認ください。' },
  },
}

export const resumeDocumentByLanguage = {
  zh: { path: '中文简历.docx', name: '蔡宙廷_FDE个人简历.docx' },
  en: { path: 'English 简历.docx', name: 'Cai_Zhouting_FDE_Resume_EN.docx' },
  ja: { path: '日本語简历.docx', name: '蔡宙廷_FDE職務経歴書_日本語.docx' },
}
