#!/usr/bin/env node
/**
 * WARP 出口检测器。
 *
 * 通过本机正在运行的 mihomo 逐个切换 MASQUE 节点，实测每个节点的真实出口
 * 国家与可用性 —— 这是 Worker 侧做不到的：Cloudflare Workers 不能建立
 * UDP/QUIC 出站连接，也没有本机代理可借道。
 *
 * 注意：本工具不能让 WARP 从指定国家出口，只能在节点实际落到的出口里挑选。
 *
 * 前提：mihomo 正在运行，且配置里已加载 WARP 节点（见 template/warp-proxies.yaml）。
 *
 * 用法:
 *   node src/scripts/warp-egress.mjs --secret <controller密钥>
 *   node src/scripts/warp-egress.mjs --secret <controller密钥> --prefer US,JP --apply
 */

import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const HELP = `用法: node src/scripts/warp-egress.mjs [参数]

  --controller <url>  mihomo external-controller，默认 http://127.0.0.1:9090
  --secret <str>      controller 密钥
  --proxy <url>       本机混合代理，默认 http://127.0.0.1:7890
  --filter <正则>     节点名过滤，默认 ^CDN \\| （与 warp-group 模板一致）
  --prefer <国家码>   期望出口，逗号分隔，如 US,JP,SG
  --group <组名>      用于切换的策略组，默认自动选择
  --apply             把最优节点选进该组（默认只检测不改动）
  --json <路径>       额外输出 JSON 报告
  --limit <n>         只测前 n 个节点，用于快速试跑
  --timeout <秒>      单次出口探测超时，默认 10
  --trace <url>       出口探测地址，默认 Cloudflare cdn-cgi/trace
`;

function parseArgs(argv) {
  const o = {
    controller: 'http://127.0.0.1:9090',
    secret: '',
    proxy: 'http://127.0.0.1:7890',
    filter: '^CDN \\| ',
    prefer: [],
    group: '',
    apply: false,
    json: '',
    limit: 0,
    timeout: 10,
    trace: 'https://www.cloudflare.com/cdn-cgi/trace',
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    switch (a) {
      case '--controller': o.controller = next().replace(/\/$/, ''); break;
      case '--secret':     o.secret = next(); break;
      case '--proxy':      o.proxy = next(); break;
      case '--filter':     o.filter = next(); break;
      case '--group':      o.group = next(); break;
      case '--json':       o.json = next(); break;
      case '--limit':      o.limit = Number(next()) || 0; break;
      case '--timeout':    o.timeout = Number(next()) || 10; break;
      case '--trace':      o.trace = next(); break;
      case '--prefer':     o.prefer = next().split(',').map(s => s.trim().toUpperCase()).filter(Boolean); break;
      case '--apply':      o.apply = true; break;
      case '-h': case '--help': o.help = true; break;
      default:
        if (a.startsWith('-')) { console.error(`未知参数: ${a}`); process.exit(2); }
    }
  }
  return o;
}

const COUNTRY = {
  US: '美国', SG: '新加坡', JP: '日本', HK: '香港', TW: '台湾', KR: '韩国',
  GB: '英国', DE: '德国', FR: '法国', NL: '荷兰', CA: '加拿大', AU: '澳大利亚',
  CH: '瑞士', SE: '瑞典', FI: '芬兰', IT: '意大利', ES: '西班牙', PL: '波兰',
  BR: '巴西', IN: '印度', ID: '印尼', MY: '马来西亚', TH: '泰国', VN: '越南',
};
const cn = code => (code && COUNTRY[code]) ? `${code} ${COUNTRY[code]}` : (code || '—');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 走 curl 而非 fetch：Node 的 fetch 不读 HTTP_PROXY，引代理库又要多一个依赖 */
async function api(opt, path, method = 'GET', body) {
  const args = ['-s', '-m', '10', '-X', method, `${opt.controller}${path}`];
  if (opt.secret) args.push('-H', `Authorization: Bearer ${opt.secret}`);
  if (body !== undefined) {
    args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  }
  const { stdout } = await exec('curl', args, { maxBuffer: 32 * 1024 * 1024 });
  if (!stdout.trim()) return {};
  try { return JSON.parse(stdout); } catch { return { _raw: stdout }; }
}

