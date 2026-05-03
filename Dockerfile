FROM node:22 AS builder

WORKDIR /builder

COPY . /builder

# pnpm 10+ skips dependency lifecycle scripts unless allowlisted (breaks Nx / esbuild without this)
ENV NPM_TOKEN=""

RUN corepack enable \
    && corepack prepare pnpm@10.21.0 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm run build

FROM lipanski/docker-static-website:2.4.0

WORKDIR /home/static

COPY --from=builder /builder/dist/apps/web/ /home/static

EXPOSE 80

CMD ["/busybox-httpd", "-f", "-v", "-p", "80", "-c", "httpd.conf"]
