/*
 * Hero 3D scene: brand "T" with atom-style orbits (Three.js, loaded from a CDN).
 * With JS on, the static <img> poster is hidden (see css) and used only as a fallback:
 * any bail-out adds `hero-fallback` to <html>, which fades the poster in.
 * The import starts as soon as this module runs, only when 3D is allowed (the inline head script
 * in index.html modulepreloads Three.js under the same conditions).
 *
 * Quality tiers (chosen once at init, never stepped back up):
 *   high    desktop look, uncapped frame rate
 *   low     phones / weak hardware: lighter materials and geometry, fewer sprites, 30 fps cap
 *   minimal last resort when even `low` cannot keep up: 1x pixel ratio, 20 fps, calmer orbits
 * Debug: `?hero3d=high|low|minimal` forces a tier (and disables adaptation);
 * `window.__hero3d.tier` reports the current one (read-only).
 */
// Camera distance: ~4% of extra margin keeps rings and glows inside the canvas at pointer extremes
const CAM_Z = 9.88;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const root = document.documentElement;
const host = document.querySelector('.hero-visual');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const conn = navigator.connection;

// ---- Quality tiers ----
const TIER_ORDER = ['high', 'low', 'minimal'];
const LOW_GEOMETRY = {
  curveSeg: 8, bevelSeg: 2, notchBevelSeg: 1, tubeSeg: 24, tubeRadial: 6,
  nodeSeg: [16, 10], jointSeg: [8, 6], ringRadial: 6, ringSeg: 96, coreSeg: [10, 8],
  trail: 5, particles: 18, backGlow2: false, physical: false, rimCyan: false, rimCyanDir: 2.2,
};
const QUALITY = {
  high: {
    curveSeg: 16, bevelSeg: 5, notchBevelSeg: 3, tubeSeg: 48, tubeRadial: 8,
    nodeSeg: [24, 16], jointSeg: [12, 8], ringRadial: 8, ringSeg: 160, coreSeg: [16, 12],
    trail: 9, particles: 40, backGlow2: true, physical: true, rimCyan: true,
    dprCap: () => (window.innerWidth < 640 ? 1.5 : 2),
    fps: 0, partialFps: 0, maxDt: 0.05, motion: 1,
  },
  low: { ...LOW_GEOMETRY, dprCap: () => 1.25, fps: 30, partialFps: 15, maxDt: 0.1, motion: 1 },
  minimal: { ...LOW_GEOMETRY, dprCap: () => 1, fps: 20, partialFps: 10, maxDt: 0.1, motion: 0.35 },
};
// Software rasterizers and old mobile GPUs
const WEAK_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic|mali-(4|t[0-7])|adreno \(tm\) ?[2-4]\d\d|powervr (sgx|gx6)/i;

function forcedTier() {
  try {
    const v = new URLSearchParams(location.search).get('hero3d');
    return TIER_ORDER.includes(v) ? v : null;
  } catch (e) {
    return null;
  }
}

// Cheap, synchronous signals only (no GL yet); the GPU hint is checked once the context exists
function initialTier() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = window.innerWidth <= 767;
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return coarse || small || (mem && mem <= 4) || (cores && cores <= 4) ? 'low' : 'high';
}

function gpuIsWeak(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return !!ext && WEAK_GPU.test(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
  } catch (e) {
    return false;
  }
}

function showFallback() {
  root.classList.add('hero-fallback');
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    // Release the probe context right away
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

async function start() {
  if (!host) return;
  if (reduceMotion.matches || (conn && conn.saveData)) return showFallback();

  // Never download Three.js for a device that cannot render it (index.html probed already)
  if (!(typeof window.__heroGL === 'boolean' ? window.__heroGL : hasWebGL())) return showFallback();
  const loading = import(THREE_URL);

  try {
    const THREE = await loading;
    // Preferences may have changed, or the safety timeout may have fired, while the module downloaded
    if (reduceMotion.matches || (conn && conn.saveData) || root.classList.contains('hero-fallback')) {
      return showFallback();
    }
    build(THREE);
  } catch (err) {
    showFallback();
    console.warn('[hero-3d] falling back to static image', err);
  }
}

// Owns the teardown stack so a throw mid-setup still releases everything acquired so far.
function build(THREE) {
  const undo = [];
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    host.classList.remove('is-3d');
    // Swap to the poster instantly: a lost context blanks the canvas at once, so a 500ms fade would show a gap
    root.classList.add('hero-fallback-now');
    showFallback();
    while (undo.length) {
      try { undo.pop()(); } catch (e) { /* keep tearing down */ }
    }
  };
  try {
    setup(THREE, undo, () => disposed, cleanup);
  } catch (err) {
    cleanup();
    throw err;
  }
  return cleanup;
}

