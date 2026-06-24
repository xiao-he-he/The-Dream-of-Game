import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const exposedFolders = ['content', '文章', 'music', 'video', '概念设计图', '排版及平设参考图'];

const mimeTypes = {
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

function exposeWorkspaceFolders() {
  return {
    name: 'tdg-expose-workspace-folders',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const pathname = decodeURIComponent(new URL(req.url, 'http://tdg.local').pathname);
        const firstSegment = pathname.split('/').filter(Boolean)[0];

        if (!exposedFolders.includes(firstSegment)) {
          next();
          return;
        }

        const basePath = path.resolve(workspaceRoot, firstSegment);
        const filePath = path.resolve(workspaceRoot, pathname.slice(1));

        if (filePath !== basePath && !filePath.startsWith(basePath + path.sep)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          next();
          return;
        }

        res.setHeader('Content-Type', mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), exposeWorkspaceFolders()],
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
