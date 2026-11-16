/**
 * sub-to-addresses-api — Cloudflare Worker
 * 模仿 edgetunnel「优选订阅生成器」提取逻辑，输出纯文本 IP:端口 列表。
 *
 * 环境变量（可选）：
 *   SUB_HOST      上游生成器域名，默认 339389037wtkr.sub.hhauv.de5.net
 *   DEFAULT_PORT  缺省端口，默认 443
 *   LIMIT         最多返回条数，0 表示不限制
 */

const FAKE_UUID = '00000000-0000-4000-8000-000000000000';
const FAKE_HOST = 'example.com';
const DEFAULT_SUB_HOST = '339389037wtkr.sub.hhauv.de5.net';
const UA =
  'v2rayN/edgetunnel (https://github.com/cmliu/edgetunnel)';

function normalizeEndpoint(addrPort, defaultPort) {
  if (!addrPort) return null;
  let s = String(addrPort).trim();
  if (!s) return null;

  // 去掉路径等杂质
  s = s.split('/')[0].trim();

  // [IPv6]:port
  if (s.startsWith('[')) {
    const m = s.match(/^\[([0-9A-Fa-f:.]+)\](?::(\d{1,5}))?$/);
    if (!m) return null;
    const port = m[2] || defaultPort;
    return `[${m[1]}]:${port}`;
  }

  const colons = (s.match(/:/g) || []).length;
  if (colons === 0) {
    return `${s}:${defaultPort}`;
  }
  if (colons === 1) {
    const [host, port] = s.split(':');
    if (!host || !/^\d{1,5}$/.test(port)) return null;
    const p = Number(port);
    if (p < 1 || p > 65535) return null;
    return `${host}:${p}`;
  }
  // 裸 IPv6
  return `[${s}]:${defaultPort}`;
}

function parseSubscriptionText(text, defaultPort) {
  const lines = text.includes('\r\n') ? text.split('\r\n') : text.split('\n');
  const results = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = (raw || '').trim();
    if (!line) continue;
    if (!line.includes(FAKE_UUID) || !line.includes(FAKE_HOST)) continue;

    // vless://uuid@host:port?...#remark  或 ss://...@host:port#remark
    const addrMatch = line.match(/:\/\/[^@\s]+@([^/?#\s]+)/);
    if (!addrMatch) continue;

    const endpoint = normalizeEndpoint(addrMatch[1], defaultPort);
    if (!endpoint) continue;

    let remark = '';
    const remarkMatch = line.match(/#(.+)$/);
    if (remarkMatch) {
      try {
        remark = '#' + decodeURIComponent(remarkMatch[1]);
      } catch {
        remark = '#' + remarkMatch[1];
      }
    }

    const key = endpoint.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(endpoint + remark);
  }
  return results;
}

async function fetchAddresses(subHost, defaultPort) {
  const host = String(subHost || DEFAULT_SUB_HOST)
    .replace(/^https?:\/\//i, '')
    .replace(/^sub:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .trim();

  if (!host) throw new Error('SUB_HOST 为空');

  const url = `https://${host}/sub?host=${FAKE_HOST}&uuid=${FAKE_UUID}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': UA },
  });

  if (!response.ok) {
    throw new Error(`上游返回 ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  let plain;
  try {
    // 多数订阅生成器返回 base64；若已是明文则回退
    plain = atob(body.replace(/\s/g, ''));
  } catch {
    plain = body;
  }

  return parseSubscriptionText(plain, defaultPort);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path !== '/' && path !== '/api' && path !== '/addressesapi.txt') {
      return new Response('Not Found', { status: 404 });
    }

    const subHost = url.searchParams.get('sub') || env.SUB_HOST || DEFAULT_SUB_HOST;
    const defaultPort =
      url.searchParams.get('port') || env.DEFAULT_PORT || '443';
    let limit = Number(url.searchParams.get('limit') || env.LIMIT || '0');
    if (!Number.isFinite(limit) || limit < 0) limit = 0;

    try {
      let list = await fetchAddresses(subHost, String(defaultPort));
      if (limit > 0) list = list.slice(0, limit);

      const body = list.join('\n') + (list.length ? '\n' : '');
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
          'X-Count': String(list.length),
        },
      });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      return new Response(`# error: ${msg}\n`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
