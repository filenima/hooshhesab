// ============================================================
// lib/seo/english-pillars.ts — ترجمهٔ انگلیسیِ ۳ مقالهٔ ستون (Trick #14)
// ------------------------------------------------------------
// هدف: مخاطب بین‌المللی (دیاسپورا، پژوهشگران B2B، تحلیل‌گران بازار
// ایران) با جست‌وجوهای انگلیسی («Moadian e-invoicing», «cloud vs
// desktop accounting Iran», «choose accounting software criteria»)
// به خلاصهٔ حرفه‌ای انگلیسی برسند و از hreflang به راهنمای کامل
// فارسی لینک شوند.
//
// سیاست صداقت (قانون پروژه):
//  - محتوا ترجمهٔ فشردهٔ همان مقالهٔ فارسی منتشرشده است؛ هیچ عدد/
//    آمار/قیمتی که در نسخهٔ فارسی نباشد اینجا ساخته نشده است.
//  - جداول قیمت تومانی و جزئیات قانونی فقط در نسخهٔ فارسی هستند و
//    کاربر انگلیسی به آن لینک می‌شود (اعلان بالای هر مقاله).
//  - تاریخ انتشار = تاریخ انتشار نسخهٔ فارسی؛ تاریخ ویرایش = تاریخ
//    ترجمه (شفافیت برای E-E-A-T).
//
// استفاده در:
//  - app/en/blog/[slug]/page.tsx (صفحهٔ مقالهٔ انگلیسی + hreflang)
//  - app/en/blog/page.tsx (ایندکس انگلیسی)
//  - app/blog/[slug]/page.tsx (hreflang نسخهٔ فارسی)
//  - app/sitemap.ts (URLهای /en/blog/ با alternates)
//  - app/api/platform/seo-files/route.ts (llms.txt — بخش مقالات)
// ============================================================

export interface EnglishPillar {
  /** همان slug نسخهٔ فارسی — URL انگلیسی: /en/blog/<slug> */
  slug: string;
  /** عنوان سئو انگلیسی (بدون برند — قالب layout اضافه می‌کند) */
  title: string;
  /** متا-دسکریپشن انگلیسی (~150-160 chars) */
  description: string;
  /** عنوان نسخهٔ فارسی — برای اعلانِ «این خلاصهٔ انگلیسی است» */
  persianTitle: string;
  /** تاریخ انتشار (همان نسخهٔ فارسی — ISO) */
  datePublished: string;
  /** آخرین به‌روزرسانی ترجمه (ISO) */
  dateModified: string;
  /** بخش/دسته برای Article schema */
  section: string;
  keywords: string[];
  /** متن کامل HTML مقالهٔ انگلیسی (خلاصهٔ حرفه‌ای ۱۲۰۰-۱۸۰۰ کلمه) */
  html: string;
}

/** اعلان یکسان بالای هر مقالهٔ انگلیسی — لینک به راهنمای کامل فارسی */
function englishNotice(persianSlug: string, persianTitle: string): string {
  return `<div class="not-prose my-6 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm leading-6 dark:border-emerald-900/50 dark:bg-emerald-950/30">
  <p><strong>ℹ️ This is an English summary of the full Persian guide.</strong> The complete guide — with Iranian price tables, penalty-rate tables, legal citations and step-by-step screenshots — is available in Persian:
  <a href="/blog/${persianSlug}" hreflang="fa" class="font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400">${persianTitle}</a>.</p>
</div>`;
}

