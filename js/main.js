(function () {
  'use strict';

  document.documentElement.classList.add('js');

  // Mobile menu ------------------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('site-nav');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.classList.toggle('is-open', open);
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
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
