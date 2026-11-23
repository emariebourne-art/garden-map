// Portland Grow Map — configuration.
// Everything you might need to change without touching app code lives here.

window.GROW_CONFIG = {
  // Map starts centred on Portland.
  center: [45.5231, -122.6765],
  zoom: 13,

  // Street trees load only when zoomed in this far (the city has ~250,000 of them).
  treeMinZoom: 16,

  // ---------------------------------------------------------------------------
  // City of Portland open data. These are fetched by the visitor's browser.
  // If a source moves, the app shows a warning in the Sources panel and keeps
  // working with everything else. Each entry may list several URLs; the first
  // one that answers wins.
  // ---------------------------------------------------------------------------
  sources: {
    // Street Tree Inventory (Portland Parks & Recreation, Urban Forestry).
    // ArcGIS MapServer/FeatureServer layer URLs. The app queries by map extent.
    streetTrees: [
      "https://www.portlandmaps.com/arcgis/rest/services/Public/Parks_UF_Tree_Layers/MapServer/13",
    ],

    // PP&R Community Gardens (open data hub item 8ca244b0754544b0ada0151710c1d73a_216).
    // Whole-dataset GeoJSON downloads; tried in order.
    communityGardens: [
      "https://hub.arcgis.com/api/v3/datasets/8ca244b0754544b0ada0151710c1d73a_216/downloads/data?format=geojson&spatialRefId=4326",
      "https://gis-pdx.opendata.arcgis.com/datasets/8ca244b0754544b0ada0151710c1d73a_216.geojson",
    ],
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