// ────────────────────────────────────────────────────────────
// ۱) راهنمای کامل سامانه مودیان (e-invoicing ایران)
// ────────────────────────────────────────────────────────────
const moadianHtml = `
${englishNotice("moadian-system-complete-guide", "راهنمای کامل سامانه مودیان برای صاحبان کسب‌وکار (به‌روز ۱۴۰۴)")}

<p>One ordinary workday morning, an SMS arrives from the Iranian Tax Organization: <em>"Dear taxpayer, please refer to your Karpoosheh (taxpayer inbox) in the Moadian System to receive an official notice."</em> From that moment, most Iranian business owners face the same flood of questions: What exactly is Karpoosheh? Am I covered by the mandate or not? Are the invoices I have printed for years no longer valid? And the biggest fear: how large is the fine if I act late?</p>

<p><strong>Moadian (سامانه مودیان)</strong> is the official electronic invoicing platform of Iran's tax authority (INTA). Under <strong>Article 169 Mokarrar ("bis") of the Direct Taxes Act</strong> — added by the 2021 amendment — every taxpayer with an active tax file must register in the system and submit sales and purchase invoices electronically through their dedicated <strong>Karpoosheh</strong> portal. Any transaction that is never submitted is subject to a <strong>1%–4% penalty on the value of that same transaction</strong>, and the penalty doubles if the taxpayer still fails to act after the organization's formal two-month notice.</p>

<h2>1. What the Moadian system actually is</h2>
<p>Moadian is not a simple dashboard; it is a set of interconnected services. The ones you will actually touch as a taxpayer:</p>
<ul>
<li><strong>Karpoosheh (کارپوشه)</strong> — your personal inbox for official notices, invoice-status tracking, responses to the tax organization's information requests, and tax-file follow-ups. Legal deadlines are counted from the date a notice is delivered here.</li>
<li><strong>Identity verification service</strong> — the secure entry gate where you (or your company's legal representative) authenticate with a national ID and password.</li>
<li><strong>Invoice reception service</strong> — the technical engine that receives invoices from licensed accounting software or intermediary panels and validates them.</li>
<li><strong>Inquiry system</strong> — validates the identity/economic codes of your counterparty before you issue an invoice.</li>
</ul>
<p>The philosophy is simple: the tax authority wants to move from "declared estimates" to <strong>actual transaction data</strong>. For a healthy business this is ultimately good news — a fairer tax base, fewer blind presumptive assessments, and a documented tax file that banks and large partners trust.</p>

<h2>2. Legal basis: Article 169 vs Article 169 Mokarrar</h2>
<p>Article 169 of the Direct Taxes Act is the long-standing obligation to <em>issue</em> an invoice for every sale and hand a copy to the customer. <strong>Article 169 Mokarrar (2021 amendment)</strong> went a step further: it obliged the tax organization to build the Moadian system, and obliged taxpayers to <strong>submit their electronic invoices to it within statutory deadlines</strong>. The same article's notes form the basis of the cabinet-approved penalty directive. Always verify the latest rules through the official portal and your own Karpoosheh — implementing rules have been revised several times since the pilot phase began in late 2023.</p>

<h2>3. Who must register?</h2>
<p>Short answer: <strong>every taxpayer with an active file who issues invoices</strong> — individuals and legal entities alike. Enforcement has been phased by transaction volume: large taxpayers first (2023–2024), extending through 2024–2025 to smaller traders and retail. Two practical implications: if you are not covered yet, you very likely will be; and the only reliable source for your exact start date is the notice in your own Karpoosheh. Non-resident businesses operating in Iran must appoint a local legal representative. Businesses without a tax file must open one first — Moadian registration is not a substitute.</p>

<h2>4. The three invoice types: A, B and J</h2>
<p>Choosing the wrong type is one of the most common causes of invoice rejection:</p>
<ul>
<li><strong>Type A</strong> — B2B sales to buyers who have a national ID / economic code. Recording the buyer's identifiers is mandatory.</li>
<li><strong>Type B</strong> — sales to final consumers without a national ID. Buyer identity is normally not required, but once cumulative purchases by one person exceed announced thresholds, identity details become mandatory.</li>
<li><strong>Type J</strong> — corrective invoices (returns, amount corrections, cancellations), always issued with an explicit reference to the original invoice's unique ID.</li>
</ul>
<p>In mixed transactions (goods + services), every line item must carry its own correct commodity/service code. For the technical structure of economic codes and the invoice UUID, see the Persian guide.</p>

<h2>5. From issuance to final acceptance</h2>
<p>An invoice travels five steps: (1) issued in your sales tool; (2) packaged into the standard format — party identifiers, commodity codes, amounts, dates and a unique UUID; (3) transmitted to the reception service (instant if your software is directly connected); (4) validated across multiple layers; (5) finally registered, receiving a tax ID and entering both parties' tax files. Each invoice holds a live status — <em>queued for validation, accepted, rejected-but-correctable, or finally rejected</em> — and the rejection reason is stated in the system response. Experience shows most rejections happen in the first two weeks; after base-data cleanup, rejection rates typically fall below 2%.</p>

<h2>6. Deadlines that matter</h2>
<ul>
<li><strong>Registration</strong> — before your mandate period begins, within the deadline stated in your Karpoosheh notice.</li>
<li><strong>Submission of each invoice</strong> — within the deadline set by the issued directives; this is the basis of the 1%–4% penalty calculation.</li>
<li><strong>Responses to information requests</strong> — counted per each notice; ignoring them triggers a separate penalty.</li>
<li><strong>Correcting a rejected invoice inside its window</strong> — legally treated as an on-time submission.</li>
</ul>

<h2>7. Penalties in one table</h2>
<p>Based on the current directive, the penalty for an unsubmitted transaction is tiered by its amount: up to 50 million rials (5 million tomans) → <strong>1%</strong>, doubled to 2% after the two-month notice; 5–20 million tomans → <strong>2% / 4%</strong>; 20–100 million tomans → <strong>3% / 6%</strong>; above 100 million tomans → <strong>4% / 8%</strong>. Two further layers can stack on an undocumented transaction: a 2% penalty for not issuing an invoice at all, and a 30% performance-tax penalty if the transaction is absent from your legal books. A worked example from the Persian guide: forgetting just two 100-million-toman invoices in one month costs 16 million tomans after the notice period — roughly a year and a half of a full subscription to compliant accounting software. The complete penalty tables, examples and amnesty mechanisms are in the Persian original.</p>

<h2>8. Threat or opportunity?</h2>
<p>Hoosh's survey of 400 Iranian businesses found that <strong>58% of taxpayers still check their Karpoosheh only weekly or less</strong>, and it takes an average of <strong>11 days</strong> for a business to discover an unsent or rejected invoice — a delay that is itself a fine-generating event. Early compliers spend only about <strong>7%</strong> of extra working time on Moadian tasks, versus <strong>21%</strong> for those who delay. The upside for healthy businesses: a fairer tax base computed on real transactions, a credible tax history for loans, tenders and partnerships, faster B2B reconciliation, and forced digital discipline in daily bookkeeping.</p>

<h2>9. How <strong>Hoosh</strong> automates Moadian compliance</h2>
<p>Hoosh, the Iranian cloud accounting software, is officially and directly connected to the Moadian system: invoices are transmitted automatically the moment they are issued (no re-entry, no intermediary files), party identifiers and commodity codes are validated <em>before</em> sending, every invoice's acceptance/rejection status is visible inside the same workspace, rejected invoices raise an immediate alert with the stated reason, and Type J corrections are issued in a few clicks with automatic reference to the original invoice. Online sales channels (Digikala, Basalam, WooCommerce) convert automatically into compliant invoices, and photographing a purchase invoice lets the AI OCR (98% claimed accuracy) turn it into an accounting document.</p>

<h2>10. A 90-day compliance roadmap</h2>
<ul>
<li><strong>Weeks 1–2:</strong> identity verification, Moadian registration, receive your identifiers.</li>
<li><strong>Weeks 3–4:</strong> commodity coding against the official list; complete organizational customer records — clean base data is the single biggest driver of fewer rejections.</li>
<li><strong>Weeks 5–6:</strong> connect your accounting software and complete a test submission.</li>
<li><strong>Weeks 7–8:</strong> issue real invoices, monitor statuses daily, fix errors.</li>
<li><strong>Weeks 9–12:</strong> turn monitoring into routine, train the sales team, document procedures.</li>
</ul>

<p><strong>Bottom line:</strong> Moadian is the new legal infrastructure of the Iranian economy. The penalty ladder is mechanical, not negotiable; the painless path is software that sends and monitors invoices for you. If you operate in Iran, start with the free 7-day Hoosh trial (no bank card required) — and for the full penalty tables, legal citations and registration walkthroughs, read the complete Persian guide. For the software-selection context around this mandate, see our English summaries of <a href="/blog/cloud-vs-desktop-accounting">cloud vs desktop accounting in Iran</a> and <a href="/blog/choose-accounting-software-15-criteria">the 15-criteria buying framework</a>; the Persian cloud-guide <a href="/blog/cloud-accounting-software-what-is-1404">«نرم‌افزار حسابداری ابری چیست؟»</a> covers the underlying concepts in depth.</p>
`;

