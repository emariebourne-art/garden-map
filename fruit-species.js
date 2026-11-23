// Decides whether a tree record is something you can eat from, and what kind.
// Each type also says what it grows on (form: tree, bush, vine, plant or garden) and its
// everyday name ("one": "Blueberry bush"), so the app never calls a grape vine a tree.
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
    fruit:  { label: "Tree fruit",            color: "#e5484d" },
    stone:  { label: "Cherries & plums",      color: "#8e4ec6" },
    berry:  { label: "Berries & small fruit", color: "#3e63dd" },
    nut:    { label: "Nuts",                  color: "#a16a2a" },
    herb:   { label: "Herbs & greens",        color: "#12a594" },
    garden: { label: "Gardens",               color: "#30a46c" },
  };

  const TYPES = {
    apple:        { label: "Apple", one: "Apple tree", form: "tree",             icon: "🍎", group: "fruit", season: "Aug–Oct" },
    crabapple:    { label: "Crabapple", one: "Crabapple tree", form: "tree",         icon: "🍏", group: "fruit", season: "Sep–Nov" },
    pear:         { label: "Pear", one: "Pear tree", form: "tree",              icon: "🍐", group: "fruit", season: "Aug–Oct" },
    asianpear:    { label: "Asian pear", one: "Asian pear tree", form: "tree",        icon: "🍐", group: "fruit", season: "Aug–Sep" },
    quince:       { label: "Quince", one: "Quince tree", form: "tree",            icon: "🍋", group: "fruit", season: "Sep–Oct" },
    fig:          { label: "Fig", one: "Fig tree", form: "tree",               icon: "🟤", group: "fruit", season: "Aug–Oct" },
    persimmon:    { label: "Persimmon", one: "Persimmon tree", form: "tree",         icon: "🟠", group: "fruit", season: "Oct–Dec" },
    pawpaw:       { label: "Pawpaw", one: "Pawpaw tree", form: "tree",            icon: "🥭", group: "fruit", season: "Sep–Oct" },
    olive:        { label: "Olive", one: "Olive tree", form: "tree",             icon: "🫒", group: "fruit", season: "Oct–Dec" },
    peach:        { label: "Peach & apricot", one: "Peach or apricot tree", form: "tree",   icon: "🍑", group: "stone", season: "Jul–Aug" },
    cherry:       { label: "Sweet cherry", one: "Sweet cherry tree", form: "tree",      icon: "🍒", group: "stone", season: "Jun–Jul" },
    plum:         { label: "Plum", one: "Plum tree", form: "tree",              icon: "🟣", group: "stone", season: "Jul–Sep" },
    cherryplum:   { label: "Cherry plum", one: "Cherry plum tree", form: "tree",       icon: "🟣", group: "stone", season: "Jul–Aug" },
    chokecherry:  { label: "Chokecherry", one: "Chokecherry tree", form: "tree",       icon: "🍒", group: "stone", season: "Aug–Sep" },
    mulberry:     { label: "Mulberry", one: "Mulberry tree", form: "tree",          icon: "🫐", group: "berry", season: "Jun–Aug" },
    serviceberry: { label: "Serviceberry", one: "Serviceberry", form: "tree",      icon: "🫐", group: "berry", season: "Jun–Jul" },
    cornelian:    { label: "Cornelian cherry", one: "Cornelian cherry", form: "tree",  icon: "🔴", group: "berry", season: "Aug–Sep" },
    kousa:        { label: "Kousa dogwood", one: "Kousa dogwood", form: "tree",     icon: "🔴", group: "berry", season: "Aug–Oct" },
    hawthorn:     { label: "Hawthorn", one: "Hawthorn", form: "tree",          icon: "🔴", group: "berry", season: "Sep–Nov" },
    strawberrytree:{label: "Strawberry tree", one: "Strawberry tree", form: "tree",   icon: "🍓", group: "berry", season: "Oct–Dec" },
    mountainash:  { label: "Mountain ash", one: "Mountain ash", form: "tree",      icon: "🟠", group: "berry", season: "Aug–Oct" },
    walnut:       { label: "Walnut", one: "Walnut tree", form: "tree",            icon: "🌰", group: "nut",   season: "Sep–Oct" },
    hazelnut:     { label: "Hazelnut", one: "Hazelnut", form: "tree",          icon: "🌰", group: "nut",   season: "Aug–Sep" },
    chestnut:     { label: "Chestnut", one: "Chestnut tree", form: "tree",          icon: "🌰", group: "nut",   season: "Sep–Oct" },
    almond:       { label: "Almond", one: "Almond tree", form: "tree",            icon: "🌰", group: "nut",   season: "Aug–Sep" },
    hickory:      { label: "Pecan & hickory", one: "Pecan or hickory tree", form: "tree",   icon: "🌰", group: "nut",   season: "Sep–Oct" },
    // Not in the city tree inventory; neighbours add these with "+ Add a spot".
    blueberry:    { label: "Blueberry",         one: "Blueberry bush",         form: "bush",  icon: "🫐", group: "berry", season: "Jul–Aug" },
    raspberry:    { label: "Raspberry",         one: "Raspberry canes",        form: "bush",  icon: "🍓", group: "berry", season: "Jun–Sep" },
    blackberry:   { label: "Blackberry",        one: "Blackberry bramble",     form: "bush",  icon: "🫐", group: "berry", season: "Jul–Sep" },
    currant:      { label: "Currant & gooseberry", one: "Currant or gooseberry bush", form: "bush", icon: "🔴", group: "berry", season: "Jun–Jul" },
    strawberry:   { label: "Strawberry",        one: "Strawberry plants",      form: "plant", icon: "🍓", group: "berry", season: "Jun–Jul" },
    grape:        { label: "Grape",             one: "Grape vine",             form: "vine",  icon: "🍇", group: "berry", season: "Sep–Oct" },
    kiwi:         { label: "Hardy kiwi",        one: "Kiwi vine",              form: "vine",  icon: "🥝", group: "berry", season: "Sep–Oct" },
    rhubarb:      { label: "Rhubarb",           one: "Rhubarb plant",          form: "plant", icon: "🌿", group: "herb",  season: "Apr–Jun" },
    herbs:        { label: "Herbs",             one: "Herbs",                  form: "plant", icon: "🌿", group: "herb",  season: "Year-round" },
    other:        { label: "Other edibles", one: "Edible plant", form: "plant",     icon: "🌿", group: "berry", season: "" },
    garden:       { label: "Community garden", one: "Community garden", form: "garden",  icon: "🥕", group: "garden", season: "" },
    yard:         { label: "Front-yard garden", one: "Front-yard garden", form: "garden", icon: "🌱", group: "garden", season: "" },
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
