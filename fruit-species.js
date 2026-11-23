// Decides whether a tree record is something you can eat from, and what kind.
// Matching is done on the common + scientific names from the city inventory
// (or whatever text a community member typed).
//
// fruiting:
//   "yes"        — a fruit/nut variety; expect a crop
//   "maybe"      — fruits, but small, irregular, or a mostly-ornamental cultivar
//   "ornamental" — bred for flowers; fruit is tiny, absent, or not worth eating
// Rules are checked top to bottom; the first match wins.

(function () {
  const TYPES = {
    apple:      { label: "Apple",            icon: "🍎", season: "Aug–Oct" },
    crabapple:  { label: "Crabapple",        icon: "🍏", season: "Sep–Nov" },
    pear:       { label: "Pear",             icon: "🍐", season: "Aug–Oct" },
    asianpear:  { label: "Asian pear",       icon: "🍐", season: "Aug–Sep" },
    cherry:     { label: "Cherry",           icon: "🍒", season: "Jun–Jul" },
    plum:       { label: "Plum",             icon: "🟣", season: "Jul–Sep" },
    stonefruit: { label: "Peach / apricot",  icon: "🍑", season: "Jul–Aug" },
    fig:        { label: "Fig",              icon: "🟤", season: "Aug–Oct" },
    persimmon:  { label: "Persimmon",        icon: "🟠", season: "Oct–Dec" },
    quince:     { label: "Quince",           icon: "🟡", season: "Sep–Oct" },
    mulberry:   { label: "Mulberry",         icon: "🫐", season: "Jun–Aug" },
    serviceberry:{label: "Serviceberry",     icon: "🫐", season: "Jun–Jul" },
    elderberry: { label: "Elderberry",       icon: "🫐", season: "Aug–Sep" },
    cornelian:  { label: "Cornelian cherry", icon: "🔴", season: "Aug–Sep" },
    pawpaw:     { label: "Pawpaw",           icon: "🥭", season: "Sep–Oct" },
    medlar:     { label: "Medlar",           icon: "🟫", season: "Nov" },
    walnut:     { label: "Walnut",           icon: "🌰", season: "Sep–Oct" },
    hazelnut:   { label: "Hazelnut",         icon: "🌰", season: "Aug–Sep" },
    chestnut:   { label: "Chestnut",         icon: "🌰", season: "Sep–Oct" },
    prunus:     { label: "Plum or cherry (unspecified)", icon: "🍒", season: "Jun–Sep" },
    garden:     { label: "Community garden", icon: "🥕", season: "" },
    yard:       { label: "Front-yard garden",icon: "🌱", season: "" },
    other:      { label: "Other edible",     icon: "🌿", season: "" },
  };

  // [pattern, type, fruiting]
  const RULES = [
    // Never edible — must come before the chestnut rule.
    [/\baesculus\b|horse ?chestnut|buckeye/i, null],

    // Flowering cherries and ornamental pears: Portland's streets are full of them.
    [/serrulata|kwanzan|yedoensis|yoshino|akebono|sargentii|subhirtella|okame|incisa|flowering cherry|kanzan|shirotae|amanogawa|accolade/i, "cherry", "ornamental"],
    [/calleryana|callery|bradford|chanticleer|aristocrat|redspire|cleveland select|capital pear|ussuriensis|flowering pear/i, "pear", "ornamental"],

    [/cornus mas|cornelian/i, "cornelian", "yes"],
    [/crab ?apple/i, "crabapple", "maybe"],
    [/malus (x )?domestica|malus pumila|\bapple\b/i, "apple", "yes"],
    [/\bmalus\b/i, "crabapple", "maybe"], // inventory entries of bare "Malus" are nearly always crabapples
    [/pyrus pyrifolia|asian pear/i, "asianpear", "yes"],
    [/pyrus communis|\bpear\b|\bpyrus\b/i, "pear", "yes"],
    [/prunus avium|prunus cerasus|sweet cherry|sour cherry|pie cherry|bing\b|rainier/i, "cherry", "yes"],
    [/prunus domestica|italian prune|\bprune\b|european plum|japanese plum|prunus salicina/i, "plum", "yes"],
    [/cerasifera|cherry plum|purple ?leaf plum|thundercloud|krauter|newport|blireiana/i, "plum", "maybe"],
    [/\bplum\b/i, "plum", "maybe"],
    [/persica|peach|nectarine|armeniaca|apricot/i, "stonefruit", "yes"],
    [/\bcherry\b/i, "cherry", "maybe"],
    [/\bprunus\b/i, "prunus", "maybe"],
    [/ficus carica|\bfig\b/i, "fig", "yes"],
    [/diospyros|persimmon/i, "persimmon", "yes"],
    [/cydonia|\bquince\b/i, "quince", "yes"],
    [/chaenomeles/i, "quince", "maybe"],
    [/\bmorus\b|mulberry/i, "mulberry", "yes"],
    [/amelanchier|serviceberry|service ?berry|saskatoon/i, "serviceberry", "yes"],
    [/sambucus|elderberry/i, "elderberry", "yes"],
    [/asimina|pawpaw|paw paw/i, "pawpaw", "yes"],
    [/mespilus|medlar/i, "medlar", "yes"],
    [/juglans|walnut|butternut/i, "walnut", "yes"],
    [/corylus|hazel|filbert/i, "hazelnut", "yes"],
    [/castanea|chestnut/i, "chestnut", "yes"],
  ];

  function classify(text) {
    if (!text) return null;
    for (const [re, type, fruiting] of RULES) {
      if (re.test(text)) return type ? { type, fruiting } : null;
    }
    return null;
  }

  window.GROW_SPECIES = { TYPES, classify };
})();
