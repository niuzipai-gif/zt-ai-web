from copy import deepcopy
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from lxml import etree


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "public" / "resume.docx"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def set_many(mapping, indexes, value):
    for index in indexes:
        mapping[index] = value


def build_texts(language):
    texts = {}
    if language == "en":
        set_many(texts, [0, 1, 32, 33], "Resume")
        set_many(texts, [2, 7], "First")
        set_many(texts, [3, 8], "Name")
        set_many(texts, [4, 9], "Ethnicity")
        set_many(texts, [5, 10], "Phone")
        set_many(texts, [6, 11], "Email")
        set_many(texts, [12, 14, 17, 19], "Age")
        set_many(texts, [13, 18], "")
        set_many(texts, [15, 20], "Status / University")
        set_many(texts, [16, 21], "Education")
        set_many(texts, [22, 27], "Cai")
        set_many(texts, [23, 28], "Zhouting")
        set_many(texts, [24, 29], "Chinese")
        set_many(texts, [25, 30], "18664695946")
        set_many(texts, [26, 31], "niuzipai@gmail.com")
        texts[34] = ""
        set_many(texts, [35, 40], "AI product development | Cross-border e-commerce | Workflow engineering")
        set_many(texts, [36, 41], "Launch velocity: ~2x peers | 8+ products/month")
        set_many(texts, [37, 42], "Creative throughput: 30 min/set")
        set_many(texts, [38, 43], "Capacity optimized: 3 designers")
        set_many(texts, [39, 44], "Business impact: >= RMB 20K monthly gross-profit contribution; assigned products remained profitable")
        set_many(texts, [45, 46], "Core skills")
        set_many(texts, [47, 56], "Japanese N1")
        set_many(texts, [48, 57], ", professional spoken, written and business communication")
        set_many(texts, [49, 58], "CET-4; able to quickly read English product and technical materials")
        set_many(texts, [50, 59], "Python, SQL/MySQL, SPSS; AI-assisted coding, analytics and automation")
        set_many(texts, [51, 60], "Feishu Bitable, ")
        set_many(texts, [52, 61], "SellerSprite")
        set_many(texts, [53, 62], " and ")
        set_many(texts, [54, 63], "LinkFox")
        set_many(texts, [55, 64], "; CapCut, Photoshop, After Effects")
        set_many(texts, [65, 66], "Professional summary")
        for group in ([67, 77], [70, 80]):
            set_many(texts, group, "2022")
        set_many(texts, [68, 78], "Sep")
        set_many(texts, [69, 79], "–")
        set_many(texts, [71, 81], "")
        set_many(texts, [72, 82], "Jun 2026")
        set_many(texts, [73, 83], "Guangdong Baiyun University")
        set_many(texts, [74, 84], "")
        set_many(texts, [75, 85], "Digital Economics (B.A.)")
        set_many(texts, [76, 86], "Coursework: Python Data Analysis, MySQL, SPSS, Power BI, Tableau, International Marketing")
        set_many(texts, [87, 89], "Education")
        set_many(texts, [88, 90], "Background")
        set_many(texts, [91, 92], "Business-focused AI product builder targeting AI product, solutions and FDE roles with Shenzhen-based international teams; turns ambiguous operational problems into executable workflows, tools and measurable outcomes.")
        set_many(texts, [93, 98], "23")
        set_many(texts, [94, 99], "years")
        set_many(texts, [95, 100], "")
        set_many(texts, [96, 101], "Guangdong Baiyun University")
        set_many(texts, [97, 102], "Bachelor's")
        set_many(texts, [103, 104], "Key metrics")
        set_many(texts, [105, 120], "Apr 2026")
        set_many(texts, [106, 121], "– Apr 2027 | Shenzhen Kunxin Technology Co., Ltd. | AI Product Development")
        set_many(texts, [107, 122], "• Owned AI workflow development for Amazon precision e-commerce; launched 8+ products monthly, with assigned products contributing >= RMB 20K monthly gross profit while remaining profitable.")
        set_many(texts, [108, 123], "Sep 2025 – Jan 2026 | Guanshi Medical Supply Chain Co., Ltd. | Procurement")
        set_many(texts, [109, 124], "• Managed sourcing, purchasing, shipping and supplier negotiation; reduced monthly costs by RMB 10K–20K and moved 21 suppliers into long-term ERP cooperation.")
        set_many(texts, [110, 125], "Jul – Sep 2023 | Royole Technology | Data Analysis Intern")
        set_many(texts, [111, 126], "• Collected and monitored e-commerce data, used Python for scraping and cleaning, built a sales database, and used SPSS for trend analysis and quarterly forecasting.")
        set_many(texts, [112, 127], "Selected projects")
        set_many(texts, [113, 128], "Apr 2026 – Apr 2027 | AI Product Selection & Launch Workflow")
        set_many(texts, [114, 129], "• Built an end-to-end workflow in Feishu Bitable covering demand intake, competitor research, keyword validation, profit assessment and launch execution.")
        set_many(texts, [115, 130], "• Result: 8+ precision launches/month at roughly 2x peer speed.")
        set_many(texts, [116, 131], "Apr 2026 – Apr 2027 | AI Creative Production: ")
        set_many(texts, [117, 132], "LinkFox")
        set_many(texts, [118, 133], " fast-image workflow, 30 min/set, optimizing the capacity of 3 designers.")
        set_many(texts, [119, 134], "")
        set_many(texts, [135, 136], "Professional experience")
        texts.update({
            137: "Kunxin Technology | AI Product Development",
            138: "Shenzhen Kunxin Technology Co., Ltd. |",
            139: " AI",
            140: " Product Development |",
            141: " Apr 2026 – Apr 2027",
            142: "1. AI Product Selection & Launch Workflow",
            143: "Business challenge:",
            144: " Rebuilt the workflow from opportunity discovery to product launch to address fragmented decisions, hard-to-track information and reliance on individual experience.",
            145: "Workflow architecture:",
            146: " Designed Feishu Bitable fields and checkpoints for demand intake, competitor analysis, keyword validation, profit modeling, supply-chain checks, decision records, launch tasks and result tracking.",
            147: "Logic systemization:",
            148: " Converted multiple selection heuristics into a consistent decision sequence and reusable checklist, keeping conclusions, evidence, supplier information and follow-up tasks traceable.",
            149: "Cross-functional delivery:",
            150: " Connected product selection, procurement, creative production, Listing content and profit tracking to reduce repeated information handling and support shared execution standards.",
            151: "2. AI Creative Production Workflow",
            152: "Approach:",
            153: "Combined ",
            154: "LinkFox",
            155: " and related tools to research rapid product-image production, from asset preparation and value-proposition extraction to prompt design, visual QA and delivery archiving.",
            156: "Standardization:",
            157: " Created reusable image templates, asset checklists and delivery QA items so different products could be completed against one consistent standard.",
            158: "Team impact:",
            159: " Defined ownership and delivery checkpoints for an experience-dependent design task, improving design-resource utilization and enabling scaled content production.",
            160: "3. Product Thinking & Delivery",
            161: "Requirement framing:",
            162: " Translated business goals into fields, workflows, tools, deliverables and acceptance criteria, prioritizing constraints that affect efficiency and profit.",
            163: "Tool stack:",
            164: "Used Feishu Bitable, ",
            165: "SellerSprite",
            166: " and ",
            167: "LinkFox",
            168: " and AI-assisted coding to combine tools into executable, reviewable workflows.",
            169: "Outcome focus:",
            170: " Tracked adoption, delivery quality, collaboration and business results after launch, iterating beyond the prototype stage.",
            171: "4. Selected Cross-Border Projects",
            172: "Sep 2023 – Feb 2024 |",
            173: "",
            174: "Apple Price-Adjustment & Cost-Preservation Project",
            175: "Project scope:",
            176: " Used Japanese to handle several hundred conversations with Apple customer support under official after-sales and price-adjustment policies, coordinating cases and preserving nearly JPY 2M in procurement cost.",
            177: "Mar – Jul 2025 |",
            178: "",
            179: "China–Japan Cross-Border Resale",
            180: "Project scope:",
            181: " Worked across sourcing judgment, purchasing coordination, cross-border logistics and sales execution for China–Japan price-difference products.",
            182: "5. Transferable Strengths",
            183: "Productize workflows:",
            184: " Turn one-off experience into fields, rules, templates and checklists that teams can use directly.",
            185: "Engineer efficiency:",
            186: " Identify repetitive, judgment-heavy steps, then use AI and tools for standardization, batching and quality assurance.",
            187: "Make outcomes testable:",
            188: " Use adoption, delivery quality, collaboration and business results as acceptance criteria, then iterate from observed evidence.",
        })
    elif language == "ja":
        set_many(texts, [0, 1, 32, 33], "職務経歴書")
        set_many(texts, [2, 7], "姓")
        set_many(texts, [3, 8], "名")
        set_many(texts, [4, 9], "民族")
        set_many(texts, [5, 10], "電話")
        set_many(texts, [6, 11], "メール")
        set_many(texts, [12, 14, 17, 19], "年齢")
        set_many(texts, [13, 18], "")
        set_many(texts, [15, 20], "身分・大学")
        set_many(texts, [16, 21], "学歴")
        set_many(texts, [22, 27], "蔡")
        set_many(texts, [23, 28], "宙廷")
        set_many(texts, [24, 29], "漢族")
        set_many(texts, [25, 30], "18664695946")
        set_many(texts, [26, 31], "niuzipai@gmail.com")
        texts[34] = ""
        set_many(texts, [35, 40], "越境EC | EC運営 | 購買・業務改善")
        set_many(texts, [36, 41], "商品開発: 月8商品以上 | 同僚の約2倍の速度")
        set_many(texts, [37, 42], "画像制作: 30分/セット")
        set_many(texts, [38, 43], "デザイン業務: 3名分の作業効率を最適化")
        set_many(texts, [39, 44], "成果: 月間2万元以上の粗利貢献 | 担当商品は継続的に黒字")
        set_many(texts, [45, 46], "活かせるスキル")
        set_many(texts, [47, 56], "日本語 N1")
        set_many(texts, [48, 57], "（会話・読解・ビジネス交渉）")
        set_many(texts, [49, 58], "CET-4、英語の製品・技術資料を速やかに読解")
        set_many(texts, [50, 59], "Python、SQL/MySQL、SPSS、AI支援コーディング、データ分析")
        set_many(texts, [51, 60], "Feishu多次元表、")
        set_many(texts, [52, 61], "SellerSprite")
        set_many(texts, [53, 62], "、")
        set_many(texts, [54, 63], "LinkFox")
        set_many(texts, [55, 64], "、CapCut、Photoshop、After Effects")
        set_many(texts, [65, 66], "職務要約")
        set_many(texts, [67, 77], "2022")
        set_many(texts, [68, 78], "年9月")
        set_many(texts, [69, 79], "〜")
        set_many(texts, [70, 80], "2026")
        set_many(texts, [71, 81], "")
        set_many(texts, [72, 82], "年6月")
        set_many(texts, [73, 83], "広東白雲学院")
        set_many(texts, [74, 84], "")
        set_many(texts, [75, 85], "デジタル経済学（学士）")
        set_many(texts, [76, 86], "主な履修: Pythonデータ分析、MySQL、SPSS、Power BI、Tableau、国際マーケティング")
        set_many(texts, [87, 89], "学歴")
        set_many(texts, [88, 90], "・基本情報")
        set_many(texts, [91, 92], "中国語を母語とし、日本語N1を活かして日本での越境EC運営、購買・調達、顧客対応を担う実務型人材。日中間の業務を手順、ツール、検証可能な成果に落とし込み、現場で運用できる形まで整備します。")
        set_many(texts, [93, 98], "23")
        set_many(texts, [94, 99], "歳")
        set_many(texts, [95, 100], "")
        set_many(texts, [96, 101], "広東白雲学院")
        set_many(texts, [97, 102], "学士")
        set_many(texts, [103, 104], "主な実績")
        set_many(texts, [105, 120], "2026年4月")
        set_many(texts, [106, 121], "〜2027年4月｜深圳市坤信科技有限公司｜AIプロダクト開発")
        set_many(texts, [107, 122], "• Amazon精密型越境ECの業務フローを開発。月8商品以上をローンチし、担当商品の月間粗利2万元以上、継続的に赤字を回避。")
        set_many(texts, [108, 123], "2025年9月〜2026年1月｜冠仕医療サプライチェーン有限公司｜購買")
        set_many(texts, [109, 124], "• 仕入先開拓、購買、出荷、価格交渉を担当。月1〜2万元のコスト削減、21社の長期ERP取引化を推進。")
        set_many(texts, [110, 125], "2023年7月〜9月｜柔宇科技｜データ分析インターン")
        set_many(texts, [111, 126], "• EC販売データをPythonで収集・整理し、データベースを構築。SPSSで販売傾向を分析し、四半期販売量を予測。")
        set_many(texts, [112, 127], "主なプロジェクト")
        set_many(texts, [113, 128], "2026年4月〜2027年4月｜AI商品選定・ローンチ業務フロー")
        set_many(texts, [114, 129], "• Feishu多次元表を活用し、ニーズ、競合、キーワード、利益判断からローンチ実行までの業務フローを構築。")
        set_many(texts, [115, 130], "• 成果: 月8商品以上、同僚の約2倍の速度で開発を推進。")
        set_many(texts, [116, 131], "2026年4月〜2027年4月｜AI画像制作の効率化: ")
        set_many(texts, [117, 132], "LinkFox")
        set_many(texts, [118, 133], "を活用した高速制作フロー、30分/セット、デザイン業務3名分を最適化。")
        set_many(texts, [119, 134], "")
        set_many(texts, [135, 136], "職務経歴")
        texts.update({
            137: "坤信科技｜AIプロダクト開発",
            138: "深圳市坤信科技有限公司｜",
            139: " AI",
            140: " プロダクト開発｜",
            141: " 2026年4月〜2027年4月",
            142: "1. 商品選定・ローンチ業務フロー設計",
            143: "業務課題:",
            144: " 商品選定の判断が分散し、情報を追跡しにくく、ローンチが個人の経験に依存していた課題に対し、機会発見から商品投入までの流れを再構築。",
            145: "フロー構築:",
            146: " Feishu多次元表を業務ハブとし、ニーズ収集、競合分析、キーワード検証、利益試算、サプライチェーン確認、意思決定、ローンチタスク、結果追跡の項目を設計。",
            147: "ロジックの体系化:",
            148: " 複数の選定ロジックを一貫した判断順序とチェックリストに整理し、結論、根拠、仕入先情報、後続タスクを追跡可能にした。",
            149: "部門連携:",
            150: " 商品選定、購買、画像制作、Listingコンテンツ、利益追跡をつなぎ、情報整理の重複を減らして共通基準で実行できる状態を整備。",
            151: "2. AI画像制作の効率化",
            152: "施策:",
            153: "",
            154: "LinkFox",
            155: "などを組み合わせ、素材整理、訴求ポイント抽出、プロンプト、画面要件、生成物の選定、サイズ確認、納品までの高速制作方法を研究。",
            156: "標準化:",
            157: " 再利用可能なテンプレート、素材リスト、納品チェック項目を整備し、商品ごとの画像セットを共通基準で制作可能にした。",
            158: "チームへの効果:",
            159: " 経験に依存していた画像制作を分担と納品工程に分解し、デザインリソースの活用効率を高め、量産の基盤を整備。",
            160: "3. 業務改善・ツール実装",
            161: "要件整理:",
            162: " 業務目標を項目、プロセス、ツール、成果物、受入基準に分解し、効率と利益に影響する課題を優先。",
            163: "ツール活用:",
            164: "Feishu多次元表、",
            165: "SellerSprite",
            166: "、",
            167: "LinkFox",
            168: "、AI支援コーディングを実行可能な業務設計に統合。",
            169: "成果確認:",
            170: " 導入後の利用状況、納品品質、協業、業務成果を記録し、試用で終わらせず継続的に改善。",
            171: "4. 日中間プロジェクト",
            172: "2023年9月〜2024年2月｜",
            173: "",
            174: "Apple公式規約に基づく価格調整交渉・調達コスト保全",
            175: "業務内容:",
            176: " 日本市場向けの大口機器調達に伴う価格変動に対し、公式アフターサービス規約と価格調整方針を確認。合規の範囲内で日本語による電話交渉を数百件行い、約200万円の調達コスト削減・損失保全に貢献。",
            177: "2025年3月〜7月｜",
            178: "",
            179: "日中越境EC・価格差商品の販売",
            180: "業務内容:",
            181: " 日本滞在と越境物流の経験を活かし、仕入れ判断、購買調整、輸送手配、販売推進まで一連の業務に携わった。",
            182: "5. 活かせる仕事の進め方",
            183: "業務の標準化:",
            184: " 一度きりの経験を項目、ルール、テンプレート、チェックリストに落とし込み、チームで使える資産にする。",
            185: "効率改善:",
            186: " 反復的で判断に依存する工程を特定し、AIとツールで標準化、量産化、品質確認を行う。",
            187: "成果の検証:",
            188: " 利用状況、納品品質、協業の円滑さ、コスト・利益への影響を受入基準とし、結果から改善を続ける。",
        })
    else:
        raise ValueError(language)
    return texts


