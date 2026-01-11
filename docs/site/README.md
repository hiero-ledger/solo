Quick local preview and branding notes

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
