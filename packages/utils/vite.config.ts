/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

const dockerLowMemBuild = process.env.AITU_DOCKER_BUILD === '1';

export default defineConfig({
  // 默认 root=cwd 时 outDir 会从仓库根错误解析到 /dist（Linux 容器告警）；锚定在包目录
  root: __dirname,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AituUtils',
      formats: dockerLowMemBuild ? ['es'] : ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
    },
    rollupOptions: {
      external: [],
      ...(dockerLowMemBuild ? { maxParallelFileOps: 2 } : {}),
    },
    sourcemap: !dockerLowMemBuild,
    reportCompressedSize: !dockerLowMemBuild,
    outDir: '../../dist/utils',
  },
  plugins: dockerLowMemBuild
    ? []
    : [
        dts({
          entryRoot: 'src',
          outDir: '../../dist/utils',
        }),
      ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