/** 经本机代理请求，拿到当前选中节点的真实出口 */
async function probeEgress(opt) {
  const args = [
    '-s', '-m', String(opt.timeout), '-x', opt.proxy, opt.trace,
  ];
  try {
    const { stdout } = await exec('curl', args, { maxBuffer: 1024 * 1024 });
    const t = {};
    for (const line of stdout.trim().split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) t[line.slice(0, i)] = line.slice(i + 1);
    }
    if (!t.ip) return null;
    return { ip: t.ip, loc: (t.loc || '').toUpperCase(), colo: t.colo || '' };
  } catch { return null; }
}

/** mihomo 自带延迟测试，同时用来判断节点能否真正建连 */
async function delayTest(opt, node) {
  const url = encodeURIComponent('http://cp.cloudflare.com/generate_204');
  const r = await api(opt, `/proxies/${encodeURIComponent(node)}/delay?timeout=5000&url=${url}`);
  return typeof r.delay === 'number' ? r.delay : null;
}

async function main() {
  const opt = parseArgs(process.argv);
  if (opt.help) { console.log(HELP); return; }

  console.log('=== WARP 出口检测 ===');
  console.log('Controller :', opt.controller);
  console.log('本机代理   :', opt.proxy);
  console.log('节点过滤   :', opt.filter);
  console.log('期望出口   :', opt.prefer.length ? opt.prefer.join(' > ') : '(不限)');
  console.log('');

  let data;
  try {
    data = await api(opt, '/proxies');
  } catch (e) {
    console.error('[错误] 无法连接 mihomo controller:', e.message);
    console.error('请确认 mihomo 正在运行，以及 --controller / --secret 是否正确。');
    process.exit(1);
  }
  if (data.message === 'Unauthorized') {
    console.error('[错误] controller 拒绝访问：secret 不正确，用 --secret 指定。');
    process.exit(1);
  }

  const proxies = data.proxies || {};
  let re;
  try { re = new RegExp(opt.filter); }
  catch { console.error(`[错误] --filter 不是合法正则: ${opt.filter}`); process.exit(2); }

  let nodes = Object.keys(proxies).filter(n => re.test(n) && !Array.isArray(proxies[n].all));
  if (!nodes.length) {
    console.error(`[错误] 没有匹配 ${opt.filter} 的节点。`);
    console.error('当前配置可能尚未加载 WARP 节点，或改用 --filter 指定别的正则。');
    process.exit(1);
  }
  if (opt.limit) nodes = nodes.slice(0, opt.limit);

  // 选一个能切换这些节点的 Selector；用户显式指定时优先
  let group = opt.group;
  if (!group) {
    const cand = Object.values(proxies).filter(
      g => g.type === 'Selector' && Array.isArray(g.all) && nodes.some(n => g.all.includes(n)),
    );
    // WARP 节点占比最高的组最可能是专用组
    cand.sort((a, b) =>
      b.all.filter(n => nodes.includes(n)).length - a.all.filter(n => nodes.includes(n)).length);
    group = cand[0]?.name ?? '';
  }
  if (!group) {
    console.error('[错误] 找不到可切换的 Selector 策略组，请用 --group 指定。');
    process.exit(1);
  }
  if (!Array.isArray(proxies[group]?.all)) {
    console.error(`[错误] 策略组 ${group} 不存在或不可切换。`);
    process.exit(1);
  }

  const original = proxies[group]?.now ?? '';
  const testable = nodes.filter(n => proxies[group].all.includes(n));
  if (!testable.length) {
    console.error(`[错误] 策略组 ${group} 不包含任何待测节点，请用 --group 换一个。`);
    process.exit(1);
  }

  console.log(`使用策略组 : ${group}（当前 ${original || '—'}）`);
  console.log(`待测节点   : ${testable.length} 个\n`);

  const rows = [];
  const width = String(testable.length).length;
  let restored = false;

  // 中途 Ctrl+C 也要把策略组恢复原状，不能把用户的线路留在检测中间态
  const restore = async () => {
    if (restored || !original) return;
    restored = true;
    try {
      await api(opt, `/proxies/${encodeURIComponent(group)}`, 'PUT', { name: original });
      console.log(`\n已恢复 ${group} → ${original}`);
    } catch { /* 恢复失败不影响退出 */ }
  };
  process.on('SIGINT', async () => { await restore(); process.exit(130); });

  for (let i = 0; i < testable.length; i++) {
    const node = testable[i];
    const tag = `[${String(i + 1).padStart(width)}/${testable.length}]`;
    process.stdout.write(`${tag} ${node.padEnd(30)} `);

    await api(opt, `/proxies/${encodeURIComponent(group)}`, 'PUT', { name: node });
    await sleep(350); // 给 mihomo 一点时间，让新连接走上刚切换的节点

    const delay = await delayTest(opt, node);
    if (delay === null) {
      console.log('✗ 不可用');
      rows.push({ node, alive: false, delay: null, ip: null, loc: null, colo: null });
      continue;
    }

    const eg = await probeEgress(opt);
    if (!eg) {
      console.log(`△ ${delay}ms，但取不到出口`);
      rows.push({ node, alive: true, delay, ip: null, loc: null, colo: null });
      continue;
    }
    console.log(`✓ ${String(delay).padStart(4)}ms  出口 ${cn(eg.loc).padEnd(10)} ${eg.ip}`);
    rows.push({ node, alive: true, delay, ...eg });
  }

  // 排序：可用优先 → 期望国家靠前 → 延迟低
  const rank = r => [
    r.alive ? 0 : 1,
    (() => { const i = opt.prefer.indexOf(r.loc || ''); return i === -1 ? opt.prefer.length : i; })(),
    r.delay ?? Number.MAX_SAFE_INTEGER,
  ];
  const sorted = [...rows].sort((a, b) => {
    const x = rank(a), y = rank(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });

  const alive = rows.filter(r => r.alive);
  const byLoc = {};
  for (const r of alive) if (r.loc) byLoc[r.loc] = (byLoc[r.loc] || 0) + 1;

  console.log('\n=== 汇总 ===');
  console.log(`可用 ${alive.length}/${rows.length}`);
  const locs = Object.entries(byLoc).sort((a, b) => b[1] - a[1]);
  console.log('出口分布 :', locs.length ? locs.map(([k, v]) => `${cn(k)}×${v}`).join('  ') : '—');

  const top = sorted.filter(r => r.alive).slice(0, 10);
  if (top.length) {
    console.log('\n前 10 名:');
    top.forEach((r, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${r.node.padEnd(30)} ${String(r.delay).padStart(4)}ms  ${cn(r.loc)}`);
    });
  }

  if (opt.prefer.length && alive.length) {
    const hit = alive.filter(r => opt.prefer.includes(r.loc));
    if (!hit.length) {
      console.log(`\n注意：没有任何节点落在期望出口 ${opt.prefer.join('/')}。`);
      console.log('WARP 的出口由 Cloudflare 决定，换端口或入口都改变不了，只能在实际出口里挑。');
    }
  }

  const best = sorted.find(r => r.alive);
  if (opt.apply && best) {
    restored = true; // 有意停在最优节点，跳过恢复
    await api(opt, `/proxies/${encodeURIComponent(group)}`, 'PUT', { name: best.node });
    console.log(`\n已将 ${group} 选中 → ${best.node}（${cn(best.loc)}，${best.delay}ms）`);
  } else {
    await restore();
    if (!opt.apply) console.log('加 --apply 可自动选中最优节点。');
  }

  if (opt.json) {
    writeFileSync(opt.json, JSON.stringify({
      generatedAt: new Date().toISOString(),
      controller: opt.controller, group, prefer: opt.prefer, results: sorted,
    }, null, 2), 'utf8');
    console.log(`报告已写入 ${opt.json}`);
  }
}

main().catch(e => { console.error('[异常]', e); process.exit(1); });
