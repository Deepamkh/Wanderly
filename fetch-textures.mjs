// Downloads the NASA Blue Marble / Black Marble globe textures into public/textures
// so the app works without any CDN. Usage: npm run textures   (then set VITE_GLOBE_LOCAL=1)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CDN = 'https://unpkg.com/three-globe/example/img';
const FILES = ['earth-blue-marble.jpg', 'earth-night.jpg', 'earth-topology.png'];
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/textures');

await fs.mkdir(out, { recursive: true });
for (const f of FILES) {
  const res = await fetch(`${CDN}/${f}`);
  if (!res.ok) throw new Error(`Failed to download ${f}: ${res.status}`);
  await fs.writeFile(path.join(out, f), Buffer.from(await res.arrayBuffer()));
  console.log('✔', f);
}
console.log(`Saved to ${out}. Add VITE_GLOBE_LOCAL=1 to client/.env to use them.`);