def replace_document_xml(xml, language):
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(xml, parser)
    nodes = root.xpath(".//w:t", namespaces=NS)
    replacements = build_texts(language)
    if len(nodes) != 189:
        raise RuntimeError(f"Unexpected template text node count: {len(nodes)}")
    for index, node in enumerate(nodes):
        if index not in replacements:
            raise RuntimeError(f"Missing replacement for text node {index}: {node.text!r}")
        node.text = replacements[index]
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def build(language, output_name, title):
    output = ROOT / "public" / output_name
    with ZipFile(TEMPLATE, "r") as source:
        files = {name: source.read(name) for name in source.namelist()}
    files["word/document.xml"] = replace_document_xml(files["word/document.xml"], language)
    core = files.get("docProps/core.xml")
    if core:
        core = core.replace("<dc:title>个人简历</dc:title>".encode(), f"<dc:title>{title}</dc:title>".encode())
        files["docProps/core.xml"] = core
    with ZipFile(output, "w", ZIP_DEFLATED) as target:
        for name, data in files.items():
            target.writestr(name, data)
    print(f"wrote {output} ({output.stat().st_size} bytes)")


build("en", "resume-en.docx", "Cai Zhouting - English Resume")
build("ja", "resume-ja.docx", "蔡宙廷 - 職務経歴書")
