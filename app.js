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
  const STATUS_COLOR = { pick: "#2f7a3a", ask: "#d09020", leave: "#b23a3a", ripe: "#7b3fa0", report: "#9aa0a6", gone: "#3a3d41" };
  const RIPE_DAYS = 21;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const thisMonth = new Date().getMonth();

  const CLUSTER_COLOR = "#16181b";

  // ---------------------------------------------------------------- state
  const state = {
    types: new Set(Object.keys(TYPES)),
    onlySeason: false,
    onlyPick: false,
    onlySure: false,
    features: new Map(),   // id -> record {id, kind, source, type, fruiting, lng, lat, name, ...}
    wishes: new Map(),     // id -> latest owner wish {status, at}
    ripe: new Map(),       // id -> latest "ripe" note time
    reports: new Map(),    // id -> [{kind, corrected_type, created_at}] corrections from neighbours
    review: new Map(),     // id -> summary of those reports (see reviewOf)
    showGone: false,
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
    if (s === "Year-round") return true;
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
  // ---------------------------------------------------------------- corrections from neighbours
  // A "still here" report cancels every problem report made before it. After that:
  //   2+ say gone / can't reach / not an edible tree  → hidden from the map
  //   2+ name the same right type                     → the tree is relabelled
  //   a single report                                 → shown on the pin and in the details, nothing hidden
  const NEEDED = 2;
  function recordReport(r) {
    const list = state.reports.get(r.spot_id) || [];
    list.push(r);
    state.reports.set(r.spot_id, list);
    state.review.delete(r.spot_id);
  }
  function reviewOf(id) {
    if (state.review.has(id)) return state.review.get(id);
    const all = (state.reports.get(id) || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    let lastConfirmed = null, open = [];
    for (const r of all) {
      if (r.kind === "still_here") { lastConfirmed = r.created_at; open = []; } else open.push(r);
    }
    const gone = open.filter((r) => r.kind === "gone" || (r.kind === "wrong_type" && r.corrected_type === "none")).length;
    const unreachable = open.filter((r) => r.kind === "unreachable").length;
    const votes = {};
    for (const r of open) if (r.kind === "wrong_type" && r.corrected_type && r.corrected_type !== "none")
      votes[r.corrected_type] = (votes[r.corrected_type] || 0) + 1;
    const [topType, topVotes] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [null, 0];
    const v = {
      gone, unreachable, votes, lastConfirmed,
      removed: gone >= NEEDED || unreachable >= NEEDED || gone + unreachable >= NEEDED + 1,
      type: topVotes >= NEEDED && TYPES[topType] ? topType : null,
      open: open.length,
    };
    state.review.set(id, v);
    return v;
  }
  const typeOf = (f) => (f.kind === "tree" && reviewOf(f.id).type) || f.type;

  function ringStatus(id) {
    const rv = reviewOf(id);
    if (rv.removed) return "gone";
    if (rv.open && !rv.type) return "report";
    const w = state.wishes.get(id)?.status;
    if (w === "leave") return "leave";
    const r = state.ripe.get(id);
    if (r && Date.now() - new Date(r).getTime() < RIPE_DAYS * 86400000) return "ripe";
    return w || "";
  }

  // ---------------------------------------------------------------- map
  function showMapError(html) {
    $("map-error").innerHTML = html;
    $("map-error").hidden = false;
  }
  if (!window.maplibregl) {
    showMapError("<b>The map couldn’t load.</b> The map library didn’t download. Check your connection, " +
      "or turn off any content blocker for this site, then reload.");
    throw new Error("maplibre-gl did not load");
  }
  let map;
  try {
    map = new maplibregl.Map({
      container: "map",
      style: window.growMapStyle(),
      center: CFG.center,
      zoom: CFG.zoom,
      maxBounds: [[-123.3, 45.2], [-122.1, 45.85]],
      attributionControl: false,
    });
  } catch (e) {
    showMapError("<b>The map couldn’t start.</b> This browser has graphics acceleration (WebGL) turned off. " +
      "In Chrome: Settings → System → “Use graphics acceleration when available”, then relaunch.");
    throw e;
  }
  map.on("error", (e) => console.warn("Map:", e.error?.message || e));
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
        "circle-stroke-color": CLUSTER_COLOR, "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.6,
        "circle-radius": ["step", ["get", "point_count"], 12, 25, 15, 100, 19, 500, 24],
      },
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "trees", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": CLUSTER_COLOR },
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
    if (reviewOf(f.id).removed && !state.showGone) return false;
    const type = typeOf(f);
    if (!state.types.has(type)) return false;
    if (f.kind === "tree") {
      if (state.onlySeason && !inSeason(type)) return false;
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
        const type = typeOf(f);
        const props = {
          id: f.id, g: TYPES[type]?.group || "berry", f: f.fruiting === "yes" && ws !== "gone" ? 1 : 0,
          label: f.kind === "tree" ? (TYPES[type]?.label || "") : f.name, src: f.source,
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
      const [spots, notes, reports] = await Promise.all([store.listSpots(), store.listNoteSummaries(), store.listReports()]);
      for (const s of spots) addCommunitySpot(s);
      for (const n of notes) recordNote(n);
      for (const r of reports) recordReport(r);
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
    // Count community additions too, so bush, vine and herb types appear in the filters once added.
    const type = kind === "tree" ? s.type : kind;
    state.counts[type] = (state.counts[type] || 0) + 1;
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
          <label title="${esc(t.season ? "Ripe " + t.season : "")}"><input type="checkbox" data-type="${k}" ${state.types.has(k) ? "checked" : ""}>
          ${esc(t.label)}<span class="count">${n ? n.toLocaleString() : ""}</span></label>`).join("")}
        </div></fieldset>`;
    }).join("");
    syncGroupBoxes();
  }
  function syncGroupBoxes() {
    document.querySelectorAll("#type-filters [data-group]").forEach((g) => {
      const boxes = [...g.closest("fieldset").querySelectorAll("[data-type]")];
      const on = boxes.filter((b) => b.checked).length;
      g.checked = on === boxes.length;
      g.indeterminate = on > 0 && on < boxes.length;
    });
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
  bind("show-gone", "showGone");
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
    const t = TYPES[typeOf(f)] || TYPES.other;
    const rv = reviewOf(id);
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
      <div class="kicker" style="color:${GROUPS[t.group]?.color}">${t.icon} ${esc(t.one || t.label)}${t.season ? " · " + (t.season === "Year-round" ? "year-round" : "ripe " + t.season) : ""}</div>
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
      ${reviewHtml(f, rv)}
      <h2>Photos</h2>
      <div class="photos" id="photos"></div>
      ${store.photos ? `
        <div class="photo-add" id="photo-add">
          <label class="btn small photo-pick">📷 Add a photo
            <input type="file" accept="image/*" id="photo-input" hidden></label>
          <small class="muted">Plants only, please: no faces, house numbers or licence plates.</small>
        </div>
        <form class="photo-form" id="photo-form" hidden>
          <img id="photo-preview" alt="Your photo, ready to post">
          <input name="caption" maxlength="140" placeholder="Caption (optional)" aria-label="Caption">
          <div class="actions">
            <button type="button" class="btn" id="photo-cancel">Cancel</button>
            <button class="btn primary">Post photo</button>
          </div>
        </form>
        <p class="photo-status small" id="photo-status" role="status"></p>`
        : `<p class="muted small">Photos can be added once the shared database is set up.</p>`}
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
    loadPhotos(id);
    wireReview(f);
    if (store.photos) wirePhotoForm(id);

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

  // ---------------------------------------------------------------- "Is this right?"
  // "an apple tree", "a grape vine", "herbs"
  const aName = (one) => {
    const lower = one.toLowerCase();
    return /s$/.test(lower) ? lower : (/^[aeiou]/.test(lower) ? "an " : "a ") + lower;
  };

  function reviewHtml(f, rv) {
    const t = TYPES[typeOf(f)] || TYPES.other;
    const thing = f.kind === "garden" ? "garden" : t.form || "plant";
    const lines = [];
    if (rv.removed) lines.push(`<b>Hidden from the map:</b> neighbours say this ${thing} is ${rv.unreachable >= rv.gone ? "can’t be reached from the sidewalk" : "gone"}. If it’s still there, say so below.`);
    else {
      if (rv.gone) lines.push(`${rv.gone} neighbour${rv.gone > 1 ? "s say" : " says"} this ${thing} is gone.`);
      if (rv.unreachable) lines.push(`${rv.unreachable} neighbour${rv.unreachable > 1 ? "s say" : " says"} it can’t be reached from the sidewalk.`);
    }
    if (rv.type && rv.type !== f.type) lines.push(`Relabelled by neighbours: ${f.source === "city" ? "the city lists it as" : "it was added as"} ${esc(aName(TYPES[f.type]?.one || f.name))}.`);
    for (const [k, n] of Object.entries(rv.votes)) if (k !== rv.type)
      lines.push(`${n} neighbour${n > 1 ? "s think" : " thinks"} it’s actually ${esc(aName(TYPES[k]?.one || k))}.`);
    if (!lines.length && rv.lastConfirmed) lines.push(`A neighbour confirmed it’s here ${ago(rv.lastConfirmed)}.`);

    const typeOptions = Object.entries(TYPES).filter(([k, t]) => t.group !== "garden" && k !== typeOf(f))
      .map(([k, t]) => `<option value="${k}">${esc(t.one || t.label)}</option>`).join("");
    const goneLabel = { tree: "Gone or cut down", garden: "Gone" }[thing] || "Gone or dug up";
    return `
      <section class="review">
        <h2>Is this right?</h2>
        ${lines.length ? `<p class="review-state small">${lines.join("<br>")}</p>` : ""}
        <div class="review-buttons" id="review-buttons">
          <button class="btn small" data-kind="still_here">✓ Still here</button>
          <button class="btn small" data-kind="gone">${goneLabel}</button>
          ${f.kind === "tree" ? `<button class="btn small" data-kind="wrong_type">Wrong kind of ${thing}</button>` : ""}
          <button class="btn small" data-kind="unreachable">Can’t reach it from the sidewalk</button>
        </div>
        <form class="review-type" id="review-type" hidden>
          <label class="small">What is it?
            <select name="corrected">
              <option value="">Choose…</option>
              ${typeOptions}
              <option value="none">Nothing you can eat</option>
            </select></label>
          <div class="actions"><button type="button" class="btn small" id="review-type-cancel">Cancel</button>
            <button class="btn small primary">Send</button></div>
        </form>
        <p class="review-done small" id="review-done" role="status"></p>
      </section>`;
  }

  function wireReview(f) {
    const done = $("review-done");
    const send = async (kind, corrected_type = null) => {
      $("review-buttons").querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        recordReport(await store.addReport({ spot_id: f.id, kind, corrected_type }));
        render();
        openDetail(f.id);
        $("review-done").textContent = kind === "still_here"
          ? "Thanks for confirming!"
          : "Thanks! When a second neighbour says the same, the map updates.";
      } catch (err) {
        done.textContent = "Couldn’t send that: " + err.message;
        $("review-buttons").querySelectorAll("button").forEach((b) => { b.disabled = false; });
      }
    };
    $("review-buttons").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-kind]");
      if (!b) return;
      if (b.dataset.kind === "wrong_type") { $("review-type").hidden = false; $("review-buttons").hidden = true; return; }
      send(b.dataset.kind);
    });
    $("review-type-cancel").onclick = () => { $("review-type").hidden = true; $("review-buttons").hidden = false; };
    $("review-type").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = e.target.corrected.value;
      if (v) send("wrong_type", v);
    });
  }

  // ---------------------------------------------------------------- photos
  async function loadPhotos(id) {
    const box = $("photos");
    if (!store.photos) { box.innerHTML = ""; return; }
    try {
      const photos = await store.listPhotos(id);
      if (state.openId !== id) return;
      box.innerHTML = photos.map((p) => `
        <figure>
          <a href="${esc(store.photoUrl(p.path))}" target="_blank" rel="noopener">
            <img src="${esc(store.photoUrl(p.path))}" alt="${esc(p.caption || "Photo from a neighbour")}" loading="lazy"></a>
          <figcaption>${p.caption ? esc(p.caption) + " · " : ""}${esc(p.author || "Anonymous")}, ${ago(p.created_at)}
            <button class="link report" data-photo="${esc(p.id)}">Report</button></figcaption>
        </figure>`).join("");
    } catch (e) {
      box.innerHTML = `<p class="muted small">Couldn’t load photos: ${esc(e.message)}</p>`;
    }
  }

  // Shrink the photo to at most 1600px and re-encode it as JPEG in the browser. Drawing it to a
  // canvas also throws away the hidden EXIF data phones add, including the GPS location.
  async function prepareJpeg(file) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      throw new Error("This browser can’t read that photo’s format. Try a JPEG or PNG.");
    }
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t prepare the photo."))), "image/jpeg", 0.85));
  }

  function wirePhotoForm(id) {
    const input = $("photo-input"), form = $("photo-form"), status = $("photo-status");
    let blob = null, previewUrl = null;
    const reset = () => {
      form.hidden = true; $("photo-add").hidden = false; blob = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null; input.value = ""; form.caption.value = "";
    };
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      status.className = "photo-status small"; status.textContent = "";
      try {
        blob = await prepareJpeg(file);
      } catch (e) {
        status.className = "photo-status small bad"; status.textContent = e.message;
        input.value = "";
        return;
      }
      previewUrl = URL.createObjectURL(blob);
      $("photo-preview").src = previewUrl;
      $("photo-add").hidden = true;
      form.hidden = false;
    });
    $("photo-cancel").onclick = reset;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!blob) return;
      const btn = form.querySelector("button.primary");
      btn.disabled = true;
      status.className = "photo-status small"; status.textContent = "Checking your photo…";
      let author = null;
      try { author = localStorage.getItem("pdx-grow-nick") || null; } catch {}
      try {
        await store.uploadPhoto(id, blob, { caption: form.caption.value.trim(), author });
        if (state.openId !== id) return;
        reset();
        status.className = "photo-status small good"; status.textContent = "Thanks! Your photo is up.";
        loadPhotos(id);
      } catch (err) {
        if (state.openId !== id) return;
        status.className = "photo-status small bad";
        status.textContent = (err.rejected ? "Not posted: " : "") + err.message;
      } finally {
        btn.disabled = false;
      }
    });
    $("photos").addEventListener("click", async (e) => {
      const b = e.target.closest("button.report");
      if (!b || b.disabled) return;
      if (!confirm("Report this photo as inappropriate? Photos with two reports are hidden until a moderator checks them.")) return;
      b.disabled = true;
      try { await store.reportPhoto(b.dataset.photo); b.textContent = "Reported"; }
      catch (err) { b.disabled = false; alert("Couldn’t send the report: " + err.message); }
    });
  }

  function closeDetail() {
    $("detail").hidden = true;
    state.openId = null;
    map.getSource("selected")?.setData({ type: "FeatureCollection", features: [] });
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 });
  }
  $("close-detail").onclick = closeDetail;

  // ---------------------------------------------------------------- add a spot
  $("spot-type").innerHTML = Object.entries(GROUPS).filter(([g]) => g !== "garden").map(([g, info]) =>
    `<optgroup label="${esc(info.label)}">` + Object.entries(TYPES).filter(([, t]) => t.group === g)
      .sort((a, b) => (a[0] === "other") - (b[0] === "other") || a[1].one.localeCompare(b[1].one))
      .map(([k, t]) => `<option value="${k}">${t.icon} ${esc(t.one)}</option>`).join("") + `</optgroup>`).join("");
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
      const isNewType = !state.counts[row.type];
      addCommunitySpot(row);
      if (isNewType) buildFilters();
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
    await mapReady;
    addDataLayers();
    render();
  });

  // Exposed for tests and debugging.
  window.GROW_APP = { state, map, classify, openDetail };
})();
