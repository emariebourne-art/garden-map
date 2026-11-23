// Decides whether a tree record is something you can eat from, and what kind.
// Used by the browser app AND by pipeline/build-directory.mjs, so there is one
// source of truth. Rules were checked against every species name in the City of
// Portland tree inventory (854 distinct names, Nov 2026).
//
// fruiting:
//   "yes"        — a fruit/nut variety; expect a crop
//   "maybe"      — fruits, but small, tart, bird-sized or needs preparing
//   "ornamental" — bred for flowers; fruit tiny or absent. Left out of the directory.
// Rules are checked top to bottom; the first match wins. A null type means "never".

(function (root) {
  // group: which heading the type sits under in the filter list, and its map colour.
  const GROUPS = {
    fruit:  { label: "Tree fruit",            color: "#c8553d" },
    stone:  { label: "Cherries & plums",      color: "#8a3f74" },
    berry:  { label: "Berries & small fruit", color: "#3f6fb0" },
    nut:    { label: "Nuts",                  color: "#8a6a3b" },
    garden: { label: "Gardens",               color: "#4f8a3c" },
  };

  const TYPES = {
    apple:        { label: "Apple",             icon: "🍎", group: "fruit", season: "Aug–Oct" },
    crabapple:    { label: "Crabapple",         icon: "🍏", group: "fruit", season: "Sep–Nov" },
    pear:         { label: "Pear",              icon: "🍐", group: "fruit", season: "Aug–Oct" },
    asianpear:    { label: "Asian pear",        icon: "🍐", group: "fruit", season: "Aug–Sep" },
    quince:       { label: "Quince",            icon: "🍋", group: "fruit", season: "Sep–Oct" },
    fig:          { label: "Fig",               icon: "🟤", group: "fruit", season: "Aug–Oct" },
    persimmon:    { label: "Persimmon",         icon: "🟠", group: "fruit", season: "Oct–Dec" },
    pawpaw:       { label: "Pawpaw",            icon: "🥭", group: "fruit", season: "Sep–Oct" },
    olive:        { label: "Olive",             icon: "🫒", group: "fruit", season: "Oct–Dec" },
    peach:        { label: "Peach & apricot",   icon: "🍑", group: "stone", season: "Jul–Aug" },
    cherry:       { label: "Sweet cherry",      icon: "🍒", group: "stone", season: "Jun–Jul" },
    plum:         { label: "Plum",              icon: "🟣", group: "stone", season: "Jul–Sep" },
    cherryplum:   { label: "Cherry plum",       icon: "🟣", group: "stone", season: "Jul–Aug" },
    chokecherry:  { label: "Chokecherry",       icon: "🍒", group: "stone", season: "Aug–Sep" },
    mulberry:     { label: "Mulberry",          icon: "🫐", group: "berry", season: "Jun–Aug" },
    serviceberry: { label: "Serviceberry",      icon: "🫐", group: "berry", season: "Jun–Jul" },
    cornelian:    { label: "Cornelian cherry",  icon: "🔴", group: "berry", season: "Aug–Sep" },
    kousa:        { label: "Kousa dogwood",     icon: "🔴", group: "berry", season: "Aug–Oct" },
    hawthorn:     { label: "Hawthorn",          icon: "🔴", group: "berry", season: "Sep–Nov" },
    strawberrytree:{label: "Strawberry tree",   icon: "🍓", group: "berry", season: "Oct–Dec" },
    mountainash:  { label: "Mountain ash",      icon: "🟠", group: "berry", season: "Aug–Oct" },
    walnut:       { label: "Walnut",            icon: "🌰", group: "nut",   season: "Sep–Oct" },
    hazelnut:     { label: "Hazelnut",          icon: "🌰", group: "nut",   season: "Aug–Sep" },
    chestnut:     { label: "Chestnut",          icon: "🌰", group: "nut",   season: "Sep–Oct" },
    almond:       { label: "Almond",            icon: "🌰", group: "nut",   season: "Aug–Sep" },
    hickory:      { label: "Pecan & hickory",   icon: "🌰", group: "nut",   season: "Sep–Oct" },
    other:        { label: "Other edibles",     icon: "🌿", group: "berry", season: "" },
    garden:       { label: "Community garden",  icon: "🥕", group: "garden", season: "" },
    yard:         { label: "Front-yard garden", icon: "🌱", group: "garden", season: "" },
  };

  // [pattern, type, fruiting]
  const RULES = [
    // Never: poisonous, or a name that only sounds edible.
    [/\baesculus\b|horse ?chestnut|buckeye/i, null],
    [/laurocerasus|lusitanica|\blaurel\b/i, null],                  // seeds and leaves are toxic
    [/hamamelis|witch ?hazel/i, null],
    [/\bquercus\b|\boak\b/i, null],                                  // "chestnut oak"
    [/parrotia|ironwood/i, null],                                    // "Parrotia persica"
    [/cryptomeria|photinia|\bulmus\b|hesperocyparis|prumnopitys|\btaxus\b|\byew\b/i, null],
    [/other than cherry/i, null],
    [/ginkgo/i, null],                                               // nearly all street ginkgos are male
    [/osmanthus|fragrant olive/i, null],

    // Flowering cherries and pears: Portland's streets are full of them.
    [/prunus (serrulata|serrula|x ?yedoensis|yedoensis|sargentii|subhirtella|incisa|pendula|padus|emarginata)|kwanzan|akebono|okame|flowering cherry|weeping cherry/i, "cherry", "ornamental"],
    [/prunus \(cherry species/i, "cherry", "ornamental"],            // the inventory's generic "cherry" is overwhelmingly flowering
    [/calleryana|callery|flowering pear|bradford|chanticleer/i, "pear", "ornamental"],

    [/cornus mas|cornelian/i, "cornelian", "yes"],
    [/cornus kousa|kousa/i, "kousa", "yes"],
    [/malus (x )?domestica|malus pumila|\bapple\b(?!.*crab)/i, "apple", "yes"],
    [/crab ?apple|\bmalus\b/i, "crabapple", "maybe"],
    [/pyrus pyrifolia|asian pear/i, "asianpear", "yes"],
    [/pyrus communis|european pear/i, "pear", "yes"],
    [/\bpyrus\b|\bpear\b/i, "pear", "maybe"],                       // "Pyrus spp." could be either
    [/prunus avium|prunus cerasus|sweet cherry|sour cherry/i, "cherry", "yes"],
    [/prunus (x )?domestica|\bprune\b|european plum/i, "plum", "yes"],
    [/cerasifera|cherry ?plum|flowering plum|purple ?leaf plum/i, "cherryplum", "maybe"],
    [/prunus \(plum|\bplum\b/i, "plum", "maybe"],
    [/prunus persica|\bpeach\b|nectarine|armeniaca|apricot|prunus mume/i, "peach", "yes"],
    [/prunus dulcis|almond/i, "almond", "yes"],
    [/prunus virginiana|chokecherry/i, "chokecherry", "maybe"],
    [/ficus carica|\bfig\b/i, "fig", "yes"],
    [/diospyros|persimmon/i, "persimmon", "yes"],
    [/cydonia|\bquince\b/i, "quince", "yes"],
    [/\bmorus\b|mulberry/i, "mulberry", "yes"],
    [/amelanchier|serviceberry|saskatoon/i, "serviceberry", "yes"],
    [/asimina|paw ?paw/i, "pawpaw", "yes"],
    [/olea europaea/i, "olive", "maybe"],                            // needs curing
    [/arbutus unedo|strawberry tree/i, "strawberrytree", "yes"],
    [/crataegus|hawthorn/i, "hawthorn", "maybe"],
    [/sorbus|mountain ash|rowan/i, "mountainash", "maybe"],          // cook before eating
    [/juglans|walnut|butternut|heartnut/i, "walnut", "yes"],
    [/corylus|hazelnut|filbert|\bhazel\b/i, "hazelnut", "yes"],
    [/castanea|chestnut/i, "chestnut", "yes"],
    [/\bcarya\b|pecan|hickory/i, "hickory", "yes"],

    // Real and edible but rare in Portland: grouped as "Other edibles".
    [/mespilus|medlar|eriobotrya|loquat|ziziphus|jujube|feijoa|acca sellowiana|pineapple guava|citrus|hippophae|seaberry|pinus pinea|sorbopyrus|shipova|sambucus|elderberry/i, "other", "yes"],
    [/elaeagnus|eleagnus|russian.olive/i, "other", "maybe"],
  ];

  function classify(text) {
    if (!text) return null;
    for (const [re, type, fruiting] of RULES) {
      if (re.test(text)) return type ? { type, fruiting } : null;
    }
    return null;
  }

  const api = { GROUPS, TYPES, RULES, classify };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GROW_SPECIES = api;
})(typeof window !== "undefined" ? window : globalThis);
