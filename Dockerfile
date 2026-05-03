FROM node:22 AS builder

# Nx 在计算图/文件哈希时可能调用 git；官方 node 镜像默认不带 git
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /builder

COPY . /builder

# 静态部署只需 Vite 工程推断；ESLint / Playwright 插件在部分容器环境里加载配置会拖垮项目图（无 --verbose 时仅显示泛型错误）
RUN node <<'NODE'
const fs = require('fs');
const p = '/builder/nx.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.plugins = (j.plugins || []).filter(
  (pl) =>
    pl.plugin !== '@nx/eslint/plugin' &&
    pl.plugin !== '@nx/playwright/plugin'
);
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
NODE

# pnpm 10+ skips dependency lifecycle scripts unless allowlisted (see package.json pnpm.onlyBuiltDependencies)
# Docker / CI：关闭 daemon，避免图解析异常
ENV NPM_TOKEN=""
ENV CI=true
ENV NX_DAEMON=false
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# 小内存 VPS：8192 易与系统抢物理内存触发 OOM killer；可用 --build-arg NODE_MAX_OLD_SPACE_SIZE=6144 加大
ARG NODE_MAX_OLD_SPACE_SIZE=3072
ENV NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}
# 各包 vite.config：跳过 dts、仅 ESM、关 sourcemap、压低并行（见 AITU_DOCKER_BUILD）
ENV AITU_DOCKER_BUILD=1

RUN corepack enable \
    && corepack prepare pnpm@10.21.0 --activate \
    && pnpm install --frozen-lockfile

# install 阶段会跑 nx postinstall；清缓存减少异常中间态
RUN rm -rf /tmp/* /builder/.nx 2>/dev/null || true

# 不执行 `nx run-many -t=build`：在部分 Docker 环境 Nx 项目图仍会失败。
# 以下顺序与 `nx run web:build` 一致：先构建依赖库，再 web（tsc + 主包 + Service Worker）
RUN node scripts/update-version.js \
  && pnpm exec vite build --config packages/utils/vite.config.ts \
  && pnpm exec vite build --config packages/react-text/vite.config.ts \
  && pnpm exec vite build --config packages/react-board/vite.config.ts \
  && pnpm exec vite build --config packages/drawnix/vite.config.ts \
  && (cd apps/web && pnpm exec tsc -p tsconfig.app.json --noEmit) \
  && (cd apps/web && pnpm exec vite build) \
  && (cd apps/web && pnpm exec vite build -c vite.sw.config.ts)

FROM lipanski/docker-static-website:2.4.0

WORKDIR /home/static

COPY --from=builder /builder/dist/apps/web/ /home/static

EXPOSE 80

CMD ["/busybox-httpd", "-f", "-v", "-p", "80", "-c", "httpd.conf"]
