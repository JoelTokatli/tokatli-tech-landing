# tokatli tech landing

Static landing page for the "tokatli tech" brand. Plain HTML, CSS and JS. No build step.

## Structure

```
index.html
css/styles.css
js/main.js
favicon.svg
assets/  logo-isotype.svg, logo-horizontal.svg, og-image.svg
```

## Preview

```sh
python -m http.server 8000
# open http://localhost:8000
```

## Deploy

Deploy the repository root as-is to GitHub Pages, Netlify or Vercel (no build command, publish directory `.`).

## Newsletter form

The form has no backend. Set your provider endpoint in `index.html`:

```html
<form id="signup-form" data-action="https://your-provider.example/endpoint">
```

`js/main.js` POSTs `{ "email": "..." }` as JSON to that URL. While `data-action` is empty, only the success state is shown locally.

## 3D hero

`js/hero-3d.js` (ES module) renders the brand "T" with orbiting electrons using Three.js `0.160.0`, lazy-loaded from jsDelivr (`https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`) only after `load` + idle. The static hero `<img>` remains the poster/LCP element and the fallback: no canvas is created with `prefers-reduced-motion`, `saveData`, or no WebGL, and the canvas is removed on errors or WebGL context loss. Rendering pauses when the hero is off-screen or the tab is hidden. Colors are read from the CSS custom properties in `:root`.

## Notes

- Design tokens (colors, spacing, type, radius, elevation) live as CSS custom properties in `:root` in `css/styles.css`.
- The logo is a geometric SVG approximation of the brand board isotype.
- Social crawlers generally do not render SVG for `og:image`. Export `assets/og-image.svg` to a 1200x630 PNG and update the meta tags before launch. Social links in the footer are `#` placeholders.
