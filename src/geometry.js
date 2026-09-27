// Générateur géométrique de plateaux 19" pour baie informatique.
//
// Repère (mm) : X = largeur (0 → 482,6), Y = profondeur (0 = face avant,
// vers l'arrière), Z = hauteur (0 = dessous du plateau).
//
// Le module ne dépend que de manifold-3d (passé en paramètre) afin de
// fonctionner à l'identique dans le navigateur et dans Node.

export const RACK = {
  panelWidth: 482.6, // largeur hors-tout d'une façade 19"
  holeSpacing: 465.1, // entraxe horizontal des trous de fixation
  opening: 450, // passage libre entre les montants
  unit: 44.45, // 1U
  panelGap: 0.79, // jeu vertical standard (façade 1U = 43,66 mm)
  holeOffsets: [6.35, 22.225, 38.1], // position des trous dans chaque U
};

export const DEFAULTS = {
  units: 1,
  depth: 250,
  mounting: 'front', // 'front' = fixation avant seule, 'double' = avant + arrière

  frontStyle: 'open', // 'open' (ouverte), 'grid' (ajourée en losanges), 'full' (pleine)
  frontLipHeight: 12, // façade ouverte : hauteur du rebord avant (0 = aucun)
  gridSize: 18, // façade ajourée : diagonale des losanges
  gridRib: 4, // façade ajourée : largeur des nervures
  frontThickness: 4,
  baseThickness: 3,
  bodyClearance: 1, // jeu entre le plateau et les montants (par côté)

  wallHeight: 20, // rebords latéraux (0 = aucun)
  wallThickness: 3,
  rearLipHeight: 10, // rebord arrière (0 = aucun)
  rearLipThickness: 3,
  gussets: 4, // renforts triangulaires façade / fond
  gussetThickness: 3,

  holeShape: 'slot', // 'slot' (oblong) | 'round'
  holeDiameter: 6.5,
  slotLength: 10,
  holePattern: 'outer', // 'outer' (haut + bas de chaque U) | 'all' (3 par U)
  teardrop: true, // trous horizontaux en goutte d'eau (impression sans support)

  vents: true,
  ventWidth: 6,
  ventLength: 40,

  // Fixation arrière (mode 'double') : équerres réglables en profondeur
  bracketThickness: 5,
  flangeThickness: 4,
  adjustPitch: 20, // pas des trous de réglage dans les rebords
  adjustRange: 120, // longueur de la zone de réglage à l'arrière
  boltDiameter: 4.4, // perçage des vis d'assemblage (M4 par défaut)

  // Découpage pour le plateau d'imprimante
  bedX: 256,
  bedY: 256,
  splitX: 'auto', // 'auto' ou nombre de tronçons en largeur
  splitY: 'auto', // 'auto' ou nombre de tronçons en profondeur
  joint: 'key', // 'key' (clés papillon à coller) | 'splice' (éclisses vissées)
  tabWidth: 14, // clé papillon : largeur des têtes
  tabDepth: 10, // clé papillon : longueur de chaque moitié (de part et d'autre de la coupe)
  tabPitch: 45, // clé papillon : espacement maxi
  jointGap: 0.15, // jeu d'emboîtement (par face)
  spliceSide: 'top', // éclisses du fond : 'top' (dessus) | 'bottom' (dessous)
  spliceWidth: 40,
  spliceThickness: 3,
  spliceBoltDiameter: 3.4, // M3 par défaut

  segments: 32,
};

const FIT_GAP = 0.3; // jeu entre équerre arrière et rebord
const AX = { x: 0, y: 1, z: 2 };

const f1 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

