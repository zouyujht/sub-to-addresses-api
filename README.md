# sub-to-addresses-api

模仿 [edgetunnel](https://github.com/cmliu/edgetunnel) 中「优选订阅生成器」逻辑：

1. 用固定占位参数请求上游 `/sub`
2. 解码 Base64 订阅
3. 从带假 UUID / `example.com` 的节点里解析出真实 `IP:端口`（或 `域名:端口`）
4. 输出纯文本列表，格式兼容 edgetunnel / gate 等项目的「优选 API」

输出示例（与 `https://cf.090227.xyz/ct?ips=6&port=443` 同类）：

```text
1.2.3.4:443#备注
cdn.example.com:2096#HK
```

---

## 两种用法

### A. Cloudflare Worker（实时 API，推荐）

1. 打开 [Cloudflare Dashboard → Workers](https://dash.cloudflare.com/) 新建 Worker
2. 把本仓库 [`_worker.js`](./_worker.js) 全文粘贴进去并部署
3. （可选）在 Worker 设置里加环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `SUB_HOST` | `339389037wtkr.sub.hhauv.de5.net` | 上游订阅生成器域名 |
| `DEFAULT_PORT` | `443` | 节点无端口时的默认端口 |
| `LIMIT` | `0` | 最多返回条数，`0` 表示不限制 |

访问：

- `https://你的worker.workers.dev/` 或 `/api` → 纯文本 `IP:端口#备注`
- `https://你的worker.workers.dev/?limit=10` → 只取前 10 条
- `https://你的worker.workers.dev/?port=443` → 无端口时强制补 443

把该 URL 填进 edgetunnel「自定义优选 API」或 gate 的 `OPTIMAL_API` 即可。

### B. GitHub Actions + raw 文本（静态文件）

1. 仓库已包含 [`.github/workflows/update.yml`](./.github/workflows/update.yml)
2. Actions → **Update addresses** → Run workflow（或等定时任务）
3. 成功后产物：

```text
https://raw.githubusercontent.com/zouyujht/sub-to-addresses-api/main/addressesapi.txt
```

也可在 Settings → Pages 开启 GitHub Pages，用 Pages 地址访问。

环境变量（workflow 里可改）：

| 变量 | 默认 |
|------|------|
| `SUB_HOST` | `339389037wtkr.sub.hhauv.de5.net` |

---

## 请求上游时用的固定参数（与 edgetunnel 一致）

```text
GET https://{SUB_HOST}/sub?host=example.com&uuid=00000000-0000-4000-8000-000000000000
User-Agent: v2rayN/edgetunnel (https://github.com/cmliu/edgetunnel)
```

解析规则：

- 行内同时包含 `00000000-0000-4000-8000-000000000000` 与 `example.com` → 视为优选 IP 行
- 用正则从 `协议://...@地址:端口?...#备注` 中提取 `地址:端口` 与备注
- 其余行忽略（或可按需扩展）

---

## 本地试跑

```bash
python fetch_addresses.py
# 或
SUB_HOST=339389037wtkr.sub.hhauv.de5.net python fetch_addresses.py
```

---

## 免责声明

仅供学习与个人研究。请遵守上游服务条款与当地法律法规；节点可用性与内容由第三方提供，本仓库不作任何保证。
