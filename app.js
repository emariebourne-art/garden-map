// Portland Grow Map — main app.
(function () {
  const CFG = window.GROW_CONFIG;
  const { TYPES, GROUPS, classify } = window.GROW_SPECIES;
  const store = window.GROW_STORE;
  const $ = (id) => document.getElementById(id);

  const STATUS_LABEL = {
    pick: "Owner says: please pick",
    ask: "Ask the owner first",
    leave: "Owner says: leave it be",
    ripe: "Ripe now",
    info: "Note",
  };
  const STATUS_COLOR = { pick: "#2f7a3a", ask: "#d09020", leave: "#b23a3a", ripe: "#7b3fa0" };
  const RIPE_DAYS = 21;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisMonth = new Date().getMonth();

  // Look: ?look=field | clean | market (preview options; the chosen one becomes the default).
  const LOOKS = {
    field:  { fruit: "#c8553d", stone: "#8a3f74", berry: "#3f6fb0", nut: "#8a6a3b", garden: "#4f8a3c", cluster: "#c8553d" },
    clean:  { fruit: "#e5484d", stone: "#8e4ec6", berry: "#3e63dd", nut: "#a16a2a", garden: "#30a46c", cluster: "#16181b" },
    market: { fruit: "#ff5a36", stone: "#c2389b", berry: "#3b6cff", nut: "#b07a2a", garden: "#2f9e44", cluster: "#e2572b" },
  };
  const look = LOOKS[new URLSearchParams(location.search).get("look")] ? new URLSearchParams(location.search).get("look") : "field";
  document.documentElement.dataset.look = look;
  for (const g of Object.keys(GROUPS)) GROUPS[g].color = LOOKS[look][g];

  // ---------------------------------------------------------------- state
  const state = {
    types: new Set(Object.keys(TYPES)),
    onlySeason: false,
    onlyPick: false,
    onlySure: false,
    features: new Map(),   // id -> record {id, kind, source, type, fruiting, lng, lat, name, ...}
    wishes: new Map(),     // id -> latest owner wish {status, at}
    ripe: new Map(),       // id -> latest "ripe" note time
    counts: {},
    adding: false,
    openId: null,
  };

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const cap = (s) => String(s || "").replace(/^\w/, (c) => c.toUpperCase());
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    if (s < 86400 * 60) return Math.round(s / 86400) + " days ago";
    return new Date(iso).toLocaleDateString();
  }
  // "Aug–Oct" → is the current month inside it?
  function inSeason(type) {
    const s = TYPES[type]?.season;
    if (!s) return false;
    const [a, b = a] = s.split("–").map((m) => MONTHS.indexOf(m.trim()));
    if (a < 0 || b < 0) return false;
    return a <= b ? thisMonth >= a && thisMonth <= b : thisMonth >= a || thisMonth <= b;
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
  function ringStatus(id) {
    const w = state.wishes.get(id)?.status;
    if (w === "leave") return "leave";
    const r = state.ripe.get(id);
    if (r && Date.now() - new Date(r).getTime() < RIPE_DAYS * 86400000) return "ripe";
    return w || "";
  }

  // ---------------------------------------------------------------- map
  const map = new maplibregl.Map({
    container: "map",
    style: window.growMapStyle(look),
    center: CFG.center,
    zoom: CFG.zoom,
    maxBounds: [[-123.3, 45.2], [-122.1, 45.85]],
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: "Trees &amp; gardens: City of Portland",
  }), "bottom-right");
  // Keep the credits folded into the (i) button so they don't cover the map on phones.
  map.on("load", () => document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  const geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false });
  map.addControl(geolocate, "top-left");

  const groupColor = ["match", ["get", "g"],
    ...Object.entries(GROUPS).flatMap(([k, v]) => [k, v.color]), "#777"];
  const ringColor = ["match", ["get", "ws"],
    ...Object.entries(STATUS_COLOR).flatMap(([k, v]) => [k, v]), "rgba(0,0,0,0)"];

  function addDataLayers() {
    map.addSource("trees", {
      type: "geojson", data: { type: "FeatureCollection", features: [] },
      cluster: true, clusterMaxZoom: 14, clusterRadius: 34,
    });
    map.addSource("gardens", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    // Gardens: soft green squares-ish (large circles) with a name at closer zooms.
    map.addLayer({
      id: "garden-points", type: "circle", source: "gardens",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 8, 18, 12],
        "circle-color": "#e4efd8", "circle-stroke-color": GROUPS.garden.color,
        "circle-stroke-width": ["case", ["==", ["get", "src"], "community"], 1.5, 2.5],
      },
    });
    map.addLayer({
      id: "garden-labels", type: "symbol", source: "gardens", minzoom: 13.5,
      layout: {
        "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11,
        "text-offset": [0, 1.3], "text-anchor": "top", "text-max-width": 9, "text-optional": true,
      },
      paint: { "text-color": "#3f6a30", "text-halo-color": "#f3efe4", "text-halo-width": 2 },
    });

    // Tree clusters: a pale disc with a count. Size grows with how many trees it holds.
    map.addLayer({
      id: "clusters", type: "circle", source: "trees", filter: ["has", "point_count"],
      paint: {
        "circle-color": "#fffaf0",
        "circle-stroke-color": LOOKS[look].cluster, "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.6,
        "circle-radius": ["step", ["get", "point_count"], 12, 25, 15, 100, 19, 500, 24],
      },
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "trees", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": LOOKS[look].cluster },
    });

    // Single trees: a ring for owner wishes / ripeness, then a dot coloured by group.
    map.addLayer({
      id: "tree-rings", type: "circle", source: "trees",
      filter: ["all", ["!", ["has", "point_count"]], ["has", "ws"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 6, 18, 12],
        "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": ringColor, "circle-stroke-width": 2.5,
      },
    });
    map.addSource("selected", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "selected", type: "circle", source: "selected",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 18, 18],
        "circle-color": "rgba(255,255,255,0.65)", "circle-stroke-color": "#1d1b16", "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "tree-points", type: "circle", source: "trees", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 5, 18, 8],
        "circle-color": groupColor,
        "circle-opacity": ["case", ["==", ["get", "f"], 1], 1, 0.55],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 17, 1.5],
      },
    });
    map.addLayer({
      id: "tree-labels", type: "symbol", source: "trees", minzoom: 17.5,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 11,
        "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true,
      },
      paint: { "text-color": "#5a5548", "text-halo-color": "#f3efe4", "text-halo-width": 2 },
    });

    map.on("click", "clusters", async (e) => {
      const f = e.features[0];
      const zoom = await map.getSource("trees").getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom, 18) });
    });
    for (const layer of ["tree-points", "garden-points"]) {
      map.on("click", layer, (e) => { if (!state.adding) openDetail(e.features[0].properties.id); });
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = state.adding ? "crosshair" : ""; });
    }
    map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
  }

  // ---------------------------------------------------------------- filtering & drawing
  function visible(f) {
    if (!state.types.has(f.type)) return false;
    if (f.kind === "tree") {
      if (state.onlySeason && !inSeason(f.type)) return false;
      if (state.onlySure && f.fruiting !== "yes") return false;
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
      if (!map.getSource("trees")) return;
      const trees = [], gardens = [];
      for (const f of state.features.values()) {
        if (!visible(f)) continue;
        const ws = ringStatus(f.id);
        const props = {
          id: f.id, g: TYPES[f.type]?.group || "berry", f: f.fruiting === "yes" ? 1 : 0,
          label: f.kind === "tree" ? (TYPES[f.type]?.label || "") : f.name, src: f.source,
          ...(ws ? { ws } : {}),
        };
        (f.kind === "tree" ? trees : gardens).push({
          type: "Feature", geometry: { type: "Point", coordinates: [f.lng, f.lat] }, properties: props,
        });
      }
      map.getSource("trees").setData({ type: "FeatureCollection", features: trees });
      map.getSource("gardens").setData({ type: "FeatureCollection", features: gardens });
    });
  }

  // ---------------------------------------------------------------- loading the directory
  async function loadDirectory() {
    const [trees, gardens, dir] = await Promise.all(
      [CFG.data.trees, CFG.data.gardens, CFG.data.directory].map((u) => fetch(u).then((r) => {
        if (!r.ok) throw new Error(u + ": HTTP " + r.status);
        return r.json();
      })));
    for (const feat of trees.features) {
      const p = feat.properties;
      const [lng, lat] = feat.geometry.coordinates;
      state.features.set(p.id, {
        id: p.id, kind: "tree", source: "city", type: p.t, fruiting: p.f ? "yes" : "maybe",
        lng, lat, name: cap(p.n) || TYPES[p.t]?.label, species: p.s, where: p.w, park: p.pk,
        diameter: p.d, condition: p.c,
      });
    }
    for (const feat of gardens.features) {
      const p = feat.properties;
      const [lng, lat] = feat.geometry.coordinates;
      state.features.set(p.id, {
        id: p.id, kind: "garden", source: "city", type: "garden", lng, lat,
        name: /garden/i.test(p.n) ? p.n : p.n + " Community Garden", plots: p.pl, status: p.st,
      });
    }
    state.counts = { ...dir.counts };
    const built = new Date(dir.built).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    $("data-status").innerHTML =
      `${trees.features.length.toLocaleString()} edible trees on streets, medians and public land, and ` +
      `${gardens.features.length} community gardens, from the City of Portland. Updated ${built}. ` +
      `Trees on private property, dead trees and flowering-only varieties are left out.`;
  }

  async function loadCommunity() {
    try {
      const [spots, notes] = await Promise.all([store.listSpots(), store.listNoteSummaries()]);
      for (const s of spots) addCommunitySpot(s);
      for (const n of notes) recordNote(n);
    } catch (e) {
      console.warn(e);
      $("storage-mode").textContent = "Shared notes couldn’t be loaded: " + e.message;
    }
  }
  function addCommunitySpot(s) {
    const kind = s.kind || "tree";
    state.features.set(s.id, {
      id: s.id, kind: kind === "tree" ? "tree" : "garden", source: "community", lng: s.lng, lat: s.lat,
      name: s.name, type: kind === "tree" ? s.type : kind, fruiting: "yes", created_at: s.created_at,
    });
    if (kind === "yard") state.counts.yard = (state.counts.yard || 0) + 1;
  }

  // ---------------------------------------------------------------- filter panel
  function buildFilters() {
    const byGroup = {};
    for (const [key, t] of Object.entries(TYPES)) {
      const n = state.counts[key] || 0;
      // Only list what's actually growing here (the directory already folds rare types into "other").
      if (!n && key !== "yard") continue;
      (byGroup[t.group] ||= []).push([key, t, n]);
    }
    $("type-filters").innerHTML = Object.entries(GROUPS).map(([g, info]) => {
      const items = (byGroup[g] || []).sort((a, b) => (a[0] === "other") - (b[0] === "other") || b[2] - a[2]);
      if (!items.length) return "";
      return `<fieldset class="group">
        <legend><label><input type="checkbox" data-group="${g}" checked>
          <span class="dot" style="background:${info.color}"></span>${esc(info.label)}</label></legend>
        <div class="type-grid">${items.map(([k, t, n]) => `
          <label title="${esc(t.season ? "Ripe " + t.season : "")}"><input type="checkbox" data-type="${k}" checked>
          ${esc(t.label)}<span class="count">${n ? n.toLocaleString() : ""}</span></label>`).join("")}
        </div></fieldset>`;
    }).join("");
  }
  // "Market" look: one chip per group across the top; "More filters" opens the panel.
  function buildChips() {
    if (look !== "market") return;
    const bar = document.createElement("nav");
    bar.className = "chipbar";
    bar.setAttribute("aria-label", "Quick filters");
    bar.innerHTML = Object.entries(GROUPS).map(([g, info]) =>
      `<button class="chip" data-chip="${g}" aria-pressed="true" style="--c:${info.color}">${esc(info.label)}</button>`).join("") +
      `<button class="chip more" id="chip-more" aria-pressed="false">More filters</button>`;
    document.body.appendChild(bar);
    bar.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      if (b.id === "chip-more") {
        const open = $("panel").classList.toggle("open");
        b.setAttribute("aria-pressed", String(open));
        return;
      }
      const box = document.querySelector(`#type-filters [data-group="${b.dataset.chip}"]`);
      if (!box) return;
      box.checked = b.getAttribute("aria-pressed") !== "true";
      box.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  function syncChips() {
    document.querySelectorAll(".chip[data-chip]").forEach((c) => {
      const box = document.querySelector(`#type-filters [data-group="${c.dataset.chip}"]`);
      c.setAttribute("aria-pressed", String(!!box && (box.checked || box.indeterminate)));
    });
  }
  function syncGroupBoxes() {
    document.querySelectorAll("#type-filters [data-group]").forEach((g) => {
      const boxes = [...g.closest("fieldset").querySelectorAll("[data-type]")];
      const on = boxes.filter((b) => b.checked).length;
      g.checked = on === boxes.length;
      g.indeterminate = on > 0 && on < boxes.length;
    });
    syncChips();
  }
  $("type-filters").addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.group) {
      t.closest("fieldset").querySelectorAll("[data-type]").forEach((b) => {
        b.checked = t.checked;
        t.checked ? state.types.add(b.dataset.type) : state.types.delete(b.dataset.type);
      });
    } else if (t.dataset.type) {
      t.checked ? state.types.add(t.dataset.type) : state.types.delete(t.dataset.type);
    }
    syncGroupBoxes();
    render();
  });
  function setAllTypes(on) {
    document.querySelectorAll("#type-filters input").forEach((i) => { i.checked = on; i.indeterminate = false; });
    state.types = new Set(on ? Object.keys(TYPES) : []);
    render();
  }
  $("types-all").onclick = () => setAllTypes(true);
  $("types-none").onclick = () => setAllTypes(false);

  const bind = (id, key) => $(id).addEventListener("change", (e) => { state[key] = e.target.checked; render(); });
  bind("only-season", "onlySeason");
  bind("only-pick", "onlyPick");
  bind("only-sure", "onlySure");
  $("season-month").textContent = "(" + new Date().toLocaleDateString(undefined, { month: "long" }) + ")";

  $("toggle-panel").onclick = () => {
    const open = $("panel").classList.toggle("open");
    $("toggle-panel").setAttribute("aria-expanded", String(open));
  };
  $("storage-mode").textContent = store.shared
    ? "Notes are shared with everyone who uses this map."
    : "Notes are saved in this browser only until a shared database is set up (see README).";

  // ---------------------------------------------------------------- satellite & locate
  $("satellite").onclick = () => {
    const on = !map.getLayer("satellite");
    if (on) {
      if (!map.getSource("satellite")) map.addSource("satellite", {
        type: "raster", tileSize: 256, maxzoom: 19,
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer({ id: "satellite", type: "raster", source: "satellite" }, "garden-points");
    } else {
      map.removeLayer("satellite");
    }
    $("satellite").setAttribute("aria-pressed", String(on));
  };
  $("locate").onclick = () => geolocate.trigger();

  // ---------------------------------------------------------------- detail sheet
  function openDetail(id) {
    const f = state.features.get(id);
    if (!f) return;
    state.openId = id;
    const t = TYPES[f.type] || TYPES.other;
    const ll = `${f.lat.toFixed(6)},${f.lng.toFixed(6)}`;
    const wish = state.wishes.get(id);
    const ripe = ringStatus(id) === "ripe" ? state.ripe.get(id) : null;

    let facts = [];
    if (f.kind === "tree" && f.source === "city") {
      const where = { street: "Street tree", median: "On a median", park: f.park ? "In " + f.park : "In a park", public: "On public land" }[f.where];
      if (where) facts.push(where);
      if (f.diameter) facts.push(`trunk ${Math.round(f.diameter)}″ across`);
      if (f.condition) facts.push(`condition: ${f.condition.toLowerCase()}`);
    }
    if (f.kind === "garden" && f.plots) facts.push(`${f.plots} plots`);
    const caveat = f.kind === "tree" && f.fruiting !== "yes"
      ? "This one may not fruit well. The fruit can be small, tart or sparse, or need cooking first." : "";
    const sourceLine = f.source === "city"
      ? (f.kind === "garden" ? "Portland Parks &amp; Recreation community garden" : "From the City of Portland tree inventory")
      : `Added by a neighbour ${f.created_at ? ago(f.created_at) : ""}`;
    const gardenNote = f.kind === "garden"
      ? `<p class="muted">Plots belong to the gardeners who tend them. Visit and admire; pick only where signs say it’s shared.</p>` : "";

    $("detail-body").innerHTML = `
      <div class="kicker" style="color:${GROUPS[t.group]?.color}">${t.icon} ${esc(t.label)}${t.season ? " · ripe " + t.season : ""}</div>
      <h3>${esc(f.name)}</h3>
      ${f.species ? `<div class="sub"><i>${esc(f.species)}</i></div>` : ""}
      ${facts.length ? `<div class="sub">${esc(facts.join(" · "))}</div>` : ""}
      <div class="badges">
        ${wish ? `<span class="badge ${wish.status}">${STATUS_LABEL[wish.status]}</span>` : ""}
        ${ripe ? `<span class="badge ripe">Reported ripe ${ago(ripe)}</span>` : ""}
      </div>
      ${caveat ? `<p class="muted">${caveat}</p>` : ""}
      ${gardenNote}
      <p class="muted small">${sourceLine}</p>
      <div class="links">
        <a target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}">Street View</a>
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
        ${store.shared ? "" : `<small class="muted">Notes are saved in this browser only for now.</small>`}
      </form>`;
    $("detail").hidden = false;
    map.getSource("selected")?.setData({ type: "Feature", geometry: { type: "Point", coordinates: [f.lng, f.lat] }, properties: {} });
    const form = $("note-form");
    try { form.author.value = localStorage.getItem("pdx-grow-nick") || ""; } catch {}
    form.addEventListener("submit", (e) => submitNote(e, id));
    loadNotes(id);

    // On phones the sheet covers the bottom of the map: keep the chosen spot visible above it.
    const sheetH = window.innerWidth <= 760 ? $("detail").offsetHeight : 0;
    const sideW = window.innerWidth > 760 ? $("detail").offsetWidth + 24 : 0;
    map.easeTo({
      center: [f.lng, f.lat], zoom: Math.max(map.getZoom(), 16),
      padding: { bottom: sheetH, right: sideW, top: 0, left: 0 }, duration: 500,
    });
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
      recordNote(await store.addNote(note));
      render();
      openDetail(id);
    } catch (err) {
      alert("Couldn’t save the note: " + err.message);
      btn.disabled = false;
    }
  }

  function closeDetail() {
    $("detail").hidden = true;
    state.openId = null;
    map.getSource("selected")?.setData({ type: "FeatureCollection", features: [] });
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 });
  }
  $("close-detail").onclick = closeDetail;

  // ---------------------------------------------------------------- add a spot
  $("spot-type").innerHTML = Object.entries(TYPES)
    .filter(([, t]) => t.group !== "garden")
    .map(([k, t]) => `<option value="${k}">${t.icon} ${t.label}</option>`).join("");
  $("spot-kind").onchange = (e) => { $("spot-type-wrap").hidden = e.target.value !== "tree"; };

  let pendingLngLat = null;
  function setAdding(on) {
    state.adding = on;
    $("add-hint").hidden = !on;
    map.getCanvas().style.cursor = on ? "crosshair" : "";
  }
  $("add-spot").onclick = () => {
    $("panel").classList.remove("open");
    if (!$("detail").hidden) closeDetail();
    setAdding(true);
  };
  $("cancel-add").onclick = () => setAdding(false);
  map.on("click", (e) => {
    if (!state.adding) return;
    pendingLngLat = e.lngLat;
    setAdding(false);
    $("spot-form").reset();
    $("spot-type-wrap").hidden = false;
    $("spot-dialog").showModal();
  });

  $("spot-dialog").addEventListener("close", async () => {
    if ($("spot-dialog").returnValue !== "ok" || !pendingLngLat) return;
    const fd = new FormData($("spot-form"));
    const kind = fd.get("kind");
    const spot = {
      kind,
      type: kind === "tree" ? fd.get("type") : kind,
      name: String(fd.get("name")).trim().slice(0, 80),
      lat: +pendingLngLat.lat.toFixed(6),
      lng: +pendingLngLat.lng.toFixed(6),
    };
    try {
      const row = await store.addSpot(spot);
      addCommunitySpot(row);
      state.types.add(row.type);
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

  // ---------------------------------------------------------------- go
  const mapReady = new Promise((r) => map.on("load", r));
  Promise.all([
    loadDirectory().catch((e) => {
      console.error(e);
      $("data-status").textContent = "The tree directory couldn’t be loaded (" + e.message + ").";
    }),
    loadCommunity(),
  ]).then(async () => {
    buildFilters();
    buildChips();
    await mapReady;
    addDataLayers();
    render();
  });

  // Exposed for tests and debugging.
  window.GROW_APP = { state, map, classify, openDetail };
})();
