#!/usr/bin/env node
/**
 * setup-kv.mjs
 * 部署前自动创建/获取 KV namespace 并将 id 写入 wrangler.toml
 * 使用 Cloudflare REST API，需要环境变量：
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRANGLER_TOML = resolve(__dirname, '../wrangler.toml');
const KV_TITLE = 'mihomo-manager-kv';
const PLACEHOLDER = 'KV_NAMESPACE_ID_PLACEHOLDER';

const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CF_TOKEN || !CF_ACCOUNT) {
  console.error('❌ 缺少环境变量：CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces`;
const HEADERS = {
  'Authorization': `Bearer ${CF_TOKEN}`,
  'Content-Type': 'application/json',
};

async function cfFetch(url, options = {}) {
  const res = await fetch(url, { headers: HEADERS, ...options });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`CF API 错误: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

// 查询已有 namespace
const listResp = await cfFetch(`${BASE}?per_page=100`);
let ns = listResp.result.find(n => n.title === KV_TITLE);

if (ns) {
  console.log(`✅ KV namespace 已存在: ${KV_TITLE} (${ns.id})`);
} else {
  console.log(`📦 创建 KV namespace: ${KV_TITLE}`);
  const createResp = await cfFetch(BASE, {
    method: 'POST',
    body: JSON.stringify({ title: KV_TITLE }),
  });
  ns = createResp.result;
  console.log(`✅ 已创建: ${ns.id}`);
}

// 将 id 写入 wrangler.toml（替换占位符或更新已有 id）
let toml = readFileSync(WRANGLER_TOML, 'utf8');

if (toml.includes(PLACEHOLDER)) {
  toml = toml.replace(PLACEHOLDER, ns.id);
} else {
  // 替换已有 id 行（支持重复执行）
  toml = toml.replace(
    /^(id\s*=\s*)"[a-f0-9]{32}"/m,
    `$1"${ns.id}"`,
  );
}

writeFileSync(WRANGLER_TOML, toml, 'utf8');
console.log(`📝 wrangler.toml 已更新 → id = "${ns.id}"`);
