const PUBLIC_CHAT_URL = 'https://niuzipai-gif.github.io/zt-ai-web/'
export const CASE_STUDIES_GITHUB_URL = 'https://github.com/niuzipai-gif/zt-ai-project-case-studies'
export const LINKFOX_GITHUB_URL = 'https://github.com/niuzipai-gif/amazon-linkfox-image-sop'

function projectEvidence(language, repository) {
  const labels = {
    zh: ['公开网页：可继续追问这个案例', 'GitHub：查看对应项目流程与公开记录'],
    en: ['Public site: ask follow-up questions about this case', 'GitHub: inspect the matching project workflow'],
    ja: ['公開サイト：この事例について追加質問できます', 'GitHub：対応するプロジェクトの流れを確認できます'],
  }
  const [siteLabel, repositoryLabel] = labels[language] || labels.zh
  return [
    { label: siteLabel, url: PUBLIC_CHAT_URL },
    { label: repositoryLabel, url: repository },
  ]
}

const flowDemo = {
  zh: {
    selectionWorkflow: {
      steps: [
        { id: 'input', label: '输入', description: '锁定产品形态、市场和使用场景。' },
        { id: 'decision', label: '判断', description: '把热度、竞品、利润和供应证据放在同一条判断链上。' },
        { id: 'execution', label: '执行', description: '拆出采购、图片、Listing 和交付任务。' },
        { id: 'qa', label: '校验', description: '核对字段、证据完整度、责任人和状态流转。' },
        { id: 'result', label: '结果', description: '回写销量、成本、利润和下一轮规则。' },
      ],
    },
    imageProduction: {
      steps: [
        { id: 'input', label: '输入', description: '整理素材、尺寸、市场语言和页面目标。' },
        { id: 'decision', label: '判断', description: '把功能、场景和差异化映射成图片任务。' },
        { id: 'execution', label: '执行', description: '用统一提示词和版式批量生成候选。' },
        { id: 'qa', label: '校验', description: '检查事实、主体、文字、比例和交付命名。' },
        { id: 'result', label: '结果', description: '形成可交给 Listing 的完整图片套图。' },
      ],
    },
    profitLoop: {
      steps: [
        { id: 'input', label: '输入', description: '收集成本、售价、物流、费用和库存假设。' },
        { id: 'decision', label: '判断', description: '先算利润底线，再决定是否继续开品。' },
        { id: 'execution', label: '执行', description: '联动采购、Listing、库存和销售跟踪。' },
        { id: 'qa', label: '校验', description: '区分估算与实际，核对产品和变体口径。' },
        { id: 'result', label: '结果', description: '用真实利润决定调价、补货、优化或停止。' },
      ],
    },
  },
  en: {
    selectionWorkflow: {
      steps: [
        { id: 'input', label: 'Input', description: 'Define the product form, market, and use case.' },
        { id: 'decision', label: 'Decision', description: 'Put heat, competitors, margin, and supply evidence into one chain.' },
        { id: 'execution', label: 'Execution', description: 'Split sourcing, creative, Listing, and delivery tasks.' },
        { id: 'qa', label: 'QA', description: 'Check fields, evidence completeness, owners, and state changes.' },
        { id: 'result', label: 'Result', description: 'Write sales, cost, profit, and the next rule back.' },
      ],
    },
    imageProduction: {
      steps: [
        { id: 'input', label: 'Input', description: 'Collect materials, dimensions, market language, and page goal.' },
        { id: 'decision', label: 'Decision', description: 'Map function, scenario, and differentiation to image tasks.' },
        { id: 'execution', label: 'Execution', description: 'Generate candidates with reusable prompts and layouts.' },
        { id: 'qa', label: 'QA', description: 'Check facts, subject clarity, copy, ratio, and naming.' },
        { id: 'result', label: 'Result', description: 'Deliver a complete image set ready for Listing.' },
      ],
    },
    profitLoop: {
      steps: [
        { id: 'input', label: 'Input', description: 'Collect cost, price, logistics, fees, and inventory assumptions.' },
        { id: 'decision', label: 'Decision', description: 'Calculate the margin floor before continuing the launch.' },
        { id: 'execution', label: 'Execution', description: 'Connect sourcing, Listing, inventory, and sales tracking.' },
        { id: 'qa', label: 'QA', description: 'Separate estimates from actuals across products and variants.' },
        { id: 'result', label: 'Result', description: 'Use real profit to reprice, replenish, improve, or stop.' },
      ],
    },
  },
  ja: {
    selectionWorkflow: {
      steps: [
        { id: 'input', label: '入力', description: '商品形態、市場、利用シーンを決めます。' },
        { id: 'decision', label: '判断', description: '熱量、競合、利益、供給の根拠を一つの流れにまとめます。' },
        { id: 'execution', label: '実行', description: '仕入れ、画像、Listing、納品タスクに分解します。' },
        { id: 'qa', label: '確認', description: '項目、根拠、担当者、状態の流れを確認します。' },
        { id: 'result', label: '結果', description: '売上、コスト、利益、次のルールを記録します。' },
      ],
    },
    imageProduction: {
      steps: [
        { id: 'input', label: '入力', description: '素材、サイズ、市場言語、ページ目的を整理します。' },
        { id: 'decision', label: '判断', description: '機能、シーン、差別化を画像タスクに割り当てます。' },
        { id: 'execution', label: '実行', description: '再利用できるプロンプトとレイアウトで生成します。' },
        { id: 'qa', label: '確認', description: '事実、主体、コピー、比率、ファイル名を確認します。' },
        { id: 'result', label: '結果', description: 'Listingへ渡せる画像セットを完成させます。' },
      ],
    },
    profitLoop: {
      steps: [
        { id: 'input', label: '入力', description: 'コスト、価格、物流、手数料、在庫の前提を集めます。' },
        { id: 'decision', label: '判断', description: '利益下限を計算してからローンチを続けるか決めます。' },
        { id: 'execution', label: '実行', description: '仕入れ、Listing、在庫、販売追跡をつなぎます。' },
        { id: 'qa', label: '確認', description: '商品とバリエーションの予測値・実績値を分けます。' },
        { id: 'result', label: '結果', description: '実利益で価格、補充、改善、停止を判断します。' },
      ],
    },
  },
}

