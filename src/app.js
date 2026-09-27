import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeLayout } from './geometry.js';
import { toSTL, to3MF, zip } from './exporters.js';

const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const partsEl = document.getElementById('parts');
const summaryEl = document.getElementById('summary');
const warningsEl = document.getElementById('warnings');
const rangeEl = document.getElementById('range');
const dl3mf = document.getElementById('dl3mf');
const dlstl = document.getElementById('dlstl');

const BED_PRESETS = { 180: [180, 180], 220: [220, 220], 250: [250, 210], 256: [256, 256], 300: [300, 300], 350: [350, 350], 500: [500, 500] };
const STORAGE_KEY = 'rack19-params-v2';

// ---------------------------------------------------------------------------
// Paramètres du formulaire
// ---------------------------------------------------------------------------
function readParams() {
  const fd = new FormData(form);
  const p = {};
  for (const [k, v] of fd.entries()) p[k] = v;
  for (const el of form.querySelectorAll('input[type=checkbox][name]')) p[el.name] = el.checked;
  const preset = p.bedPreset;
  if (preset !== 'custom' && BED_PRESETS[preset]) [p.bedX, p.bedY] = BED_PRESETS[preset];
  return p;
}

function writeParams(p) {
  for (const [k, v] of Object.entries(p)) {
    const els = form.querySelectorAll(`[name="${k}"]`);
    for (const el of els) {
      if (el.type === 'checkbox') el.checked = v === true || v === 'true' || v === '1';
      else if (el.type === 'radio') el.checked = el.value === v;
      else el.value = v;
    }
  }
  syncMirrors();
}

function syncMirrors(source) {
  for (const m of form.querySelectorAll('[data-mirror]')) {
    const target = form.elements[m.dataset.mirror];
    if (source === m) target.value = m.value;
    else m.value = target.value;
  }
  for (const o of form.querySelectorAll('output[data-for]')) o.textContent = `${form.elements[o.dataset.for].value} mm`;
}

function updateFormState(p) {
  form.classList.toggle('double', p.mounting === 'double');
  form.classList.toggle('custom-bed', p.bedPreset === 'custom');
  for (const st of ['open', 'grid', 'full']) form.classList.toggle(`front-${st}`, p.frontStyle === st);
  form.classList.toggle('joint-dovetail', p.joint !== 'splice');
  form.classList.toggle('joint-splice', p.joint === 'splice');
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved) writeParams(saved);
} catch {
  /* stockage indisponible */
}
const hash = new URLSearchParams(location.hash.slice(1));
if ([...hash.keys()].length) writeParams(Object.fromEntries(hash.entries()));
syncMirrors();

// ---------------------------------------------------------------------------
// Scène 3D
// ---------------------------------------------------------------------------
const container = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-400, -800, 900);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(600, 700, 300);
scene.add(fill);

const model = new THREE.Group();
const rackGroup = new THREE.Group();
scene.add(model, rackGroup);

function applyTheme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  scene.background = new THREE.Color(dark ? 0x161a21 : 0xe9ecf1);
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function resize() {
  const { clientWidth: w, clientHeight: h } = container;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

let current = null; // { layout, parts }
let viewInitialized = false;

function geometryFrom(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  g.dispose();
  return ng;
}

function clearGroup(group) {
  for (const obj of [...group.children]) {
    group.remove(obj);
    obj.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
  }
}

function showModel() {
  clearGroup(model);
  if (!current) return;
  const explode = document.getElementById('explode').checked;
  for (const part of current.parts) {
    const mat = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.6, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometryFrom(part.mesh), mat);
    if (explode && part.explode) mesh.position.set(...part.explode);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 30),
      new THREE.LineBasicMaterial({ color: 0x1c2330, transparent: true, opacity: 0.35 }),
    );
    mesh.add(edges);
    model.add(mesh);
  }
  drawRack();
}

function drawRack() {
  clearGroup(rackGroup);
  if (!current || !document.getElementById('showRack').checked) return;
  const L = current.layout;
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6270, transparent: true, opacity: 0.35, depthWrite: false });
  const post = (x0, y0, z0, x1, y1, z1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat.clone());
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    rackGroup.add(m);
  };
  const W = L.W;
  const lip = 16.3; // largeur de l'aile du montant visible en façade
  const z0 = -25;
  const z1 = L.H + 25;
  const rail = (yFace, dir) => {
    // aile avant du montant + retour vers l'extérieur
    const y0 = dir > 0 ? yFace : yFace - 2.5;
    post(-4, y0, z0, lip, y0 + 2.5, z1);
    post(W - lip, y0, z0, W + 4, y0 + 2.5, z1);
    post(-4, dir > 0 ? yFace : yFace - 40, z0, -1.5, dir > 0 ? yFace + 40 : yFace, z1);
    post(W + 1.5, dir > 0 ? yFace : yFace - 40, z0, W + 4, dir > 0 ? yFace + 40 : yFace, z1);
  };
  rail(L.tf, +1);
  if (L.bracket) rail(L.bracket.yE, -1);
}

