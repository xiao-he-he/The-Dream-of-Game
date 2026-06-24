import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const distRoot = path.resolve(workspaceRoot, 'dist');
const folders = ['content', '文章', 'music', 'video', '概念设计图', '排版及平设参考图'];

function copyDirectory(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

for (const folder of folders) {
  const source = path.resolve(workspaceRoot, folder);
  if (!fs.existsSync(source)) continue;
  copyDirectory(source, path.resolve(distRoot, folder));
}

console.log(`Copied ${folders.length} workspace asset folders to dist.`);