export const PROJECT_DETAIL_IDS = ['selection-workflow', 'image-production', 'profit-loop']

export const PROJECT_DETAILS = {
  zh: {
    ui: {
      back: '返回精选项目',
      caseEyebrow: 'CASE STUDY',
      problem: '要解决的问题',
      contribution: '我具体做了什么',
      workflow: '实际执行链路',
      stack: '工具与能力',
      results: '结果与验收边界',
      evidence: '可验证入口',
      demo: '建议现场演示问题',
      open: '打开',
      flowEyebrow: 'IMPLEMENTATION DEMO',
      flowTitle: '看我怎样把事情做成',
      flowNote: '这是流程示意，不是实时业务数据。可以点击步骤或重新播放。',
      flowPlay: '播放演示',
      flowReplay: '重新播放',
    },
    items: [
      {
        id: 'selection-workflow',
        repository: CASE_STUDIES_GITHUB_URL,
        flowDemo: flowDemo.zh.selectionWorkflow,
        title: 'AI 选品与开品工作流',
        summary: '把分散的选品判断、证据核验和开品任务，收敛成一条可以复用、追踪和复盘的业务链路。',
        metric: '8+ / 月',
        problem: '选品信息分散在不同工具和聊天记录里，判断容易依赖个人经验；即使选出了产品，后续的供应链、Listing、图片和利润结果也不容易回溯。',
        contribution: [
          '用飞书多维表格设计需求、竞品、关键词、成本、供应链、决策、任务和结果字段，把判断依据留在同一条记录里。',
          '把多套选品逻辑整理成统一的判断顺序，明确哪些是发现信号，哪些才算可以立项的证据。',
          '把选品、采购、图片、Listing 和利润跟踪连接起来，让产品从“被选中”继续走到“完成开品”。',
          '为每个关键节点设置复盘入口，能看到为什么立项、哪里卡住，以及上线后结果是否达到预期。',
        ],
        workflow: [
          '机会发现：锁定产品形态、目标市场和使用场景。',
          '证据筛选：核验竞品、关键词、需求、价格和差异化，不把单一热度直接当结论。',
          '利润与供应链核验：测算成本、物流、合规和可供货性，先过底线再进入开品。',
          '开品执行：拆分图片、Listing、采购和交付任务，并记录负责人和状态。',
          '结果复盘：回看销量、成本、利润和协作问题，更新下一轮判断规则。',
        ],
        stack: ['飞书多维表格', 'SellerSprite / 市场数据', 'Python、SQL 与数据分析', 'AI 辅助编程与流程设计'],
        results: ['月均精铺 8 个以上。', '开品速度约为其他同事的 2 倍。', '验收重点是证据是否完整、任务是否真正流转、结果能否回写，而不是只做出一张漂亮的表。'],
        evidence: projectEvidence('zh', CASE_STUDIES_GITHUB_URL),
        demoPrompt: '如果一个新品只有关键词热度、但利润和供应链证据不完整，你会如何判断它能不能立项？',
      },
      {
        id: 'image-production',
        repository: LINKFOX_GITHUB_URL,
        flowDemo: flowDemo.zh.imageProduction,
        title: '半小时套图生产方案',
        summary: '将素材整理、卖点提炼、生成、筛选、尺寸检查和交付归档拆成标准步骤，形成可以快速复制的商品图工作流。',
        metric: '30 min / 套',
        problem: '做图经常卡在素材不全、卖点不清、画面要求反复修改和尺寸交付遗漏上；单纯增加工具并不能稳定提高交付速度。',
        contribution: [
          '先整理商品素材和目标页面，再把核心卖点转成画面任务，而不是直接开始生成图片。',
          '研究 LinkFox 等工具的组合方式，明确提示词、构图、文案、尺寸和风格的输入标准。',
          '建立首图、卖点图、场景图和细节图的检查清单，按信息层级筛选结果。',
          '把合格图片、尺寸校验、命名和归档纳入交付步骤，减少生成完成后返工。',
        ],
        workflow: [
          '输入检查：确认商品素材、尺寸、市场语言和页面目标。',
          '卖点拆解：把功能、场景和差异化分别映射到图片任务。',
          '批量生成：按统一提示词和版式快速产出多个候选。',
          '人工筛选：检查事实准确、主体清晰、文字可读和品牌一致性。',
          '交付归档：完成像素、比例、文件名和版本记录后再交给 Listing。',
        ],
        stack: ['LinkFox 等做图工具', 'AI 生成与提示词设计', 'Photoshop / 剪映 / AE', '尺寸、文案和交付质量检查'],
        results: ['单套图片目标约 30 分钟完成。', '释放约 3 个设计师的重复性产能。', '验收重点是信息表达和交付可用性，不以“看起来漂亮”替代事实和尺寸检查。'],
        evidence: projectEvidence('zh', LINKFOX_GITHUB_URL),
        demoPrompt: '给一个陌生商品做一套主图和卖点图时，你会怎样在半小时内确定图片结构和验收标准？',
      },
      {
        id: 'profit-loop',
        repository: CASE_STUDIES_GITHUB_URL,
        flowDemo: flowDemo.zh.profitLoop,
        title: '跨境电商利润闭环',
        summary: '围绕 Amazon 精铺业务，把选品、开品、成本、销售和利润追踪串成可执行、可复盘的经营闭环。',
        metric: '≥ ¥2W / 月',
        problem: '只看销售额或单次毛利，容易忽略采购、物流、平台费用、库存和长期仓储；产品表面在卖，实际可能并不赚钱。',
        contribution: [
          '把选品阶段的成本、售价、物流、费用和库存假设带入开品决策，而不是上线后才看利润。',
          '将产品、变体、供应商、Listing、库存和结果建立可追踪关系，减少口径不一致。',
          '用持续回写的方式跟踪实际销售、费用和利润，识别需要调价、补货、优化内容或停止投入的节点。',
          '把利润结果和下一轮选品、供应商与内容决策连接起来，让数据真正改变动作。',
        ],
        workflow: [
          '立项测算：先算清产品成本、物流、平台费用、售价和利润底线。',
          '开品交付：完成采购、图片、Listing 和库存准备，保留版本和责任人。',
          '销售跟踪：记录订单、费用、库存和异常，区分估算值与实际值。',
          '利润判断：按产品和变体回看真实利润，识别风险而不是只看销量。',
          '经营动作：决定调价、补货、改图改文案、优化供应商或停止投入，并把原因写回。',
        ],
        stack: ['Amazon 精铺业务', '飞书多维表格与结果追踪', '采购、物流和供应商协作', '成本测算、利润分析与复盘'],
        results: ['负责品月度利润贡献达到或超过 2 万元。', '用同一套口径连接选品、开品和利润判断。', '验收重点是利润口径、数据时点和动作依据清楚，避免用未经核实的数字包装结果。'],
        evidence: projectEvidence('zh', CASE_STUDIES_GITHUB_URL),
        demoPrompt: '一个产品销量增长但利润下降时，你会先检查哪些成本和流程节点，再决定要不要继续投入？',
      },
    ],
  },
  en: {
    ui: {
      back: 'Back to selected work',
      caseEyebrow: 'CASE STUDY',
      problem: 'Problem to solve',
      contribution: 'What I did',
      workflow: 'Execution flow',
      stack: 'Tools and capabilities',
      results: 'Results and acceptance boundaries',
      evidence: 'Verifiable entry points',
      demo: 'A good live-demo question',
      open: 'Open',
      flowEyebrow: 'IMPLEMENTATION DEMO',
      flowTitle: 'How the work moves from input to result',
      flowNote: 'A process illustration, not live business data. Select a step or replay it.',
      flowPlay: 'Play demo',
      flowReplay: 'Replay',
    },
    items: [
      {
        id: 'selection-workflow',
        repository: CASE_STUDIES_GITHUB_URL,
        flowDemo: flowDemo.en.selectionWorkflow,
        title: 'AI Product Selection & Launch Workflow',
        summary: 'Turn scattered product judgments, evidence checks, and launch tasks into a reusable, traceable, reviewable operating flow.',
        metric: '8+ / mo',
        problem: 'Selection evidence was spread across tools and conversations, so decisions depended too much on individual experience. Even after a product was selected, supply chain, Listing, creative, and profit outcomes were hard to trace.',
        contribution: ['Designed Feishu Bitable fields for demand, competitors, keywords, costs, suppliers, decisions, tasks, and outcomes.', 'Converted several selection heuristics into one decision sequence, separating discovery signals from launch evidence.', 'Connected selection, sourcing, images, Listing work, and profit tracking so a selected product could move through launch.', 'Added review points to explain why a product was approved, where it stalled, and whether the result met expectations.'],
        workflow: ['Opportunity discovery: define the product form, target market, and use case.', 'Evidence screening: verify competitors, keywords, demand, price, and differentiation instead of treating one heat signal as a conclusion.', 'Profit and supply check: test cost, logistics, compliance, and supplyability before launch.', 'Launch execution: split creative, Listing, sourcing, and delivery tasks with owners and states.', 'Review: write sales, cost, profit, and collaboration learnings back into the next decision cycle.'],
        stack: ['Feishu Bitable', 'SellerSprite and market data', 'Python, SQL, and data analysis', 'AI-assisted coding and workflow design'],
        results: ['More than 8 precision launches per month.', 'Roughly 2× the launch speed of peers.', 'Acceptance is based on complete evidence, real task flow, and written-back outcomes—not a polished table alone.'],
        evidence: projectEvidence('en', CASE_STUDIES_GITHUB_URL),
        demoPrompt: 'If a new product has keyword heat but incomplete margin and supply evidence, how would you decide whether it is ready to launch?',
      },
      {
        id: 'image-production',
        repository: LINKFOX_GITHUB_URL,
        flowDemo: flowDemo.en.imageProduction,
        title: 'Half-hour Product Image Workflow',
        summary: 'Break material preparation, benefit extraction, generation, selection, size checks, and delivery into a repeatable image-production system.',
        metric: '30 min / set',
        problem: 'Image work often stalls because materials are incomplete, benefits are unclear, visual requirements keep changing, or delivery dimensions are missed. Adding tools alone does not create stable speed.',
        contribution: ['Checked product material and page goals before generation instead of starting with prompts immediately.', 'Studied combinations of LinkFox and related tools and defined inputs for prompts, layout, copy, size, and style.', 'Created checklists for hero, benefit, scenario, and detail images, then selected results by information hierarchy.', 'Included pixel checks, naming, and archiving in delivery so generation completion did not equal handoff completion.'],
        workflow: ['Input check: confirm product materials, dimensions, market language, and page goal.', 'Benefit breakdown: map function, scenario, and differentiation to image tasks.', 'Batch generation: produce candidates with reusable prompts and layouts.', 'Human QA: check factual accuracy, clarity, readable copy, and brand consistency.', 'Handoff: verify pixels, ratio, filenames, and version history before Listing delivery.'],
        stack: ['LinkFox and related creative tools', 'AI generation and prompt design', 'Photoshop, CapCut, and AE', 'Copy, dimension, and delivery QA'],
        results: ['Target roughly 30 minutes per product image set.', 'Released the equivalent of about three designers of repetitive capacity.', 'Acceptance prioritizes information clarity and delivery usability; visual polish never replaces factual and dimension checks.'],
        evidence: projectEvidence('en', LINKFOX_GITHUB_URL),
        demoPrompt: 'When creating a new product image set in thirty minutes, how do you decide the image structure and acceptance checklist?',
      },
      {
        id: 'profit-loop',
        repository: CASE_STUDIES_GITHUB_URL,
        flowDemo: flowDemo.en.profitLoop,
        title: 'Cross-border E-commerce Profit Loop',
        summary: 'Connect selection, launch, costs, sales, inventory, and profit tracking into an executable operating loop for Amazon precision e-commerce.',
        metric: '≥ ¥20K / mo',
        problem: 'Looking only at sales or one-time gross margin can hide sourcing, logistics, platform fees, inventory, and long-term storage. A product can sell while still losing money.',
        contribution: ['Carried cost, price, logistics, fees, and inventory assumptions into launch decisions instead of waiting until after launch to check profit.', 'Linked products, variants, suppliers, Listings, inventory, and outcomes with consistent definitions.', 'Tracked actual sales, fees, and profit through written-back results to identify repricing, replenishment, content, or stop decisions.', 'Connected profit outcomes to the next selection, supplier, and creative decision so data changed the next action.'],
        workflow: ['Launch model: calculate product cost, logistics, platform fees, price, and margin floor.', 'Delivery: complete sourcing, images, Listing, and inventory preparation with owners and versions.', 'Sales tracking: record orders, fees, inventory, and anomalies while separating estimates from actuals.', 'Profit review: inspect real profit by product and variant instead of relying on sales volume.', 'Operating action: reprice, replenish, revise content, optimize supply, or stop investment—and record why.'],
        stack: ['Amazon precision e-commerce', 'Feishu Bitable and outcome tracking', 'Sourcing, logistics, and supplier coordination', 'Cost modeling, profit analysis, and review'],
        results: ['Monthly profit contribution for responsible products reached at least ¥20K.', 'Selection, launch, and profit decisions use a consistent operating definition.', 'Acceptance requires clear profit definitions, data timing, and action rationale; unsupported figures are not presented as proof.'],
        evidence: projectEvidence('en', CASE_STUDIES_GITHUB_URL),
        demoPrompt: 'If sales rise while profit falls, which cost and process nodes would you inspect before deciding whether to keep investing?',
      },
    ],
  },
  ja: {
    ui: {
      back: 'プロジェクト一覧に戻る',
      caseEyebrow: 'CASE STUDY',
      problem: '解決する課題',
      contribution: '担当したこと',
      workflow: '実行フロー',
      stack: 'ツールとスキル',
      results: '成果と受入基準',
      evidence: '確認できる入口',
      demo: 'デモで聞ける質問',
      open: '開く',
      flowEyebrow: 'IMPLEMENTATION DEMO',
      flowTitle: '入力を結果につなげる進め方',
      flowNote: '実際の業務データではなく、進め方のイメージです。手順を選択または再生できます。',
      flowPlay: 'デモを再生',
      flowReplay: 'もう一度再生',
    },
    items: [
      {
        id: 'selection-workflow',
        repository: CASE_STUDIES_GITHUB_URL,
        flowDemo: flowDemo.ja.selectionWorkflow,
        title: 'AI商品選定・ローンチワークフロー',
        summary: '分散していた商品選定の判断、根拠確認、ローンチ作業を、再利用・追跡・振り返りができる業務フローにまとめました。',
        metric: '8+ / 月',
        problem: '選定情報がツールや会話に分散し、個人の経験に判断が依存していました。商品を選んだ後のサプライチェーン、Listing、画像、利益の結果も追跡しにくい状態でした。',
        contribution: ['Feishu多次元表に需要、競合、キーワード、コスト、仕入先、判断、タスク、結果のフィールドを設計しました。', '複数の選定ロジックを一つの判断順序に整理し、発見シグナルとローンチ根拠を分けました。', '商品選定、仕入れ、画像、Listing、利益追跡をつなぎ、選定後もローンチまで進められるようにしました。', 'なぜ採用したか、どこで止まったか、結果が目標を満たしたかを振り返れる記録点を設けました。'],
        workflow: ['機会発見：商品形態、対象市場、利用シーンを決めます。', '根拠確認：競合、キーワード、需要、価格、差別化を確認し、一つの熱量だけで結論を出しません。', '利益と供給確認：コスト、物流、法令、供給可能性を確認してからローンチへ進みます。', '実行：画像、Listing、仕入れ、納品タスクを担当者と状態つきで分解します。', '振り返り：売上、コスト、利益、協業上の課題を次の判断ルールに反映します。'],
        stack: ['Feishu多次元表', 'SellerSprite・市場データ', 'Python、SQL、データ分析', 'AI支援コーディング・業務設計'],
        results: ['月8商品以上の精密型ローンチを継続しました。', '同僚と比べてローンチ速度は約2倍でした。', '表を作るだけではなく、根拠、タスクの流れ、結果の記録までを受入基準にしました。'],
        evidence: projectEvidence('ja', CASE_STUDIES_GITHUB_URL),
        demoPrompt: 'キーワードの熱量はあるものの利益と供給の根拠が不足している商品を、ローンチ可能かどう判断しますか？',
      },
      {
        id: 'image-production',
        repository: LINKFOX_GITHUB_URL,
        flowDemo: flowDemo.ja.imageProduction,
        title: '30分で作る商品画像ワークフロー',
        summary: '素材整理、訴求点の抽出、生成、選定、サイズ確認、納品を標準手順に分け、再利用できる画像制作フローにしました。',
        metric: '30 min / セット',
        problem: '素材不足、訴求点の不明確さ、画面要件の修正、納品サイズの漏れで制作が止まりやすく、ツールを増やすだけでは速度が安定しませんでした。',
        contribution: ['生成前に商品素材とページ目的を整理し、いきなりプロンプトを書く状態をなくしました。', 'LinkFoxなどの組み合わせを研究し、プロンプト、構図、コピー、サイズ、スタイルの入力基準を決めました。', 'メイン画像、訴求画像、シーン画像、詳細画像のチェックリストを作り、情報の優先順位で選定しました。', 'ピクセル、ファイル名、バージョン、アーカイブまでを納品工程に含め、生成後の手戻りを減らしました。'],
        workflow: ['入力確認：素材、サイズ、市場言語、ページ目的を確認します。', '訴求分解：機能、利用シーン、差別化を画像タスクに割り当てます。', '一括生成：再利用できるプロンプトとレイアウトで候補を作ります。', '品質確認：事実の正確さ、見やすさ、文字の可読性、ブランドの一貫性を確認します。', '納品：ピクセル、比率、ファイル名、バージョンを確認してListingへ渡します。'],
        stack: ['LinkFoxなどの画像制作ツール', 'AI生成・プロンプト設計', 'Photoshop・CapCut・AE', 'コピー、サイズ、納品品質の確認'],
        results: ['商品1セットを約30分で完成させることを目標にしました。', 'デザイナー約3名分の反復作業を効率化しました。', '見た目だけではなく、情報の正確さと納品の使いやすさを受入基準にしました。'],
        evidence: projectEvidence('ja', LINKFOX_GITHUB_URL),
        demoPrompt: '新しい商品画像を30分で作る場合、画像構成と受入チェック項目をどのように決めますか？',
      },
      {
        id: 'profit-loop',
        repository: CASE_STUDIES_GITHUB_URL,
        flowDemo: flowDemo.ja.profitLoop,
        title: '越境ECの利益管理ループ',
        summary: 'Amazon精密型越境ECで、商品選定、ローンチ、コスト、販売、在庫、利益を一つの実行ループにつなぎました。',
        metric: '≥ ¥2W / 月',
        problem: '売上や一度だけの粗利だけを見ると、仕入れ、物流、手数料、在庫、長期保管の影響を見落とします。売れていても利益が残らない場合があります。',
        contribution: ['商品コスト、価格、物流、手数料、在庫の前提をローンチ判断に持ち込み、販売後だけでなく事前にも利益を確認しました。', '商品、バリエーション、仕入先、Listing、在庫、結果を一貫した定義でつなぎました。', '実売上、費用、利益を継続的に記録し、価格変更、補充、コンテンツ改善、停止のタイミングを判断しました。', '利益の結果を次の商品選定、仕入先、画像・Listingの判断に戻し、数字が次の行動を変えるようにしました。'],
        workflow: ['事前計算：商品コスト、物流、手数料、価格、利益下限を計算します。', '納品：仕入れ、画像、Listing、在庫を担当者とバージョンつきで準備します。', '販売追跡：注文、費用、在庫、異常を記録し、予測値と実績値を分けます。', '利益確認：商品とバリエーションごとの実利益を見て、売上だけで判断しません。', '経営アクション：価格変更、補充、内容改善、仕入先改善、投資停止と理由を記録します。'],
        stack: ['Amazon精密型越境EC', 'Feishu多次元表・結果追跡', '仕入れ、物流、仕入先との連携', 'コスト計算、利益分析、振り返り'],
        results: ['担当商品の月間利益貢献は2万元以上でした。', '商品選定、ローンチ、利益判断を同じ定義でつなぎました。', '利益の定義、データ時点、行動理由を明確にし、確認できない数字は実績として扱いません。'],
        evidence: projectEvidence('ja', CASE_STUDIES_GITHUB_URL),
        demoPrompt: '売上が伸びているのに利益が下がった場合、投資を続ける前にどのコストと工程を確認しますか？',
      },
    ],
  },
}

export function getProjectDetails(language = 'zh') {
  return (PROJECT_DETAILS[language] || PROJECT_DETAILS.zh).items
}

export function getProjectDetail(language = 'zh', id) {
  return getProjectDetails(language).find(detail => detail.id === id) || null
}

export function getProjectDetailUi(language = 'zh') {
  return (PROJECT_DETAILS[language] || PROJECT_DETAILS.zh).ui
}
