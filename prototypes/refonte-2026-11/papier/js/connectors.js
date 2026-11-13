/* Leon « Papier » v2 : the public page "Connectors". No dependency; the page is whole without this file.
   The filter: by name, category or what Leon reads. It only hides rows that are already in the page, and the field
   is only shown once this script runs. Navigation, notice and entrances come from js/pages.js. */
(function () {
  'use strict';
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  var box = $('[data-filter]');
  var input = $('[data-filter-input]');
  var rows = $$('[data-row]');
  if (box && input && rows.length) {
    var status = $('[data-filter-status]');
    var none = $('[data-none]');
    var noneQ = $('[data-none-q]');
    var total = rows.length;
    // Self-check: the page says 42 in its headline; the rows must agree.
    console.assert(total === Number(box.getAttribute('data-total')), 'Connectors: ' + total + ' rows, expected ' + box.getAttribute('data-total'));

    // "Help Scout" answers to "helpscout", "tl;dv" to "tldv": lower case, no accents, punctuation as spaces.
    var fold = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
    var hay = rows.map(function (row) {
      var fam = row.closest('[data-family]');
      var name = fold($('.cx-row__name', row).textContent);
      return name + ' ' + name.replace(/ /g, '') + ' ' + fold(row.textContent) + ' ' + fold($('h3', fam).firstChild.textContent);
    });

    var apply = function () {
      var words = fold(input.value).split(' ').filter(Boolean);
      var shown = 0;
      rows.forEach(function (row, i) {
        var ok = words.every(function (w) { return hay[i].indexOf(w) !== -1; });
        row.hidden = !ok;
        if (ok) shown++;
      });
      $$('[data-family]').forEach(function (fam) {
        var empty = !$('[data-row]:not([hidden])', fam);
        fam.hidden = empty;
        var link = $('.cx-index a[href="#' + fam.id + '"]');
        if (link) link.parentNode.hidden = empty;
      });
      none.hidden = shown > 0;
      noneQ.textContent = input.value.trim();
      status.textContent = shown === total ? total + ' connectors' : shown === 0 ? 'No matching connector' : shown + ' of ' + total + ' connectors';
    };
    box.hidden = false; // the field is only offered when it works
    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { input.value = ''; apply(); } });
    $$('[data-filter-clear]').forEach(function (b) { b.addEventListener('click', function () { input.value = ''; apply(); input.focus(); }); });
    apply();
  }
})();
