# 19-inch Rack Transformer

Générateur de **plateaux 19″ pour baie informatique**, imprimables en 3D, exportés en **.stl** ou **.3mf**.

Application web 100 % statique (aucun serveur) : aperçu 3D en temps réel, calcul des solides avec
[manifold-3d](https://github.com/elalish/manifold) (maillages fermés, sans erreur pour le trancheur).

## Fonctions

- **Hauteur** 1U à 4U, cotes 19″ standard (façade 482,6 mm, entraxe 465,1 mm, trous à 6,35 / 22,225 / 38,1 mm dans chaque U).
- **Profondeur réglable** (60 à 1200 mm).
- **Fixation avant seule** ou **double fixation avant + arrière** :
  - en mode double, deux **équerres arrière** se glissent par l’arrière de la baie et se vissent (M4)
    dans une rangée de trous des rebords latéraux ; leurs lumières oblongues permettent un réglage continu.
    L’application affiche l’**écartement de montants compatible** (face avant des montants avant →
    face arrière des montants arrière).
- **Façade** au choix :
  - **ouverte** (par défaut) : pattes de fixation + petit rebord bas, reliées au fond par des joues latérales
    en pente — tout le contenu du plateau reste visible ;
  - **ajourée** : losanges à 45° (imprimables sans support) ;
  - **pleine**.
- Rebords latéraux et arrière, renforts triangulaires façade/fond, fentes d’aération.
- Trous rack ronds ou oblongs, 2 ou 3 par U, en **goutte d’eau** pour imprimer sans support.
- **Découpage automatique** selon la taille du plateau de l’imprimante (préréglages Bambu, Prusa, Ender, Voron…).
  Les tronçons s’assemblent par des **queues d’aronde** (tenons/mortaises type puzzle, jeu réglable) à coller :
  jonction invisible, aucune pièce en plus. Option : **éclisses** vissées (M3), démontables.
- Export **3MF** (toutes les pièces, déjà orientées et posées sur le plateau) ou **STL** (par pièce ou en .zip).
- Réglages mémorisés dans le navigateur ; ils peuvent aussi être passés dans l’URL, ex.
  `index.html#mounting=double&depth=450&units=2`.

## Utilisation

En ligne : activez GitHub Pages (Settings → Pages → Source : *GitHub Actions*) ; le workflow
`.github/workflows/pages.yml` publie le site à chaque push sur `main`.

En local (un serveur HTTP est nécessaire pour les modules ES / Web Worker) :

```bash
npm install
npm run serve        # puis ouvrir http://localhost:8080
```

L’aperçu charge three.js et manifold-3d depuis cdn.jsdelivr.net.

### Ligne de commande

```bash
npm install
node cli/generate.mjs --depth 450 --units 2 --mounting double --out out/
node cli/generate.mjs --help   # liste de toutes les options
```

### Tests

```bash
npm test
```

Les tests vérifient pour plusieurs configurations que chaque pièce est un solide fermé, qu’aucune pièce
n’en chevauche une autre une fois assemblée, que tout tient sur le plateau d’impression, que le corps
passe entre les montants (450 mm) et que les fichiers STL / 3MF sont valides.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html`, `src/app.js`, `src/style.css` | interface et aperçu 3D (three.js) |
| `src/worker.js` | calcul de la géométrie dans un Web Worker |
| `src/geometry.js` | modèle paramétrique (façade, fond, rebords, renforts, trous, éclisses, équerres) |
| `src/exporters.js` | export STL binaire et 3MF (ZIP écrit à la main) |
| `cli/generate.mjs` | génération en ligne de commande |

## Conseils d’impression

PETG ou ASA de préférence (le PLA flue sous charge dans une baie chaude), 4 périmètres, 25–40 % de
remplissage. Collez les queues d’aronde à la cyanoacrylate ou à l’époxy ; si l’emboîtement est trop serré,
augmentez le jeu (0,2–0,25 mm). Visserie : M6 + écrous cage pour la baie, M4 pour les équerres arrière,
M3 pour les éclisses éventuelles (diamètres modifiables).