/** Normalise les paramètres utilisateur (valeurs numériques, bornes). */
export function normalizeParams(input = {}) {
  const p = { ...DEFAULTS, ...input };
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof DEFAULTS[k] === 'number') p[k] = num(p[k], DEFAULTS[k]);
  }
  p.units = Math.round(clamp(p.units, 1, 6));
  p.depth = clamp(p.depth, 60, 1200);
  p.frontThickness = clamp(p.frontThickness, 2, 10);
  p.baseThickness = clamp(p.baseThickness, 1.5, 10);
  p.wallThickness = clamp(p.wallThickness, 1.5, 10);
  p.rearLipThickness = clamp(p.rearLipThickness, 1.5, 10);
  p.gussetThickness = clamp(p.gussetThickness, 1.5, 10);
  p.gussets = Math.round(clamp(p.gussets, 0, 12));
  p.holeDiameter = clamp(p.holeDiameter, 3, 12);
  p.slotLength = clamp(p.slotLength, p.holeDiameter, 14);
  p.boltDiameter = clamp(p.boltDiameter, 2, 8);
  p.spliceBoltDiameter = clamp(p.spliceBoltDiameter, 2, 8);
  p.spliceWidth = clamp(p.spliceWidth, 20, 80);
  p.spliceThickness = clamp(p.spliceThickness, 1.5, 8);
  p.adjustPitch = clamp(p.adjustPitch, 10, 50);
  p.adjustRange = clamp(p.adjustRange, 40, 600);
  p.bracketThickness = clamp(p.bracketThickness, 2, 10);
  p.flangeThickness = clamp(p.flangeThickness, 2, 8);
  p.ventWidth = clamp(p.ventWidth, 3, 20);
  p.ventLength = clamp(p.ventLength, p.ventWidth, 150);
  p.bedX = clamp(p.bedX, 100, 1000);
  p.bedY = clamp(p.bedY, 100, 1000);
  p.segments = Math.round(clamp(p.segments, 12, 96));
  p.mounting = p.mounting === 'double' ? 'double' : 'front';
  p.frontStyle = ['open', 'grid', 'full'].includes(p.frontStyle) ? p.frontStyle : 'open';
  p.joint = p.joint === 'splice' ? 'splice' : 'key';
  p.frontLipHeight = clamp(p.frontLipHeight, 0, 200);
  p.gridSize = clamp(p.gridSize, 6, 60);
  p.gridRib = clamp(p.gridRib, 2, 15);
  p.tabWidth = clamp(p.tabWidth, 6, 30);
  p.tabDepth = clamp(p.tabDepth, 4, 20);
  p.tabPitch = clamp(p.tabPitch, 20, 200);
  p.jointGap = clamp(p.jointGap, 0, 0.6);
  p.vents = p.vents === true || p.vents === 'true';
  p.teardrop = p.teardrop === true || p.teardrop === 'true';
  for (const k of ['splitX', 'splitY']) {
    p[k] = p[k] === 'auto' ? 'auto' : Math.round(clamp(num(p[k], 1), 1, 6));
  }
  return p;
}

