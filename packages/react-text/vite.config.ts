/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const dockerLowMemBuild = process.env.AITU_DOCKER_BUILD === '1';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/react-text',

  plugins: [
    react(),
    nxViteTsPaths(),
    ...(dockerLowMemBuild
      ? []
      : [
          dts({
            entryRoot: 'src',
            tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
          }),
        ]),
  ],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: '../../dist/react-text',
    emptyOutDir: true,
    reportCompressedSize: !dockerLowMemBuild,
    sourcemap: !dockerLowMemBuild,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: 'src/index.ts',
      name: 'react-text',
      fileName: 'index',
      formats: dockerLowMemBuild ? ['es'] : ['es', 'cjs'],
    },
    rollupOptions: {
      ...(dockerLowMemBuild ? { maxParallelFileOps: 2 } : {}),
      // External packages that should not be bundled into your library.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'slate', 'slate-react', 'slate-history', 'is-hotkey', '@plait/text-plugins', '@plait/common'],
    },
  },
  resolve: {
    alias: {
      '@plait': path.resolve(__dirname, 'src'), // 根据项目结构调整路径
      'react-text': path.resolve(__dirname, 'packages/react-text/src'), // 配置 lib 包的别名
    },
  },
});
