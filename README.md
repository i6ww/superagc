<div align="center">
  <h1>SuperTu</h1>
  <p>SuperTu（开图）· 基于画布工作区的 AI 创作平台</p>
  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" /></a>
  </p>
</div>

## 项目简介

SuperTu 是一个基于画布工作区（Plait）的 AI 创作平台，支持：

- 多模型图片/视频生成（含 `nano-banana-*` 等模型）
- 任务队列与生成进度追踪
- 素材库缓存与画布插入
- 流程图、思维导图、自由绘制与文本编辑

平台核心理念：**在同一画布中完成“生成 - 编辑 - 组织 - 导出”**。

## 主要特性

- **统一 AI 输入与模型路由**：不同模型可在同一交互入口切换调用
- **任务队列**：支持重试、状态恢复、结果回填
- **媒体与缓存体系**：结合 Service Worker + Cache Storage + IndexedDB
- **插件化架构**：`withXxx` 组合扩展，便于功能拆分与维护
- **本地优先体验**：自动保存、导入导出（JSON / PNG / JPG）

## 技术栈

- React 18 + TypeScript
- Vite + Nx（Monorepo）
- Plait + Slate
- TDesign React
- pnpm workspace

## 仓库结构

```text
apps/
  web/                 # Web 应用入口（Vite）
packages/
  drawnix/             # 画布与 AI 业务核心
  react-board/         # Plait React 适配层
  react-text/          # 文本编辑与渲染
docs/                  # 项目文档
```

## 快速开始

### 1) 环境要求

- Node.js >= 18（建议 LTS）
- pnpm >= 8

### 2) 安装依赖

```bash
pnpm install
```

### 3) 启动开发环境

```bash
pnpm start
```

默认地址：`http://localhost:7200`

## 常用命令

```bash
# 开发
pnpm start

# 质量检查
pnpm check
pnpm typecheck
pnpm lint
pnpm test

# 构建
pnpm run build
pnpm run build:web
```

## 本地开发说明（重要）

### Service Worker

为避免本地调试时 SW 造成的缓存/模块干扰，项目在 localhost 默认关闭 SW。  
如需在本地强制开启 SW，请使用：

```text
http://localhost:7200/?sw=1
```

### 自定义 API 网关（CORS）

本地开发已支持通过 Vite 代理转发到自定义网关，减少浏览器 CORS 问题。  
生产环境仍建议在网关/Nginx 层正确配置 CORS 或同源反代。

## 品牌与静态资源

- 项目对外名称：`SuperTu`
- 反馈二维码默认走 `apps/web/public/image.png`

## 贡献指南（简版）

1. 新建分支开发：`feature/*` / `fix/*`
2. 提交前执行：
   - `pnpm check`
   - `pnpm test`（如改动涉及逻辑）
3. 使用规范提交信息（Conventional Commits）

## 许可证

[MIT](./LICENSE)
