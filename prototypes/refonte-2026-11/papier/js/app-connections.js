/* Leon « Papier » v2 : Connections. No dependency; the page is whole without this file (js/app.js gives the shell).
   Two behaviours: the catalogue filter (by name or family) and "Reconnect" on the failing tool. Nothing is sent
   anywhere: the key typed in the form is only checked for being there. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- The filter (name, family, or what Leon reads): it only hides rows that are already in the page ---------- */
  var box = $('[data-filter]');
  var tools = $$('[data-tool]');
  if (box && tools.length) {
    var input = $('input', box), clear = $('[data-clear]', box), count = $('[data-count]'), none = $('[data-none]');
    var total = tools.length, whole = count.textContent;
    console.assert(total === 42, 'Connections: ' + total + ' tools in the catalogue, expected 42');
    // "Help Scout" answers to "helpscout", "tl;dv" to "tldv": lower case, punctuation as spaces.
    var fold = function (s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
    var hay = tools.map(function (li) {
      return fold($('.cx-tool__name', li).textContent + ' ' + $('.cx-tool__reads', li).textContent) + ' ' + li.dataset.tool + ' ' + fold($('dt', li.closest('[data-family]')).textContent); // its name, what Leon reads from it, its family
    });
    var apply = function () {
      var words = fold(input.value).split(' ').filter(Boolean), shown = 0;
      tools.forEach(function (li, i) {
        li.hidden = !words.every(function (w) { return hay[i].indexOf(w) !== -1; });
        if (!li.hidden) shown++;
      });
      $$('[data-family]').forEach(function (fam) { fam.hidden = !$('[data-tool]:not([hidden])', fam); });
      none.hidden = shown > 0;
      $('[data-none-q]', none).textContent = input.value.trim();
      clear.hidden = !input.value;
      count.textContent = shown === total ? whole : shown === 0 ? 'No tool matches' : shown + ' of ' + total + ' tools';
    };
    var reset = function () { input.value = ''; apply(); input.focus(); };
    box.hidden = false; // the field is only offered when it works
    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) reset(); });
    $$('[data-clear]').forEach(function (b) { b.addEventListener('click', reset); });
    apply(); // a value the browser restored on reload
  }

  /* ---------- Reconnect: the form opens under the row; a key, then a short wait, then the row is healthy ---------- */
  var open = $('[data-reconnect]'), fix = $('#cx-fix'), form = $('[data-fix]');
  if (open && fix && form) {
    var key = $('#cx-key'), err = $('#cx-key-err'), state = $('[data-state]');
    var show = function (on) { fix.hidden = !on; open.hidden = on; open.setAttribute('aria-expanded', String(on)); (on ? key : open).focus(); };
    var invalid = function (bad) { key.setAttribute('aria-invalid', String(bad)); err.hidden = !bad; };
    open.addEventListener('click', function () { show(true); });
    $('[data-cancel]', form).addEventListener('click', function () { invalid(false); show(false); });
    form.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !key.readOnly) { invalid(false); show(false); } });
    key.addEventListener('input', function () { invalid(false); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (key.readOnly) return;
      if (!key.value.trim()) { invalid(true); key.focus(); return; }
      key.readOnly = true;
      $$('button', form).forEach(function (b) { b.disabled = true; });
      // two lines, as the failing state had: the row and the form under it do not jump while it waits
      state.innerHTML = '<span class="busy">Reconnecting…</span><span class="cell__sub cx-why">Checking the new key.</span>';
      setTimeout(function () { // the healthy state, as the other rows show it
        fix.hidden = true;
        state.innerHTML = '<span class="status"><span class="dot dot--ok" aria-hidden="true"></span>Synced just now</span>';
        open.outerHTML = '<button type="button" class="btn btn--line btn--sm" title="Not in this prototype" aria-label="Manage Intercom">Manage</button>';
        $('.side__state').outerHTML = '<p class="side__state"><span class="dot dot--ok" aria-hidden="true"></span>All tools synced</p>';
        $('[data-live]').textContent = 'Intercom is reconnected. All tools synced.';
        $('[aria-label="Manage Intercom"]').focus();
      }, 1200);
    });
  }
})();
