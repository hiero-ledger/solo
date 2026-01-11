Solo Docs Site
==============

Overview
--------
This folder contains the Hugo + Docsy site for Solo. It ships with Hiero branding (logo, palette, typography) and a minimal task runner setup for building and previewing the documentation.

Prerequisites
-------------
- Node 18+ and npm
- Go (for Hugo extended)
- Hugo extended 0.145.0 or newer
- Task (go-task) if you want to use the provided tasks

Quick Start
-----------
1) Install site dependencies and Hugo modules
```
cd docs/site
task install
```

2) Build the site (no Kind required)
```
task build:hugo
```
Outputs to `public/`.

3) Run with live reload
```
hugo server -D --baseURL http://localhost:1313/main/ --cleanDestinationDir
```
Open http://localhost:1313/main/ in your browser.

Common Tasks
------------
- Full docs build (includes mutations and typedoc): `task build`
- Typedoc only: `task build:typedoc`
- Clean artifacts: `task clean`

Branding & Theming
-------------------
- Logo: `assets/icons/logo.svg` (Docsy inlines it via `navbar_logo`)
- Design tokens and component overrides: `assets/scss/_variables_project.scss`
- Colors: Hiero palette is defined as CSS variables (primary `#b81a56`, primary-dark `#992350`, primary-light `#d92d6a`, secondary `#1ebdc4`)
- Typography: Space Grotesk is loaded via Google Fonts and applied across headings, body, and UI elements

Editing Styles
--------------
1) Update SCSS in `assets/scss/_variables_project.scss` (e.g., buttons, badges, sidebar, code)
2) Rebuild CSS via `task build:hugo` or `hugo server` to regenerate `public/main/scss/*.css`

Content Structure
-----------------
- `content/en` holds pages and landing content
- `assets/` contains SCSS, fonts, and icons
- `layouts/` has partial overrides (e.g., footer)
- `static/` serves generated API docs (typedoc) under `static/classes`

Notes
-----
- The navbar logo is enabled in `hugo.yaml`; placing the SVG is enough for it to render.
- For color/contrast tweaks, adjust the CSS variables in `_variables_project.scss` and rebuild.
- If you only need a quick preview, prefer `task build:hugo` + `hugo server` over `task local` (the latter runs additional long builds).

Troubleshooting
---------------
- Hugo not found: ensure Go is installed and `$(go env GOPATH)/bin` is on PATH (the Taskfiles set this automatically).
- Styles not updating: verify SCSS changes are rebuilt (run `task build:hugo` or restart `hugo server`).
- Typedoc missing: run `task build:typedoc` from `docs/site` to regenerate API docs.Quick local preview and branding notes

What I changed:
- Added Hiero logo at `assets/icons/logo.svg` (inline SVG) and applied the Hiero color palette.
- Updated `assets/scss/_variables_project.scss` with CSS variables mapped to the Hiero palette and a few component overrides (buttons, badges, sidebar surfaces).

How to preview locally (without running `task local` which builds the entire doc including the step-by-step guide that requires `kind`):

1. From the repo root, run the Hugo build task for the site only:

   cd docs/site && task build:hugo

   This compiles SCSS into `public/main/scss/*.css` and generates the site in `public/`.

2. To preview locally with live reload:

   cd docs/site && hugo server -D --baseURL http://localhost:1313/main/ 

   Then open `http://localhost:1313/main/` in your browser.

Notes and tips:
- The UI option `navbar_logo` is already enabled in `hugo.yaml` so placing the logo at `assets/icons/logo.svg` is sufficient for Docsy to inline it into the navbar.
- If you want color adjustments (contrast, hover color, badge tones), edit `assets/scss/_variables_project.scss` and re-run `task build:hugo`.

Recent changes (Hiero branding):
- Added full Hiero CSS variables and font import (`Inter`) in `assets/scss/_variables_project.scss`.
- Implemented typography scale for `h1`–`h6`, body, small/meta text, and code blocks per the branding kit.
- Styled primary and secondary buttons, cards, inputs, sidebar, badges, and callouts to match the design system.
- Updated the navbar logo color to the new primary `#C91F47`.

Accessibility & contrast:
- Quick contrast checks (against white):
  - Primary `#C91F47` — contrast: 5.57 (WCAG AA ok for normal text)
  - Primary dark `#A31835` — contrast: 7.67
  - Body gray `#666666` — contrast: 5.74
  - Light gray `#888888` — contrast: 3.54 (used for secondary/meta text; consider darkening if used for small/important text)

Next steps / optional follow-ups:
- Fine-tune hover states and component spacing if you want tighter parity with the mockups.
- Run an automated accessibility audit (axe/core or Lighthouse) on the generated site and adjust colors if needed.
