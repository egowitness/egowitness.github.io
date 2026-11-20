# EgoWitness project page

Static source for https://egowitness.github.io/ (paper: https://arxiv.org/abs/2611.25849).

Code, dataset, and annotations are coming soon: https://github.com/egowitness/EgoWitness

## Layout

- `index.html`: page markup and styles. `assets/app.js`: video wall, Day 1 to 7 timeline, clip player, figure zoom, agent traces, and results chart. No build step and no external libraries.
- `data/`: small JSON files read by the page (`results.json` from Table 3, `clips.json`, `coverage.json`, `traces.json`).
- `media/hero/`: one mosaic video for the opening screen and its poster.
- `media/clips/`: annotated square clips (H.264 MP4, optional VP9 WebM) with posters. Masks and room labels are drawn into the pixels. No mask files are published here.
- `media/traces/`: reference images and evidence frames for the agent traces.
- `assets/fig/`: paper figures as WebP, plus zoom tiles for the room-observation figure.

## Loading

The first screen loads the HTML, the script, and the mosaic poster. The mosaic video starts after the page has loaded and pauses off screen, or stays paused with data saver or reduced motion. Figures load lazily, and clips load only when played.

## Local preview

```bash
python -m http.server 8731 --directory .
```
