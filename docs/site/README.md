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
1. Install site dependencies and Hugo modules:
   ```
   cd docs/site
   task install
   ```

2. Build the site (no Kind required):
   ```
   task build:hugo
   ```
   Outputs to `public/`.

3. Run with live reload:
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
- **Logo:** `assets/icons/logo.svg` (Docsy inlines it via `navbar_logo`).
- **Design tokens and component overrides:** `assets/scss/_variables_project.scss`
- **Colors:** Hiero palette is defined as CSS variables (primary `#b81a56`, primary-dark `#992350`, primary-light `#d92d6a`, secondary `#1ebdc4`).
- **Typography:** Space Grotesk is loaded via Google Fonts and applied across headings, body, and UI elements.

Editing Styles
--------------
1. Update SCSS in `assets/scss/_variables_project.scss` (e.g., buttons, badges, sidebar, code)
2. Rebuild CSS via `task build:hugo` or `hugo server` to regenerate `public/main/scss/*.css`

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
- **Hugo not found:** ensure Go is installed and `$(go env GOPATH)/bin` is on PATH (the Taskfiles set this automatically).
- **Styles not updating:** verify SCSS changes are rebuilt (run `task build:hugo` or restart `hugo server`).
- **Typedoc missing:** run `task build:typedoc` from `docs/site` to regenerate API docs.
