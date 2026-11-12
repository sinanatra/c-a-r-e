# Care outside the institution

This graph traces the evolution of the terms "[mutual aid](https://books.google.com/ngrams/graph?content=mutual+aid&year_start=1950&year_end=2022&corpus=en&smoothing=3)" and "[self-care](https://books.google.com/ngrams/graph?content=self-care&year_start=1950&year_end=2022&corpus=en&smoothing=3)" in the literature from 1950 to the present day. "Mutual aid" has been in decline for decades, while "self-care" has kept rising, overtaking it around 1980: care shifts from the group to the individual, something each person manages alone, through apps, platforms and protocols. Audre Lorde had described caring for oneself as ["an act of political warfare"](https://www.are.na/block/4436850); today the same word sells wellness.

The interfaces that connect a person in difficulty with the help that exists (a phone number, a manual, a map, a group of volunteers) were often built from below by feminist, migrant and activist networks. They have therefore been gradually absorbed into apps and platforms, or criminalised. Nevertheless, in recent years, new forms of self-organisation have been building care interfaces that are simple, shared and made to last.

## Running it locally

There is no build step. The page loads its data with `fetch()`, so it must be
served rather than opened as a file:

```
python3 -m http.server 8000
```

then open http://localhost:8000/.

## Updating the data

Everything lives in `data/timeline.md`. Edit it and reload the page.

- **Settings**: `start` and `end` set the years at the two ends of the
  horizontal axis (currently 1950 and 2026). Optional: `year_width` (pixels per
  year; without it the chart fits the page width) and `height` (plot height
  above the axis, default 668). Items after `end` still appear;
  the chart grows to the right.
- **Items**: one row per event: `date` (a year; decimals such as `2015.5`
  are allowed), `label`, `branch` (an `id` from Branches), `type` (from
  Types), a `link` (every label in the chart should be clickable), and a `check` column for verification notes
  that is not shown in the chart.
- **Branches**: each branch starts on the axis at the date of its first item;
  `rise` (0–100) sets how high it climbs by the last year. Labels that would collide, also across branches, are
  moved to the nearest free line.
- **Colours** mean type, as in the original chart, across both branches:
  pink for `practice` (people taking care of people, or acting against
  them), grey for `tool` (number, manual, map, kit, website, app, standard).
  The branches read apart by their position. The blue lines are the Ngrams
  curves.
- **Phases**: vertical markers with an optional `link`; `dashed` draws a
  dashed line, and `reaches` (an item label) makes the line rise only up to
  that item. Currently none.
- **Curves**: one row per Google Ngrams series: `label` (shown at the end of
  the line), `file` (a JSON file), `color` and an optional `link` (e.g. the Ngrams
  graph page). Add a second row to overlay a
  second curve; both share the same vertical scale so they can be compared.

### Updating a Google Ngrams curve

1. Open the JSON URL in your browser, e.g. for "self-care":

   ```
   https://books.google.com/ngrams/json?content=self-care&year_start=1950&year_end=2022&corpus=en&smoothing=3
   ```

   The `en` corpus ends in 2022, so a later `year_end` returns the same data.
   Ngrams reads a hyphenated term as `self - care`; check that the `ngram`
   field in the response says so and that `timeseries` is not empty.

2. Copy the `timeseries` array from the response.
3. Paste it as `values` into the JSON file, and set `startYear` to the
   `year_start` of the URL:

   ```json
   { "startYear": 1950, "values": [ ... ] }
   ```

4. Update the `label` of that row in the Curves table.

For a second curve, save it as a new file (e.g. `data/ngrams-2.json`) and add
a row to Curves.
