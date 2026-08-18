---
type: Project Overview
title: docs agent notes
description: Mintlify 文档站。写页面、改导航时走仓库内 Mintlify skill。
---

# docs

文档根目录就是仓库根目录（`docs.json` + `*.mdx`）。

- 个人笔记在 `notes/`
- Agent 约定在 `notes/agents/`
- 公开 skill 表在 `notes/skills/`
- 生态索引在 `indexes/`
- 站点维护说明在 `usage-guide/`

写文档、改 `docs.json`、加组件时先读：

- `.agents/skills/mintlify`
- `.agents/skills/mintlify-docs`
- `.agents/skills/mintlify-api`

这三条指向 `~/.agents/skill-library/`，不要在仓库里再复制一份 SKILL.md。

生态索引漏收仓库时用 `.codex/skills/gh-repo-intel`。