// ────────────────────────────────────────────────────────────
// ۲) ابری یا نصبی — مقایسهٔ صادقانه
// ────────────────────────────────────────────────────────────
const cloudVsDesktopHtml = `
${englishNotice("cloud-vs-desktop-accounting", "نرم‌افزار حسابداری ابری یا نصبی؟ مقایسهٔ صادقانه")}

<p>Two proforma invoices are on your desk. The first, from a legacy desktop-software vendor, says: <em>"Buy once, own it forever — why pay a yearly subscription?"</em> The second, from a cloud service, says: <em>"Subscribe and never worry about updates, backups or Moadian compliance again."</em> Both sound logical, and both omit something: the desktop vendor does not mention server costs, annual support renewals and future upgrades; the cloud vendor does not mention internet dependency. You are in the middle, facing a five-year decision. This article is decision-driven: quick verdict first, then the real five-year cost table, then each common argument examined with numbers.</p>

<h2>1. Two models, precisely defined</h2>
<p><strong>Desktop (on-premise/network)</strong> accounting software is installed on your own computer or server. You buy a license, the data file lives on that server, and responsibility for backups, updates, security and hardware is entirely yours. <strong>Cloud (SaaS)</strong> accounting runs on the provider's datacenter servers; you connect via browser or mobile app, and in exchange for a periodic subscription, infrastructure, updates, backups and legal compliance sit with the provider.</p>
<p>One common trap: a "web-based" viewer layer bolted onto a desktop product still requires your own in-house server. The diagnostic question: <em>"Do I need to maintain a server to use this system?"</em> If yes, you are comparing against the desktop model, not real cloud.</p>

<h2>2. The 30-second verdict</h2>
<ul>
<li><strong>Single-store or small business</strong> → cloud (near-zero entry cost, data risk eliminated).</li>
<li><strong>Multi-branch or remote teams</strong> → cloud (a single live dataset; desktop fundamentally cannot offer this).</li>
<li><strong>Online selling (Digikala, Basalam, WooCommerce)</strong> → cloud (ready connectors, automatic invoice submission).</li>
<li><strong>Large organization with an IT team and existing infrastructure</strong> → desktop or hybrid (sunk investment and internal mandates can justify it).</li>
<li><strong>Region with unstable internet</strong> → desktop, or cloud with a cellular-data fallback.</li>
<li><strong>Newly founded business</strong> → cloud (no upfront capital, grow by upgrading plans).</li>
</ul>

<h2>3. The real five-year cost (Iranian market example)</h2>
<p>Comparing only day-one prices flatters desktop. Total cost of ownership over five years, for a 5-user distribution company (1404-era market estimates from the Persian guide):</p>
<ul>
<li><strong>Desktop (network edition):</strong> server hardware + Windows Server + database ≈ 120M tomans; installation 20M; 5-user licenses 100M; annual support renewals (~20% of license) 100M over 5 years; part-time technical staff 120M; major version upgrades in years 3 and 5 ≈ 100M; peripherals and repairs 50M — <strong>total ≈ 610M tomans</strong>.</li>
<li><strong>Cloud (Hoosh organizational plan):</strong> subscription ≈ 34.9M tomans/year × 5 = <strong>≈ 174.5M tomans</strong>, everything else included.</li>
</ul>
<p>That is roughly a <strong>3.5× difference</strong> — before counting two silent costs: downtime (a failed server stops every user in the middle of the sales season) and the opportunity cost of ~240M tomans of year-one capital that could have funded inventory and growth instead of hardware that ages every four years. Fairness check: if your company already owns a strong server and technical staff, the gap narrows sharply and the comparison shifts to capabilities and legal compliance. Hoosh's survey of 400 Iranian businesses found cloud's share of new financial-software purchases grew from <strong>51% to 73% in two years</strong>, and 44% of desktop buyers cite maintenance/update cost erosion as their main reason to reconsider.</p>

<h2>4. Compliance speed with Moadian — cloud's trump card</h2>
<p>In today's Iran, comparing accounting software means comparing <em>how fast you stay legal</em>. Moadian invoice formats, social-security rates, payroll-tax brackets and VAT rules change every year — sometimes every season — and each change carries a compliance deadline. In cloud, changes are applied centrally by the vendor's team: the next morning every customer works on the compliant version, with no download, no installation, no extra fee. In desktop, every legal change means a full cycle — release, download or on-site delivery, installation (usually needing a technician), testing, and resolving interference with legacy data. Best case: days. Worst case: weeks — during which every invoice issued in the old format risks rejection in the Moadian system and penalties. A concrete payroll example from the guide: when insurance-rate tables changed at the start of a fiscal year, cloud customers printed correct payslips from day one, while late-updating desktop users had to recompute two weeks of payslips.</p>

<h2>5. Data security — without the fearmongering</h2>
<p>The desktop argument "my data stays with me, so it's safer" deserves a fair, layered comparison. The typical small-business "server" is an ordinary PC in the manager's room or storeroom: rarely disk-encrypted, often on default passwords, manual-and-forgotten backups, exposed to any employee's USB stick, to theft, power fluctuation and dust. A reputable cloud service provides encryption in transit and at rest, automatic daily multi-version backups, enforced/two-factor login, complete change logs ("who did what, when"), datacenter-grade physical protection and redundant infrastructure. Two honest caveats: an organization with a serious security team <em>can</em> secure an on-premise setup; and moving to cloud means buying trust in the provider — so pick a vendor with a track record, a transparent contract, and an explicit, unrestricted <strong>data-export right</strong>.</p>

<h2>6. The "offline" myth</h2>
<p>Desktop's second argument is independence from the internet. The true half: invoice registration keeps working during an outage. The hidden half: desktop is not truly offline, only <em>internet-breaking</em> — (1) submitting invoices to Moadian requires internet in <em>every</em> model, since an unsubmitted invoice is legally incomplete; (2) the offline capability only serves one physical location — your remote accountant, travelling manager and second branch still cannot reach anything; (3) good cloud products ship a PWA/mobile app that runs on cellular data, giving you two independent internet paths; and (4) your on-premise server depends on power, hardware and malware — an outage without a datacenter's backup. The fair conclusion: in regions where both fixed and mobile internet are genuinely unstable, desktop's offline advantage is real and should be weighed; in most Iranian cities, the "offline myth" is habit, not risk analysis.</p>

<h2>7. Five honest cases where desktop still makes sense</h2>
<ol>
<li><strong>Existing, paid-for infrastructure</strong> — server, IT staff and active support contracts; re-decide at their natural expiry, not today.</li>
<li><strong>Regionally unstable internet</strong> on both fixed and mobile paths.</li>
<li><strong>Data-residency mandates</strong> — internal or regulatory requirements to keep data on your own servers.</li>
<li><strong>Deep, one-of-a-kind industrial customizations</strong> with no cloud equivalent, where rebuilding would cost more than migrating gains.</li>
<li><strong>A deliberate management preference for physical control</strong>, accepting its costs knowingly.</li>
</ol>

<h2>8. Final verdict by business type (from the Persian guide)</h2>
<ul>
<li><strong>Single store (≈2 users)</strong> → cloud, e.g. Hoosh's base plan at 9,750,000 tomans/year with 2 users and 4 warehouses.</li>
<li><strong>Store/service with a 3–4 person team</strong> → cloud professional plan, 13,900,000 tomans/year including AI OCR and current-year payroll tables.</li>
<li><strong>Chains, distribution, multi-company groups</strong> → cloud organizational plan (unlimited users/warehouses, multi-company).</li>
<li><strong>Services with remote teams</strong> → cloud + the mobile app.</li>
<li><strong>Mid-size manufacturing, stable internet</strong> → cloud, but verify the manufacturing/costing module carefully in a demo.</li>
<li><strong>Large organization with IT and servers</strong> → desktop or hybrid, revisited at hardware renewal.</li>
<li><strong>Weak-internet region</strong> → desktop, or test the cellular-PWA path before migrating.</li>
</ul>

<h2>9. If you decide to migrate: the 8-step checklist</h2>
<p>The core fear is losing data; done properly, a mid-size company migrates in <strong>one to two weeks without losing a single document</strong>: (1) map your data — accounts, balances, products, customers, open documents; (2) pick a cutover date at a month or quarter start; (3) transfer master data (a good moment to prune dead accounts); (4) record opening balances and reconcile fully against the old system's reports; (5) activate the Moadian connection and issue a first electronic invoice <em>before</em> switching off the old system; (6) train each role briefly and specifically; (7) run both systems in parallel for one to two weeks with daily comparisons; (8) close the old system, archive a complete export, and document the migration date.</p>

<p><strong>Bottom line:</strong> the verdict is the product of three tables, not slogans — 5-year cost, compliance speed, and security quality. Outside the five honest exceptions above, for Iranian stores, service firms, distribution and chains, the cloud verdict is clear. Try it with real numbers: the free 7-day Hoosh trial requires no bank card and no installation. For the Moadian e-invoicing context see our English summary of <a href="/blog/moadian-system-complete-guide">the complete Moadian guide</a>; for a structured purchase decision see <a href="/blog/choose-accounting-software-15-criteria">the 15-criteria framework</a>; the full Persian cloud definition guide is at <a href="/blog/cloud-accounting-software-what-is-1404">«نرم‌افزار حسابداری ابری چیست؟»</a>.</p>
`;

