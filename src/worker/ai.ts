/**
 * AI 助手后端。
 *
 * 两个入口共用这里：模板页侧边栏（改当前模板）与全局助手页（问跨数据的问题）。
 *
 * 两条硬规则：
 *  1. AI 只产出建议，绝不直接写 R2/KV。写入一律走既有的模板 API，由人点确认。
 *  2. 送出的内容按需裁剪。proxies 段含私钥、订阅 URL 含 token，
 *     除非用户明确要求，否则打码后再送。
 */

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 调 OpenAI 兼容接口。text 为回复正文，usage 用于前端显示消耗。 */
export async function chat(
  messages: ChatMessage[],
  cfg: AiConfig,
  opts: { temperature?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; usage?: Record<string, number> }> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, temperature: opts.temperature ?? 0, messages }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI 接口 ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json() as any;
  return { text: json?.choices?.[0]?.message?.content ?? '', usage: json?.usage };
}

/** 去掉 markdown 代码围栏，模型常常不听话仍然套一层 */
export function stripFence(s: string): string {
  return s.replace(/^\s*```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
}

/** 解析模型返回的 JSON，失败时抛出带原文片段的错误便于排查 */
export function parseJson<T>(text: string): T {
  const cleaned = stripFence(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`AI 返回的不是合法 JSON：${cleaned.slice(0, 200)}`);
  }
}

// ---------- 敏感信息裁剪 ----------

/**
 * 把配置里的凭据换成占位符。
 * AI 分析结构时不需要这些值，而它们一旦出网就等于泄漏。
 */
export function redact(yaml: string): string {
  return yaml
    .replace(/^(\s*(?:private-key|public-key|password|uuid|psk|token|secret|auth-str|api-key):\s*).*$/gim,
             (_m, p1) => `${p1}"[已打码]"`)
    // 订阅 URL 里的 token 段
    .replace(/(https?:\/\/[^\s"']*?[?&](?:token|key|auth)=)[^\s"'&]+/gi, '$1[已打码]')
    // /sub/<32位hex> 形式的订阅路径
    .replace(/(\/sub\/)[0-9a-f]{16,}/gi, '$1[已打码]');
}

/** 顶层键 → 原文区块（左闭右开行区间），保留注释与缩进 */
export interface Section {
  key: string;
  start: number;
  end: number;
  content: string;
}

/** 按顶层键切块。顶层键 = 行首非空白且形如 `key:` 的行。 */
export function splitSections(raw: string): Section[] {
  const lines = raw.split(/\r?\n/);
  const heads: { key: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):/);
    if (m) heads.push({ key: m[1], line: i });
  }
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].line : lines.length;
    return { key: h.key, start: h.line, end, content: lines.slice(h.line, end).join('\n') };
  });
}

// ---------- 能力一：拆分整份配置 ----------

export interface GroupAdvice {
  name: string;
  action: 'keep' | 'replace';
  reason: string;
  suggestedUse: string;
  /** 代码侧判定该组是否真的引用了 provider，用于和 AI 结论比对 */
  usesProvider: boolean;
  /** AI 结论与代码判定不一致，前端应高亮提示复核 */
  mismatch: boolean;
}

/** 从 proxy-providers 段取 provider 名 */
export function providerNamesOf(providersYaml: string): string[] {
  const names: string[] = [];
  for (const line of providersYaml.split(/\r?\n/)) {
    const m = line.match(/^ {2}([A-Za-z0-9_\-. ]+):\s*$/);
    if (m) names.push(m[1].trim());
  }
  return names;
}

/** 代码侧判定每个分组的 use: 是否引用了 provider */
export function detectProviderRefs(groupsYaml: string, providerNames: string[]): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const lines = groupsYaml.split(/\r?\n/);
  let cur: string | null = null;
  let inUse = false;
  for (const line of lines) {
    const nameM = line.match(/^ {2}- name:\s*"?(.+?)"?\s*$/);
    if (nameM) { cur = nameM[1]; out.set(cur, false); inUse = false; continue; }
    if (!cur) continue;
    if (/^ {4}use:/.test(line)) {
      inUse = true;
      if (providerNames.some(p => line.includes(p))) out.set(cur, true);
      continue;
    }
    if (/^ {4}\S/.test(line)) { inUse = false; continue; }
    if (inUse && providerNames.some(p => line.includes(p))) out.set(cur, true);
  }
  return out;
}

const SPLIT_PROMPT = `你是 Clash/Mihomo 配置分析器。用户会给出一段 proxy-groups YAML。
该配置原本绑定写死的 proxy-provider，现要迁移到模板系统，由订阅管理动态注入节点。
可用占位符：
- {{URL_GROUPS}}  自动生成所有订阅分组
- {{URL_GROUP_PROVIDERS:分组名}}  某分组下的 provider 列表
- {{URL_GROUP_NAMES}}  所有分组名

对每个 proxy-group 判断：
- keep   : 原样保留。proxies 指向具体节点名或其他分组（如自建/中转节点组）。
- replace: use: 引用了写死的 provider，应改为占位符。

仅输出 JSON，不要 markdown 代码块，不要额外说明。
格式: {"groups":[{"name":"组名","action":"keep|replace","reason":"简短理由","suggested_use":"replace 时给出占位符，否则空字符串"}]}`;

/**
 * 拆分整份配置：代码切块 + AI 给 proxy-groups 的改写建议。
 * 只有 proxy-groups 段会送给 AI，且已打码。
 */
export async function analyzeSplit(raw: string, cfg: AiConfig): Promise<{
  sections: { key: string; lines: number; chars: number }[];
  groups: GroupAdvice[];
  usage?: Record<string, number>;
}> {
  const sections = splitSections(raw);
  const groupsSec = sections.find(s => s.key === 'proxy-groups');
  const providersSec = sections.find(s => s.key === 'proxy-providers');
  const summary = sections.map(s => ({ key: s.key, lines: s.end - s.start, chars: s.content.length }));

  if (!groupsSec) return { sections: summary, groups: [] };

  const providerNames = providersSec ? providerNamesOf(providersSec.content) : [];
  const refs = detectProviderRefs(groupsSec.content, providerNames);

  const { text, usage } = await chat(
    [{ role: 'system', content: SPLIT_PROMPT }, { role: 'user', content: redact(groupsSec.content) }],
    cfg,
  );
  const parsed = parseJson<{ groups?: any[] }>(text);
  const groups: GroupAdvice[] = (parsed.groups ?? []).map(g => {
    const name = String(g?.name ?? '');
    const action = g?.action === 'replace' ? 'replace' as const : 'keep' as const;
    const usesProvider = refs.get(name) ?? false;
    return {
      name,
      action,
      reason: String(g?.reason ?? ''),
      suggestedUse: String(g?.suggested_use ?? ''),
      usesProvider,
      // AI 说要替换却没引用 provider，或反之，都需要人工复核
      mismatch: (action === 'replace') !== usesProvider,
    };
  });
  return { sections: summary, groups, usage };
}

// ---------- 能力二：对当前模板提问 / 改写 ----------

const EDIT_PROMPT = `你是 Clash/Mihomo 配置模板助手。用户给你一份模板和一个要求。

模板中的 {{...}} 是占位符，由服务端渲染时替换，**必须原样保留**，不要当成待填的空。
常见占位符：{{PROVIDERS}} {{PROXIES}} {{URL_GROUPS}} {{URL_GROUP_NAMES}}
{{URL_GROUP_PROVIDERS:分组名}} {{INCLUDE: 模板名}} {{SECRET:键名}} {{DOWNLOAD: url}}

若用户要求修改配置，返回完整的修改后模板；若只是提问，返回解释文字。
仅输出 JSON，不要 markdown 代码块。
格式: {"kind":"edit|answer","answer":"给用户看的说明","content":"kind=edit 时为完整的新模板内容，否则空字符串"}`;

export interface EditResult {
  kind: 'edit' | 'answer';
  answer: string;
  content: string;
  usage?: Record<string, number>;
}

/** 针对单个模板的提问或改写。含占位符的模板原样送出（不打码，否则 AI 看不懂结构）。 */
export async function editTemplate(
  templateName: string,
  templateContent: string,
  instruction: string,
  cfg: AiConfig,
  history: ChatMessage[] = [],
): Promise<EditResult> {
  const { text, usage } = await chat([
    { role: 'system', content: EDIT_PROMPT },
    ...history,
    { role: 'user', content: `模板名：${templateName}\n\n--- 模板内容 ---\n${redact(templateContent)}\n\n--- 要求 ---\n${instruction}` },
  ], cfg, { temperature: 0.2 });

  const p = parseJson<any>(text);
  return {
    kind: p?.kind === 'edit' ? 'edit' : 'answer',
    answer: String(p?.answer ?? ''),
    content: String(p?.content ?? ''),
    usage,
  };
}

// ---------- 能力三：全局问答 ----------

const ASK_PROMPT = `你是 Mihomo 订阅管理平台的助手。用户会给出平台当前的数据概览和一个问题。
基于给出的数据回答，不要编造数据里没有的内容。数据不足以回答时直接说明。
用中文回答，简洁务实，可以用 markdown。`;

/** 基于平台数据概览的自由问答。概览由调用方组装并打码。 */
export async function askGlobal(
  overview: string,
  question: string,
  cfg: AiConfig,
  history: ChatMessage[] = [],
): Promise<{ text: string; usage?: Record<string, number> }> {
  return chat([
    { role: 'system', content: ASK_PROMPT },
    ...history,
    { role: 'user', content: `--- 平台数据 ---\n${overview}\n\n--- 问题 ---\n${question}` },
  ], cfg, { temperature: 0.3 });
}
