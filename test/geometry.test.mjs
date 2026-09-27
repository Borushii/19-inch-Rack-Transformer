import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { buildRack, computeLayout, RACK } from '../src/geometry.js';
import { toSTL, to3MF, crc32 } from '../src/exporters.js';

const wasm = await Module();
wasm.setup();
const { Manifold, Mesh } = wasm;

const toManifold = (m) =>
  new Manifold(new Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

const CASES = {
  'avant 1U 250': { depth: 250 },
  'double 2U 500': { mounting: 'double', units: 2, depth: 500 },
  'double 1U 180 sans découpe': { mounting: 'double', depth: 180, bedX: 500, bedY: 500 },
  'avant 3U éclisses dessous, sans rebords': { units: 3, depth: 400, spliceSide: 'bottom', wallHeight: 0, rearLipHeight: 0, holeShape: 'round', holePattern: 'all', teardrop: false },
  'petit plateau 180': { depth: 150, bedX: 180, bedY: 180, gussets: 0, vents: false },
};

for (const [label, params] of Object.entries(CASES)) {
  test(`${label} : pièces étanches, sans collision, imprimables`, () => {
    const { layout, parts } = buildRack(wasm, params);
    assert.ok(parts.length >= 1);
    const solids = parts.map((p) => {
      const m = toManifold(p.mesh);
      assert.equal(m.status(), 'NoError', `${p.name} n'est pas un solide fermé`);
      assert.ok(m.volume() > 0, `${p.name} a un volume nul`);
      assert.ok(Math.abs(m.volume() - p.volume) < 1e-3 * p.volume + 1e-3);
      return m;
    });
    // aucune pièce ne doit en chevaucher une autre une fois assemblée
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const v = solids[i].intersect(solids[j]).volume();
        assert.ok(v < 1e-3, `collision ${parts[i].name} / ${parts[j].name} (${v.toFixed(3)} mm³)`);
      }
    }
    // chaque pièce tient sur le plateau d'impression (dans un sens ou l'autre)
    const { bedX, bedY } = layout.params;
    for (const p of parts) {
      const [a, b] = p.size;
      assert.ok((a <= bedX && b <= bedY) || (b <= bedX && a <= bedY), `${p.name} (${a.toFixed(1)} × ${b.toFixed(1)}) dépasse le plateau`);
      const pm = toManifold(p.printMesh);
      assert.ok(Math.abs(pm.boundingBox().min[2]) < 1e-4, `${p.name} n'est pas posée à z = 0`);
    }
    // la façade fait bien 19"
    const bb = solids.slice(0, layout.nx).reduce((acc, s) => {
      const b = s.boundingBox();
      return { min: Math.min(acc.min, b.min[0]), max: Math.max(acc.max, b.max[0]) };
    }, { min: Infinity, max: -Infinity });
    assert.ok(Math.abs(bb.max - bb.min - RACK.panelWidth) < 1e-3);
  });
}

test('cotes normalisées 19"', () => {
  const L = computeLayout({ units: 1 });
  assert.equal(L.earHoleX, (482.6 - 465.1) / 2);
  assert.ok(Math.abs(L.H - 43.66) < 0.01);
  assert.deepEqual(L.rackHolesZ.map((z) => +z.toFixed(3)), [5.955, 37.705]);
  assert.ok(L.bodyWidth < RACK.opening);
  const D = computeLayout({ mounting: 'double', depth: 500 });
  assert.ok(D.bodyWidth + 2 * 4 < RACK.opening, 'équerres + plateau doivent passer entre les montants');
  assert.ok(D.bracket.range.max > D.bracket.range.min);
});

test('le plateau passe entre les montants (450 mm)', () => {
  for (const mounting of ['front', 'double']) {
    const { parts } = buildRack(wasm, { mounting, depth: 200, bedX: 600, bedY: 600 });
    const body = toManifold(parts[0].mesh);
    // tout ce qui est derrière la façade doit tenir dans l'ouverture de 450 mm
    const behind = body.trimByPlane([0, 1, 0], 4.01).boundingBox();
    assert.ok(behind.max[0] - behind.min[0] <= RACK.opening, `${mounting}: ${behind.max[0] - behind.min[0]}`);
    // les équerres aussi, sauf leur patte
    for (const p of parts.filter((q) => q.kind === 'bracket')) {
      const b = toManifold(p.mesh);
      const bb = b.boundingBox();
      const flange = b.trimByPlane([0, -1, 0], -(bb.max[1] - 5.01)).boundingBox();
      assert.ok(flange.min[0] >= (482.6 - RACK.opening) / 2 - 1e-6 && flange.max[0] <= 482.6 - (482.6 - RACK.opening) / 2 + 1e-6, p.name);
    }
  }
});

test('STL binaire et 3MF valides', async () => {
  const { parts } = buildRack(wasm, { depth: 200 });
  const stl = toSTL(parts[0].printMesh);
  const dv = new DataView(stl.buffer);
  const n = dv.getUint32(80, true);
  assert.equal(n, parts[0].printMesh.indices.length / 3);
  assert.equal(stl.length, 84 + 50 * n);

  const z = await to3MF(parts.map((p) => ({ name: p.name, mesh: p.printMesh })));
  const zv = new DataView(z.buffer);
  // lecture du répertoire central
  const eocd = z.length - 22;
  assert.equal(zv.getUint32(eocd, true), 0x06054b50);
  const count = zv.getUint16(eocd + 10, true);
  let off = zv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = zv.getUint16(off + 10, true);
    const crc = zv.getUint32(off + 16, true);
    const csize = zv.getUint32(off + 20, true);
    const nlen = zv.getUint16(off + 28, true);
    const local = zv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(z.subarray(off + 46, off + 46 + nlen));
    const lnlen = zv.getUint16(local + 26, true);
    const raw = z.subarray(local + 30 + lnlen, local + 30 + lnlen + csize);
    const data = method === 8
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
      : raw;
    assert.equal(crc32(data), crc, name);
    files[name] = new TextDecoder().decode(data);
    off += 46 + nlen;
  }
  assert.ok(files['[Content_Types].xml'] && files['_rels/.rels']);
  const model = files['3D/3dmodel.model'];
  assert.equal((model.match(/<object /g) || []).length, parts.length);
  assert.equal((model.match(/<item /g) || []).length, parts.length);
  assert.match(model, /unit="millimeter"/);
});
