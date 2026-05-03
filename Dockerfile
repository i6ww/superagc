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

RUN corepack enable \
    && corepack prepare pnpm@10.21.0 --activate \
    && pnpm install --frozen-lockfile

# install 阶段会跑 nx postinstall，紧接着再跑 run-many 时，/tmp 或 .nx 中间态可能导致
# “Failed to process project graph”（参见 Nx issue #27582 等）；安装完成后清一下再构建
RUN rm -rf /tmp/* /builder/.nx 2>/dev/null || true

RUN pnpm run build

FROM lipanski/docker-static-website:2.4.0

WORKDIR /home/static

COPY --from=builder /builder/dist/apps/web/ /home/static

EXPOSE 80

CMD ["/busybox-httpd", "-f", "-v", "-p", "80", "-c", "httpd.conf"]
