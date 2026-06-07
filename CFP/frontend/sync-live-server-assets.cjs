const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distAssetsDir = path.join(rootDir, 'dist', 'assets');
const liveAssetsDir = path.join(rootDir, 'assets');
const livePreviewSource = path.join(rootDir, 'live-preview.js');
const livePreviewDist = path.join(rootDir, 'dist', 'live-preview.js');

if (!fs.existsSync(distAssetsDir)) {
  console.error('Build assets were not found in frontend/dist/assets.');
  process.exit(1);
}

fs.rmSync(liveAssetsDir, { recursive: true, force: true });
fs.cpSync(distAssetsDir, liveAssetsDir, { recursive: true });
fs.copyFileSync(livePreviewSource, livePreviewDist);

console.log('Synced frontend/assets for Live Server.');
