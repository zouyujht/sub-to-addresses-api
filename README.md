# sub-to-addresses-api

1. 用固定占位参数请求上游 `/sub`
2. 解码 Base64 订阅
3. 从带假 UUID / `example.com` 的节点里解析出真实 `IP:端口`（或 `域名:端口`）
4. 输出纯文本列表，格式兼容 edgetunnel / gate 等项目的「优选 API」

输出示例：

```text
1.2.3.4:443#备注
cdn.example.com:2096#HK
```

---

## 配置（必做）

上游订阅生成器域名通过 **GitHub Actions Secret** 配置，不写在代码里。

1. 打开仓库 **Settings → Secrets and variables → Actions**
2. 新建 Secret：
   - Name：`SUB_HOST`
   - Secret：你的上游生成器域名（只填 host，不要带 `https://`）
3. （可选）同样可配置 Variables 或 Secrets：
   - `DEFAULT_PORT`（默认 `443`）
   - `LIMIT`（默认 `0` 表示不限制条数）

---

## 两种用法

### A. Cloudflare Worker（实时 API，推荐）

1. 打开 [Cloudflare Dashboard → Workers](https://dash.cloudflare.com/) 新建 Worker
2. 把本仓库 [`_worker.js`](./_worker.js) 全文粘贴进去并部署
3. 在 Worker **Settings → Variables** 中配置：

| 变量 | 必填 | 说明 |
|------|------|------|
| `SUB_HOST` | ✅ | 上游订阅生成器域名 |
| `DEFAULT_PORT` | ❌ | 节点无端口时的默认端口，默认 `443` |
| `LIMIT` | ❌ | 最多返回条数，`0` 表示不限制 |

访问：

- `https://你的worker.workers.dev/` 或 `/api` → 纯文本 `IP:端口#备注`
- `https://你的worker.workers.dev/?limit=10` → 只取前 10 条
- `https://你的worker.workers.dev/?port=443` → 无端口时强制补 443

把该 URL 填进 edgetunnel「自定义优选 API」或 gate 的 `OPTIMAL_API` 即可。

### B. GitHub Actions + raw 文本（静态文件）

1. 先按上文配置 Secret `SUB_HOST`
2. 打开 **Actions → Update addresses → Run workflow**（或等定时任务）
3. 成功后产物：

```text
https://raw.githubusercontent.com/zouyujht/sub-to-addresses-api/main/addressesapi.txt
```

也可在 Settings → Pages 开启 GitHub Pages，用 Pages 地址访问。

未配置 `SUB_HOST` 时 workflow 会直接失败并提示。

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
export SUB_HOST="你的上游域名"
python fetch_addresses.py
```

---

## 免责声明

仅供学习与个人研究。请遵守上游服务条款与当地法律法规；节点可用性与内容由第三方提供，本仓库不作任何保证。
