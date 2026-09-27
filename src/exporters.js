// Export STL (binaire) et 3MF (archive ZIP) — sans dépendance externe.

/** STL binaire à partir d'une liste de maillages { positions, indices }. */
export function toSTL(meshes, name = 'rack') {
  const list = Array.isArray(meshes) ? meshes : [meshes];
  const triCount = list.reduce((n, m) => n + m.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `19in rack shelf - ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, triCount, true);
  let o = 84;
  for (const { positions: P, indices: I } of list) {
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
      o += 12;
      for (const v of [a, b, c]) {
        dv.setFloat32(o, P[v], true);
        dv.setFloat32(o + 4, P[v + 1], true);
        dv.setFloat32(o + 8, P[v + 2], true);
        o += 12;
      }
      dv.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

const xmlEscape = (s) =>
  String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

/**
 * Fichier 3MF contenant un objet par pièce, disposées côte à côte sur le plateau.
 * @param items Array<{ name, mesh: {positions, indices}, quantity? }>  maillages déjà orientés pour
 *   l'impression ; une pièce en plusieurs exemplaires est placée `quantity` fois (même objet).
 */
export async function to3MF(items, { spacing = 10, bedWidth = 256 } = {}) {
  const fmt = (v) => (Math.round(v * 1e4) / 1e4).toString();
  const objects = [];
  const build = [];
  // Rangement simple en lignes
  let cx = 0, cy = 0, rowH = 0;
  items.forEach((item, idx) => {
    const id = idx + 1;
    const { positions: P, indices: I } = item.mesh;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      minX = Math.min(minX, P[i]); maxX = Math.max(maxX, P[i]);
      minY = Math.min(minY, P[i + 1]); maxY = Math.max(maxY, P[i + 1]);
      minZ = Math.min(minZ, P[i + 2]);
    }
    const w = maxX - minX, d = maxY - minY;
    const place = () => {
      if (cx > 0 && cx + w > Math.max(bedWidth, w)) { cx = 0; cy += rowH + spacing; rowH = 0; }
      const tx = cx - minX, ty = cy - minY, tz = -minZ;
      cx += w + spacing;
      rowH = Math.max(rowH, d);
      build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/>`);
    };
    const copies = Math.max(1, Math.round(item.quantity || 1));
    for (let k = 0; k < copies; k++) place();

    const verts = [];
    for (let i = 0; i < P.length; i += 3) verts.push(`<vertex x="${fmt(P[i])}" y="${fmt(P[i + 1])}" z="${fmt(P[i + 2])}"/>`);
    const tris = [];
    for (let i = 0; i < I.length; i += 3) tris.push(`<triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`);
    objects.push(
      `<object id="${id}" name="${xmlEscape(item.name)}" type="model"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`,
    );
  });

  const model =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    '<metadata name="Application">19-inch Rack Transformer</metadata>' +
    `<resources>${objects.join('')}</resources><build>${build.join('')}</build></model>`;
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
    '</Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
    '</Relationships>';
  const enc = new TextEncoder();
  return zip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ]);
}

// --- ZIP minimal (DEFLATE via CompressionStream si disponible) -------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const deflated = await deflateRaw(f.data);
    const method = deflated && deflated.length < f.data.length ? 8 : 0;
    const body = method === 8 ? deflated : f.data;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, body);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, method, true);
    cen.setUint16(12, 0, true);
    cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, body.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of all) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
