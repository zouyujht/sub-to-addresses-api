#!/usr/bin/env python3
"""从优选订阅生成器提取 IP:端口 列表（与 edgetunnel 逻辑对齐）。

SUB_HOST 必须通过环境变量或 Secret 提供，代码内无默认域名。
"""

from __future__ import annotations

import base64
import os
import re
import sys
from urllib.request import Request, urlopen

FAKE_UUID = "00000000-0000-4000-8000-000000000000"
FAKE_HOST = "example.com"
UA = "v2rayN/edgetunnel (https://github.com/cmliu/edgetunnel)"
ADDR_RE = re.compile(r"://[^@\s]+@([^/?#\s]+)")
REMARK_RE = re.compile(r"#(.+)$")


def normalize_endpoint(addr_port: str, default_port: str = "443") -> str | None:
    s = (addr_port or "").strip().split("/")[0].strip()
    if not s:
        return None
    if s.startswith("["):
        m = re.fullmatch(r"\[([0-9A-Fa-f:.]+)\](?::(\d{1,5}))?", s)
        if not m:
            return None
        return f"[{m.group(1)}]:{m.group(2) or default_port}"
    colons = s.count(":")
    if colons == 0:
        return f"{s}:{default_port}"
    if colons == 1:
        host, port = s.rsplit(":", 1)
        if not host or not port.isdigit():
            return None
        p = int(port)
        if not 1 <= p <= 65535:
            return None
        return f"{host}:{p}"
    return f"[{s}]:{default_port}"


def parse_subscription(text: str, default_port: str = "443") -> list[str]:
    lines = text.replace("\r\n", "\n").split("\n")
    results: list[str] = []
    seen: set[str] = set()
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if FAKE_UUID not in line or FAKE_HOST not in line:
            continue
        m = ADDR_RE.search(line)
        if not m:
            continue
        endpoint = normalize_endpoint(m.group(1), default_port)
        if not endpoint:
            continue
        remark = ""
        rm = REMARK_RE.search(line)
        if rm:
            try:
                from urllib.parse import unquote

                remark = "#" + unquote(rm.group(1))
            except Exception:
                remark = "#" + rm.group(1)
        key = endpoint.lower()
        if key in seen:
            continue
        seen.add(key)
        results.append(endpoint + remark)
    return results


def fetch_addresses(sub_host: str | None = None, default_port: str = "443") -> list[str]:
    host = (sub_host or os.environ.get("SUB_HOST") or "").strip()
    host = re.sub(r"^https?://", "", host, flags=re.I)
    host = re.sub(r"^sub://", "", host, flags=re.I)
    host = host.split("/")[0].split("?")[0].split("#")[0].strip()
    if not host:
        raise SystemExit(
            "未设置 SUB_HOST。请配置环境变量，或在 GitHub Actions 中添加 Secret SUB_HOST。"
        )

    url = f"https://{host}/sub?host={FAKE_HOST}&uuid={FAKE_UUID}"
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=30) as resp:
        body = resp.read()

    # 尝试 base64，失败则当明文
    text: str
    try:
        text = base64.b64decode(body, validate=False).decode("utf-8", errors="replace")
        # 粗略校验：解码后应像节点链接
        if "://" not in text and FAKE_UUID not in text:
            text = body.decode("utf-8", errors="replace")
    except Exception:
        text = body.decode("utf-8", errors="replace")

    return parse_subscription(text, default_port)


def main() -> None:
    default_port = os.environ.get("DEFAULT_PORT", "443")
    limit = int(os.environ.get("LIMIT", "0") or "0")
    out_path = os.environ.get("OUTPUT", "addressesapi.txt")

    addrs = fetch_addresses(default_port=default_port)
    if limit > 0:
        addrs = addrs[:limit]

    content = "\n".join(addrs) + ("\n" if addrs else "")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"写入 {out_path}，共 {len(addrs)} 条", flush=True)
    if addrs[:5]:
        print("示例:", flush=True)
        for line in addrs[:5]:
            print(f"  {line}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"失败: {exc}", file=sys.stderr)
        sys.exit(1)
