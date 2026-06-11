# Frontend Redesign

The repository does not currently contain a standalone web app. The public frontend is the GitHub README, generated bitmap hero/infographic assets, and SVG support diagrams.

## v5.4.5 Design Goals

- Lead with a real cinematic production-control hero instead of generic abstract graphics.
- Show Seedance's practical range: references, first/last-frame continuity, product reveal, timeline control, audio, and camera direction.
- Use generated cinematic infographics for the operating-system overview, skill map, skill capability map, CDN delivery map, reference role map, production delivery map, and QC stack.
- Allow text-rich infographics when the text is large, corrected, visually balanced, and repeated in nearby searchable Markdown.
- Keep SVG assets as support diagrams, not the primary emotional surface.
- Validate README completeness, gallery coverage, PNG dimensions, and asset presence with `scripts/design_audit.py`.

## v5.2 Design Goals

- Replace collapsed one-line Markdown with readable sections.
- Put the workflow selector near the top.
- Use dark/light hero assets with accessible SVG metadata.
- Show the skill constellation visually, then provide tables for navigation.
- Keep platform status source-aware instead of hardcoding stale claims.
- Validate design quality with `scripts/design_audit.py`.

## Assets

- `assets/hero-command-center.png`
- `assets/hero-global-filmmaker-mode.png`
- `assets/infographic-skill-capabilities.png`
- `assets/infographic-cdn-delivery-map.png`
- `assets/infographic-reference-role-map.png`
- `assets/infographic-production-delivery.png`
- `assets/infographic-professional-qc-stack.png`
- `assets/hero-cinematic.png`
- `assets/skill-os-infographic.png`
- `assets/skill-map-cinematic.png`
- `assets/hero-dark.svg`
- `assets/hero-light.svg`
- `assets/skill-map.svg`

## Design Rules

- No external fonts or scripts in SVG.
- Every SVG needs `<title>` and `<desc>`.
- README should stay readable on mobile and dark mode.
- Avoid dense badge walls and noisy decorative text.
- Use text-rich generated infographics only for big, short labels that remain legible at README width.
- Inspect every generated text image; reject garbled words, ugly typography, poor contrast, or placeholder-looking panels before commit.
- Keep equivalent Markdown explanation beside every text-rich image so the repo remains accessible and searchable.
