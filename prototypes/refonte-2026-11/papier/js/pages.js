/* Leon « Papier » v2 : the inner pages of the public site (pricing, security, connectors). No dependency.
   The pages are whole without this file. It adds: the bar's line after 24px of scroll, the phone's menu, a quiet
   notice on the links that lead nowhere in this prototype, and the home's section entrance on [data-rv]
   (heading 1, text 2, fragment 3: 70ms apart, 20px of travel, once; nothing under reduced motion). */
(function () {
  'use strict';
  var doc = document;
  var $ = function (s) { return doc.querySelector(s); };
  doc.documentElement.classList.add('js'); // from here css/site.css keeps the phone's menu closed until asked

  /* "Not in this prototype": a notice instead of a jump to the top */
  var notice = doc.createElement('p');
  var timer;
  notice.className = 'notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  doc.body.appendChild(notice);
  doc.addEventListener('click', function (e) {
    var el = e.target.closest('[title="Not in this prototype"]');
    if (!el) return;
    e.preventDefault();
    notice.textContent = el.textContent.trim() + ': not in this prototype.';
    notice.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { notice.hidden = true; }, 2400);
  });

  /* Navigation */
  var nav = $('[data-nav]'), menu = $('[data-nav-menu]'), panel = $('[data-nav-panel]');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  if (menu && panel) {
    var setMenu = function (open) { panel.classList.toggle('is-open', open); menu.setAttribute('aria-expanded', String(open)); };
    menu.addEventListener('click', function () { setMenu(menu.getAttribute('aria-expanded') !== 'true'); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); }
    });
  }

  /* Section entrances */
  var rv = [].slice.call(doc.querySelectorAll('[data-rv]'));
  if (!rv.length || !('IntersectionObserver' in window) || !rv[0].animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      io.unobserve(el);
      el.style.opacity = '';
      el.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], {
        duration: 600, delay: ((parseInt(el.getAttribute('data-rv'), 10) || 1) - 1) * 70, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards',
      });
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  rv.forEach(function (el) { el.style.opacity = '0'; io.observe(el); });
  window.addEventListener('beforeprint', function () { rv.forEach(function (el) { el.style.opacity = ''; }); });
})();