function setView(kind) {
  if (!current) return;
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z);
  controls.target.copy(c);
  const d = r * 2.1;
  const dirs = {
    iso: [0.45, -1, 0.85],
    front: [0, -1, 0.02],
    top: [0, -0.02, 1],
    side: [-1, 0, 0.05],
  };
  const v = new THREE.Vector3(...dirs[kind]).normalize().multiplyScalar(d);
  camera.position.copy(c).add(v);
  camera.near = r / 100;
  camera.far = r * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
document.getElementById('showRack').addEventListener('change', drawRack);
document.getElementById('explode').addEventListener('change', showModel);

// ---------------------------------------------------------------------------
// Calcul (worker)
// ---------------------------------------------------------------------------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
let pending = null;
let busy = false;

worker.onmessage = (e) => {
  busy = false;
  const { id, error, layout, parts, ms } = e.data;
  if (error) {
    statusEl.textContent = `Erreur : ${error}`;
    statusEl.classList.add('error');
  } else if (id === reqId) {
    current = { layout, parts };
    statusEl.classList.remove('error');
    statusEl.textContent = `${parts.length} pièce${parts.length > 1 ? 's' : ''} · calcul ${Math.round(ms)} ms`;
    showModel();
    if (!viewInitialized) {
      setView('iso');
      viewInitialized = true;
    }
    renderInfo();
    dl3mf.disabled = dlstl.disabled = false;
  }
  if (pending) {
    const p = pending;
    pending = null;
    send(p);
  }
};
worker.onerror = (e) => {
  statusEl.textContent = `Impossible de charger le moteur 3D (${e.message || 'réseau ?'})`;
  statusEl.classList.add('error');
};

function send(params) {
  if (busy) {
    pending = params;
    return;
  }
  busy = true;
  reqId++;
  statusEl.textContent = 'Calcul…';
  worker.postMessage({ id: reqId, params });
}

let timer = null;
function regenerate() {
  const p = readParams();
  updateFormState(p);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  // Aperçu instantané des cotes pendant le calcul
  renderInfo(computeLayout(p));
  clearTimeout(timer);
  timer = setTimeout(() => send(p), 120);
}

form.addEventListener('input', (e) => {
  if (e.target.dataset.mirror) syncMirrors(e.target);
  else syncMirrors();
  regenerate();
});
form.addEventListener('change', regenerate);
form.addEventListener('submit', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Informations & téléchargements
// ---------------------------------------------------------------------------
const f1 = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

function renderInfo(layout = current?.layout) {
  if (!layout) return;
  const L = layout;
  const rows = [
    ['Largeur façade', `${f1(L.W)} mm`],
    ['Hauteur façade', `${f1(L.H)} mm (${L.params.units}U)`],
    ['Profondeur', `${f1(L.D)} mm`],
    ['Largeur utile', `${f1(L.bodyWidth - 2 * L.tw)} mm`],
    ['Découpage', `${L.nx} × ${L.ny} tronçon${L.nx * L.ny > 1 ? 's' : ''}`],
  ];
  if (current?.layout === L) {
    const vol = current.parts.reduce((s, p) => s + p.volume, 0);
    rows.push(['Matière (≈ PLA/PETG)', `${f1((vol / 1000) * 1.25)} g`]);
  }
  summaryEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  warningsEl.innerHTML = L.warnings.map((w) => `<li>${w}</li>`).join('');
  if (L.bracket) {
    rangeEl.innerHTML = L.bracket.range
      ? `Écartement des montants compatible :<br><b>${f1(L.bracket.range.min)} à ${f1(L.bracket.range.max)} mm</b><br><small>mesuré de la face avant des montants avant à la face arrière des montants arrière.</small>`
      : 'Aucune position de réglage possible.';
  }
  if (current?.layout === L) renderParts();
}

function renderParts() {
  partsEl.innerHTML = '';
  current.parts.forEach((part, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sw" style="background:${part.color}"></span><span class="nm">${part.name}<small>${part.size.map(f1).join(' × ')} mm</small></span>`;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'STL';
    b.addEventListener('click', () => download(toSTL(part.printMesh, part.name), `${baseName()}-${slug(part.name)}.stl`, 'model/stl'));
    li.appendChild(b);
    partsEl.appendChild(li);
    void i;
  });
}

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function baseName() {
  const p = current.layout.params;
  return `plateau-19p-${p.units}U-${Math.round(p.depth)}mm${p.mounting === 'double' ? '-double' : ''}`;
}

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

dl3mf.addEventListener('click', async () => {
  if (!current) return;
  const data = await to3MF(
    current.parts.map((p) => ({ name: p.name, mesh: p.printMesh })),
    { bedWidth: current.layout.params.bedX },
  );
  download(data, `${baseName()}.3mf`, 'model/3mf');
});

dlstl.addEventListener('click', async () => {
  if (!current) return;
  const files = current.parts.map((p) => ({ name: `${baseName()}-${slug(p.name)}.stl`, data: toSTL(p.printMesh, p.name) }));
  download(await zip(files), `${baseName()}-stl.zip`, 'application/zip');
});

regenerate();
