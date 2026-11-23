// Builds the map's directory from public data and writes it to data/.
//
//   node pipeline/build-directory.mjs
//
// (Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1.)
//
// Output:
//   data/trees.geojson     edible trees on streets, medians, parks and other public land
//   data/gardens.geojson   Portland Parks & Recreation community gardens
//   data/directory.json    counts per type, sources, build date — the app reads this
//
// What is deliberately left out:
//   - trees the city records as on private property (20,000+): not reachable from the street
//   - dead trees, stumps and empty planting sites
//   - ornamental varieties (flowering cherries, Callery pears)
//   - street addresses: the app shows a location, never whose house it is

import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { classify, TYPES } = require("../fruit-species.js");

const TREES = "https://www.portlandmaps.com/arcgis/rest/services/Public/Parks_UF_Tree_Layers/MapServer/12";
const GARDENS = "https://www.portlandmaps.com/od/rest/services/COP_OpenData_Miscellaneous/MapServer/216";

// Genera worth asking the server for. classify() makes the final call.
const GENERA = [
  "Malus", "Pyrus", "Prunus", "Ficus", "Diospyros", "Juglans", "Corylus", "Castanea", "Carya",
  "Morus", "Cydonia", "Asimina", "Amelanchier", "Sambucus", "Mespilus", "Cornus", "Crataegus",
  "Sorbus", "Arbutus", "Olea", "Eriobotrya", "Ziziphus", "Feijoa", "Citrus", "Hippophae",
  "Pinus pinea", "xSorbopyrus", "Elaeagnus", "Eleagnus",
];
const PUBLIC_PLACES = { ROW: "street", median: "median", park: "park", "other public": "public", ODOT: "street" };

// Types with fewer public trees than this are folded into "Other edibles",
// so the filter list only shows things you're likely to come across.
const MIN_PER_TYPE = 20;

async function getJSON(url, params) {
  const qs = new URLSearchParams({ f: "geojson", ...params });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}/query?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn(`  retry ${attempt}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function fetchAll(url, where, outFields) {
  const out = [];
  for (let offset = 0; ; offset += 2000) {
    const j = await getJSON(url, {
      where, outFields, outSR: "4326", returnGeometry: "true",
      orderByFields: "OBJECTID", resultOffset: offset, resultRecordCount: 2000,
    });
    out.push(...j.features);
    process.stdout.write(`\r  ${out.length} records`);
    if (j.features.length < 2000 && !j.properties?.exceededTransferLimit) break;
  }
  process.stdout.write("\n");
  return out;
}

const round = (n) => Math.round(n * 1e6) / 1e6;

async function buildTrees() {
  console.log("Street, park and public trees…");
  const where = [
    "status = 'Alive'",
    `prop_type IN (${Object.keys(PUBLIC_PLACES).map((p) => `'${p}'`).join(",")})`,
    "(" + GENERA.map((g) => `species_latin LIKE '${g}%'`).join(" OR ") + ")",
  ].join(" AND ");
  const raw = await fetchAll(TREES, where,
    "OBJECTID,species_common,species_latin,prop_type,park_name,diameter,condition");

  const features = [];
  const counts = {};
  for (const f of raw) {
    const p = f.properties;
    const c = classify(`${p.species_common} | ${p.species_latin}`);
    if (!c || c.fruiting === "ornamental" || !f.geometry) continue;
    counts[c.type] = (counts[c.type] || 0) + 1;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: f.geometry.coordinates.map(round) },
      properties: {
        id: "city-tree:" + p.OBJECTID,
        t: c.type,
        f: c.fruiting === "yes" ? 1 : 0,
        n: p.species_common || "",
        s: p.species_latin || "",
        w: PUBLIC_PLACES[p.prop_type],
        ...(p.park_name ? { pk: p.park_name } : {}),
        ...(p.diameter ? { d: p.diameter } : {}),
        ...(p.condition ? { c: p.condition } : {}),
      },
    });
  }

  // Fold rare types into "other" so the filter list stays honest.
  for (const [t, n] of Object.entries(counts)) {
    if (t !== "other" && n < MIN_PER_TYPE) {
      for (const f of features) if (f.properties.t === t) f.properties.t = "other";
      counts.other = (counts.other || 0) + n;
      delete counts[t];
    }
  }
  console.log(`  kept ${features.length} edible public trees`);
  return { features, counts };
}

function centroid(geom) {
  if (geom.type === "Point") return geom.coordinates;
  const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
  let x = 0, y = 0;
  for (const [a, b] of ring) { x += a; y += b; }
  return [round(x / ring.length), round(y / ring.length)];
}

async function buildGardens() {
  console.log("Community gardens…");
  const raw = await fetchAll(GARDENS, "1=1", "OBJECTID,Site_Name,Status,Plotspergarden,Acres");
  const features = raw.filter((f) => f.geometry).map((f) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: centroid(f.geometry) },
    properties: {
      id: "city-garden:" + f.properties.OBJECTID,
      t: "garden",
      n: (f.properties.Site_Name || "Community garden").trim(),
      st: f.properties.Status || "",
      ...(f.properties.Plotspergarden ? { pl: f.properties.Plotspergarden } : {}),
    },
  }));
  console.log(`  kept ${features.length} gardens`);
  return features;
}

const trees = await buildTrees();
const gardens = await buildGardens();

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const fc = (features) => JSON.stringify({ type: "FeatureCollection", features });
await writeFile(new URL("../data/trees.geojson", import.meta.url), fc(trees.features));
await writeFile(new URL("../data/gardens.geojson", import.meta.url), fc(gardens));
await writeFile(new URL("../data/directory.json", import.meta.url), JSON.stringify({
  built: new Date().toISOString(),
  counts: { ...trees.counts, garden: gardens.length },
  minPerType: MIN_PER_TYPE,
  sources: [
    { name: "City of Portland tree inventory (Urban Forestry)", url: TREES.replace(/\/12$/, "") },
    { name: "Portland Parks & Recreation Community Gardens", url: GARDENS },
  ],
}, null, 1));

console.log("\nBy type:");
for (const [t, n] of Object.entries(trees.counts).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(6)}  ${TYPES[t]?.label || t}`);
