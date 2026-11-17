/* Home: the morning briefing (one sheet, its five lines in their three groups; a line opens its source in the side
   panel, at the passage) and three questions to try (each opens its discussion). Built on the kit: Leon.tile,
   Leon.panel.source. The first half also runs in Node (build.mjs writes its blocks into index.html). */
(function () {
  'use strict';
  const L = window.Leon, { D, A, esc } = L;
  const SRC = A.briefingSources; // line n of the briefing cites source n

  // A line: its words under a stroke that is drawn only when it is pointed at, and its number in its colour. The last
  // word, the full stop and the number never part across a line; nor do a month and its day.
  const line = (text, s) => {
    const c = L.col(s.n), t = esc(text).replace(/\b([A-Z][a-z]{2}) (\d)/g, '$1&nbsp;$2'), cut = t.lastIndexOf(' ');
    return `<li><button type="button" class="brow" data-n="${s.n}" aria-haspopup="dialog"><span class="hl hl-${c} hl--a">${t.slice(0, cut + 1)}</span><span class="nw"><span class="hl hl-${c} hl--b">${t.slice(cut + 1)}</span><span class="num c${c}"><span class="vh"> Source </span>${s.n}</span></span></button></li>`;
  };
  const brief = () => {
    let i = 0;
    return D.briefing.sections.map((sec, k) => `<section class="brief__col" aria-labelledby="brief-${k}"><h3 id="brief-${k}">${esc(sec.title)}</h3><ul>${sec.items.map((t) => line(t, SRC[i++])).join('')}</ul></section>`).join('\n');
  };
  const asks = L.asksHTML; // the kit's three questions (the block "asks" is the kit's too)

  L.block('brief', brief);
  // Five lines numbered 1 to 5 in reading order, each with a source; three questions, each opening its discussion
  L.selfCheck = (assert) => {
    const b = brief();
    assert.deepEqual([...b.matchAll(/data-n="(\d)"/g)].map((m) => +m[1]), [1, 2, 3, 4, 5]);
    assert.equal(SRC.length, 5);
    assert.deepEqual([...asks().matchAll(/href="chat\.html\?d=(\w+)"/g)].map((m) => m[1]), ['commitment', 'bug', 'unknown']);
  };
  if (!L.browser) return;

  // A line, or its number, opens the original at its passage; the line stays marked while its source is open
  const sheet = document.getElementById('brief');
  let open = null;
  const mark = (b) => { if (open) open.classList.remove('is-open'); open = b; if (b) b.classList.add('is-open'); };
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('.brow');
    if (!b) return;
    L.panel.source(SRC.find((s) => s.n === +b.dataset.n), b);
    mark(b);
  });
  L.panel.el.addEventListener('close', () => mark(null));
})();
