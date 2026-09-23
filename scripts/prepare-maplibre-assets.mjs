import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', 'maplibre-gl', 'dist');
const destination = path.join(root, 'public', 'vendor', 'maplibre-gl');
const assets = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

fs.mkdirSync(destination, { recursive: true });
for (const asset of assets) {
  const sourcePath = path.join(source, asset);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing MapLibre runtime asset: ${sourcePath}`);
  fs.copyFileSync(sourcePath, path.join(destination, asset));
}

console.log(`[prepare-maplibre] copied ${assets.length} worker assets to ${destination}`);
