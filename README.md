# Mintlify 起步套件

使用本起步套件，可以快速完成文档站点的部署，并开始进行个性化定制。

点击仓库顶部绿色的 **Use this template** 按钮，复制一份 Mintlify 起步套件。起步套件包含以下示例：

- 指南页面（Guides）
- 导航（Navigation）
- 定制项（Customizations）
- API 参考页（API reference）
- 常用组件的用法示例

**[查看完整快速开始指南](https://starter.mintlify.com/quickstart)**

## 本地开发

安装 [Mintlify CLI](https://www.npmjs.com/package/mint) 以在本地预览文档改动。安装命令如下：

```
npm i -g mint
```

在文档仓库根目录（也就是 `docs.json` 所在目录）运行：

```
mint dev
```

在浏览器中打开 `http://localhost:3000` 查看本地预览。

## 文档维护工作流

### 1) 使用指南（Usage Guide）

- 站点入口页：`index.mdx`
- 主要内容位于：`usage-guide/`（用于保持本地目录结构与页面层级一致）

### 2) Agent 生态索引

索引页：`indexes/agent-ecosystem.mdx`（按 repo 类型分组，并在条目中保留关键英文术语）。

**检查 Stars Lists 是否有漏收录 repo（推荐在提交前跑一次）**

```
node scripts/stars/check-star-lists.mjs
```

配置文件：`scripts/stars/star-lists.config.json`（脚本会自动处理分页；后续新增 Stars list：在这里加一条 `{ key, url }` 即可）。

如果检查提示某个 repo “Missing in index”，推荐用 `.codex/skills/gh-repo-intel` 先拉取仓库信息并生成可直接插入的条目，再按对应类目补到 `indexes/agent-ecosystem.mdx`。

**自动更新 ⭐ Star 数（GitHub Action）**

- 工作流：`.github/workflows/update-agent-ecosystem.yml`
- 脚本：`scripts/update-agent-ecosystem.mjs`
- 触发方式：定时（每周）或手动触发；工作流会自动创建 PR（避免每次 push 后自动写回 main，导致本地频繁需要 pull）

## 发布变更

在你的 [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) 安装我们的 GitHub App，用于将仓库变更同步到线上部署。将更改推送到默认分支后，会自动部署到生产环境。

## 需要帮助？

### 故障排查

- 如果本地开发环境无法运行：执行 `mint update` 确保 CLI 为最新版本。
- 如果页面打开是 404：确认你是在包含有效 `docs.json` 的目录中运行 `mint dev`。

### 资源
- [Mintlify 官方文档](https://mintlify.com/docs)
