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

## 发布变更

在你的 [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) 安装我们的 GitHub App，用于将仓库变更同步到线上部署。将更改推送到默认分支后，会自动部署到生产环境。

## 需要帮助？

### 故障排查

- 如果本地开发环境无法运行：执行 `mint update` 确保 CLI 为最新版本。
- 如果页面打开是 404：确认你是在包含有效 `docs.json` 的目录中运行 `mint dev`。

### 资源
- [Mintlify 官方文档](https://mintlify.com/docs)
