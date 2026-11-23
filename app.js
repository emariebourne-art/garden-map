// Portland Grow Map — main app.
(function () {
  const CFG = window.GROW_CONFIG;
  const { TYPES, classify } = window.GROW_SPECIES;
  const store = window.GROW_STORE;
  const $ = (id) => document.getElementById(id);

  const FRUIT_KEYS = Object.keys(TYPES).filter((k) => !["garden", "yard"].includes(k));
  const STATUS_LABEL = {
    pick: "Owner says: please pick",
    ask: "Ask the owner first",
    leave: "Owner says: leave it be",
    ripe: "Ripe now",
    info: "Note",
  };
  const RIPE_DAYS = 21;

  // ---------------------------------------------------------------- state
  const state = {
    types: new Set(FRUIT_KEYS),
    showOrnamental: false,
    onlyPick: false,
    layers: { trees: true, gardens: true, community: true },
    features: new Map(),   // id -> normalized feature
    markers: new Map(),    // id -> Leaflet marker
    wishes: new Map(),     // spot_id -> latest owner wish {status, at}
    ripe: new Map(),       // spot_id -> latest ripe note time
    adding: false,
    openId: null,
  };

  // ---------------------------------------------------------------- map
  const map = L.map("map", { zoomControl: true }).setView(CFG.center, CFG.zoom);
  const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }
  );
  L.control.layers({ Streets: streets, Satellite: satellite }, null, { position: "topright" }).addTo(map);

  const cluster = L.markerClusterGroup({ disableClusteringAtZoom: 18, maxClusterRadius: 45, showCoverageOnHover: false });
  map.addLayer(cluster);

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    if (s < 86400 * 60) return Math.round(s / 86400) + " days ago";
    return new Date(iso).toLocaleDateString();
  }
  function setSource(key, cls, text) {
    let li = document.querySelector(`#source-status li[data-key="${key}"]`);
    if (!li) {
      li = document.createElement("li");
      li.dataset.key = key;
      $("source-status").appendChild(li);
    }
    li.className = cls;
    li.innerHTML = text;
  }
  function pickField(props, regex) {
    return Object.keys(props).find((k) => regex.test(k) && props[k] != null && String(props[k]).trim() !== "");
  }

  // ---------------------------------------------------------------- notes summary
  function recordNote(n) {
    const t = n.created_at;
    if (["pick", "ask", "leave"].includes(n.status)) {
      const cur = state.wishes.get(n.spot_id);
      if (!cur || cur.at < t) state.wishes.set(n.spot_id, { status: n.status, at: t });
    }
    if (n.status === "ripe") {
      const cur = state.ripe.get(n.spot_id);
      if (!cur || cur < t) state.ripe.set(n.spot_id, t);
    }
  }
  function badgeStatus(id) {
    const r = state.ripe.get(id);
    if (r && Date.now() - new Date(r).getTime() < RIPE_DAYS * 86400000) {
      const w = state.wishes.get(id);
      return w && w.status === "leave" ? "leave" : "ripe";
    }
    return state.wishes.get(id)?.status || "";
  }

  // ---------------------------------------------------------------- markers
  function iconFor(f) {
    const t = TYPES[f.type] || TYPES.other;
    const cls = ["pin", badgeStatus(f.id), f.fruiting || "", f.kind === "garden" ? "garden" : "", f.source === "community" ? "community" : ""]
      .filter(Boolean).join(" ");
    return L.divIcon({ className: "", html: `<div class="${cls}">${t.icon}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
  }
  function markerFor(f) {
    let m = state.markers.get(f.id);
    if (!m) {
      m = L.marker([f.lat, f.lng], { icon: iconFor(f), title: f.name, keyboard: true });
      m.on("click", () => openDetail(f.id));
      state.markers.set(f.id, m);
    }
    return m;
  }
  function refreshIcon(id) {
    const f = state.features.get(id), m = state.markers.get(id);
    if (f && m) m.setIcon(iconFor(f));
  }

  function visible(f) {
    if (f.source === "city" && f.kind === "tree" && !state.layers.trees) return false;
    if (f.source === "city" && f.kind === "garden" && !state.layers.gardens) return false;
    if (f.source === "community" && !state.layers.community) return false;
    if (f.kind === "tree") {
      if (!state.types.has(f.type)) return false;
      if (f.fruiting === "ornamental" && !state.showOrnamental) return false;
    }
    if (state.onlyPick && state.wishes.get(f.id)?.status !== "pick") return false;
    return true;
  }

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      const want = [];
      for (const f of state.features.values()) if (visible(f)) want.push(markerFor(f));
      cluster.clearLayers();
      cluster.addLayers(want);
      updateCounts();
    });
  }

  function updateCounts() {
    const b = map.getBounds();
    const counts = {};
    for (const f of state.features.values()) {
      if (f.kind !== "tree" || !b.contains([f.lat, f.lng])) continue;
      if (f.fruiting === "ornamental" && !state.showOrnamental) continue;
      counts[f.type] = (counts[f.type] || 0) + 1;
    }
    document.querySelectorAll("#type-filters [data-count]").forEach((el) => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = n ? n : "";
    });
  }

  // ---------------------------------------------------------------- city street trees
  // Fetched per grid cell so panning around doesn't re-download what we already have.
  const CELL = 0.005; // degrees, roughly 550 m × 390 m in Portland
  const cells = new Map(); // key -> "loading" | "done" | "error"
  let treeUrl = null, treeFormat = "geojson", treeCount = 0, treeErrors = 0;

  function cellKeysInView() {
    const b = map.getBounds().pad(0.1);
    const keys = [];
    for (let x = Math.floor(b.getWest() / CELL); x <= Math.floor(b.getEast() / CELL); x++)
      for (let y = Math.floor(b.getSouth() / CELL); y <= Math.floor(b.getNorth() / CELL); y++)
        keys.push(x + ":" + y);
    return keys;
  }

  function treeText(props) {
    const fields = Object.keys(props).filter((k) => /common|species|genus|scientific|botanical|tree_?name|cultivar|variety/i.test(k));
    const vals = (fields.length ? fields : Object.keys(props)).map((k) => props[k]).filter((v) => typeof v === "string");
    return vals.join(" | ");
  }

  function addTreeFromProps(props, lng, lat) {
    if (!isFinite(lat) || !isFinite(lng)) return;
    const c = classify(treeText(props));
    if (!c) return;
    const idField = pickField(props, /^(objectid|fid|ogc_fid|tree_?id|inventory_?id|id)$/i);
    const id = "city-tree:" + (idField ? props[idField] : lat.toFixed(6) + "," + lng.toFixed(6));
    if (state.features.has(id)) return;
    const common = props[pickField(props, /common/i)] || "";
    const sci = props[pickField(props, /scientific|botanical|genus_?spec|species/i)] || "";
    state.features.set(id, {
      id, kind: "tree", source: "city", type: c.type, fruiting: c.fruiting, lat, lng,
      name: titleCase(common) || sci || TYPES[c.type].label,
      species: sci, props,
    });
    treeCount++;
  }

  async function queryArcGIS(url, [x, y], format, offset) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: [x * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL].join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326", outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*", returnGeometry: "true",
      f: format,
    });
    if (offset) params.set("resultOffset", offset);
    const res = await fetch(url.replace(/\/$/, "") + "/query?" + params);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "ArcGIS error");
    return data;
  }

  async function loadCell(key) {
    cells.set(key, "loading");
    const xy = key.split(":").map(Number);
    const urls = treeUrl ? [treeUrl] : CFG.sources.streetTrees;
    for (const url of urls) {
      for (const format of treeUrl ? [treeFormat] : ["geojson", "json"]) {
        try {
          let offset = 0;
          for (let page = 0; page < 6; page++) {
            const data = await queryArcGIS(url, xy, format, offset);
            if (format === "geojson") {
              for (const f of data.features || []) {
                const g = f.geometry;
                if (g && g.type === "Point") addTreeFromProps(f.properties || {}, g.coordinates[0], g.coordinates[1]);
              }
            } else {
              for (const f of data.features || []) {
                const g = f.geometry || {};
                addTreeFromProps(f.attributes || {}, g.x, g.y);
              }
            }
            const n = (data.features || []).length;
            const more = data.exceededTransferLimit || data.properties?.exceededTransferLimit;
            if (!more || !n) break;
            offset += n;
          }
          treeUrl = url; treeFormat = format;
          cells.set(key, "done");
          setSource("trees", "ok", `Street Tree Inventory — ${treeCount.toLocaleString()} fruit &amp; nut trees loaded so far`);
          return;
        } catch (e) {
          console.warn("Street trees:", url, format, e);
        }
      }
    }
    cells.set(key, "error");
    treeErrors++;
    setSource("trees", "err",
      `Street Tree Inventory couldn’t be reached. Check <code>sources.streetTrees</code> in config.js. ` +
      `<a href="https://www.portland.gov/trees/get-involved/tree-inventory" target="_blank" rel="noopener">Dataset page</a>`);
  }

  async function loadTreesInView() {
    const zoomedIn = map.getZoom() >= CFG.treeMinZoom;
    $("zoom-hint").hidden = zoomedIn || !state.layers.trees || state.adding;
    if (!zoomedIn || !state.layers.trees) return;
    const todo = cellKeysInView().filter((k) => !cells.has(k));
    if (!todo.length) return;
    if (!treeCount && !treeErrors) setSource("trees", "wait", "Street Tree Inventory — loading…");
    // A few at a time to be polite to the city's server.
    const queue = todo.slice();
    const worker = async () => {
      while (queue.length) {
        await loadCell(queue.shift());
        render();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  // ---------------------------------------------------------------- city community gardens
  async function loadGardens() {
    setSource("gardens", "wait", "Community gardens — loading…");
    for (const url of CFG.sources.communityGardens) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const gj = await res.json();
        if (!gj.features) throw new Error("not GeoJSON");
        let n = 0;
        for (const feat of gj.features) {
          if (!feat.geometry) continue;
          const props = feat.properties || {};
          const c = L.geoJSON(feat).getBounds().getCenter();
          const nameKey = pickField(props, /^(name|site_?name|garden_?name|sitename|gardenname)$/i) || pickField(props, /name/i);
          const idKey = pickField(props, /^(objectid|fid|id|propertyid)$/i);
          const name = props[nameKey] || "Community garden";
          const id = "city-garden:" + (idKey ? props[idKey] : name);
          state.features.set(id, { id, kind: "garden", source: "city", type: "garden", lat: c.lat, lng: c.lng, name, props });
          n++;
        }
        setSource("gardens", "ok", `PP&amp;R Community Gardens — ${n} gardens`);
        render();
        return;
      } catch (e) {
        console.warn("Community gardens:", url, e);
      }
    }
    setSource("gardens", "err",
      `Community gardens couldn’t be reached. Check <code>sources.communityGardens</code> in config.js. ` +
      `<a href="https://www.portland.gov/parks/community-gardens" target="_blank" rel="noopener">Garden list</a>`);
  }

  // ---------------------------------------------------------------- community spots & notes
  async function loadCommunity() {
    setSource("community", "wait", "Neighbour-added spots — loading…");
    try {
      const [spots, notes] = await Promise.all([store.listSpots(), store.listNoteSummaries()]);
      for (const s of spots) addCommunitySpot(s);
      for (const n of notes) recordNote(n);
      for (const id of state.markers.keys()) refreshIcon(id);
      setSource("community", "ok", `Neighbour-added spots — ${spots.length}; notes — ${notes.length}`);
      render();
    } catch (e) {
      console.warn(e);
      setSource("community", "err", "Shared notes couldn’t be loaded: " + esc(e.message));
    }
  }
  function addCommunitySpot(s) {
    const kind = s.kind || "tree";
    state.features.set(s.id, {
      id: s.id, kind, source: "community", lat: s.lat, lng: s.lng, name: s.name,
      type: kind === "tree" ? s.type : kind, fruiting: "yes", created_at: s.created_at,
    });
  }

  // ---------------------------------------------------------------- detail sheet
  async function openDetail(id) {
    const f = state.features.get(id);
    if (!f) return;
    state.openId = id;
    const t = TYPES[f.type] || TYPES.other;
    const ll = `${f.lat.toFixed(6)},${f.lng.toFixed(6)}`;
    const wish = state.wishes.get(id);
    const caveat = {
      maybe: "May not fruit every year, or fruit may be small or tart.",
      ornamental: "Ornamental variety — bred for flowers. Fruit is usually tiny or absent.",
    }[f.fruiting] || "";
    const sourceLine = f.source === "city"
      ? (f.kind === "garden" ? "Portland Parks &amp; Recreation community garden" : "City of Portland Street Tree Inventory (public right-of-way)")
      : `Added by a neighbour ${f.created_at ? ago(f.created_at) : ""}`;
    const gardenNote = f.kind === "garden"
      ? `<p class="muted">Plots belong to the gardeners who rent them. Visit and admire; pick only from areas signed as shared.</p>` : "";
    const raw = f.props
      ? `<details class="raw"><summary>City record</summary><dl>${Object.entries(f.props)
          .filter(([, v]) => v !== null && v !== "")
          .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></details>` : "";

    $("detail-body").innerHTML = `
      <h3>${t.icon} ${esc(f.name)}</h3>
      <div class="sub">${esc(t.label)}${f.species ? " · <i>" + esc(f.species) + "</i>" : ""}${t.season ? " · ripe " + t.season : ""}</div>
      ${wish ? `<span class="badge ${wish.status}">${STATUS_LABEL[wish.status]}</span>` : ""}
      ${badgeStatus(id) === "ripe" ? `<span class="badge ripe">Reported ripe ${ago(state.ripe.get(id))}</span>` : ""}
      ${caveat ? `<p class="muted">${caveat}</p>` : ""}
      <p class="muted">${sourceLine}</p>
      ${gardenNote}
      <div class="links">
        <a target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}">Street View</a>
        <a target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=map&center=${ll}&zoom=20&basemap=satellite">Satellite</a>
        <a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=walking">Walking directions</a>
      </div>
      <h2>Notes from neighbours</h2>
      <ul class="notes" id="notes"><li class="muted">Loading…</li></ul>
      <form class="note-form" id="note-form">
        <div class="two">
          <select name="status" aria-label="Kind of note">
            <option value="info">General note</option>
            <option value="ripe">It’s ripe now</option>
            <option value="pick">Owner says: please pick</option>
            <option value="ask">Ask the owner first</option>
            <option value="leave">Owner says: leave it be</option>
          </select>
          <input name="author" maxlength="40" placeholder="Your nickname" aria-label="Nickname">
        </div>
        <textarea name="body" maxlength="500" rows="2" required placeholder="Leave a note for the next forager"></textarea>
        <button class="btn primary">Post note</button>
        ${store.shared ? "" : `<small>Notes are saved in this browser only until a shared database is set up.</small>`}
      </form>
      ${raw}`;
    $("detail").hidden = false;
    const form = $("note-form");
    try { form.author.value = localStorage.getItem("pdx-grow-nick") || ""; } catch {}
    form.addEventListener("submit", (e) => submitNote(e, id));
    loadNotes(id);
  }

  async function loadNotes(id) {
    const ul = $("notes");
    try {
      const notes = await store.listNotes(id);
      if (state.openId !== id) return;
      ul.innerHTML = notes.length ? notes.map((n) => `
        <li><div class="meta"><span class="badge ${esc(n.status)}">${esc(STATUS_LABEL[n.status] || n.status)}</span>
        ${esc(n.author || "Anonymous")} · ${ago(n.created_at)}</div><p>${esc(n.body)}</p></li>`).join("")
        : `<li class="muted">No notes yet. Know something about this one? Say so below.</li>`;
    } catch (e) {
      ul.innerHTML = `<li class="muted">Couldn’t load notes: ${esc(e.message)}</li>`;
    }
  }

  async function submitNote(e, id) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector("button");
    const note = {
      spot_id: id,
      status: form.status.value,
      author: form.author.value.trim().slice(0, 40) || null,
      body: form.body.value.trim().slice(0, 500),
    };
    if (!note.body) return;
    try { localStorage.setItem("pdx-grow-nick", note.author || ""); } catch {}
    btn.disabled = true;
    try {
      const row = await store.addNote(note);
      recordNote(row);
      refreshIcon(id);
      openDetail(id);
      render();
    } catch (err) {
      alert("Couldn’t save the note: " + err.message);
      btn.disabled = false;
    }
  }

  $("close-detail").onclick = () => { $("detail").hidden = true; state.openId = null; };

  // ---------------------------------------------------------------- add a spot
  const typeSelect = $("spot-type");
  typeSelect.innerHTML = FRUIT_KEYS.map((k) => `<option value="${k}">${TYPES[k].icon} ${TYPES[k].label}</option>`).join("");
  $("spot-kind").onchange = (e) => { $("spot-type-wrap").hidden = e.target.value !== "tree"; };

  let pendingLatLng = null;
  function setAdding(on) {
    state.adding = on;
    $("add-hint").hidden = !on;
    map.getContainer().style.cursor = on ? "crosshair" : "";
    loadTreesInView();
  }
  $("add-spot").onclick = () => {
    $("panel").classList.remove("open");
    $("detail").hidden = true;
    state.openId = null;
    setAdding(true);
  };
  $("cancel-add").onclick = () => setAdding(false);
  map.on("click", (e) => {
    if (!state.adding) return;
    pendingLatLng = e.latlng;
    setAdding(false);
    $("spot-form").reset();
    $("spot-type-wrap").hidden = false;
    $("spot-dialog").showModal();
  });

  $("spot-dialog").addEventListener("close", async () => {
    if ($("spot-dialog").returnValue !== "ok" || !pendingLatLng) return;
    const fd = new FormData($("spot-form"));
    const kind = fd.get("kind");
    const spot = {
      kind,
      type: kind === "tree" ? fd.get("type") : kind,
      name: String(fd.get("name")).trim().slice(0, 80),
      lat: +pendingLatLng.lat.toFixed(6),
      lng: +pendingLatLng.lng.toFixed(6),
    };
    try {
      const row = await store.addSpot(spot);
      addCommunitySpot(row);
      const body = String(fd.get("body") || "").trim();
      const status = fd.get("status");
      if (body || status !== "info") {
        let author = null;
        try { author = localStorage.getItem("pdx-grow-nick") || null; } catch {}
        recordNote(await store.addNote({ spot_id: row.id, status, author, body: body || STATUS_LABEL[status] }));
      }
      render();
      openDetail(row.id);
    } catch (err) {
      alert("Couldn’t add the spot: " + err.message);
    }
  });

  // ---------------------------------------------------------------- filter panel
  $("type-filters").innerHTML = FRUIT_KEYS.map((k) => `
    <label><input type="checkbox" data-type="${k}" checked> ${TYPES[k].icon} ${TYPES[k].label}
    <span class="count" data-count="${k}"></span></label>`).join("");
  $("type-filters").addEventListener("change", (e) => {
    const k = e.target.dataset.type;
    if (!k) return;
    e.target.checked ? state.types.add(k) : state.types.delete(k);
    render();
  });
  function setAllTypes(on) {
    document.querySelectorAll("#type-filters input").forEach((i) => { i.checked = on; });
    state.types = new Set(on ? FRUIT_KEYS : []);
    render();
  }
  $("types-all").onclick = () => setAllTypes(true);
  $("types-none").onclick = () => setAllTypes(false);

  const bind = (id, fn) => $(id).addEventListener("change", (e) => { fn(e.target.checked); render(); });
  bind("layer-trees", (v) => { state.layers.trees = v; loadTreesInView(); });
  bind("layer-gardens", (v) => { state.layers.gardens = v; });
  bind("layer-community", (v) => { state.layers.community = v; });
  bind("show-ornamental", (v) => { state.showOrnamental = v; });
  bind("only-pick", (v) => { state.onlyPick = v; });

  $("toggle-panel").onclick = () => {
    const open = $("panel").classList.toggle("open");
    $("toggle-panel").setAttribute("aria-expanded", String(open));
  };

  $("storage-mode").textContent = store.shared
    ? "Notes are shared with everyone who uses this map."
    : "Notes are saved in this browser only. See README to turn on shared notes.";

  // ---------------------------------------------------------------- go
  map.on("moveend", () => { loadTreesInView(); updateCounts(); });
  loadGardens();
  loadCommunity();
  loadTreesInView();

  // Exposed for tests and debugging.
  window.GROW_APP = { state, map };
})();