/** Calcule toutes les cotes dérivées, sans géométrie (utilisé aussi par l'UI). */
export function computeLayout(input) {
  const p = normalizeParams(input);
  const warnings = [];
  const W = RACK.panelWidth;
  const H = p.units * RACK.unit - RACK.panelGap;
  const D = p.depth;
  const tf = p.frontThickness;
  const tb = p.baseThickness;
  const double = p.mounting === 'double';

  // Largeur du corps du plateau (doit passer entre les montants)
  const sideSpace = double ? p.flangeThickness + FIT_GAP + p.bodyClearance : p.bodyClearance;
  const bodyWidth = RACK.opening - 2 * sideSpace;
  const xb0 = (W - bodyWidth) / 2;
  const xb1 = W - xb0;

  let hs = p.wallHeight > 0 ? clamp(p.wallHeight, tb + 2, H) : 0;
  if (double && hs < 20) {
    hs = Math.min(20, H);
    warnings.push('Fixation arrière : rebords latéraux forcés à 20 mm minimum (les équerres s’y vissent).');
  }
  if (p.wallHeight > H) warnings.push(`Rebords limités à la hauteur de façade (${H.toFixed(1)} mm).`);
  const tw = hs > 0 ? p.wallThickness : 0;
  const hl = p.rearLipHeight > 0 ? clamp(p.rearLipHeight, tb + 2, H) : 0;
  const tl = hl > 0 ? p.rearLipThickness : 0;

  // Découpage
  const { nx, ny, fits } = chooseSplit(p, W, D, H);
  if (!fits) warnings.push('Même découpé, un tronçon dépasse le plateau d’impression : augmentez le découpage ou réduisez la profondeur.');
  const xs = Array.from({ length: nx - 1 }, (_, i) => ((i + 1) * W) / nx);
  const ys = Array.from({ length: ny - 1 }, (_, i) => ((i + 1) * D) / ny);

  const top = p.spliceSide !== 'bottom';
  const st = p.spliceThickness;
  const sw = p.spliceWidth;
  const keyed = p.joint === 'key';
  // Demi-largeur de la zone à garder pleine de part et d'autre d'une coupe
  const seamKeep = keyed ? p.tabDepth + p.jointGap + 3 : sw / 2;

  // Façade ouverte : rebord avant + joues latérales qui relient les pattes au plateau
  const open = p.frontStyle === 'open';
  const lipF = open && p.frontLipHeight > 0 ? clamp(p.frontLipHeight, tb + 2, H) : 0;
  let cheek = null;
  if (open) {
    const y1 = tf + 6;
    const lowZ = Math.max(hs, tb);
    const maxY = Math.max(y1 + 1, D - tl - 2);
    let y2 = y1 + 1.2 * (H - lowZ);
    let z2 = lowZ;
    if (y2 > maxY) {
      z2 = H - (maxY - y1) / 1.2;
      y2 = maxY;
    }
    cheek = { y1, y2, z2, t: p.wallThickness };
  }

  // Renforts
  let gussetLen = 0;
  let gussetHeight = 0;
  const gussetX = [];
  if (p.gussets > 0 && !open) {
    gussetHeight = Math.max(0, H - tb - 3);
    let maxLen = D - tf - tl - 5;
    if (ys.length) maxLen = Math.min(maxLen, ys[0] - seamKeep - tf - 3);
    gussetLen = Math.min(gussetHeight, maxLen);
    if (gussetLen < 5 || gussetHeight < 5) {
      gussetLen = 0;
    } else {
      const lo = xb0 + tw + p.gussetThickness;
      const hi = xb1 - tw - p.gussetThickness;
      const keepOut = seamKeep + p.gussetThickness / 2 + 2;
      for (let i = 1; i <= p.gussets; i++) {
        let x = xb0 + (i * (xb1 - xb0)) / (p.gussets + 1);
        for (const s of xs) {
          if (Math.abs(x - s) < keepOut) x = x < s ? s - keepOut : s + keepOut;
        }
        x = clamp(x, lo, hi);
        if (!gussetX.some((g) => Math.abs(g - x) < p.gussetThickness + 1)) gussetX.push(x);
      }
    }
  }

  // Équerres arrière
  let bracket = null;
  if (double) {
    const P = p.adjustPitch;
    const bd = p.boltDiameter;
    const lo = tb + Math.max(5, bd + 1.5);
    const hi = hs - Math.max(4, bd);
    const rows = hi - lo >= 10 ? [lo, hi] : [(lo + hi) / 2];
    const yMin = Math.max(D - p.adjustRange, tf + gussetLen + 8);
    const holesY = [];
    for (let y = D - 8; y >= yMin - 1e-6; y -= P) {
      if (ys.some((s) => Math.abs(y - s) < seamKeep + bd)) continue;
      holesY.push(y);
    }
    const c1 = -(8 + P / 2); // centre de la 1re lumière (relatif à la face avant de la patte)
    const c2 = c1 - 2 * P;
    const flangeLen = 14 + 3 * P;
    // Trous utilisables par la lumière 1 : un trou doit aussi exister 2 pas plus en avant
    const usable = holesY.filter((y) => holesY.some((z) => Math.abs(z - (y - 2 * P)) < 1e-6));
    let range = null;
    if (usable.length) {
      const yEmin = Math.min(...usable) - c1 - P / 2;
      const yEmax = Math.max(...usable) - c1 + P / 2;
      range = { min: yEmin - tf, max: yEmax - tf };
    } else {
      warnings.push('Zone de réglage trop courte pour les équerres arrière : augmentez la plage de réglage ou la profondeur.');
    }
    const yE = range ? clamp(D, range.min + tf, range.max + tf) : D;
    bracket = { P, rows, holesY, c1, c2, flangeLen, range, yE, earWidth: xb0 - FIT_GAP, thickness: p.bracketThickness };
  }

  return {
    params: p, warnings, W, H, D, tf, tb, hs, tw, hl, tl, bodyWidth, xb0, xb1,
    nx, ny, xs, ys, top, st, sw, seamKeep, keyed, open, lipF, cheek, gussetLen, gussetHeight, gussetX, bracket,
    earHoleX: (W - RACK.holeSpacing) / 2,
    rackHolesZ: rackHoleHeights(p),
  };
}

function rackHoleHeights(p) {
  const offs = p.holePattern === 'all' ? RACK.holeOffsets : [RACK.holeOffsets[0], RACK.holeOffsets[2]];
  const zs = [];
  for (let u = 0; u < p.units; u++) for (const o of offs) zs.push(u * RACK.unit + o - RACK.panelGap / 2);
  return zs;
}

