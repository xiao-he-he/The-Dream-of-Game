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

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }

        const size = fs.statSync(filePath).size;
        res.setHeader('Content-Type', mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');

        const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
        if (req.headers.range && !range) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          res.end();
          return;
        }

        if (range) {
          const suffixLength = range[1] === '' ? Number(range[2]) : null;
          const start = suffixLength === null ? Number(range[1]) : Math.max(size - suffixLength, 0);
          const requestedEnd = suffixLength === null && range[2] !== '' ? Number(range[2]) : size - 1;
          const end = Math.min(requestedEnd, size - 1);

          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            res.end();
            return;
          }

          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          if (req.method === 'HEAD') res.end();
          else fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.setHeader('Content-Length', size);
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(filePath).pipe(res);
      });
    }
  };
}

export default defineConfig({
  base: '/The-Dream-of-Game/',
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
