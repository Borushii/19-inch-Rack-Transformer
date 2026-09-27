// Worker de calcul : construit la géométrie hors du thread d'affichage.
import Module from 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.4/manifold.js';
import { buildRack } from './geometry.js';

const ready = Module().then((wasm) => {
  wasm.setup();
  return wasm;
});

self.onmessage = async (e) => {
  const { id, params } = e.data;
  try {
    const wasm = await ready;
    const t0 = performance.now();
    const { layout, parts } = buildRack(wasm, params);
    const transfer = [];
    for (const p of parts) {
      transfer.push(p.mesh.positions.buffer, p.mesh.indices.buffer, p.printMesh.positions.buffer, p.printMesh.indices.buffer);
      if (p.explodeMesh) transfer.push(p.explodeMesh.positions.buffer, p.explodeMesh.indices.buffer);
    }
    self.postMessage({ id, layout, parts, ms: performance.now() - t0 }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