function setup(THREE, undo, isDisposed, cleanup) {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => new THREE.Color(css.getPropertyValue(name).trim());
  const cyan = token('--brand-cyan');
  const blue = token('--brand-blue');
  const purple = token('--brand-purple');

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'hero-canvas';
  host.appendChild(canvas);
  undo.push(() => canvas.remove());

  // Antialiasing stays on for every tier: thin rings look broken without it, and MSAA is cheap on
  // tile-based mobile GPUs at the capped pixel ratio.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  undo.push(() => {
    renderer.dispose();
    renderer.forceContextLoss();
  });

  // ---- Tier selection (once) ----
  const forced = forcedTier();
  let tierName = forced || initialTier();
  if (!forced && tierName === 'high' && gpuIsWeak(renderer.getContext())) tierName = 'low';
  let q = QUALITY[tierName];
  // Adaptive step-down is skipped when a tier is forced for debugging
  const adapt = { on: !forced, prev: 0, sum: 0, n: 0, skip: 12 };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 50);
  camera.position.set(0, 0.1, CAM_Z);

  // ---- Glow texture (shared radial sprite, lives across tier rebuilds) ----
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const gx = gc.getContext('2d');
  const grad = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = grad;
  gx.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  undo.push(() => glowTex.dispose());

  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const rad = (deg) => (deg * Math.PI) / 180;

  // Everything tier-dependent lives in a "world" so a step-down can swap it wholesale.
  // `orbitClock` carries the (motion-scaled) orbit time across rebuilds so orbits do not jump.
  function makeWorld(q, orbitClock) {
    const disposables = [];
    const track = (o) => (disposables.push(o), o);
    const group = new THREE.Group();
    scene.add(group);

    // ---- Lights ----
    group.add(new THREE.HemisphereLight(0x6f8cff, 0x1a1040, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(-2, 4, 6);
    const rimViolet = new THREE.PointLight(purple, 70, 20);
    rimViolet.position.set(4, -3, 3);
    group.add(key, rimViolet);
    // The cyan rim is a point light on high; low tiers use a directional stand-in from the same
    // side (no per-pixel distance attenuation) so the top of the T keeps its cyan wash.
    const rimCyan = q.rimCyan ? new THREE.PointLight(cyan, 60, 20) : new THREE.DirectionalLight(cyan, q.rimCyanDir);
    rimCyan.position.set(-4, 2.5, 3);
    group.add(rimCyan);

    const makeSprite = (color, opacity, depthTest = true) => {
      const m = track(
        new THREE.SpriteMaterial({
          map: glowTex, color, opacity, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest,
        })
      );
      return new THREE.Sprite(m);
    };

    // Backdrop glow + floor glow
    const backGlow = makeSprite(blue, 0.55, false);
    backGlow.scale.set(8.5, 7, 1);
    backGlow.position.set(0, 0.1, -3);
    backGlow.renderOrder = -2;
    const floorGlow = makeSprite(blue, 0.9, false);
    floorGlow.scale.set(4.2, 0.9, 1);
    floorGlow.position.set(0, -2.15, -0.2);
    floorGlow.renderOrder = -1;
    group.add(backGlow, floorGlow);
    if (q.backGlow2) {
      const backGlow2 = makeSprite(purple, 0.28, false);
      backGlow2.scale.set(6, 4, 1);
      backGlow2.position.set(0.6, -1.2, -2.8);
      backGlow2.renderOrder = -2;
      group.add(backGlow2);
    }

    // ---- The T ----
    const tGroup = new THREE.Group();
    group.add(tGroup);

    const shape = new THREE.Shape();
    shape.moveTo(-1.5, 0.85);
    shape.lineTo(-1.5, 1.3);
    shape.quadraticCurveTo(-1.5, 1.6, -1.2, 1.6);
    shape.lineTo(1.5, 1.6); // top edge
    shape.bezierCurveTo(1.55, 1.3, 1.35, 1.0, 0.95, 0.85); // curved right tip
    shape.lineTo(0.42, 0.85);
    shape.lineTo(0.42, -1.15);
    shape.lineTo(0.02, -1.62); // tapered point
    shape.lineTo(-0.42, -1.15);
    shape.lineTo(-0.42, 0.85);
    shape.closePath();

    const extrude = { depth: 0.45, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: q.bevelSeg, curveSegments: q.curveSeg };
    const tGeo = track(new THREE.ExtrudeGeometry(shape, extrude));
    tGeo.translate(0, 0, -0.22);

    // Vertical gradient: cyan (top) -> blue -> violet (bottom), stored as vertex colors
    const applyGradient = (geo) => {
      const pos = geo.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp((pos.getY(i) + 1.6) / 3.2, 0, 1);
        if (t > 0.5) c.copy(blue).lerp(cyan, (t - 0.5) * 2);
        else c.copy(purple).lerp(blue, t * 2);
        cols.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    };
    applyGradient(tGeo);

    // Low tiers swap the clearcoat physical material for a plain standard one (a fraction of the shader cost)
    const tMat = track(
      q.physical
        ? new THREE.MeshPhysicalMaterial({
            vertexColors: true, roughness: 0.28, metalness: 0.1,
            clearcoat: 1, clearcoatRoughness: 0.12,
            emissive: blue, emissiveIntensity: 0.55,
          })
        : new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.22, metalness: 0.1,
            emissive: blue, emissiveIntensity: 0.6,
          })
    );
    const tMesh = new THREE.Mesh(tGeo, tMat);
    tGroup.add(tMesh);

    // Small inner block under the bar (left of the stem), slightly recessed
    const notch = new THREE.Shape();
    notch.moveTo(-0.85, 0.5);
    notch.lineTo(-0.58, 0.5);
    notch.lineTo(-0.58, -0.45);
    notch.lineTo(-0.85, -0.05);
    notch.closePath();
    const nGeo = track(new THREE.ExtrudeGeometry(notch, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: q.notchBevelSeg }));
    nGeo.translate(0, 0, -0.32);
    applyGradient(nGeo);
    const nMesh = new THREE.Mesh(nGeo, tMat);
    tGroup.add(nMesh);

    // Circuit traces with glowing end nodes (right side)
    const traceMat = track(new THREE.MeshBasicMaterial({ color: blue }));
    const traceHi = track(new THREE.MeshBasicMaterial({ color: cyan }));
    const nodeGeo = track(new THREE.SphereGeometry(0.11, q.nodeSeg[0], q.nodeSeg[1]));
    const jointGeo = track(new THREE.SphereGeometry(0.036, q.jointSeg[0], q.jointSeg[1]));
    const traces = [
      // Two traces, matching the brand isotype: a longer upper one and a shorter lower one,
      // each leaving the stem horizontally and bending diagonally up-right to a node.
      { pts: [[0.42, -0.25], [0.75, -0.25], [1.78, 0.95]], mat: traceHi },
      { pts: [[0.42, -0.85], [0.75, -0.85], [1.6, 0.12]], mat: traceMat },
    ];
    const nodes = [];
    traces.forEach(({ pts, mat }) => {
      const path = new THREE.CurvePath();
      const v = pts.map(([x, y]) => new THREE.Vector3(x, y, 0));
      for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
      const tube = new THREE.Mesh(track(new THREE.TubeGeometry(path, q.tubeSeg, 0.036, q.tubeRadial, false)), mat);
      tGroup.add(tube);
      v.slice(1, -1).forEach((p) => {
        const j = new THREE.Mesh(jointGeo, mat);
        j.position.copy(p);
        tGroup.add(j);
      });
      const end = v[v.length - 1];
      const node = new THREE.Mesh(nodeGeo, track(new THREE.MeshBasicMaterial({ color: mat === traceHi ? 0xbff8ff : 0xb4c8ff })));
      node.position.copy(end);
      const halo = makeSprite(mat === traceHi ? cyan : blue, 0.9);
      halo.scale.set(0.75, 0.75, 1);
      halo.position.copy(end);
      tGroup.add(node, halo);
      nodes.push(halo);
    });

    // ---- Orbits (atom-style rings) ----
    // Clearance: every T vertex lies within 2.29 units of the T group origin (measured on the
    // extruded body, traces and nodes), and the T only rotates/floats about that origin. The orbit
    // group shares the origin and float, so circular rings with r >= 2.6 stay >= 0.3 away from the
    // mesh at any sway angle, pointer offset or orbit spin. Do not shrink r without re-measuring.
    // (Tiers only change tessellation and sprite counts, never ring radii or tilt.)
    const orbitGroup = new THREE.Group();
    group.add(orbitGroup);
    const ringDefs = [
      { r: 2.62, tau: 46, psi: 30, color: cyan, speed: 0.9, e: [0, 3.4] },
      { r: 2.74, tau: 46, psi: 150, color: blue, speed: -0.65, e: [1.5] },
      { r: 2.86, tau: 46, psi: 270, color: purple, speed: 0.5, e: [2.2, 5.3] },
    ];
    // Fewer trail sprites cover the same arc (0.675 rad) with wider spacing
    const TRAIL = q.trail;
    const TRAIL_STEP = (0.075 * 9) / TRAIL;
    const electrons = [];
    ringDefs.forEach((def) => {
      const pivot = new THREE.Group();
      // Ring-plane normal: tilted `tau` degrees from vertical, toward azimuth `psi`
      pivot.quaternion.setFromUnitVectors(
        AXIS_Z,
        new THREE.Vector3(Math.sin(rad(def.tau)) * Math.sin(rad(def.psi)), Math.cos(rad(def.tau)), Math.sin(rad(def.tau)) * Math.cos(rad(def.psi)))
      );
      orbitGroup.add(pivot);
      const ring = new THREE.Mesh(
        track(new THREE.TorusGeometry(def.r, 0.012, q.ringRadial, q.ringSeg)),
        track(new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
      );
      pivot.add(ring);

      def.e.forEach((phase) => {
        const core = new THREE.Mesh(track(new THREE.SphereGeometry(0.075, q.coreSeg[0], q.coreSeg[1])), track(new THREE.MeshBasicMaterial({ color: 0xffffff })));
        const halo = makeSprite(def.color, 1);
        halo.scale.set(0.85, 0.85, 1);
        pivot.add(core, halo);
        const trail = [];
        for (let k = 1; k <= TRAIL; k++) {
          const s = makeSprite(def.color, 1 - k / (TRAIL + 1));
          s.scale.setScalar(0.3 * (1 - k / (TRAIL + 2)));
          pivot.add(s);
          trail.push(s);
        }
        electrons.push({ def, phase, core, halo, trail });
      });
    });

    // ---- Floating particles + hexagon outlines ----
    const pCount = q.particles;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 7;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 5;
      pPos[i * 3 + 2] = -1.5 + Math.random() * 3;
    }
    const pGeo = track(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const points = new THREE.Points(
      pGeo,
      track(new THREE.PointsMaterial({ color: cyan, size: 0.05, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
    );
    group.add(points);

    const hexPts = [];
    for (let i = 0; i < 6; i++) hexPts.push(new THREE.Vector3(Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6), Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6), 0));
    const hexGeo = track(new THREE.BufferGeometry().setFromPoints(hexPts));
    const hexMat = track(new THREE.LineBasicMaterial({ color: blue, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    const hexes = [
      { p: [-2.6, 1.9, -0.6], s: 0.42, r: 0.3 },
      { p: [2.9, -0.9, -0.4], s: 0.3, r: -0.5 },
      { p: [-2.3, -1.4, 0.4], s: 0.2, r: 0.9 },
    ].map(({ p, s, r }) => {
      const h = new THREE.LineLoop(hexGeo, hexMat);
      h.position.set(...p);
      h.scale.setScalar(s);
      h.rotation.z = r;
      group.add(h);
      return h;
    });

    let clock = orbitClock;
    const update = (time, dt, cur) => {
      clock += dt * q.motion;

      // Short scale-in (~600 ms); T and orbits scale together about the shared origin
      const k = Math.min(time / 0.6, 1);
      const intro = 0.86 + 0.14 * (1 - (1 - k) ** 3);
      tGroup.scale.setScalar(intro);
      orbitGroup.scale.setScalar(intro);

      tGroup.rotation.y = Math.sin(time * 0.55) * 0.43 + cur.x * 0.12; // about +/-25 deg
      tGroup.rotation.x = cur.y * 0.06;
      tGroup.position.y = Math.sin(time * 0.9) * 0.06;
      orbitGroup.rotation.y = clock * 0.12 + cur.x * 0.15;
      orbitGroup.rotation.x = Math.sin(clock * 0.25) * 0.12 + cur.y * 0.08;
      orbitGroup.position.y = tGroup.position.y;
      floorGlow.material.opacity = 0.8 + Math.sin(time * 1.6) * 0.12;
      nodes.forEach((n, i) => n.scale.setScalar(0.7 + Math.sin(time * 2 + i) * 0.08));
      hexes.forEach((h, i) => {
        h.rotation.z += dt * 0.15 * (i % 2 ? -1 : 1);
        h.position.y += Math.sin(time + i * 2) * 0.09 * dt; // 0.0015/frame at 60 Hz
      });
      points.rotation.z = time * 0.02;

      electrons.forEach((el) => {
        const { r, speed } = el.def;
        const a0 = el.phase + clock * speed;
        const place = (obj, a) => obj.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        place(el.core, a0);
        place(el.halo, a0);
        const dir = Math.sign(speed);
        el.trail.forEach((s, k) => place(s, a0 - dir * (k + 1) * TRAIL_STEP));
      });
    };

    return {
      update,
      get clock() { return clock; },
      dispose() {
        scene.remove(group);
        disposables.forEach((d) => d.dispose && d.dispose());
      },
    };
  }

  let world = makeWorld(q, 0);
  undo.push(() => world.dispose());

  // ---- Sizing ----
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap()));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole scene in frame on narrow boxes
    camera.position.z = camera.aspect < 1.2 ? CAM_Z * (1.2 / camera.aspect) ** 0.6 : CAM_Z;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  undo.push(() => ro.disconnect());
  resize();

  // Swap to the next lighter tier: rebuild the world once, carrying the orbit clock over
  const stepDown = () => {
    const next = TIER_ORDER[TIER_ORDER.indexOf(tierName) + 1];
    if (!next) return false;
    const clock = world.clock;
    world.dispose();
    tierName = next;
    q = QUALITY[next];
    world = makeWorld(q, clock);
    resize();
    return true;
  };

  // Read-only debug hook (no logging)
  Object.defineProperty(window, '__hero3d', {
    configurable: true,
    value: Object.freeze({
      get tier() { return tierName; },
      get info() { return renderer.info; },
    }),
  });
  undo.push(() => { delete window.__hero3d; });

  // ---- Pointer parallax (desktop, damped) ----
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  const onPointer = (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (finePointer) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    undo.push(() => window.removeEventListener('pointermove', onPointer));
  }

  // ---- Loop control ----
  let raf = 0;
  let onScreen = true;
  let partial = false; // hero mostly scrolled out: render at a lower rate
  let lastRender = -1;
  let time = 0;

  // Average rAF tick interval over ~1 s (ticks, not renders, so the fps cap does not skew it).
  // Over ~24 ms means the device cannot hold ~40 fps: step down one tier. Stops after the first
  // healthy window, so there is no oscillation and never a step back up.
  const monitor = (now) => {
    if (!adapt.on) return;
    if (adapt.prev) {
      const d = Math.min(now - adapt.prev, 100);
      if (adapt.skip > 0) adapt.skip--; // warm-up: shader compilation and first uploads
      else { adapt.sum += d; adapt.n++; }
    }
    adapt.prev = now;
    if (adapt.sum < 1000) return;
    const avg = adapt.sum / adapt.n;
    adapt.sum = adapt.n = 0;
    adapt.skip = 12;
    adapt.prev = 0;
    if (avg > 24 && stepDown()) return;
    adapt.on = false;
  };

  const frame = (now) => {
    if (isDisposed()) return;
    monitor(now);
    const fps = partial && q.partialFps ? q.partialFps : q.fps;
    if (fps && lastRender >= 0 && now - lastRender < 1000 / fps - 4) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const dt = lastRender < 0 ? 0 : Math.min(Math.max((now - lastRender) / 1000, 0), q.maxDt);
    lastRender = now;
    time += dt;

    cur.x += (target.x - cur.x) * 0.05;
    cur.y += (target.y - cur.y) * 0.05;

    world.update(time, dt, cur);

    try {
      renderer.render(scene, camera);
    } catch (err) {
      console.warn('[hero-3d] render failed, falling back to static image', err);
      cleanup();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const shouldRun = () => onScreen && !document.hidden && !isDisposed();
  const sync = () => {
    if (shouldRun() && !raf) {
      lastRender = -1; // next frame renders immediately with dt = 0
      adapt.prev = 0;
      raf = requestAnimationFrame(frame);
    } else if (!shouldRun() && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  undo.push(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  });
  const io = new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    onScreen = e.isIntersecting;
    const vh = e.rootBounds ? Math.min(e.boundingClientRect.height, e.rootBounds.height) : 0;
    partial = onScreen && vh > 0 && e.intersectionRect.height / vh < 0.25;
    sync();
  }, { threshold: [0, 0.25] });
  io.observe(host);
  undo.push(() => io.disconnect());
  document.addEventListener('visibilitychange', sync);
  undo.push(() => document.removeEventListener('visibilitychange', sync));

  const onReduce = () => reduceMotion.matches && cleanup();
  reduceMotion.addEventListener('change', onReduce);
  undo.push(() => reduceMotion.removeEventListener('change', onReduce));

  // ---- Context loss ----
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cleanup();
  });

  // First frame, then reveal (canvas fades in; the poster stays hidden)
  frame(performance.now());
  if (isDisposed()) return;
  sync();
  requestAnimationFrame(() => {
    if (isDisposed()) return;
    // The safety timeout already showed the poster: keep it, do not stack the canvas on top
    if (root.classList.contains('hero-fallback')) cleanup();
    else host.classList.add('is-3d');
  });
}

start();