// ────────────────────────────────────────────────────────────
// ۳) ۱۵ معیار انتخاب نرم‌افزار حسابداری
// ────────────────────────────────────────────────────────────
const choose15Html = `
${englishNotice("choose-accounting-software-15-criteria", "چطور نرم‌افزار حسابداری انتخاب کنیم؟ ۱۵ معیار حرفه‌ای")}

<p>You have spent two weeks asking about accounting software in Telegram groups, and every answer contradicts the last. One person says the old desktop tool is enough; another says never move without cloud; a vendor has called to claim their product "has everything"; and your accountant is attached to the tool they have used for years. In the middle of all this noise you must make a decision you will live with for three to five years — and a wrong one costs not just money, but data, time and your team's patience. This guide was written for exactly that moment: <strong>fifteen weighted professional criteria, a copyable scoring sheet, vendor red flags, a standard RFP question set, and a real decision matrix</strong> — so you choose by score, not by emotion.</p>

<p><strong>Quick answer:</strong> score the 15 criteria across five categories (legal, financial, technical, human, commercial); test your three finalists with real data; decide with a weighted matrix. The heaviest criteria: official Moadian integration, accounting depth, security, and total cost of ownership — not today's price tag.</p>

<h2>1. A five-year infrastructure decision</h2>
<p>Hoosh's survey of 400 Iranian businesses found that <strong>57% chose their current software on price alone</strong>; of that group, <strong>39% were forced to switch within two years</strong> due to incomplete Moadian support or hidden costs — with the average cost of the switch (data migration plus lost time) estimated at <strong>30–90 million tomans</strong>. The "savings" from a shallow comparison repay themselves several times over.</p>

<h2>2. Three preparation questions first</h2>
<ol>
<li><strong>Business shape:</strong> retail, services, or manufacturing? Each has different mission-critical modules.</li>
<li><strong>Scale today and in two years:</strong> invoices per month, users, warehouses, branches.</li>
<li><strong>Legal status:</strong> are you covered by Moadian and VAT now? If not yet, you probably will be within two years — which makes the legal criteria vital anyway.</li>
</ol>

<h2>3. The 15 criteria in five categories</h2>
<h3>Legal compliance (1–3)</h3>
<ul>
<li><strong>1. Official, integrated Moadian connection</strong> — electronic invoices issued in the standard format with unique IDs and submitted directly, not through side plug-ins or intermediate files. Ask: <em>"Show me issuance-to-acceptance in the Moadian system, live, in this demo."</em></li>
<li><strong>2. VAT support</strong> — correct handling of rates (including the zero rate), sale/purchase invoices, periodic reports and return preparation.</li>
<li><strong>3. Current-year payroll</strong> — social-insurance parameters, payroll-tax exemptions and bracket tables kept up to date; ask how many times the tables were updated at the last New Year.</li>
</ul>
<h3>Financial &amp; accounting capability (4–7)</h3>
<ul>
<li><strong>4. Real accounting depth</strong> — standard general and subsidiary ledgers, multi-level chart of accounts, automatic journal entries generated from routine operations (sales, purchases, receipts, payments), cost centers.</li>
<li><strong>5. Reporting &amp; management dashboards</strong> — live P&amp;L, per-branch profit, receivables aging, inventory turnover — produced from your own data, not rebuilt in Excel. Ask to see the dashboard with <em>your</em> sample data.</li>
<li><strong>6. Multi-branch, multi-warehouse, user roles</strong> — per-branch reporting, inter-warehouse transfers, multi-company operation, role-based access.</li>
<li><strong>7. Bank connectivity &amp; reconciliation</strong> — importing bank statements and auto-matching them to records is one of the biggest monthly time-savers.</li>
</ul>
<h3>Technical &amp; security (8–10)</h3>
<ul>
<li><strong>8. Data security</strong> — two-factor login, encryption in transit and at rest, change logs, automatic multi-version backups — and above all, an unconditional right to receive <em>all</em> your data whenever you want. A vague answer to this one question is itself a red flag.</li>
<li><strong>9. Reliability &amp; speed</strong> — ask for the real 12-month uptime (with evidence), and test responsiveness over an ordinary mobile connection yourself.</li>
<li><strong>10. A real mobile app &amp; an integration ecosystem</strong> — the mobile app must be able to issue invoices and show reports, not just display them; connectors to online sales channels (Digikala, Basalam, WooCommerce), payment gateways and an app marketplace. Over the next two years, your software's value will depend more on these connections than on its general ledger.</li>
</ul>
<h3>Human &amp; training (11–12)</h3>
<ul>
<li><strong>11. Learning curve &amp; training</strong> — Persian video training, searchable documentation, and a simple interface for non-accountant roles. Ask: <em>"How many hours of training until my salesperson can issue an invoice?"</em></li>
<li><strong>12. Real support</strong> — hours, channels (phone/ticket/chat) and mean resolution time. Send a test ticket before buying; that experience <em>is</em> your next two years.</li>
</ul>
<h3>Commercial &amp; cost (13–15)</h3>
<ul>
<li><strong>13. Total cost of ownership</strong> — license/subscription + extra users/warehouses + major upgrades + annual support + server costs (desktop) over three years, not today's price.</li>
<li><strong>14. Growth path</strong> — upgrading plans without re-migration and without data loss; get the exact cost and process for doubling your users.</li>
<li><strong>15. Vendor credibility</strong> — track record, speed of reaction to new laws (e.g. the Moadian phases), pricing transparency, and same-industry customers.</li>
</ul>

<h2>4. The weighting table (total = 100)</h2>
<p>Suggested weights for a mid-size Iranian business: <strong>Legal 22</strong> (Moadian 12, VAT 6, payroll 4) · <strong>Financial 31</strong> (accounting depth 10, reporting 9, multi-branch 7, bank reconciliation 5) · <strong>Technical 22</strong> (security 10, reliability 7, mobile/ecosystem 5) · <strong>Human 13</strong> (training 5, support 8) · <strong>Commercial 12</strong> (TCO 7, growth 3, vendor credibility 2). The logic: errors in Moadian compliance and security are the costliest to undo; the financial category is the heart of daily work; and buying "cheap" while failing the other categories is what turns expensive over time. Personalize the weights with your three preparation answers — manufacturers, for instance, should raise the weight of inventory and production costing.</p>

<h2>5. Three buyer personas</h2>
<ul>
<li><strong>Retail</strong> (clothing, appliances, groceries; 1–3 branches; 2–6 staff) — vital: fast Moadian invoicing, live inventory/kardex, mobile and simplicity for sales staff. Trap: an over-complex manufacturing system nobody on the team can use.</li>
<li><strong>Services</strong> (consulting, training, agencies, service contracting; project-based) — vital: per-project/contract cost and profit, payroll, periodic profit reports. Trap: a system that only understands goods.</li>
<li><strong>Manufacturing</strong> (workshops and factories) — vital: multi-level product costing, raw-material inventory and accurate kardex, production orders. Trap: a simple retail system that never builds a real cost price.</li>
</ul>

<h2>6. Eight vendor red flags</h2>
<ul>
<li>Vague pricing — a permanent "it depends" with no transparent price table.</li>
<li>Claims of having every feature, but never shows them in the demo.</li>
<li>No trial period — good software does not fear a test.</li>
<li>Contract with no data-ownership/export clause.</li>
<li>Charging separately for each legal update (every Moadian change becomes a new invoice).</li>
<li>Old or unreachable references — customer names you may not call or visit.</li>
<li>Time pressure — "the discount ends tonight" for a five-year decision.</li>
<li>Single-channel, slow support — one phone line, busy for hours.</li>
</ul>

<h2>7. Ten standard RFP questions</h2>
<ol>
<li>Documented real uptime for the last 12 months?</li>
<li>Is your Moadian issuance-to-acceptance process integrated? Demonstrate it.</li>
<li>What is your RTO after a widespread outage?</li>
<li>Exact costs of extra users, extra warehouses and plan upgrades?</li>
<li>Is two-factor login enforced, and are change logs visible to the customer?</li>
<li>In what format and within how many days will I receive a complete export of my data?</li>
<li>How many days after a legal announcement (insurance rates, Moadian format) are changes live in the product?</li>
<li>Support hours, channels, and average response time?</li>
<li>How many customers in our industry do you serve — may we speak with one or two?</li>
<li>Send a fully itemized three-year total cost of ownership.</li>
</ol>

<h2>8. A worked decision matrix</h2>
<p>The Persian guide scores three archetypes (1–5 per category, weighted): <strong>Option A</strong> — a legacy desktop product with deep accounting but weak Moadian integration and no real mobile app: weighted score <strong>3.75</strong>. <strong>Option B</strong> — a cheap, young cloud service with immature support: <strong>3.21</strong>. <strong>Option C</strong> — a mature cloud service (such as Hoosh) with integrated Moadian: <strong>4.22</strong>. The instructive part: Option A was unmatched on raw accounting depth, but its low weights on the legal and technical categories decided the outcome — and Option B collapsed in the human category despite its attractive price. A matrix turns these trade-offs into numbers. Three field rules for your own scoring sheet: score only after a demo (verbal descriptions are ~3× more optimistic than reality), bring real data (ten real invoices and products), and let your accountant score the financial category — the person who will live in it three hours a day.</p>

<h2>9. A fair look at the Iranian market</h2>
<p>The 2024–2025 market mixes three families: <strong>legacy desktop players</strong> such as Hamkaran System and Sepidar, known for long track records, a wide ecosystem and industry-specific packs; <strong>experienced veterans</strong> like Tadbir and Faramoz, long present in accounting offices and various industries; and the <strong>new cloud generation</strong> such as Hoosh, built from day one for web, mobile and integrated Moadian submission, offering features like 98%-accuracy AI invoice OCR, VAT and current-year payroll, with transparent annual pricing from 9,750,000 to 34,900,000 tomans. The right choice depends on your persona, not the brand: a large office with existing servers and IT staff can still justify an experienced desktop vendor; distributed teams, online sales and Moadian-first priorities are what the cloud generation was built for.</p>

<p><strong>Bottom line:</strong> clarify your persona with the three questions, collect comparable answers from your three finalists with the 15 criteria and 10 RFP questions, watch each demo with your real data, and let the weighted matrix make the final call — with a trial period as the tiebreaker. To go deeper on the two heaviest criteria, read our English summaries of <a href="/blog/moadian-system-complete-guide">the complete Moadian e-invoicing guide</a> and <a href="/blog/cloud-vs-desktop-accounting">cloud vs desktop accounting in Iran</a>; the Persian originals (with the full price and weighting tables) are linked at the top of each page, alongside the pillar guide <a href="/blog/cloud-accounting-software-what-is-1404">«نرم‌افزار حسابداری ابری چیست؟»</a>.</p>
`;

