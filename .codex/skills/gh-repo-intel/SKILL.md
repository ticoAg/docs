---
name: gh-repo-intel
description: 获取 GitHub 仓库基础信息（description、topics、stars、语言、最近更新、最新 release、README 摘要），并基于 docs 仓库的 `indexes/agent-ecosystem.mdx` 主类目给出归类建议与可直接插入的条目（bullet）。适用于：只给出仓库名/URL 想快速判断它“做什么”；维护/更新 `indexes/agent-ecosystem.mdx`（尤其从 Stars Lists：agent / agent-plugin 整理条目）。
---

# gh-repo-intel

## Overview

运行 `scripts/repo_intel.py` 拉取并汇总 GitHub 仓库信息，输出结构化 JSON（便于后续自动化）和 `indexes/agent-ecosystem.mdx` 兼容的条目文本（便于直接插入）。

## 快速开始

1. 获取仓库信息 + 生成条目（不写文件）

   - 纯 JSON（推荐给 Codex 继续处理）：
     - `python3 .codex/skills/gh-repo-intel/scripts/repo_intel.py owner/repo --json`
   - 人类可读 + 同时包含 JSON：
     - `python3 .codex/skills/gh-repo-intel/scripts/repo_intel.py owner/repo`

2. 生成条目时指定来源（Stars list）

   - `python3 .codex/skills/gh-repo-intel/scripts/repo_intel.py owner/repo --source agent`
   - `python3 .codex/skills/gh-repo-intel/scripts/repo_intel.py owner/repo --source agent-plugin`
   - 多来源：`--source agent,agent-plugin`

3. （可选）写入 `indexes/agent-ecosystem.mdx`

   - 先让用户确认 `--section`（归类主类目）与 `--source`（来源），再写入：
     - `python3 .codex/skills/gh-repo-intel/scripts/repo_intel.py owner/repo --section 'MCP（协议/SDK/Servers/合集）' --source agent --apply`

## 工作流（建议）

1. 规范化输入：优先使用 `owner/repo` 或 `https://github.com/owner/repo`。
2. 拉取信息：优先走 `gh repo view ... --json ...`（已登录时最稳定）。
3. 可选读取 README：抓取 `README` 原文并截取摘要（默认启用；可用 `--no-readme` 关闭）。
4. 给出归类建议：根据 `description/topics/README` 命中关键词，给出 1–3 个 `indexes/agent-ecosystem.mdx` 的候选 `##` 主类目。
5. 生成条目：输出与 `indexes/agent-ecosystem.mdx` 现有格式一致的 bullet。
6. 写入前确认：只有当用户明确确认主类目与来源时才执行 `--apply`，并确保幂等（避免重复插入）。

## 脚本：`scripts/repo_intel.py`

### 输出（稳定契约）

默认输出包含两部分：

- 人类可读摘要（含 repo 链接、stars、语言、topics、最近更新、最新 release、README 摘要）
- 结构化 JSON（字段包括：`repo`、`url`、`description`、`topics`、`stars`、`primary_language`、`languages_top`、`license`、`pushed_at`、`latest_release`、`readme_excerpt`、`suggested_sections`、`mdx_bullet`）

使用 `--json` 时只输出 JSON（推荐）。

### 关键参数

- `--json`：只输出 JSON
- `--source agent[,agent-plugin]`：写入条目时的“来自：”字段
- `--section <标题>`：指定写入到 `indexes/agent-ecosystem.mdx` 的 `##` 主类目（配合 `--apply`）
- `--mdx <path>`：指定索引文件路径（默认 `indexes/agent-ecosystem.mdx`）
- `--apply`：直接修改 `--mdx` 指定文件（默认不写文件）
- `--no-readme`：不抓取 README 摘要（更快、更少噪声）

### 约束与注意

- 需要 `gh` 已登录（`gh auth status`）。若未登录，建议先登录再运行以避免 API 速率限制。
- `--apply` 会做去重：如果 `owner/repo` 已存在于目标文件中，则不会重复插入。
- `--apply` 会尽量按该 section 内 `⭐ stars` 降序插入；无法解析 stars 时退化为追加到 section 末尾。

## references/

`references/` 预留给后续扩展（例如：对 `indexes/agent-ecosystem.mdx` 的类目说明、归类关键词约定等）。当前版本不要求加载。
