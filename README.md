# Portland Grow Map

A map of fruit and nut trees, front-yard gardens and community gardens around Portland that anyone
can reach from the sidewalk. Visitors filter by what they want (plums, figs, hazelnuts…) and leave
notes for each other: "owner says please pick", "ask first", "please leave it be", "ripe now".

It is a static site: plain HTML/CSS/JS, no build step.

## Where the map data comes from

| Layer | Source | How it gets there |
|---|---|---|
| Street fruit & nut trees | City of Portland **Street Tree Inventory** (Urban Forestry, ~250,000 trees in the public right-of-way) | Loaded live in the visitor's browser for the area they're looking at, then filtered to edible species by `fruit-species.js` |
| Community gardens | **Portland Parks & Recreation Community Gardens** open dataset | Loaded live in the browser |
| Front-yard gardens, yard trees, anything else | **Neighbours** | Added with the "+ Add a spot" button |

### Why not scan Google satellite imagery and photos?

The app does **not** pull trees out of Google Maps imagery, and that's on purpose:

- Google's terms don't allow scraping or analysing their satellite imagery or Street View to build
  a dataset.
- From above, a plum tree and an ornamental cherry look the same. Automated detection would fill
  the map with wrong guesses.

What it uses instead is better data: the city has already surveyed every street tree by species. Every spot also has
**Street View** and **Satellite** links that open Google Maps at that location, so anyone can check
a tree with their own eyes before walking over. Front-yard gardens aren't in any city dataset, so
neighbours add those.

### Edible vs ornamental

Portland's streets are full of flowering cherries and Callery pears that produce little or no
fruit. `fruit-species.js` sorts every tree into:

- **yes**: a fruiting variety (e.g. *Malus domestica*, *Ficus carica*, *Corylus colurna*)
- **maybe**: fruits, but small, tart or irregular (crabapples, purple-leaf plums). Drawn faded.
- **ornamental**: flowering cherries, Callery pears. Hidden unless "Ornamental varieties" is ticked.

Horse chestnut (*Aesculus*) is poisonous and is always excluded, even though "chestnut" is in its
name. To change how a species is classified, edit `RULES` in `fruit-species.js`.

## Run it locally

Any static file server works. From the top folder of this repository (the one with `index.html`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. On Windows, use `python` instead of `python3`.

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

## If a city data source stops loading

The **Sources** section of the side panel shows a red dot for any layer that couldn't be reached.
Open `config.js` and update the URL:

- `sources.streetTrees`: an ArcGIS MapServer/FeatureServer **layer** URL (ends in `/<number>`).
  Find the current one from the [Street Tree Inventory page](https://www.portland.gov/trees/get-involved/tree-inventory).
  The app reads species from any field whose name contains *common*, *species*, *genus* or
  *scientific*, so it copes with renamed columns.
- `sources.communityGardens`: any URL that returns GeoJSON. Find it on the
  [PortlandMaps open data hub](https://gis-pdx.opendata.arcgis.com/), item
  `8ca244b0754544b0ada0151710c1d73a_216`.

## Files

```
index.html          page layout
styles.css          styling (light + dark, phone + desktop)
config.js           data source URLs, Supabase keys, map start position
fruit-species.js    which tree species count as edible, and their seasons
storage.js          notes & spots: Supabase if configured, otherwise this browser
app.js              the map, loading, filters, notes, adding spots
supabase/schema.sql database tables and access rules
```

## Ideas for later

- A "report this note" button that sets `hidden` for review
- A season filter ("what's ripe this month")
- Import [Falling Fruit](https://fallingfruit.org) data for Portland, after checking its licence
- Spam protection on Supabase (captcha or rate limit) once traffic grows
