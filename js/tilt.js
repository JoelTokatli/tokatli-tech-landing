/* Interactive 3D effects: pointer tilt, magnetic buttons, scroll parallax.
   Vanilla, no dependencies. One shared rAF loop, only CSS custom properties
   are written (the CSS turns them into transform/opacity). Opt-in via
   [data-tilt], [data-magnet] and [data-parallax]. */
(function () {
  'use strict';

  var root = document.documentElement;
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var DAMP = 0.16;  // fraction of the remaining distance covered per 16.7ms frame
  var EPS = 0.002;
  var EDGE_TOL = 2;     // px of hysteresis around the un-tilted rect before a hover ends
  var TILT_VARS = ['--rx', '--ry', '--lift', '--px', '--py', '--gx', '--gy', '--sx', '--sy'];
  var MAGNET_VARS = ['--bx', '--by'];

  var style = window.getComputedStyle(root);
  function token(name, fallback) {
    var v = parseFloat(style.getPropertyValue(name));
    return isNaN(v) ? fallback : v;
  }
  var TILT_MAX = token('--tilt-max', 8);
  var MAGNET_MAX = token('--magnet-max', 5);

  var enabled = false;
  var items = [];
  var live = [];        // items that are hovered or still easing back to rest
  var parallax = [];
  var raf = 0;
  var last = 0;
  var scrollDirty = true;

  // Items ------------------------------------------------------------------
  function createItem(el, kind) {
    var it = {
      el: el, kind: kind, hover: false, visible: true, live: false,
      max: kind === 'tilt' ? (parseFloat(el.getAttribute('data-tilt-max')) || TILT_MAX) : MAGNET_MAX,
      left: 0, top: 0, w: 0, h: 0, measured: false,
      tx: 0, ty: 0, x: 0, y: 0, lift: 0, tl: 0, settled: false
    };
    if (kind === 'tilt') {
      it.shadow = document.createElement('span');
      it.shadow.className = 'tilt-shadow';
      it.glare = document.createElement('span');
      it.glare.className = 'tilt-glare';
      it.shadow.setAttribute('aria-hidden', 'true');
      it.glare.setAttribute('aria-hidden', 'true');
    }
    return it;
  }

  // Document coordinates: scrolling never invalidates them, only resize does.
  function measure(it) {
    var r = it.el.getBoundingClientRect();
    it.left = r.left + window.pageXOffset;
    it.top = r.top + window.pageYOffset;
    it.w = it.el.offsetWidth || r.width;
    it.h = it.el.offsetHeight || r.height;
    it.measured = true;
  }

  function isRevealing(el) {
    return el.classList.contains('reveal') && !el.classList.contains('is-done');
  }

  function enter(it, e) {
    if (!enabled || e.pointerType === 'touch' || isRevealing(it.el)) return;
    if (it.hover) { move(it, e); return; }
    if (!it.live || !it.measured) measure(it); // reuse the cache while easing back (element is slightly transformed)
    it.hover = true;
    it.tl = it.kind === 'tilt' ? 1 : 0;
    if (it.kind === 'tilt') {
      if (!it.glare.parentNode) {
        it.el.insertBefore(it.shadow, it.el.firstChild);
        it.el.appendChild(it.glare);
      }
      it.el.classList.add('is-tilting');
    }
    it.el.style.willChange = it.kind === 'tilt' ? 'transform' : 'translate';
    move(it, e);
    if (!it.live) { it.live = true; live.push(it); }
    schedule();
  }

  function move(it, e) {
    if (!it.hover) return;
    if (!it.measured) measure(it);
    var nx = (e.clientX + window.pageXOffset - it.left) / it.w * 2 - 1;
    var ny = (e.clientY + window.pageYOffset - it.top) / it.h * 2 - 1;
    it.tx = nx < -1 ? -1 : nx > 1 ? 1 : nx;
    it.ty = ny < -1 ? -1 : ny > 1 ? 1 : ny;
    it.settled = false;
    schedule();
  }

  function leave(it) {
    if (!it.hover) return;
    it.hover = false;
    it.tx = 0; it.ty = 0; it.tl = 0;
    it.settled = false;
    schedule();
  }

  // The hovered element is itself transformed, so its edge moves under a
  // resting pointer. Hit-test against the stable, un-tilted rect instead.
  function inside(it, e) {
    var l = it.left - window.pageXOffset, t = it.top - window.pageYOffset;
    return e.clientX >= l - EDGE_TOL && e.clientX <= l + it.w + EDGE_TOL &&
           e.clientY >= t - EDGE_TOL && e.clientY <= t + it.h + EDGE_TOL;
  }

  function onDocMove(e) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.hover) continue;
      if (inside(it, e)) move(it, e); else leave(it);
    }
  }

  function leaveAll() {
    for (var i = 0; i < items.length; i++) leave(items[i]);
  }

  function clear(it) {
    var vars = it.kind === 'tilt' ? TILT_VARS : MAGNET_VARS;
    for (var i = 0; i < vars.length; i++) it.el.style.removeProperty(vars[i]);
    it.el.style.willChange = '';
    if (it.kind === 'tilt') it.el.classList.remove('is-tilting');
    it.x = it.y = it.lift = it.tx = it.ty = it.tl = 0;
    it.hover = false;
    it.settled = false;
    if (it.live) {
      it.live = false;
      var i2 = live.indexOf(it);
      if (i2 > -1) live.splice(i2, 1);
    }
  }

  function write(it) {
    var s = it.el.style;
    if (it.kind === 'tilt') {
      s.setProperty('--rx', (-it.y * it.max).toFixed(2) + 'deg');
      s.setProperty('--ry', (it.x * it.max).toFixed(2) + 'deg');
      s.setProperty('--lift', it.lift.toFixed(3));
      s.setProperty('--px', it.x.toFixed(3));
      s.setProperty('--py', it.y.toFixed(3));
      s.setProperty('--gx', (it.x * it.w * 0.5).toFixed(1));
      s.setProperty('--gy', (it.y * it.h * 0.5).toFixed(1));
      s.setProperty('--sx', (-it.x * 14).toFixed(1));
      s.setProperty('--sy', (-it.y * 10).toFixed(1));
    } else {
      s.setProperty('--bx', (it.x * it.max).toFixed(2) + 'px');
      s.setProperty('--by', (it.y * it.max).toFixed(2) + 'px');
    }
  }

  // Shared loop ------------------------------------------------------------
  function schedule() {
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  function frame(t) {
    raf = 0;
    var active = false;
    var dt = last ? Math.min(t - last, 50) : 16.7;
    last = t;
    var k = 1 - Math.pow(1 - DAMP, dt / 16.7);

    for (var i = live.length - 1; i >= 0; i--) {
      var it = live[i];
      if (!it.visible && !it.hover) { clear(it); continue; }
      if (it.settled) continue; // hovered and at its target: idle until the next pointermove
      it.x += (it.tx - it.x) * k;
      it.y += (it.ty - it.y) * k;
      it.lift += (it.tl - it.lift) * k;
      if (Math.abs(it.tx - it.x) < EPS && Math.abs(it.ty - it.y) < EPS && Math.abs(it.tl - it.lift) < EPS) {
        if (!it.hover) { clear(it); continue; }
        it.x = it.tx; it.y = it.ty; it.lift = it.tl;
        it.settled = true;
        write(it);
      } else {
        write(it);
        active = true;
      }
    }

    if (scrollDirty) { scrollDirty = false; updateParallax(); }

    if (active || scrollDirty) schedule(); else last = 0;
  }

  // Scroll parallax (translate only, hero copy and glows) ------------------
  function updateParallax() {
    var y = Math.min(window.pageYOffset, 900);
    for (var i = 0; i < parallax.length; i++) {
      var p = parallax[i];
      if (!p.visible) continue;
      p.el.style.translate = enabledMotion() ? '0 ' + (y * p.factor).toFixed(1) + 'px' : '';
    }
  }

  function enabledMotion() { return !mqReduce.matches; }

  function onScroll() {
    scrollDirty = true;
    schedule();
  }

  // Setup --------------------------------------------------------------------
  function bind(it) {
    var el = it.el;
    el.addEventListener('pointerenter', function (e) { enter(it, e); });
    el.addEventListener('pointermove', function (e) { if (it.hover) move(it, e); else enter(it, e); }, { passive: true });
    // pointerleave also fires when the tilted edge slides under a resting pointer; the
    // document-level hit test against the stable rect decides when the hover really ends.
    el.addEventListener('pointerleave', function (e) { if (!it.hover || !inside(it, e)) leave(it); });
    el.addEventListener('pointercancel', function () { leave(it); });
    items.push(it);
  }

  function update() {
    enabled = mqFine.matches && !mqReduce.matches;
    root.classList.toggle('tilt-on', enabled);
    if (!enabled) items.forEach(clear);
    scrollDirty = true;
    if (parallax.length && !enabledMotion()) {
      parallax.forEach(function (p) { p.el.style.translate = ''; });
    }
    schedule();
  }

  function init() {
    document.querySelectorAll('[data-tilt]').forEach(function (el) { bind(createItem(el, 'tilt')); });
    document.querySelectorAll('[data-magnet]').forEach(function (el) { bind(createItem(el, 'magnet')); });
    document.querySelectorAll('[data-parallax]').forEach(function (el) {
      parallax.push({ el: el, factor: parseFloat(el.getAttribute('data-parallax')) || 0, visible: true });
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].el === entry.target) items[i].visible = entry.isIntersecting;
          }
          for (var j = 0; j < parallax.length; j++) {
            if (parallax[j].el === entry.target) parallax[j].visible = entry.isIntersecting;
          }
        });
        scrollDirty = true;
        schedule();
      });
      items.forEach(function (it) { io.observe(it.el); });
      parallax.forEach(function (p) { io.observe(p.el); });
    }

    document.addEventListener('pointermove', onDocMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', leaveAll);
    window.addEventListener('blur', leaveAll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      items.forEach(function (it) { it.measured = false; });
    }, { passive: true });
    mqFine.addEventListener('change', update);
    mqReduce.addEventListener('change', update);
    update();
  }

  init();
})();