function chooseSplit(p, W, D, H) {
  const fit = (a, b) => (a <= p.bedX && b <= p.bedY) || (b <= p.bedX && a <= p.bedY);
  // Un tronçon contient la façade (H) + le fond : son encombrement au sol est (W/nx) x (D/ny)
  // les tronçons sont coupés net (les clés sont des pièces à part) ; 1 mm de marge
  const test = (nx, ny) => fit(W / nx + 1, D / ny + 1);
  const fixedX = p.splitX !== 'auto' ? p.splitX : null;
  const fixedY = p.splitY !== 'auto' ? p.splitY : null;
  let best = null;
  for (let nx = 1; nx <= 6; nx++) {
    if (fixedX && nx !== fixedX) continue;
    for (let ny = 1; ny <= 6; ny++) {
      if (fixedY && ny !== fixedY) continue;
      if (test(nx, ny)) {
        const score = nx * ny * 10 + ny;
        if (!best || score < best.score) best = { nx, ny, score };
      }
    }
  }
  if (best) return { nx: best.nx, ny: best.ny, fits: true };
  return { nx: fixedX || 4, ny: fixedY || Math.max(1, Math.ceil(D / p.bedY)), fits: false };
}

// ---------------------------------------------------------------------------
// Construction des solides
// ---------------------------------------------------------------------------

/**
 * Construit toutes les pièces.
 * @param wasm module manifold-3d initialisé (après setup())
 * @returns {{layout, parts: Array<{name, kind, color, mesh, printMesh, size}>}}
 */
