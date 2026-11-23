// Portland Grow Map — configuration.
// Everything you might need to change without touching app code lives here.

window.GROW_CONFIG = {
  // Map starts centred on Portland.
  center: [-122.6587, 45.5231], // [longitude, latitude]
  zoom: 12,

  // The directory, built by `node pipeline/build-directory.mjs` (see docs/directory-process.md).
  data: {
    trees: "data/trees.geojson",
    gardens: "data/gardens.geojson",
    directory: "data/directory.json",
  },

  // ---------------------------------------------------------------------------
  // Shared notes & community-added spots.
  // Leave blank and notes are saved only in the visitor's own browser.
  // Fill in a free Supabase project (see README.md) and every visitor shares them.
  // The anon key is meant to be public; row-level security in schema.sql protects the data.
  // ---------------------------------------------------------------------------
  supabase: {
    url: "",
    anonKey: "",
  },
};
