FROM node:22 AS builder

WORKDIR /builder

COPY . /builder

RUN corepack enable \
    && corepack prepare pnpm@9 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm run build

FROM lipanski/docker-static-website:2.4.0

WORKDIR /home/static

COPY --from=builder /builder/dist/apps/web/ /home/static

EXPOSE 80

CMD ["/busybox-httpd", "-f", "-v", "-p", "80", "-c", "httpd.conf"]
