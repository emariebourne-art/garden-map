// The "Grow" basemap: a quiet, paper-like map so the trees are the loudest thing on it.
// Vector tiles from OpenFreeMap (free, no key, OpenStreetMap data). Only a handful of
// layers are drawn: land, parks, water, streets, faint buildings, and a few labels.

(function () {
  const PALETTES = {
    // Warm paper, like a field guide.
    field: {
      land: "#f3efe4", landDark: "#ebe5d6", park: "#dfe5cc", wood: "#d5dec0", water: "#c5d8dc", waterLine: "#b4cbd0",
      road: "#ffffff", roadCase: "#e2dccd", major: "#fbf6ea", majorCase: "#d9cfb9", building: "#e7e0cf",
      label: "#6f6a5c", labelHalo: "#f3efe4", waterLabel: "#6e8f97",
    },
    // Near-white and neutral grey, so colour only comes from the trees.
    clean: {
      land: "#f6f6f4", landDark: "#f0f0ee", park: "#e4eee1", wood: "#dde9da", water: "#d3e3ee", waterLine: "#c3d6e4",
      road: "#ffffff", roadCase: "#e3e4e6", major: "#ffffff", majorCase: "#d5d7da", building: "#ececea",
      label: "#7a7f86", labelHalo: "#f6f6f4", waterLabel: "#6d8ea8",
    },
    // Sunny and warm, a farmers'-market feel.
    market: {
      land: "#fff5e6", landDark: "#fcecd6", park: "#e5efc9", wood: "#dbe8bc", water: "#cbe6ef", waterLine: "#b5dae6",
      road: "#ffffff", roadCase: "#f1dcbd", major: "#fffaf2", majorCase: "#ebcfa6", building: "#f7e6cc",
      label: "#8a7860", labelHalo: "#fff5e6", waterLabel: "#5f98ab",
    },
  };


  const roadWidth = (base, extra = 0) =>
    ["interpolate", ["exponential", 1.6], ["zoom"], 11, base * 0.4 + extra, 14, base + extra, 18, base * 6 + extra];

  window.growMapStyle = function (look) {
    const C = PALETTES[look] || PALETTES.field;
    return {
      version: 8,
      name: "Grow",
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      },
      layers: [
        { id: "land", type: "background", paint: { "background-color": C.land } },
        {
          id: "landuse-residential", type: "fill", source: "omt", "source-layer": "landuse",
          filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood"]]],
          paint: { "fill-color": C.landDark, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 0] },
        },
        {
          id: "wood", type: "fill", source: "omt", "source-layer": "landcover",
          filter: ["in", ["get", "class"], ["literal", ["wood", "grass"]]],
          paint: { "fill-color": C.wood, "fill-opacity": 0.7 },
        },
        {
          id: "park", type: "fill", source: "omt", "source-layer": "park",
          paint: { "fill-color": C.park },
        },
        {
          id: "landuse-green", type: "fill", source: "omt", "source-layer": "landuse",
          filter: ["in", ["get", "class"], ["literal", ["cemetery", "pitch", "playground", "garden", "allotments", "orchard"]]],
          paint: { "fill-color": C.park },
        },
        {
          id: "water", type: "fill", source: "omt", "source-layer": "water",
          paint: { "fill-color": C.water },
        },
        {
          id: "waterway", type: "line", source: "omt", "source-layer": "waterway",
          paint: { "line-color": C.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 2] },
        },
        {
          id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 15,
          paint: { "fill-color": C.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, 0.8] },
        },
        // Streets: casing then fill, minor first so major roads sit on top.
        {
          id: "road-minor-case", type: "line", source: "omt", "source-layer": "transportation", minzoom: 13,
          filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": C.roadCase, "line-width": roadWidth(1.2, 1) },
        },
        {
          id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12,
          filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": C.road, "line-width": roadWidth(1.2) },
        },
        {
          id: "path", type: "line", source: "omt", "source-layer": "transportation", minzoom: 14,
          filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
          paint: { "line-color": "#d8cfb8", "line-width": 1, "line-dasharray": [2, 2] },
        },
        {
          id: "road-major-case", type: "line", source: "omt", "source-layer": "transportation",
          filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "trunk", "motorway"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": C.majorCase, "line-width": roadWidth(2, 1.2) },
        },
        {
          id: "road-major", type: "line", source: "omt", "source-layer": "transportation",
          filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "trunk", "motorway"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": C.major, "line-width": roadWidth(2) },
        },
        {
          id: "rail", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12,
          filter: ["in", ["get", "class"], ["literal", ["rail", "transit"]]],
          paint: { "line-color": "#d3cab5", "line-width": 1 },
        },
        // Labels: water, streets (close in), neighbourhoods.
        {
          id: "water-label", type: "symbol", source: "omt", "source-layer": "water_name",
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 13, "symbol-placement": "line" },
          paint: { "text-color": C.waterLabel, "text-halo-color": C.water, "text-halo-width": 1.5 },
        },
        {
          id: "street-label", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 15,
          layout: {
            "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "symbol-placement": "line",
            "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 13],
          },
          paint: { "text-color": C.label, "text-halo-color": C.road, "text-halo-width": 2 },
        },
        {
          id: "place-label", type: "symbol", source: "omt", "source-layer": "place",
          filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter", "city", "town"]]],
          layout: {
            "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 15, 14],
            "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 8,
          },
          paint: { "text-color": C.label, "text-halo-color": C.labelHalo, "text-halo-width": 2, "text-opacity": 0.85 },
        },
      ],
    };
  };
})();
