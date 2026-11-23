// Notes and community-added spots.
// Two back ends with the same interface:
//   - Supabase (shared by every visitor) when config.supabase is filled in
//   - localStorage (this browser only) otherwise
//
// Spot  = { id, kind: "tree"|"yard"|"garden", type, name, lat, lng, created_at }
// Note  = { id, spot_id, status, author, body, created_at }
// status: "pick" | "ask" | "leave" | "ripe" | "info"

(function () {
  const cfg = window.GROW_CONFIG.supabase || {};
  const shared = Boolean(cfg.url && cfg.anonKey);

  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ---------------- localStorage -----------------
  const LS_KEY = "pdx-grow-map-v1";
  function lsLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || { spots: [], notes: [] }; }
    catch { return { spots: [], notes: [] }; }
  }
  function lsSave(db) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch { /* private mode: keep in memory */ }
  }
  let mem = lsLoad();

  const local = {
    shared: false,
    async listSpots() { return mem.spots.slice(); },
    async addSpot(spot) {
      const row = { ...spot, id: uuid(), created_at: new Date().toISOString() };
      mem.spots.push(row); lsSave(mem); return row;
    },
    async listNoteSummaries() {
      return mem.notes.map(({ spot_id, status, created_at }) => ({ spot_id, status, created_at }));
    },
    async listNotes(spotId) {
      return mem.notes.filter((n) => n.spot_id === spotId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async addNote(note) {
      const row = { ...note, id: uuid(), created_at: new Date().toISOString() };
      mem.notes.push(row); lsSave(mem); return row;
    },
  };

  // ---------------- Supabase (PostgREST over fetch, no SDK) -----------------
  const base = (cfg.url || "").replace(/\/$/, "") + "/rest/v1";
  const headers = {
    apikey: cfg.anonKey,
    Authorization: "Bearer " + cfg.anonKey,
    "Content-Type": "application/json",
  };
  async function rest(path, opts = {}) {
    const res = await fetch(base + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error("Database error " + res.status + ": " + (await res.text()).slice(0, 200));
    return res.status === 204 ? null : res.json();
  }

  const remote = {
    shared: true,
    listSpots: () => rest("/spots?select=id,kind,type,name,lat,lng,created_at&limit=10000"),
    async addSpot(spot) {
      const rows = await rest("/spots", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(spot),
      });
      return rows[0];
    },
    listNoteSummaries: () =>
      rest("/notes?select=spot_id,status,created_at&order=created_at.desc&limit=20000"),
    listNotes: (spotId) =>
      rest("/notes?select=*&spot_id=eq." + encodeURIComponent(spotId) + "&order=created_at.desc&limit=200"),
    async addNote(note) {
      const rows = await rest("/notes", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(note),
      });
      return rows[0];
    },
  };

  window.GROW_STORE = shared ? remote : local;
})();