export const ENGLISH_PILLARS: EnglishPillar[] = [
  {
    slug: "moadian-system-complete-guide",
    title: "Iran's Moadian E-Invoicing System: Complete Business Guide (2026 Update)",
    description:
      "English summary of the complete Persian guide to Iran's Moadian electronic invoicing mandate: legal basis (Article 169 bis), invoice types A/B/J, Karpoosheh, deadlines, the 1–4% penalty ladder, and how accounting software automates compliance.",
    persianTitle: "راهنمای کامل سامانه مودیان برای صاحبان کسب‌وکار (به‌روز ۱۴۰۴)",
    datePublished: "2026-08-26T21:00:24+00:00",
    dateModified: "2026-10-24T18:00:00+00:00",
    section: "Tax & Compliance",
    keywords: [
      "Moadian system",
      "Iran e-invoicing",
      "electronic invoice Iran",
      "Karpoosheh",
      "Article 169 bis Iran",
      "Iranian tax compliance",
    ],
    html: moadianHtml.trim(),
  },
  {
    slug: "cloud-vs-desktop-accounting",
    title: "Cloud vs Desktop Accounting Software in Iran: An Honest TCO Comparison",
    description:
      "Cloud or on-premise accounting for Iranian businesses? An English summary of the Persian deep-dive: the five-year total cost of ownership table (~610M vs ~174.5M tomans), Moadian compliance speed, security layers, the offline myth, and an 8-step migration checklist.",
    persianTitle: "نرم‌افزار حسابداری ابری یا نصبی؟ مقایسهٔ صادقانه",
    datePublished: "2026-09-04T13:51:06+00:00",
    dateModified: "2026-10-24T18:00:00+00:00",
    section: "Software Selection",
    keywords: [
      "cloud accounting Iran",
      "desktop accounting software",
      "accounting software TCO",
      "SaaS accounting Iran",
      "cloud vs on-premise accounting",
    ],
    html: cloudVsDesktopHtml.trim(),
  },
  {
    slug: "choose-accounting-software-15-criteria",
    title: "How to Choose Accounting Software: 15 Weighted Criteria + Decision Matrix",
    description:
      "A professional framework for evaluating accounting software in the Iranian market: 15 weighted criteria in five categories, buyer personas, eight vendor red flags, a 10-question RFP, and a worked scoring matrix — English summary of the Persian pillar guide.",
    persianTitle: "چطور نرم‌افزار حسابداری انتخاب کنیم؟ ۱۵ معیار حرفه‌ای",
    datePublished: "2026-09-03T13:55:24+00:00",
    dateModified: "2026-10-24T18:00:00+00:00",
    section: "Software Selection",
    keywords: [
      "choose accounting software",
      "accounting software criteria",
      "accounting software RFP",
      "accounting software Iran",
      "weighted decision matrix accounting",
    ],
    html: choose15Html.trim(),
  },
];

/** نگاشت slug → مقالهٔ انگلیسی (دسترسی سریع در مسیرها) */
export const ENGLISH_PILLARS_BY_SLUG: Record<string, EnglishPillar> = Object.fromEntries(
  ENGLISH_PILLARS.map((p) => [p.slug, p])
);

/** فقط slugها — برای sitemap / llms.txt / hreflang در نسخهٔ فارسی */
export const ENGLISH_PILLAR_SLUGS: string[] = ENGLISH_PILLARS.map((p) => p.slug);

/** آیا این slug فارسی نسخهٔ انگلیسی دارد؟ (hreflang در app/blog/[slug]) */
export function isEnglishMappedSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENGLISH_PILLARS_BY_SLUG, slug);
}
