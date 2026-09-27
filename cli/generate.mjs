#!/usr/bin/env node
// Génération en ligne de commande :
//   node cli/generate.mjs --depth 300 --mounting double --units 2 --out out/
// Toutes les options de DEFAULTS (src/geometry.js) sont acceptées sous la forme --nom valeur.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Module from 'manifold-3d';
import { buildRack, DEFAULTS } from '../src/geometry.js';
import { toSTL, to3MF } from '../src/exporters.js';

const args = process.argv.slice(2);
const params = {};
let outDir = 'out';
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, '');
  const val = args[i + 1];
  if (key === 'help' || key === 'h') {
    console.log('Options :', Object.entries(DEFAULTS).map(([k, v]) => `--${k} (${v})`).join(' '), '--out <dossier>');
    process.exit(0);
  }
  i++;
  if (key === 'out') outDir = val;
  else if (key in DEFAULTS) params[key] = val;
  else {
    console.error(`Option inconnue : --${key}`);
    process.exit(1);
  }
}

const wasm = await Module();
wasm.setup();
const { layout, parts } = buildRack(wasm, params);
await mkdir(outDir, { recursive: true });
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const base = `plateau-19p-${layout.params.units}U-${layout.D}mm${layout.params.mounting === 'double' ? '-double' : ''}`;
for (const part of parts) {
  await writeFile(join(outDir, `${base}-${slug(part.name)}.stl`), toSTL(part.printMesh, part.name));
}
await writeFile(join(outDir, `${base}.3mf`), await to3MF(parts.map((p) => ({ name: p.name, mesh: p.printMesh })), { bedWidth: layout.params.bedX }));
for (const w of layout.warnings) console.warn('⚠', w);
console.log(`${parts.length} pièce(s) → ${outDir}/`);
for (const p of parts) console.log(`  - ${p.name} : ${p.size.map((v) => v.toFixed(1)).join(' × ')} mm`);
if (layout.bracket?.range) console.log(`Écartement des montants compatible : ${layout.bracket.range.min.toFixed(0)} – ${layout.bracket.range.max.toFixed(0)} mm`);
