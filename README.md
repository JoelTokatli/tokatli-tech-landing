# tokatli tech landing

Static landing page for the "tokatli tech" brand. Plain HTML, CSS and JS. No build step.

## Structure

```
index.html
css/styles.css
js/main.js
js/tilt.js
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

`js/hero-3d.js` (ES module) renders the brand "T" with orbiting electrons using Three.js `0.160.0` from jsDelivr. The import starts as soon as the module runs (`index.html` preconnects and modulepreloads it), and the canvas fades in after its first rendered frame. With JS on, the static hero `<img>` is hidden (its box stays reserved, so no layout shift) and is used only as a fallback: `html.hero-fallback` fades it in on `prefers-reduced-motion`, `saveData`, no WebGL, import errors, WebGL context loss, or when no frame has rendered after 5 s. The orbit rings are circles of radius >= 2.6 around the T's rotation origin (the T's farthest point is 2.29 away), so they never intersect it at any sway angle. Rendering pauses when the hero is off-screen or the tab is hidden. Colors are read from the CSS custom properties in `:root`.

## Interactive 3D effects

Vanilla CSS 3D transforms plus `js/tilt.js` (no libraries). Everything is opt-in via data attributes in `index.html`:

- `data-tilt` (optionally `data-tilt-max="2.5"` in degrees): pointer tilt with perspective, moving glare and soft shadow. Cards also get depth layers (illustration parallax, cyan/violet glow, floating icon/title/text).
- `data-magnet`: subtle magnetic pull on primary buttons.
- `data-parallax="0.06"`: scroll-linked `translate` on the hero copy and glows.
- `.reveal`: 3D tilt-up entrance on scroll, staggered by 60ms, once per element (`js/main.js`).

Tuning tokens live in `:root` (`--tilt-max`, `--tilt-persp`, `--tilt-lift`, `--depth-*`, `--dur-reveal`, `--reveal-*`).

Only `transform`/`opacity` are animated, through one shared `requestAnimationFrame` loop. Tilt is disabled on touch (`hover: none`, replaced by a press-in on `:active`) and with `prefers-reduced-motion: reduce` (content is simply visible), including live changes. Keyboard focus on a card gives the depth "pop" without tilt. Without JS all content is visible.

## Notes

- Design tokens (colors, spacing, type, radius, elevation) live as CSS custom properties in `:root` in `css/styles.css`.
- The logo is a geometric SVG approximation of the brand board isotype.
- Social crawlers generally do not render SVG for `og:image`. Export `assets/og-image.svg` to a 1200x630 PNG and update the meta tags before launch. Social links in the footer are `#` placeholders.
