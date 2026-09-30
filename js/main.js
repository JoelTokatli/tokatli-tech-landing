(function () {
  'use strict';

  document.documentElement.classList.add('js');

  // Mobile menu ------------------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('site-nav');

  var FOCUSABLE = 'a[href], button:not([disabled])';

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open); // scroll lock while the overlay is open
  }

  function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(!isOpen());
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    // Tap outside the header closes the menu
    document.addEventListener('click', function (e) {
      if (isOpen() && !e.target.closest('.site-header')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') {
        setMenu(false);
        toggle.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      // Focus trap: toggle + menu items form one cycle while open
      var nodes = [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll(FOCUSABLE)));
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (e) {
      if (e.matches) setMenu(false);
    });
  }

  // Scroll reveal ----------------------------------------------------------
  var items = document.querySelectorAll('.reveal');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var io = null;

  // Instant: no transition, element is final (reduced motion / no IO support).
  function revealNow(el) { el.classList.add('is-visible', 'is-done'); }

  // Animated: 3D tilt-up entrance; `is-done` drops the transform when it ends.
  function reveal(el, index) {
    var timer;
    function finish() {
      clearTimeout(timer);
      el.removeEventListener('transitionend', onEnd);
      el.classList.add('is-done');
    }
    function onEnd(e) { if (e.target === el && e.propertyName === 'transform') finish(); }
    el.style.setProperty('--reveal-i', index);
    el.classList.add('is-visible');
    el.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, 1500);
  }

  if (!('IntersectionObserver' in window) || mqReduce.matches) {
    items.forEach(revealNow);
  } else {
    io = new IntersectionObserver(function (entries) {
      var n = 0; // stagger index within this batch
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          reveal(entry.target, Math.min(n++, 6));
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  // Live change to reduced motion: show everything immediately.
  mqReduce.addEventListener('change', function (e) {
    if (!e.matches) return;
    if (io) io.disconnect();
    items.forEach(revealNow);
  });

  // Newsletter form --------------------------------------------------------
  var form = document.getElementById('signup-form');
  var input = document.getElementById('email');
  var msg = document.getElementById('email-msg');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function show(text, type) {
    msg.textContent = text;
    msg.className = 'form-msg' + (type ? ' is-' + type : '');
  }

  function validate() {
    var value = input.value.trim();
    var ok = EMAIL_RE.test(value);
    input.setAttribute('aria-invalid', String(!ok));
    if (!value) show('Ingresa tu correo electrónico.', 'error');
    else if (!ok) show('Revisa el formato, por ejemplo tu@correo.com.', 'error');
    else show('', '');
    return ok;
  }

  if (form) {
    // Keep the field clear of the on-screen keyboard on phones
    input.addEventListener('focus', function () {
      if (!window.matchMedia('(pointer: coarse)').matches) return;
      setTimeout(function () {
        input.scrollIntoView({ block: 'center', behavior: mqReduce.matches ? 'auto' : 'smooth' });
      }, 300);
    });
    input.addEventListener('blur', function () { if (input.value) validate(); });
    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') validate();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) { input.focus(); return; }

      // TODO: set data-action on the form (see README) to POST to a real
      // provider. Without it, the form only shows the success state locally.
      var action = form.getAttribute('data-action');
      var done = function () {
        show('Listo, ya estás en la lista. Revisa tu correo.', 'success');
        form.reset();
        input.removeAttribute('aria-invalid');
      };

      if (!action) { done(); return; }

      fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: input.value.trim() })
      }).then(function (res) {
        if (res.ok) done();
        else show('No pudimos suscribirte. Inténtalo de nuevo.', 'error');
      }).catch(function () {
        show('Error de conexión. Inténtalo de nuevo.', 'error');
      });
    });
  }
})();