export function buildRack(wasm, input) {
  const L = computeLayout(input);
  const p = L.params;
  const { Manifold, CrossSection } = wasm;
  const pool = [];
  const t = (o) => {
    pool.push(o);
    return o;
  };
  const seg = p.segments;

  try {
    // --- primitives -------------------------------------------------------
    const box = (x0, y0, z0, x1, y1, z1) =>
      t(t(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));

    // Extrusion d'un profil 2D (u, v) le long d'un axe, entre `from` et `to`.
    //  axe z : (u, v) = (x, y) ; axe y : (u, v) = (x, z) ; axe x : (u, v) = (y, z)
    const prism = (axis, cs, from, to) => {
      const e = t(cs.extrude(to - from));
      if (axis === 'z') return t(e.translate([0, 0, from]));
      if (axis === 'y') return t(t(e.rotate([90, 0, 0])).translate([0, to, 0]));
      return t(t(e.rotate([90, 0, 90])).translate([from, 0, 0]));
    };

    const disc = (r) => t(CrossSection.circle(r, seg));
    // Goutte d'eau tronquée, pointe vers +v (le haut à l'impression)
    const drop = (r) =>
      t(
        CrossSection.hull([
          disc(r),
          t(new CrossSection([[[-0.27 * r, 1.15 * r], [0, 0], [0.27 * r, 1.15 * r]]])),
        ]),
      );
    const holeShape = (r, horizontal) => (horizontal && p.teardrop ? drop(r) : disc(r));
    // Lumière (oblong) de longueur hors-tout `len` orientée selon u
    const slotShape = (r, len, horizontal) => {
      const d = Math.max(0, len - 2 * r) / 2;
      const s = holeShape(r, horizontal);
      if (d <= 0) return s;
      return t(CrossSection.hull([t(s.translate([-d, 0])), t(s.translate([d, 0]))]));
    };
    const at = (cs, u, v) => t(cs.translate([u, v]));

    const { W, H, D, tf, tb, hs, tw, hl, tl, xb0, xb1, xs, ys, top, st, sw, seamKeep, keyed } = L;
    const plates = [];
    const solids = [];
    const cutters = [];
    // plage (selon la hauteur) disponible pour une jonction sur une paroi verticale
    const zRange = (hi) => [[tb + (keyed ? 0 : top ? st : 0) + 1, hi - 1]];
    const nearSeam = (v, seams, extra = 0) => seams.some((s) => Math.abs(v - s) < seamKeep + extra);

    // --- façade -----------------------------------------------------------
    if (L.open) {
      const C = L.cheek;
      // pattes de fixation, prolongées jusqu'aux joues
      solids.push(box(0, 0, 0, xb0 + C.t, tf, H));
      solids.push(box(xb1 - C.t, 0, 0, W, tf, H));
      if (L.lipF > 0) {
        solids.push(box(xb0, 0, 0, xb1, tf, L.lipF));
        plates.push({ name: 'rebord avant', min: [xb0, 0, 0], max: [xb1, tf, L.lipF], n: 1, side: +1, seams: 'x', t: zRange(L.lipF) });
      }
      // joues : pleine hauteur à l'avant, puis descendent en pente jusqu'aux rebords
      const prof = t(new CrossSection([[[0, 0], [C.y2, 0], [C.y2, C.z2], [C.y1, H], [0, H]]]));
      solids.push(prism('x', prof, xb0, xb0 + C.t));
      solids.push(prism('x', prof, xb1 - C.t, xb1));
    } else {
      solids.push(box(0, 0, 0, W, tf, H));
      plates.push({ name: 'façade', min: [0, 0, 0], max: [W, tf, H], n: 1, side: +1, seams: 'x', t: zRange(H) });
      if (p.frontStyle === 'grid') {
        // losanges à 45° : s'impriment sans support
        const s = p.gridSize;
        const a = s / Math.SQRT2;
        const pitch = s + p.gridRib * Math.SQRT2;
        const m = Math.max(4, p.gridRib);
        const x0 = xb0 + tw + m, x1 = xb1 - tw - m;
        const z0 = tb + m, z1 = H - m;
        if (x1 - x0 > 10 && z1 - z0 > 6) {
          const dia = t(t(CrossSection.square([a, a], true)).rotate(45));
          const shapes = [];
          const zc = (z0 + z1) / 2;
          const xc = (x0 + x1) / 2;
          const nzr = Math.ceil((z1 - z0) / pitch) + 1;
          const nxr = Math.ceil((x1 - x0) / pitch) + 1;
          for (let j = -nzr; j <= nzr; j++) {
            for (let i = -nxr; i <= nxr; i++) {
              const u = xc + i * pitch + (Math.abs(j) % 2 ? pitch / 2 : 0);
              const v = zc + (j * pitch) / 2;
              if (u < x0 - s || u > x1 + s || v < z0 - s || v > z1 + s) continue;
              shapes.push(at(dia, u, v));
            }
          }
          let win = t(CrossSection.union(shapes));
          win = t(win.intersect(t(t(CrossSection.square([x1 - x0, z1 - z0])).translate([x0, z0]))));
          // nervures pleines au droit des renforts et des coupes
          const keep = [];
          for (const g of L.gussetX) keep.push(t(t(CrossSection.square([p.gussetThickness + 2 * m, H])).translate([g - p.gussetThickness / 2 - m, 0])));
          for (const c of xs) keep.push(t(t(CrossSection.square([2 * seamKeep, H])).translate([c - seamKeep, 0])));
          if (keep.length) win = t(win.subtract(t(CrossSection.union(keep))));
          if (!win.isEmpty()) cutters.push(prism('y', win, -1, tf + 1));
        }
      }
    }

    // trous de fixation rack (façade)
    const rackHole = () => {
      const r = p.holeDiameter / 2;
      return p.holeShape === 'slot' ? slotShape(r, p.slotLength, true) : holeShape(r, true);
    };
    const rackHoleCutters = (y0, y1, xsList) => {
      const out = [];
      const shape = rackHole();
      for (const x of xsList) for (const z of L.rackHolesZ) out.push(prism('y', at(shape, x, z), y0, y1));
      return out;
    };
    cutters.push(...rackHoleCutters(-1, tf + 1, [L.earHoleX, W - L.earHoleX]));

    // --- fond -------------------------------------------------------------
    solids.push(box(xb0, 0, 0, xb1, D, tb));
    const xSeamBaseT = keyed ? [tf + 1, D - tl - 1] : top ? [tf + st + 1, D - tl - 1] : [tf + 1, D - 1];
    const ySeamBaseT = keyed || (top && tw) ? [xb0 + tw + 1, xb1 - tw - 1] : [xb0 + 1, xb1 - 1];
    plates.push({ name: 'fond', min: [xb0, 0, 0], max: [xb1, D, tb], n: 2, side: top ? +1 : -1,
      seams: 'xy', tForX: [xSeamBaseT], tForY: [ySeamBaseT] });

    // --- rebords latéraux -------------------------------------------------
    if (hs > 0) {
      const tz = zRange(hs);
      solids.push(box(xb0, 0, 0, xb0 + tw, D, hs));
      solids.push(box(xb1 - tw, 0, 0, xb1, D, hs));
      plates.push({ name: 'rebord gauche', min: [xb0, 0, 0], max: [xb0 + tw, D, hs], n: 0, side: +1, seams: 'y', t: tz });
      plates.push({ name: 'rebord droit', min: [xb1 - tw, 0, 0], max: [xb1, D, hs], n: 0, side: -1, seams: 'y', t: tz });
    }

    // --- rebord arrière ---------------------------------------------------
    if (hl > 0) {
      solids.push(box(xb0, D - tl, 0, xb1, D, hl));
      plates.push({ name: 'rebord arrière', min: [xb0, D - tl, 0], max: [xb1, D, hl], n: 1, side: -1, seams: 'x',
        t: zRange(hl) });
    }

    // --- renforts ---------------------------------------------------------
    if (L.gussetLen > 0) {
      const tri = t(new CrossSection([[[tf - 0.5, tb - 0.5], [tf + L.gussetLen, tb - 0.5], [tf - 0.5, tb + L.gussetHeight]]]));
      for (const x of L.gussetX) {
        solids.push(prism('x', tri, x - p.gussetThickness / 2, x + p.gussetThickness / 2));
      }
    }

    // --- aérations --------------------------------------------------------
    if (p.vents) {
      const vw = p.ventWidth;
      const vl = p.ventLength;
      const x0 = xb0 + tw + 8;
      const x1 = xb1 - tw - 8;
      const y0 = tf + (L.gussetLen > 0 ? L.gussetLen : 0) + (L.open ? 14 : 10);
      const y1 = D - tl - 10;
      const pitchX = vw * 2.2;
      const pitchY = vl + 10;
      const nxV = Math.floor((x1 - x0 - vw) / pitchX) + 1;
      const nyV = Math.floor((y1 - y0 - vl) / pitchY) + 1;
      if (nxV > 0 && nyV > 0) {
        const offX = (x1 - x0 - vw - (nxV - 1) * pitchX) / 2;
        const offY = (y1 - y0 - vl - (nyV - 1) * pitchY) / 2;
        const shape = t(slotShape(vw / 2, vl, false).rotate(90));
        for (let i = 0; i < nxV; i++) {
          const cx = x0 + offX + vw / 2 + i * pitchX;
          if (nearSeam(cx, xs, vw)) continue;
          for (let j = 0; j < nyV; j++) {
            const cy = y0 + offY + vl / 2 + j * pitchY;
            if (nearSeam(cy, ys, vl / 2 + 3)) continue;
            cutters.push(prism('z', at(shape, cx, cy), -1, tb + 1));
          }
        }
      }
    }

    // --- trous de réglage des équerres arrière ---------------------------
    const B = L.bracket;
    if (B) {
      const r = p.boltDiameter / 2;
      const s = holeShape(r, true);
      for (const y of B.holesY) {
        for (const z of B.rows) {
          cutters.push(prism('x', at(s, y, z), xb0 - 1, xb0 + tw + 1));
          cutters.push(prism('x', at(s, y, z), xb1 - tw - 1, xb1 + 1));
        }
      }
    }

    // --- éclisses d'assemblage -------------------------------------------
    const splices = [];
    const sr = p.spliceBoltDiameter / 2;
    const addSplices = (plate, seamAxis, seamPos, tRanges) => {
      const a = AX[seamAxis];
      const n = plate.n;
      const tAx = [0, 1, 2].find((k) => k !== a && k !== n);
      const along = (lo, hi) => {
        const len = hi - lo;
        const m = Math.max(sr * 2 + 2, 5);
        if (len < 2 * sr + 2) return [];
        if (len < 2 * m + 10) return [(lo + hi) / 2];
        const count = Math.max(2, Math.ceil((len - 2 * m) / 50) + 1);
        return Array.from({ length: count }, (_, i) => lo + m + (i * (len - 2 * m)) / (count - 1));
      };
      for (const [t0, t1] of tRanges) {
        if (t1 - t0 < 2 * sr + 4) continue;
        const min = [0, 0, 0];
        const max = [0, 0, 0];
        min[a] = seamPos - sw / 2;
        max[a] = seamPos + sw / 2;
        min[tAx] = t0;
        max[tAx] = t1;
        if (plate.side > 0) {
          min[n] = plate.max[n];
          max[n] = plate.max[n] + st;
        } else {
          min[n] = plate.min[n] - st;
          max[n] = plate.min[n];
        }
        const solid = box(min[0], min[1], min[2], max[0], max[1], max[2]);
        // trous traversant l'éclisse et la paroi
        const axisName = ['x', 'y', 'z'][n];
        const from = Math.min(plate.min[n], min[n]) - 1;
        const to = Math.max(plate.max[n], max[n]) + 1;
        const holes = [];
        const shape = holeShape(sr, n !== 2);
        for (const tv of along(t0, t1)) {
          for (const off of [-sw / 4, sw / 4]) {
            const c = [0, 0, 0];
            c[a] = seamPos + off;
            c[tAx] = tv;
            // coordonnées (u, v) du profil selon l'axe d'extrusion
            const uv = n === 2 ? [c[0], c[1]] : n === 1 ? [c[0], c[2]] : [c[1], c[2]];
            holes.push(prism(axisName, at(shape, uv[0], uv[1]), from, to));
          }
        }
        cutters.push(...holes);
        splices.push({ name: `Éclisse ${plate.name}`, solid, holes, n, side: plate.side });
      }
    };
    const subtractIntervals = (ranges, cuts) => {
      let out = ranges;
      for (const [c0, c1] of cuts) {
        out = out.flatMap(([a, b]) => {
          if (c1 <= a || c0 >= b) return [[a, b]];
          const r = [];
          if (c0 > a) r.push([a, c0]);
          if (c1 < b) r.push([c1, b]);
          return r;
        });
      }
      return out;
    };
    // --- clés papillon (double queue d'aronde, à coller) --------------------
    // Une mortaise en forme de nœud papillon est creusée à cheval sur la coupe,
    // dans les deux tronçons ; une clé séparée (imprimée à plat) s'y emboîte.
    const sockets = [];
    const keyGroups = new Map();
    const addKeys = (plate, seamAxis, c, tRanges) => {
      const a = AX[seamAxis];
      const n = plate.n;
      const tAx = [0, 1, 2].find((k) => k !== a && k !== n);
      const [uIdx, vIdx] = [0, 1, 2].filter((k) => k !== n);
      const h = p.tabDepth;
      const thick = plate.max[n] - plate.min[n];
      for (const [t0, t1] of tRanges) {
        const len = t1 - t0;
        const wh = Math.min(p.tabWidth, len - 2);
        if (wh < 8) continue; // trop petite pour être solide : simple collage bord à bord
        const wn = wh * 0.6;
        const m = wh / 2 + 1;
        const count = Math.max(1, Math.floor((len - 2 * m) / p.tabPitch) + 1);
        for (let i = 0; i < count; i++) {
          const tc = count === 1 ? (t0 + t1) / 2 : t0 + m + (i * (len - 2 * m)) / (count - 1);
          const bow = [[-h, -wh / 2], [0, -wn / 2], [h, -wh / 2], [h, wh / 2], [0, wn / 2], [-h, wh / 2]];
          const pts = bow.map(([da, dt]) => {
            const q = [0, 0, 0];
            q[a] = c + da;
            q[tAx] = tc + dt;
            return [q[uIdx], q[vIdx]];
          });
          let area = 0;
          for (let k = 0; k < pts.length; k++) {
            const [x1, y1] = pts[k];
            const [x2, y2] = pts[(k + 1) % pts.length];
            area += x1 * y2 - x2 * y1;
          }
          if (area < 0) pts.reverse();
          const cs = t(new CrossSection([pts]));
          const axisName = ['x', 'y', 'z'][n];
          const off = p.jointGap > 0 ? t(cs.offset(p.jointGap, 'Miter')) : cs;
          sockets.push(prism(axisName, off, plate.min[n] - 0.01, plate.max[n] + 0.01));
          // les clés identiques sont regroupées (une seule pièce à imprimer N fois)
          const id = `${thick.toFixed(2)}|${wh.toFixed(2)}`;
          if (!keyGroups.has(id)) keyGroups.set(id, { thick, wh, n, solids: [] });
          keyGroups.get(id).solids.push(prism(axisName, cs, plate.min[n], plate.max[n]));
        }
      }
    };

    const kh = p.tabDepth + p.jointGap + 2;
    const xCuts = xs.map((s) => (keyed ? [s - kh, s + kh] : [s - sw / 2 - 1, s + sw / 2 + 1]));
    const yCuts = ys.map((s) => (keyed ? [s - kh, s + kh] : [s - sw / 2 - 1, s + sw / 2 + 1]));
    for (const plate of plates) {
      if (plate.seams.includes('x')) {
        for (const s of xs) {
          const tr = plate.tForX ? subtractIntervals(plate.tForX, yCuts) : plate.t;
          if (keyed) addKeys(plate, 'x', s, tr);
          else addSplices(plate, 'x', s, tr);
        }
      }
      if (plate.seams.includes('y')) {
        for (const s of ys) {
          const tr = plate.tForY ? subtractIntervals(plate.tForY, xCuts) : plate.t;
          if (keyed) addKeys(plate, 'y', s, tr);
          else addSplices(plate, 'y', s, tr);
        }
      }
    }
    cutters.push(...sockets);
    if (!keyed && ys.length && hs > 0 && hs - tb - (top ? st : 0) < 2 * sr + 6) {
      L.warnings.push('Rebords trop bas pour recevoir des éclisses : ils seront seulement collés.');
    }

    // --- assemblage du corps et découpe ----------------------------------
    const allCut = cutters.length ? t(Manifold.union(cutters)) : null;
    let body = t(Manifold.union(solids));
    if (allCut) body = t(body.subtract(allCut));

    const parts = [];
    const colors = ['#4f8cff', '#38b2ac', '#9f7aea', '#ed8936', '#48bb78', '#e53e3e'];
    const bx = [-1e4, ...xs, 1e4];
    const by = [-1e4, ...ys, 1e4];
    for (let j = 0; j < by.length - 1; j++) {
      for (let i = 0; i < bx.length - 1; i++) {
        // cellule (i, j) : tronçon i en largeur, j en profondeur
        const cell = box(bx[i], by[j], -1e3, bx[i + 1], by[j + 1], 1e3);
        const piece = t(body.intersect(cell));
        if (piece.isEmpty()) continue;
        const explode = [(i - (L.nx - 1) / 2) * 40, j * 40, 0];
        const name = L.nx * L.ny === 1 ? 'Plateau' : `Plateau ${String.fromCharCode(65 + j)}${i + 1}`;
        parts.push(makePart(name, 'body', piece, null, colors[(i + j) % 2], { cell: [i, j], explode }));
      }
    }

    const counts = {};
    for (const s of splices) {
      let solid = s.solid;
      if (s.holes.length) solid = t(solid.subtract(t(Manifold.union(s.holes))));
      counts[s.name] = (counts[s.name] || 0) + 1;
      const offset = [0, 0, 0];
      offset[s.n] = s.side * 25;
      parts.push(makePart(`${s.name} ${counts[s.name]}`, 'splice', solid, s.n, '#f6ad55', { explode: offset }));
    }

    for (const g of keyGroups.values()) {
      const all = t(Manifold.compose(g.solids));
      const offset = [0, 0, 0];
      offset[g.n] = g.n === 1 ? -25 : 25;
      const part = makePart(`Clé papillon ${f1(g.thick)} mm`, 'key', all, g.n, '#f6ad55', { explode: offset, quantity: g.solids.length });
      // pièce à imprimer : une seule clé (à imprimer « quantity » fois)
      part.printMesh = flatMesh(g.solids[0], g.n);
      part.size = part.printMesh.size;
      delete part.printMesh.size;
      parts.push(part);
    }

    // --- équerres arrière -------------------------------------------------
    if (B) {
      const te = p.bracketThickness;
      const ft = p.flangeThickness;
      const fx1 = xb0 - FIT_GAP; // face intérieure de l'aile (contre le rebord)
      const fx0 = fx1 - ft;
      const yE = B.yE;
      // patte (contre le montant arrière) + aile (le long du rebord)
      let br = t(Manifold.union([
        box(0, yE, 0, fx1, yE + te, H),
        box(fx0, yE - B.flangeLen, 0, fx1, yE + te, hs),
      ]));
      const bc = [...rackHoleCutters(yE - 1, yE + te + 1, [L.earHoleX])];
      const r = p.boltDiameter / 2;
      const sl = slotShape(r, B.P + 2 * r, true);
      for (const c of [B.c1, B.c2]) {
        for (const z of B.rows) bc.push(prism('x', at(sl, yE + c, z), fx0 - 1, fx1 + 1));
      }
      br = t(br.subtract(t(Manifold.union(bc))));
      parts.push(makePart('Équerre arrière gauche', 'bracket', br, null, '#a0aec0', { explode: [-40, 40, 0] }));
      const brR = t(t(br.mirror([1, 0, 0])).translate([W, 0, 0]));
      parts.push(makePart('Équerre arrière droite', 'bracket', brR, null, '#a0aec0', { explode: [40, 40, 0] }));
    }

    return { layout: L, parts };

    // -----------------------------------------------------------------------
    function flatMesh(solid, flatAxis) {
      let printSolid = solid;
      if (flatAxis === 1) printSolid = t(solid.rotate([90, 0, 0]));
      else if (flatAxis === 0) printSolid = t(solid.rotate([0, 90, 0]));
      const bb = printSolid.boundingBox();
      printSolid = t(printSolid.translate([-bb.min[0], -bb.min[1], -bb.min[2]]));
      const mesh = toMesh(printSolid);
      mesh.size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
      return mesh;
    }

    function makePart(name, kind, solid, flatAxis, color, extra = {}) {
      const printMesh = flatMesh(solid, flatAxis);
      const size = printMesh.size;
      delete printMesh.size;
      return {
        name, kind, color, size, quantity: 1, ...extra,
        volume: solid.volume(),
        mesh: toMesh(solid),
        printMesh,
      };
    }
  } finally {
    for (const o of pool) {
      try {
        o.delete();
      } catch {
        /* déjà libéré */
      }
    }
  }
}

function toMesh(m) {
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const vp = mesh.vertProperties;
  const nv = vp.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = vp[i * np];
    positions[i * 3 + 1] = vp[i * np + 1];
    positions[i * 3 + 2] = vp[i * np + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}
