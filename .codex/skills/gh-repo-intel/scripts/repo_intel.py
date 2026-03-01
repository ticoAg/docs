#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable
from urllib.parse import urlparse


class RepoIntelError(RuntimeError):
    pass


def _run(cmd: list[str], *, cwd: str | None = None) -> str:
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or "").strip()
        raise RepoIntelError(f"命令执行失败：{' '.join(cmd)}\n{stderr}") from e
    return proc.stdout


def _has_gh() -> bool:
    try:
        subprocess.run(
            ["gh", "--version"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return True
    except Exception:
        return False


def _normalize_repo(repo_or_url: str) -> str:
    raw = repo_or_url.strip()
    if not raw:
        raise RepoIntelError("repo 不能为空；请使用 owner/repo 或 https://github.com/owner/repo")

    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        if parsed.netloc not in {"github.com", "www.github.com"}:
            raise RepoIntelError(f"仅支持 github.com URL：{raw}")
        path = parsed.path.strip("/")
        parts = path.split("/")
        if len(parts) < 2:
            raise RepoIntelError(f"无法从 URL 解析 owner/repo：{raw}")
        return f"{parts[0]}/{parts[1]}"

    # owner/repo
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", raw):
        return raw

    raise RepoIntelError(
        "无法解析仓库标识；请使用 owner/repo 或 https://github.com/owner/repo（避免仅给 repo 名导致歧义）"
    )


def _format_int(n: int | None) -> str | None:
    if n is None:
        return None
    return f"{n:,}"


def _truncate(s: str | None, *, max_len: int) -> str | None:
    if not s:
        return s
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1].rstrip() + "…"


def _parse_sections_from_mdx(mdx_path: str) -> list[str]:
    if not os.path.exists(mdx_path):
        return []
    sections: list[str] = []
    with open(mdx_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("## "):
                sections.append(line.removeprefix("## ").strip())
    return sections


def _score_sections(
    *,
    available_sections: Iterable[str],
    text: str,
) -> list[dict[str, Any]]:
    normalized_text = text.lower()
    sections = list(available_sections)

    # 先按 section 标题本身做粗分类：这样 indexes/agent-ecosystem.mdx 的分类标题调整后仍能工作
    def infer_category(section_title: str) -> str:
        s = section_title.lower()
        if "mcp" in s:
            return "mcp"
        if "prompt" in s:
            return "prompt"
        if "skill" in s or "技能" in section_title:
            return "skills"
        if "sandbox" in s or "沙盒" in section_title:
            return "sandbox"
        if "gateway" in s or "proxy" in s or "网关" in section_title:
            return "gateway"
        if "tools" in s or "tool" in s or "工具" in section_title or "自动化" in section_title:
            return "tools"
        if "context" in s or "检索" in section_title or "记忆" in section_title or "上下文" in section_title:
            return "context"
        if "framework" in s or "框架" in section_title:
            return "agent_framework"
        if "cli" in s or "终端" in section_title or "tui" in s:
            return "agent_cli"
        if "编排" in section_title or "工作台" in section_title or "调度" in section_title or "ui" in s:
            return "orchestration"
        if "其他" in section_title or "other" in s:
            return "other"
        return "other"

    category_keywords: dict[str, list[str]] = {
        "agent_cli": [
            "codex",
            "claude code",
            "gemini cli",
            "qwen",
            "terminal",
            "cli",
            "tui",
            "coding agent",
            "code agent",
            "lsp",
        ],
        "orchestration": [
            "workstation",
            "scheduler",
            "dashboard",
            "desktop",
            "web ui",
            "ui",
            "kanban",
            "orchestration",
            "orchestrator",
        ],
        "agent_framework": [
            "agent framework",
            "multi-agent",
            "multi agent",
            "agentic",
            "autogen",
            "crew",
            "langgraph",
            "langchain",
            "swarm",
            "agents",
        ],
        "prompt": ["prompt engineering", "prompt", "prompts", "system prompt"],
        "gateway": [
            "gateway",
            "proxy",
            "router",
            "switch",
            "compatible api",
            "openai compatible",
            "api proxy",
        ],
        "tools": ["tool", "tools", "plugin", "automation", "playwright", "puppeteer", "browser"],
        "mcp": ["mcp", "model context protocol", "fastmcp", "sdk", "server"],
        "context": [
            "rag",
            "retrieval",
            "embedding",
            "vector",
            "index",
            "indexing",
            "semantic search",
            "code search",
            "memory",
            "context",
            "knowledge base",
        ],
        "skills": ["skill catalog", "skill", "skills", "rules"],
        "sandbox": ["sandbox", "container", "docker", "kubernetes", "runtime", "e2b"],
        "other": [],
    }

    scored: list[dict[str, Any]] = []
    for section in sections:
        category = infer_category(section)
        keywords = category_keywords.get(category, [])
        score = 0
        hits: list[str] = []
        for kw in keywords:
            if kw and kw in normalized_text:
                score += 1
                if len(hits) < 6:
                    hits.append(kw)
        # 如果完全没命中，也保留一个兜底候选（通常是“其他”）
        scored.append({"section": section, "score": score, "hits": hits, "category": category})

    # 更偏向非 0 分；分数相同则更偏向非 other
    def sort_key(x: dict[str, Any]) -> tuple[int, int, str]:
        other_penalty = 1 if x.get("category") == "other" else 0
        return (int(x.get("score") or 0), -other_penalty, str(x.get("section") or ""))

    scored.sort(key=sort_key, reverse=True)
    top = scored[:3]
    # 若 top 全是 0 分，尽量把“其他”留到最后
    if top and all((t.get("score") or 0) == 0 for t in top):
        top.sort(key=lambda x: (x.get("category") == "other", str(x.get("section") or "")))
    return top


def _gh_repo_view(repo: str) -> dict[str, Any]:
    fields = [
        "nameWithOwner",
        "url",
        "description",
        "homepageUrl",
        "stargazerCount",
        "forkCount",
        "watchers",
        "primaryLanguage",
        "languages",
        "licenseInfo",
        "createdAt",
        "pushedAt",
        "updatedAt",
        "latestRelease",
        "repositoryTopics",
        "isArchived",
        "isFork",
        "isTemplate",
        "isPrivate",
    ]
    out = _run(["gh", "repo", "view", repo, "--json", ",".join(fields)])
    return json.loads(out)


def _gh_readme_excerpt(repo: str, *, max_chars: int = 1200, max_lines: int = 60) -> str | None:
    owner, name = repo.split("/", 1)
    try:
        raw = _run(
            [
                "gh",
                "api",
                "-H",
                "Accept: application/vnd.github.raw",
                f"repos/{owner}/{name}/readme",
            ]
        )
    except RepoIntelError:
        return None

    # 清洗：去掉过长内容，但尽量保留“这仓库做什么”的段落
    lines = [ln.rstrip("\n") for ln in raw.splitlines()]
    picked: list[str] = []
    for ln in lines:
        if ln.strip() == "":
            if picked and picked[-1] == "":
                continue
            picked.append("")
        else:
            picked.append(ln)
        if len(picked) >= max_lines:
            break

    excerpt = "\n".join(picked).strip()
    excerpt = excerpt[: max_chars + 50]
    excerpt = excerpt.strip()
    if len(excerpt) > max_chars:
        excerpt = excerpt[:max_chars].rstrip() + "…"
    return excerpt or None


def _extract_topics(repo_view: dict[str, Any]) -> list[str]:
    topics = repo_view.get("repositoryTopics") or []
    out: list[str] = []
    for item in topics:
        name = (item or {}).get("name")
        if isinstance(name, str) and name.strip():
            out.append(name.strip())
    return out


def _extract_languages_top(repo_view: dict[str, Any], *, top_n: int = 5) -> list[str]:
    langs = repo_view.get("languages") or []
    items: list[tuple[str, int]] = []
    for item in langs:
        node = (item or {}).get("node") or {}
        name = node.get("name")
        size = item.get("size")
        if isinstance(name, str) and isinstance(size, int):
            items.append((name, size))
    items.sort(key=lambda x: x[1], reverse=True)
    return [name for name, _ in items[:top_n]]


def _build_mdx_bullet(
    *,
    name_with_owner: str,
    url: str,
    description: str | None,
    primary_language: str | None,
    stars: int | None,
    source: str | None,
) -> str:
    desc = _truncate(description, max_len=180) or ""

    meta_parts: list[str] = []
    if primary_language:
        meta_parts.append(primary_language)
    if stars is not None:
        meta_parts.append(f"⭐ {_format_int(stars)}")
    if source:
        meta_parts.append(f"来自：{source}")

    meta = f"（{'；'.join(meta_parts)}）" if meta_parts else ""
    mid = f" — {desc}" if desc else ""
    return f"- [{name_with_owner}]({url}){mid}{meta}"


_STARS_RE = re.compile(r"⭐\s*([0-9][0-9,]*)")


def _parse_stars_from_line(line: str) -> int | None:
    m = _STARS_RE.search(line)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _apply_to_mdx(
    *,
    mdx_path: str,
    section: str,
    repo_slug: str,
    bullet: str,
    stars: int | None,
) -> dict[str, Any]:
    if not os.path.exists(mdx_path):
        raise RepoIntelError(f"找不到目标文件：{mdx_path}")

    with open(mdx_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    if any(repo_slug in ln for ln in lines):
        return {"updated": False, "reason": "duplicate"}

    heading = f"## {section}"
    heading_idx = next((i for i, ln in enumerate(lines) if ln.strip() == heading), None)
    if heading_idx is None:
        available = [ln.removeprefix("## ").strip() for ln in lines if ln.startswith("## ")]
        raise RepoIntelError(
            "未找到 section 标题；请从以下候选中选择：\n- " + "\n- ".join(available)
        )

    # section 范围：heading 之后到下一个 heading/EOF
    start = heading_idx + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("## ")), len(lines))

    # 找插入点：尽量按 stars 降序插入；否则追加到 section 末尾
    insert_at = end
    if stars is not None:
        for i in range(start, end):
            ln = lines[i]
            if not ln.lstrip().startswith("- ["):
                continue
            existing = _parse_stars_from_line(ln)
            if existing is None:
                continue
            if stars > existing:
                insert_at = i
                break

    bullet_line = bullet.rstrip("\n") + "\n"
    lines.insert(insert_at, bullet_line)

    with open(mdx_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    return {"updated": True, "reason": "inserted", "insert_at": insert_at + 1}


@dataclass(frozen=True)
class Args:
    repo: str
    json_only: bool
    mdx_path: str
    section: str | None
    apply: bool
    source: str | None
    no_readme: bool


def _parse_args(argv: list[str]) -> Args:
    p = argparse.ArgumentParser(
        prog="repo_intel.py",
        description="抓取 GitHub 仓库基础信息，并为 indexes/agent-ecosystem.mdx 生成/插入条目。",
    )
    p.add_argument("repo", help="owner/repo 或 https://github.com/owner/repo")
    p.add_argument("--json", dest="json_only", action="store_true", help="仅输出 JSON")
    p.add_argument(
        "--mdx",
        dest="mdx_path",
        default="indexes/agent-ecosystem.mdx",
        help="索引文件路径（默认：indexes/agent-ecosystem.mdx）",
    )
    p.add_argument("--section", help="写入到指定的 ## 主类目（配合 --apply）")
    p.add_argument("--apply", action="store_true", help="直接修改 --mdx 指定文件（默认不写文件）")
    p.add_argument(
        "--source",
        help="条目来源（用于生成 '来自：' 字段），例如：agent 或 agent-plugin 或 agent,agent-plugin",
    )
    p.add_argument("--no-readme", action="store_true", help="不抓取 README 摘要（更快）")
    ns = p.parse_args(argv)

    source = None
    if ns.source:
        parts = [s.strip() for s in ns.source.split(",") if s.strip()]
        if parts:
            source = ", ".join(parts)

    return Args(
        repo=ns.repo,
        json_only=ns.json_only,
        mdx_path=ns.mdx_path,
        section=ns.section,
        apply=ns.apply,
        source=source,
        no_readme=ns.no_readme,
    )


def main(argv: list[str]) -> int:
    args = _parse_args(argv)

    if not _has_gh():
        raise RepoIntelError("未检测到 gh（GitHub CLI）；请先安装并登录 gh。")

    repo = _normalize_repo(args.repo)
    repo_view = _gh_repo_view(repo)

    name_with_owner = repo_view.get("nameWithOwner") or repo
    url = repo_view.get("url") or f"https://github.com/{repo}"
    description = repo_view.get("description")
    stars = repo_view.get("stargazerCount")
    primary_language = (repo_view.get("primaryLanguage") or {}).get("name")

    topics = _extract_topics(repo_view)
    languages_top = _extract_languages_top(repo_view)
    license_name = (repo_view.get("licenseInfo") or {}).get("name")
    pushed_at = repo_view.get("pushedAt")

    latest_release = repo_view.get("latestRelease") or None

    readme_excerpt = None if args.no_readme else _gh_readme_excerpt(repo)

    mdx_sections = _parse_sections_from_mdx(args.mdx_path)
    combined_text = " ".join(
        [
            str(name_with_owner or ""),
            str(description or ""),
            " ".join(topics),
            str(readme_excerpt or ""),
        ]
    )
    suggested_sections = _score_sections(available_sections=mdx_sections, text=combined_text)

    mdx_bullet = _build_mdx_bullet(
        name_with_owner=name_with_owner,
        url=url,
        description=description,
        primary_language=primary_language,
        stars=stars if isinstance(stars, int) else None,
        source=args.source,
    )

    payload: dict[str, Any] = {
        "repo": name_with_owner,
        "url": url,
        "description": description,
        "homepage_url": repo_view.get("homepageUrl"),
        "topics": topics,
        "stars": stars,
        "forks": repo_view.get("forkCount"),
        "watchers": (repo_view.get("watchers") or {}).get("totalCount"),
        "primary_language": primary_language,
        "languages_top": languages_top,
        "license": license_name,
        "created_at": repo_view.get("createdAt"),
        "pushed_at": pushed_at,
        "updated_at": repo_view.get("updatedAt"),
        "latest_release": latest_release,
        "readme_excerpt": readme_excerpt,
        "suggested_sections": suggested_sections,
        "mdx_bullet": mdx_bullet,
        "mdx_path": args.mdx_path,
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }

    apply_result = None
    if args.apply:
        if not args.section:
            raise RepoIntelError("使用 --apply 时必须提供 --section（目标 ## 主类目标题）。")
        stars_int = stars if isinstance(stars, int) else None
        apply_result = _apply_to_mdx(
            mdx_path=args.mdx_path,
            section=args.section,
            repo_slug=name_with_owner,
            bullet=mdx_bullet,
            stars=stars_int,
        )
        payload["apply_result"] = apply_result

    if args.json_only:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        return 0

    # 人类可读输出（不泄露任何 token）
    sys.stdout.write(f"Repo: {name_with_owner}\n")
    sys.stdout.write(f"URL: {url}\n")
    if description:
        sys.stdout.write(f"Description: {description}\n")
    if primary_language:
        sys.stdout.write(f"Primary language: {primary_language}\n")
    if languages_top:
        sys.stdout.write("Languages (top): " + ", ".join(languages_top) + "\n")
    if topics:
        sys.stdout.write("Topics: " + ", ".join(topics) + "\n")
    if isinstance(stars, int):
        sys.stdout.write(f"Stars: {_format_int(stars)}\n")
    if pushed_at:
        sys.stdout.write(f"Pushed at: {pushed_at}\n")
    if latest_release:
        sys.stdout.write(
            "Latest release: "
            + ", ".join(
                [
                    str(latest_release.get("tagName") or ""),
                    str(latest_release.get("publishedAt") or ""),
                    str(latest_release.get("url") or ""),
                ]
            ).strip(", ")
            + "\n"
        )

    if suggested_sections:
        sys.stdout.write("Suggested sections:\n")
        for s in suggested_sections:
            hits = f"（命中：{', '.join(s.get('hits') or [])}）" if s.get("hits") else ""
            sys.stdout.write(f"- {s.get('section')} (score={s.get('score')}){hits}\n")

    sys.stdout.write("\nMDX bullet:\n")
    sys.stdout.write(mdx_bullet + "\n")

    if apply_result:
        sys.stdout.write("\nApply result:\n")
        sys.stdout.write(json.dumps(apply_result, ensure_ascii=False) + "\n")

    sys.stdout.write("\n--- JSON ---\n")
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except RepoIntelError as e:
        sys.stderr.write(str(e).rstrip() + "\n")
        raise SystemExit(2)
