# Building the directory: how trees and gardens get onto the map

The map is only as good as its directory. The goal is a list of edible trees and gardens that a
person can actually reach from the sidewalk, with as few wrong pins as possible.

## The short version

1. **Start from data someone has already checked on the ground.** The City of Portland has
   surveyed every street and park tree by species. That gives about 43,000 edible trees on day one,
   with no guessing.
2. **Fill the gaps with open map data.** OpenStreetMap has orchards, community gardens and
   individually mapped fruit trees.
3. **Use imagery to point people where to look, not to decide what's there.** Satellite images
   can't tell a plum from a flowering cherry, so imagery only produces *candidates* for a person
   to confirm.
4. **Let neighbours confirm, correct and add.** Front-yard gardens aren't in any dataset. They
   come from people walking past.

## Stage 1: authoritative public data (done)

`pipeline/build-directory.mjs` downloads and filters:

| Source | What it gives | Kept |
|---|---|---|
| City tree inventory, *All Trees* layer (Urban Forestry, ~350,000 records) | Species, location, trunk size, condition, street/park/private | Living, edible trees on streets, medians, parks and other public land: **42,743** |
| PP&R Community Gardens (open data layer 216) | Garden outlines, names, plot counts | All **62** gardens |

Left out on purpose:
- **20,500 trees the city records as on private property.** They're not reachable from the street.
- **Dead trees, snags and empty planting sites.**
- **Flowering-only varieties** (about 20,000 ornamental cherries and Callery pears).
- **Street addresses.** The map shows a location, never whose house it is.

Every species name in the inventory (854 of them) was checked by hand against the rules in
`fruit-species.js`. That check caught Persian ironwood being read as "peach", witch hazel as
hazelnut, and poisonous laurels slipping through.

**Only types likely to be seen in Portland get their own entry.** A type needs at least 20
public trees (`MIN_PER_TYPE`); rarer ones (loquat, jujube, medlar, citrus…) are grouped as
"Other edibles".

To refresh, run `node pipeline/build-directory.mjs` (behind a proxy, add `NODE_USE_ENV_PROXY=1`)
and commit `data/`. The city updates the inventory daily, so monthly is plenty.

## Stage 2: open map data (next)

[OpenStreetMap](https://www.openstreetmap.org) is mapped by volunteers and free to reuse under
the ODbL licence, which requires credit. Useful tags:

- `landuse=orchard`: orchards, including small community ones
- `leisure=garden` + `garden:type=community`, `landuse=allotments`: gardens the city layer misses
  (church, school and non-profit gardens)
- `natural=tree` with `genus=`, `species=` or `produce=`: individual fruit trees

Add these to the pipeline through the Overpass API, dropping anything within ~5 m of a city tree
of the same genus, since that's a duplicate. Overpass wasn't reachable from the build environment
when this was written, so this stage is still to do.

**Falling Fruit** ([fallingfruit.org](https://fallingfruit.org)) has a large crowd-sourced Portland
dataset. Check its licence before importing anything. If it's non-commercial or share-alike, link
to it instead of copying it.

## Stage 3: imagery as a "look here" list (possible, with limits)

What imagery can and can't do, honestly:

| Can | Can't |
|---|---|
| Find large tree crowns and vegetable beds from above | Tell species apart (plum vs flowering cherry vs crabapple) |
| Spot a mature tree that isn't in the city inventory | Tell whether fruit hangs over the sidewalk |
| Spot spring blossom (white/pink) in dated imagery | See anything under a canopy |

**Which imagery is allowed:**
- ✅ **USDA NAIP** aerial photos (public domain, 60 cm, updated every 2–3 years)
- ✅ **Mapillary** street-level photos (CC BY-SA; free API for non-commercial projects)
- ✅ **Esri World Imagery**, for *viewing* in the app's Satellite button
- ❌ **Google satellite, Street View and photos.** Google's terms forbid extracting data from them,
  so no automated scanning and no tracing. The app links to Street View so a *person* can look
  before they walk over. That's personal use, not data extraction.

**A realistic imagery workflow:**
1. Take city parcels with street frontage. Use NAIP plus a simple greenness measure (NDVI) to
   flag front strips with garden-like patterns: bare soil in rows, raised beds, dense low
   vegetation.
2. Take tree crowns from NAIP or Portland Metro LiDAR canopy data, and drop any within a few
   metres of a city-inventory tree.
3. Turn both into **candidate pins** shown only to volunteers, in a "Help check these" mode:
   "Is there a fruit tree or garden here you can reach from the sidewalk?" → Yes (pick type) /
   No / Can't tell.
4. A candidate becomes a real pin after two independent "yes" answers.

This is a real project of its own: weeks of work, and the results need human review. Do it
after the notes database is live and people are using the map, not before.

## Stage 4: neighbours (built, needs the shared database)

- **+ Add a spot** for front-yard gardens and trees the city doesn't list
- Notes: *owner says pick / ask first / leave it be / ripe now*
- Next: a "this tree is gone" or "this isn't a fruit tree" button that hides a pin after two
  reports, so the directory corrects itself.

## Order of work

1. ✅ City trees and gardens
2. Turn on shared notes (Supabase); without it nobody sees anyone else's additions
3. OpenStreetMap orchards and gardens
4. "Report a problem" on pins
5. Imagery candidates and volunteer checking, only if the map has an active community by then
