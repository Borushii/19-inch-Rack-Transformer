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
  'façade pleine, éclisses vissées': { frontStyle: 'full', joint: 'splice', depth: 300 },
  'façade ajourée 2U, double, éclisses': { frontStyle: 'grid', mounting: 'double', units: 2, depth: 450, joint: 'splice' },
  'façade ajourée 1U clés papillon': { frontStyle: 'grid', depth: 350 },
  'ouverte 4U profonde': { units: 4, depth: 600, mounting: 'double' },
  'avant 3U éclisses dessous, sans rebords': { units: 3, depth: 400, joint: 'splice', frontStyle: 'full', spliceSide: 'bottom', wallHeight: 0, rearLipHeight: 0, holeShape: 'round', holePattern: 'all', teardrop: false },
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

test('clés papillon : mortaises dans les deux tronçons, clés à part', () => {
  const { layout, parts } = buildRack(wasm, { depth: 250, vents: false });
  assert.equal(layout.nx, 2);
  const bodies = parts.filter((p) => p.kind === 'body');
  const keys = parts.filter((p) => p.kind === 'key');
  assert.equal(bodies.length, 2);
  assert.ok(keys.length >= 1 && keys.every((k) => k.quantity >= 1));
  const seam = layout.xs[0];
  // les tronçons sont coupés net sur la coupe
  const [a, b] = bodies.map((p) => toManifold(p.mesh).boundingBox());
  assert.ok(Math.abs(a.max[0] - seam) < 1e-3 && Math.abs(b.min[0] - seam) < 1e-3);
  // chaque clé est à cheval sur la coupe, moitié dans chaque tronçon
  for (const k of keys) {
    for (const piece of toManifold(k.mesh).decompose()) {
      const kb = piece.boundingBox();
      const along = kb.max[0] - kb.min[0] > kb.max[1] - kb.min[1] + 1e-6 ? 0 : 1;
      if (along === 0) assert.ok(Math.abs((kb.min[0] + kb.max[0]) / 2 - seam) < 1e-3);
    }
    // la pièce à imprimer est une seule clé posée à plat
    const single = toManifold(k.printMesh);
    assert.ok(Math.abs(single.volume() * k.quantity - k.volume) < 1e-3 * k.volume);
  }
  // clés + tronçons ≈ plateau d'un seul tenant (le jeu enlève très peu)
  const full = buildRack(wasm, { depth: 250, vents: false, bedX: 600, bedY: 600 }).parts[0].volume;
  const sum = parts.reduce((s, p) => s + p.volume, 0);
  assert.ok(sum < full && full - sum < 0.01 * full, `${full} vs ${sum}`);
});

test('clés papillon cachées : insérées par-dessous, face du dessus intacte', () => {
  for (const params of [{ depth: 300, units: 2, frontStyle: 'full' }, { depth: 250 }]) {
    const { layout, parts } = buildRack(wasm, params);
    const { tb, params: P } = layout;
    const bodies = parts.filter((p) => p.kind === 'body').map((p) => toManifold(p.mesh));
    const body = Manifold.union(bodies);
    const keys = parts.filter((p) => p.kind === 'key');
    assert.ok(keys.length);
    let checked = 0;
    for (const k of keys) {
      for (const inst of toManifold(k.mesh).decompose()) {
        const b = inst.boundingBox();
        const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
        const thin = size.indexOf(Math.min(...size));
        if (thin !== 2) continue; // clés du fond
        // la clé affleure la face du dessous et s'arrête sous la peau
        assert.ok(Math.abs(b.min[2]) < 1e-4, 'clé du fond insérée par-dessous');
        assert.ok(Math.abs(b.max[2] - (tb - P.keySkin)) < 1e-4);
        // la peau au-dessus de la clé est pleine : rien n'est visible sur le dessus
        const skin = Manifold.cube([size[0], size[1], P.keySkin - 0.02]).translate([b.min[0], b.min[1], tb - P.keySkin + 0.01]);
        const filled = body.intersect(skin).volume();
        assert.ok(Math.abs(filled - skin.volume()) < 1e-3, `peau percée (${filled} / ${skin.volume()})`);
        checked++;
      }
    }
    assert.ok(checked > 0);
  }
});

test('clés papillon : ergots de clipsage logés dans des gorges', () => {
  const opts = { depth: 250, vents: false };
  const withSnap = buildRack(wasm, { ...opts, keySnap: true });
  const noSnap = buildRack(wasm, { ...opts, keySnap: false });
  const key = (r) => r.parts.find((p) => p.kind === 'key' && p.name.includes('3 mm'));
  const [ks, kn] = [key(withSnap), key(noSnap)];
  const e = withSnap.layout.params.snapHeight;
  // la clé à ergots dépasse de la saillie à chaque bout
  const len = (k) => Math.max(...k.size.slice(0, 2));
  assert.ok(Math.abs(len(ks) - len(kn) - 2 * e) < 1e-3, `${len(ks)} vs ${len(kn)}`);
  // sans gorge, l'ergot serait en conflit avec la paroi de la mortaise (clipsage en force)
  const bodyNoGroove = Manifold.union(noSnap.parts.filter((p) => p.kind === 'body').map((p) => toManifold(p.mesh)));
  assert.ok(bodyNoGroove.intersect(toManifold(ks.mesh)).volume() > 0.01);
  // avec gorge, aucune collision une fois clipsée
  const body = Manifold.union(withSnap.parts.filter((p) => p.kind === 'body').map((p) => toManifold(p.mesh)));
  assert.ok(body.intersect(toManifold(ks.mesh)).volume() < 1e-3);
});

test('façade : ouverte < ajourée < pleine (matière)', () => {
  const v = (frontStyle) => buildRack(wasm, { frontStyle, depth: 200, bedX: 600, bedY: 600, gussets: 0 }).parts[0].volume;
  const [o, g, f] = [v('open'), v('grid'), v('full')];
  assert.ok(o < g && g < f, `${o} ${g} ${f}`);
});

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

  const z = await to3MF(parts.map((p) => ({ name: p.name, mesh: p.printMesh, quantity: p.quantity })));
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
  assert.equal((model.match(/<item /g) || []).length, parts.reduce((n, p) => n + p.quantity, 0));
  assert.match(model, /unit="millimeter"/);
});
