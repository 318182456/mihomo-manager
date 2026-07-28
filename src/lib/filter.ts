/**
 * 订阅组筛选表达式。
 *
 * 有两种存储形态，需保持与后端既有约定一致：
 *  - 普通模式：直接存正则字符串
 *  - 高级模式：存 JSON `{"advanced":true,"rules":[...]}`，由前端编译成正则
 */

export interface FilterRule {
  logic: 'or' | 'and' | 'not';
  value: string;
}

const ADVANCED_PREFIX = '{"advanced":true';

export function isAdvanced(filter: string | undefined): boolean {
  return !!filter?.startsWith(ADVANCED_PREFIX);
}

export function parseRules(filter: string | undefined): FilterRule[] {
  if (!isAdvanced(filter)) return [];
  try {
    return JSON.parse(filter!).rules ?? [];
  } catch {
    return [];
  }
}

export function serializeRules(rules: FilterRule[]): string {
  return JSON.stringify({ advanced: true, rules });
}

/** 把存储形态编译为可直接用于 RegExp 的字符串；空串表示不过滤 */
export function compileFilter(filter: string | undefined): string {
  if (!filter) return '';
  if (!isAdvanced(filter)) return filter;

  const rules = parseRules(filter);
  const or = rules.filter(r => r.logic === 'or').map(r => r.value).filter(Boolean);
  const and = rules.filter(r => r.logic === 'and').map(r => r.value).filter(Boolean);
  const not = rules.filter(r => r.logic === 'not').map(r => r.value).filter(Boolean);

  let regex = '^';
  if (or.length > 0) regex += `(?=.*(${or.join('|')}))`;
  for (const a of and) regex += `(?=.*${a})`;
  if (not.length > 0) regex += `(?!.*(${not.join('|')}))`;
  regex += '.*$';

  return regex === '^.*$' ? '' : regex;
}

/** 编译并校验，返回可用的匹配函数与错误信息 */
export function buildMatcher(filter: string | undefined): {
  match: (name: string) => boolean;
  error: string | null;
} {
  const pattern = compileFilter(filter);
  if (!pattern) return { match: () => true, error: null };
  try {
    const re = new RegExp(pattern);
    return { match: (name: string) => re.test(name), error: null };
  } catch (e) {
    return { match: () => false, error: e instanceof Error ? e.message : '正则表达式无效' };
  }
}
