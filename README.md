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

## Turn on photos (after shared notes)

Visitors can add photos to any tree or garden. **Every photo is checked by Claude before it is
stored**; anything that fails is never saved. Photos are rejected if they show:

- sexual content, violence, hate symbols, drug use or offensive text
- a recognisable face, or private details: a readable house number, licence plate, street address,
  name or mail (this map is about trees, not the people who live behind them)
- something that isn't a plant, tree, fruit, nut or garden, or is too blurry to tell

The person uploading sees a short reason ("Please crop out the house number and try again").

Other protections:
- **Location data is removed.** Phone photos carry hidden GPS coordinates. The browser shrinks
  each photo and re-saves it without them, and the server strips them again in case.
- **No way around the check.** Visitors can't write to the photos table or storage directly;
  only the checking function can.
- **If the check can't run, the photo is rejected,** with a "try again later" message.
- **Reports:** a photo with two reports is hidden until you look at it.
- **Rate limit:** 12 photo attempts per visitor per hour.

Setup (needs the [Supabase CLI](https://supabase.com/docs/guides/cli) and an
[Anthropic API key](https://platform.claude.com/settings/keys)):

1. Re-run `supabase/schema.sql` in the SQL Editor. It adds the photo tables and the `photos` bucket.
2. From this folder:

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase secrets set ANTHROPIC_API_KEY=<your key>
```

```bash
supabase functions deploy upload-photo
```

**Cost:** about 1¢ per photo checked, using Claude Opus 5.5. To pay less, change `MODEL` in
`supabase/functions/upload-photo/index.ts` to `claude-haiku-5-5` (a small fraction of a cent).
It's less careful with borderline photos, so try a few before switching.

**To remove a photo:** in Supabase's Table Editor, set `hidden` to `true` on its row in `photos`.
To bring back a photo that was hidden by reports, set it to `false`.

To run the function's tests (no API key needed; [Deno](https://deno.com) required):

```bash
deno test supabase/functions/upload-photo/
```

## Fixing the map: gone trees and wrong labels

City records go out of date: trees get cut down, replaced, or were logged as the wrong species.
Every pin has an **Is this right?** section:

| Button | What happens |
|---|---|
| **Gone or cut down** | 2 reports → hidden from the map |
| **Not a …** (pick the right kind, or "not a fruit or nut tree") | 2 votes for the same kind → relabelled; 2 "not a fruit tree" → hidden |
| **Can't reach it from the sidewalk** | 2 reports → hidden |
| **✓ Still here** | Cancels the problem reports made before it |

A single report never hides anything; it shows as a grey ring on the pin. Hidden trees can be
seen again with **Show trees reported gone**, so someone can confirm them. To undo a bad-faith
report, set `hidden` to `true` on its row in `spot_reports`.

Reports are stored separately from the city data, so they survive when you refresh `data/`.

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
storage.js                  notes, spots, reports, photos: Supabase if configured, otherwise this browser
app.js                      the map, filters, notes, adding spots
data/                       the pre-built directory (trees, gardens, counts)
pipeline/build-directory.mjs  rebuilds data/ from City of Portland open data
docs/directory-process.md   how the directory is built and how it grows
supabase/schema.sql         database tables and access rules
supabase/functions/upload-photo/  the photo checker (Claude) and its tests
```
