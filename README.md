# Portland Grow Map

A map of fruit and nut trees, front-yard gardens and community gardens around Portland that anyone
can reach from the sidewalk. Visitors filter by what they want (plums, figs, hazelnuts…) and leave
notes for each other: "owner says please pick", "ask first", "please leave it be", "ripe now".

It is a static site: plain HTML/CSS/JS, no build step. The map uses [MapLibre](https://maplibre.org)
with a custom near-white style (`map-style.js`) on free [OpenFreeMap](https://openfreemap.org) tiles.

## Where the map data comes from

| Layer | Source | Count |
|---|---|---|
| Edible trees on streets, medians, parks and public land | City of Portland tree inventory (Urban Forestry) | 42,743 |
| Community gardens | Portland Parks & Recreation Community Gardens | 62 |
| Front-yard gardens, yard trees, anything else | Neighbours, with the "+ Add a spot" button | grows over time |

The city data is pre-built into `data/` by `pipeline/build-directory.mjs`, so the site loads one
file instead of querying the city's servers on every visit. **How the directory is built, what's
left out, and how it can grow (OpenStreetMap, imagery, volunteers) is in
[docs/directory-process.md](docs/directory-process.md).**

### Why not scan Google satellite imagery and photos?

- Google's terms don't allow extracting data from their satellite imagery or Street View.
- From above, a plum tree and a flowering cherry look the same.

So the app starts from trees the city has already identified on the ground. Every spot has a
**Street View** link so a person can check it before walking over.

### Edible vs ornamental

`fruit-species.js` sorts every species name (all 854 in the city inventory were checked):

- **yes**: a fruiting variety (*Malus domestica*, *Ficus carica*, *Corylus colurna*…)
- **maybe**: fruits, but small, tart, sparse or needs cooking (crabapples, cherry plums, hawthorn).
  Drawn paler; "Hide trees that may not fruit well" removes them.
- **ornamental**: flowering cherries, Callery pears. Not included.
- **never**: poisonous or misleading names (horse chestnut, laurels, witch hazel, chestnut oak).

Only types with at least 20 public trees in Portland get their own filter. Rarer ones are grouped
as "Other edibles".

## Run it locally

From the top folder of this repository (the one with `index.html`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. On Windows, use `python` instead of `python3`.

## Refresh the tree data

The city updates its inventory daily; refreshing monthly is plenty. Needs Node 20 or newer:

```bash
node pipeline/build-directory.mjs
```

Then commit the changed files in `data/`.

## Turn on shared notes (needed before going public)

With `supabase` left blank in `config.js`, notes and added spots are saved **only in that visitor's
browser**. That's fine for trying the app out, but visitors can't see each other's notes. To share them:

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in `supabase/schema.sql`, and run it.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key into
   `config.js` under `supabase`.

The anon key is meant to be public. The database rules in `schema.sql` let visitors **read and add**
rows, but not edit or delete them. To remove spam or a note that names someone, open the row in
Supabase's Table Editor and set `hidden` to `true`.

## Publish it with GitHub Pages

On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and
`/ (root)`, and save. After a minute or two the site is live at
`https://<your-username>.github.io/garden-map/`.

## Files

```
index.html                  page layout
styles.css                  styling (phone + desktop)
map-style.js                the basemap's colours and which map layers are drawn
config.js                   data file paths, Supabase keys, map start position
fruit-species.js            which species count as edible, their groups, colours and seasons
storage.js                  notes & spots: Supabase if configured, otherwise this browser
app.js                      the map, filters, notes, adding spots
data/                       the pre-built directory (trees, gardens, counts)
pipeline/build-directory.mjs  rebuilds data/ from City of Portland open data
docs/directory-process.md   how the directory is built and how it grows
supabase/schema.sql         database tables and access rules
```
