/* Leon « Papier » v2 : the interface fragments, built from window.LEON_DEMO as HTML strings.
   No DOM is needed to build them (index.html carries them pre-built, so the page is whole without script);
   js/site.js uses the same builders when the visitor changes question or person. Needs css/tokens.css and css/ui.css.

   window.LeonUI
     .data, .scenario(id)                    LEON_DEMO, and a scenario: 'commitment' | 'bug' | 'departure' | 'unknown'
     .logoBase                               '../shared/logos/'
     .questionHTML(who, query)               <p class="q" data-question>
     .answerHTML(answer, {selected})         <div class="answer" data-answer> sentences + <div class="flags" data-flags>
     .notesHTML(sources, {selected})         <ol class="notes" data-notes> the footnote rows (buttons)
     .asheetHTML(answer, {who, query, notes, selected})   question + answer (+ notes): the inside of an answer sheet
     .docHTML(source, {slot})                <article class="doc sheet" data-source> the original, opened at the passage
     .pileHTML(sources, top)                 the three docs with data-slot = top | b1 | b2
     .miniHTML(source, {vis})                <article class="mini sheet" data-source> flag, title, passage
     .fragHTML(answer, {who, query, vis})    an answer sheet and its minis (the rules' fragments)
     .permHTML(view)                         the permissions fragment for view 0 (Julie) or 1 (Sophie)
     .memoHTML(briefing)                     the morning briefing
     .connectorsHTML()                       the 42 tools as two <ul class="marquee__row" data-marquee-row>
     .dreamHTML(agentContext)                <ol class="dream" data-dream> evening, night (the thread's pile), morning
     .terminalHTML(agentContext)             <figure class="term" data-term> what the agent receives, one div per line
     .layoutFlags(scope)                     puts every flag level with the line where its sentence starts (DOM)

   Hooks on the markup (stable; the motion pass animates these):
     [data-sentence="k"]  sentence k of an answer (with data-n when it has a source)     .hl  its highlighter strokes
     [data-cite="n"]      the number chip after a sentence            [data-flag="n"] its flag (data-for="k"; n = 0: empty)
     [data-note="n"]      a footnote row                              [data-source="n"] a document (doc or mini)
     [data-docflag="n"]   the flag on a document's left edge          [data-n="n"] on all of the above: the link
     [data-term-line]     a printed line of the terminal (in order)   [data-term-mark="n"] a coloured [n] in it
     [data-term-source="n"] the source line n of the terminal         [data-dream-step="1|2|3"], [data-dream-sheet="n"],
     [data-dream-thread], [data-dream-marker]                         the dreaming strip
     [data-story-step="k"] a step's button, [data-story-replay]       the story's controls (state: data-step on [data-story])
     [data-term-title="evening|morning"], [data-term-body="evening|morning"], [data-term-end]   the terminal's two states
   In the data, **words** mark the passage Leon found: rendered as <mark class="hl hl-n">, never as bold. */
(function (root) {
  'use strict';
  const D = () => root.LEON_DEMO;
  // A month never parts from its day or its year across a line: "Nov 15", "December 2", "March 2025"
  const DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)([a-z]*) (\d)/g;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])).replace(DATE, '$1$2&nbsp;$3');
  const col = (n) => ((n - 1) % 4) + 1;
  const marked = (s, n) => esc(s).replace(/\*\*(.+?)\*\*/g, (_, t) => `<mark class="hl hl-${col(n)}">${t}</mark>`);
  const person = (key) => (D().people[key] || { name: key, initials: '?' });
  const NOT = 'title="Not in this prototype"';

  const UI = {
    get data() { return D(); },
    logoBase: '../shared/logos/',
    scenario: (id) => D().scenarios.find((s) => s.id === id) || D().scenarios[0],
    esc, col,
  };
  const logo = (tool, size = 20, lazy = false) => `<img class="logo" src="${UI.logoBase}${esc(tool)}.svg" alt="" width="${size}" height="${size}"${lazy ? ' loading="lazy"' : ''}>`;
  UI.logo = logo;
  const visHTML = (s) => s.visibility === 'private' ? '<span class="stamp">Private to you</span>' : '<span class="vis">Shared with the team</span>';
  const visText = (s) => s.visibility === 'private' ? 'Private to you' : 'Shared with the team';
  const titleOf = (sources, n) => { const s = (sources || []).find((x) => x.n === n); return s ? `: ${s.toolLabel}, ${s.title}` : ''; };

  /* ---------- the question ---------- */
  UI.questionHTML = function (who, query) {
    const p = person(who);
    return `<p class="q" data-question><span class="avatar" aria-hidden="true">${esc(p.initials)}</span><span><span class="vh">${esc(p.name)} asked: </span>${esc(query)}</span></p>`;
  };

  /* ---------- the answer: one flowing paragraph, a colour and a number on every sentence ---------- */
  const emptyFlag = (k) => `<span class="flag flag--empty" data-flag="0" data-for="${k}"><svg class="ef ef--wide" viewBox="0 0 84 24" width="84" height="24" aria-hidden="true"><polygon data-draw points="1,1 83,1 75,12 83,23 1,23"/></svg><svg class="ef ef--small" viewBox="0 0 34 24" width="34" height="24" aria-hidden="true"><polygon data-draw points="1,1 33,1 25,12 33,23 1,23"/></svg><span class="flag__label">no source</span></span>`;

  UI.answerHTML = function (answer, o = {}) {
    const segs = answer.segments;
    const body = segs.map((seg, i) => {
      const k = i + 1;
      const next = segs[i + 1];
      const end = next && /^[a-z]/.test(next.text) ? '' : '.';
      if (!seg.cites.length) return `<span class="seg seg--none" data-sentence="${k}">${esc(seg.text)}${end}</span>`;
      const n = seg.cites[0];
      const cites = seg.cites.map((c) => `<button type="button" class="cite c${col(c)}" data-cite="${c}" data-n="${c}" aria-pressed="${c === o.selected}" aria-label="Source ${c}${esc(titleOf(answer.sources, c))}">${c}</button>`).join('');
      // The last word, the full stop and the number never part across a line break
      const t = esc(seg.text);
      const cut = t.lastIndexOf(' ');
      return `<span class="seg${n === o.selected ? ' is-selected' : ''}" data-sentence="${k}" data-n="${n}"><mark class="hl hl-${col(n)} hl--a">${t.slice(0, cut + 1)}</mark><span class="nw"><mark class="hl hl-${col(n)} hl--b">${t.slice(cut + 1)}${end}</mark>${cites}</span></span>`;
    }).join(' ');
    const flags = segs.map((seg, i) => {
      const n = seg.cites[0];
      return n
        ? `<button type="button" class="flag c${col(n)}" data-flag="${n}" data-n="${n}" data-for="${i + 1}" tabindex="-1" aria-pressed="${n === o.selected}" aria-label="Source ${n}${esc(titleOf(answer.sources, n))}">${n}</button>`
        : emptyFlag(i + 1);
    }).join('');
    return `<div class="answer" data-answer><p class="answer__p">${body}</p><div class="flags" data-flags>${flags}</div></div>`;
  };

  /* ---------- footnotes: one compact row per source ---------- */
  UI.notesHTML = function (sources, o = {}) {
    return `<ol class="notes" data-notes aria-label="Sources">${sources.map((s) => `<li><button type="button" class="note c${col(s.n)}" data-note="${s.n}" data-n="${s.n}" aria-pressed="${s.n === o.selected}"><span class="num"><span class="vh">Source </span>${s.n}</span>${logo(s.tool)}<span class="note__title">${esc(s.title)}</span><span class="note__date">${esc(s.date)}</span><span class="note__sub">${esc(s.toolLabel)} · ${esc(s.kind)} · ${visText(s)}</span></button></li>`).join('')}</ol>`;
  };

  UI.asheetHTML = function (answer, o = {}) {
    return UI.questionHTML(o.who || answer.askedBy, o.query || answer.query)
      + UI.answerHTML(answer, o)
      + (o.notes ? UI.notesHTML(answer.sources, o) : '');
  };

  /* ---------- the original, in its own shape, opened at the passage ---------- */
  const paras = (body, n) => body.map((p) => `<p>${marked(p, n)}</p>`).join('');
  const stateClass = (s) => /review/i.test(s) ? 'state state--review' : /progress/i.test(s) ? 'state state--progress' : 'state';
  const prop = (k, v, cls) => `<div><dt>${k}</dt><dd>${cls ? `<span class="${cls}">${esc(v)}</span>` : esc(v)}</dd></div>`;
  // Two lines around the passage: the sheet is open at the place, it is not the whole record
  const around = (lines) => {
    const hit = Math.max(0, lines.findIndex((l) => l.hit));
    const from = Math.max(0, Math.min(hit - 1, lines.length - 2));
    return lines.slice(from, from + 2);
  };
  const byline = (s) => `${esc(s.author)} · ${esc(s.date)}`;
  const shapes = {
    meeting: (s, n) => ({
      meta: esc(s.original.meta),
      body: `<ol class="tx" aria-label="Transcript, at the passage">${around(s.original.lines).map((l) => `<li class="tx__line${l.hit ? ' is-hit' : ''}"><time class="tx__at">${esc(l.at)}</time><div><span class="tx__who">${esc(l.who)}</span><p class="tx__text">${marked(l.text, n)}</p></div></li>`).join('')}</ol>`,
    }),
    conversation: (s, n) => {
      const first = s.original.lines[0].who;
      return {
        meta: esc(s.original.meta),
        body: `<ol class="msgs" aria-label="Conversation, at the passage">${around(s.original.lines).map((l) => `<li class="msg${l.who === first ? '' : ' msg--team'}"><div class="msg__who"><span>${esc(l.who)}</span><time>${esc(l.at)}</time></div><p>${marked(l.text, n)}</p></li>`).join('')}</ol>`,
      };
    },
    note: (s, n) => ({ meta: esc(s.original.meta), body: `<div class="doc__body">${paras(s.original.body, n)}</div>` }),
    page: (s, n) => ({ meta: esc(s.original.meta), body: `<div class="doc__body">${paras(s.original.body, n)}</div>` }),
    ticket: (s, n) => {
      const [id, status, priority, who] = s.original.meta.split(' · ');
      return { meta: byline(s), body: `<p class="doc__id">${esc(id)}</p><dl class="props">${prop('Status', status, stateClass(status))}${prop('Priority', priority)}${prop('Assignee', who.replace(/^Assigned to /, ''))}</dl><div class="doc__body">${paras(s.original.body, n)}</div>` };
    },
    pr: (s, n) => {
      const [repo, num, state, files] = s.original.meta.split(' · ');
      return { meta: byline(s), body: `<p class="doc__id">${esc(repo)} ${esc(num)}</p><dl class="props">${prop('State', state, stateClass(state))}${prop('Changes', files)}</dl><div class="doc__body">${paras(s.original.body, n)}</div>` };
    },
    task: (s, n) => {
      const [project, who, state] = s.original.meta.split(' · ');
      return { meta: byline(s), body: `<dl class="props">${prop('Project', project.replace(/^Project: /, ''))}${prop('Assignee', who.replace(/^Assigned to /, ''))}${prop('Status', state, stateClass(state))}</dl><div class="doc__body">${s.original.body.map((p) => `<p class="checkline"><span class="checkbox" aria-hidden="true"></span><span>${marked(p, n)}</span></p>`).join('')}</div>` };
    },
    email: (s, n) => {
      const [from, to, date] = s.original.meta.split(' · ');
      return { meta: byline(s), body: `<dl class="props props--rows">${prop('From', from.replace(/^From /, ''))}${prop('To', to.replace(/^To /, ''))}${prop('Date', date)}</dl><div class="doc__body">${paras(s.original.body, n)}</div>` };
    },
  };

  UI.docHTML = function (s, o = {}) {
    const slot = o.slot || 'top';
    const shape = (shapes[s.original.type] || shapes.note)(s, s.n);
    return `<article class="doc sheet c${col(s.n)}" data-source="${s.n}" data-n="${s.n}" data-slot="${slot}" aria-label="Original: ${esc(s.title)}">
      <button type="button" class="flag flag--left" data-docflag="${s.n}" data-n="${s.n}" aria-pressed="${slot === 'top'}" aria-label="Source ${s.n}: ${esc(s.title)}">${s.n}</button>
      <header class="doc__head">${logo(s.tool)}<h3 class="doc__title">${esc(s.title)}</h3></header>
      <p class="doc__meta">${esc(s.toolLabel)} · ${esc(s.kind)} · ${shape.meta}</p>
      <div class="doc__rest">${shape.body}<footer class="doc__foot"><a class="btn btn--line btn--sm" href="#" ${NOT}>Open in ${esc(s.toolLabel)}</a>${visHTML(s)}</footer></div>
    </article>`;
  };

  // The chosen source on top; the others behind it, in reading order
  UI.slotsFor = function (sources, top) {
    const others = sources.filter((s) => s.n !== top);
    const slots = {};
    sources.forEach((s) => { slots[s.n] = s.n === top ? 'top' : `b${others.indexOf(s) + 1}`; });
    return slots;
  };
  UI.pileHTML = function (sources, top = 1) {
    const slots = UI.slotsFor(sources, top);
    return sources.map((s) => UI.docHTML(s, { slot: slots[s.n] })).join('\n');
  };

  /* ---------- a source as a small sheet ---------- */
  UI.miniHTML = function (s, o = {}) {
    return `<article class="mini sheet c${col(s.n)}" data-source="${s.n}" data-n="${s.n}" aria-label="Source ${s.n}: ${esc(s.title)}">
      <span class="flag flag--left" aria-hidden="true">${s.n}</span>
      <header class="doc__head">${logo(s.tool)}<h3 class="doc__title">${esc(s.title)}</h3></header>
      <p class="mini__sub">${esc(s.toolLabel)} · ${esc(s.kind)}</p>
      <p class="mini__passage">${marked(s.passage, s.n)}</p>
      ${o.vis || s.visibility === 'private' ? `<p class="mini__vis">${visHTML(s)}</p>` : ''}
    </article>`;
  };

  UI.fragHTML = function (answer, o = {}) {
    return `<div class="asheet asheet--plain sheet">${UI.asheetHTML(answer, o)}</div>
    <div class="minis minis--${answer.sources.length}">${answer.sources.map((s) => UI.miniHTML(s, o)).join('')}</div>`;
  };

  // Only the documents this person can open are built: a hidden one leaves no trace.
  UI.permHTML = function (view = 0) {
    const perm = D().permissions;
    const v = perm.views[view];
    return UI.fragHTML(v, { who: v.askedBy, query: perm.query, vis: true });
  };

  /* ---------- the morning briefing ---------- */
  UI.memoHTML = function (b) {
    b = b || D().briefing;
    let n = 0;
    return `<article class="memo sheet" data-memo aria-label="Morning briefing">
      <h3 class="memo__title" data-line>Morning briefing</h3>
      <p class="memo__date" data-line>${esc(D().today)} · ${esc(b.time)}</p>
      ${b.sections.map((sec) => `<section class="memo__sec"><h4 data-line>${esc(sec.title)}</h4><ul>${sec.items.map((it) => {
        n += 1;
        const t = esc(it);
        const cut = t.lastIndexOf(' '); // the last word and its number stay together
        return `<li data-line><span data-line-text>${t.slice(0, cut + 1)}<span class="nw">${t.slice(cut + 1)}<span class="num c${col(n)}" data-chip aria-label="source ${n}">${n}</span></span></span></li>`;
      }).join('')}</ul></section>`).join('')}
    </article>`;
  };

  /* ---------- the 42 connectors, in two rows ---------- */
  UI.connectorsHTML = function () {
    const all = D().catalogue.flatMap((f) => f.tools);
    return [0, 1].map((r) => `<ul class="marquee__row" data-marquee-row="${r + 1}">${all.filter((_, i) => i % 2 === r).map(([tool, label]) => `<li class="tool" data-tool="${esc(tool)}">${logo(tool, 24, true)}<span>${esc(label)}</span></li>`).join('')}</ul>`).join('\n');
  };

  /* ---------- for developers: the dreaming strip and what the agent receives when a session starts ---------- */
  // Three steps on one line; under "Night", the sources of the briefing lie in one pile named after the work thread.
  UI.dreamHTML = function (ctx) {
    ctx = ctx || D().agentContext;
    // A story in three steps. Each step is a button that shows its state again; Morning is the page's default state.
    const steps = [
      ['Evening', 'A session ends. Leon keeps it.'],
      ['Night', 'Leon dreams: it rereads, files and prepares.'],
      ['Morning', 'The next session starts up to date, in any tool.'],
    ];
    const pile = `<div class="dream__pile" data-dream-pile>${ctx.briefing.sources.map((s) => `<p class="dsheet sheet c${col(s.n)}" data-dream-sheet="${s.n}"><span class="flag flag--left" aria-hidden="true">${s.n}</span>${logo(s.tool, 16)}<span class="dsheet__title">${esc(s.title)}</span></p>`).join('')}<p class="dream__thread" data-dream-thread>Thread <b>${esc(ctx.sessions[0].branch)}</b></p></div>`;
    return `<ol class="dream" data-dream aria-label="How it works, in three steps">${steps.map(([when, cap], i) => `<li class="dream__step" data-dream-step="${i + 1}"><button type="button" class="dream__btn" data-story-step="${i + 1}" aria-pressed="${i === 2}"><span class="dream__dot" aria-hidden="true"></span><span class="dream__when">${when}<span class="vh">: </span></span><span class="dream__cap">${esc(cap)}</span></button></li>`).join('')}<li class="dream__marker" data-dream-marker aria-hidden="true"></li></ol><div class="dream__desk">${pile}<button type="button" class="more dream__replay" data-story-replay hidden>Replay</button></div>`;
  };

  // Real terminal output: one <div data-term-line> per printed line, in print order. [n] and source n share colour n.
  // A source's text is a <span> on purpose: GSAP, measuring a mark inside a line that is not displayed yet, puts it back
  // before its next *element* sibling; with bare text after it, the number ended up at the end of the line.
  UI.terminalHTML = function (ctx) {
    ctx = ctx || D().agentContext;
    const b = ctx.briefing;
    const line = (cls, html, attr = '') => `<div class="term__line ${cls}" data-term-line${attr}>${html}</div>`;
    const ref = (n) => `<span class="term__ref t${col(n)}" data-term-mark="${n}">[${n}]</span>`;
    const toolW = Math.max(...ctx.sessions.map((s) => s.tool.length));
    const out = [
      line('term__strong', `Leon · context for ${esc(ctx.repo)}`),
      line('term__head term__gap', 'Your last sessions on this repository'),
      ...ctx.sessions.map((s) => line('term__session', `<span class="term__dim">${esc(s.when)}</span>  ${esc(s.tool.padEnd(toolW))}  <span class="term__branch">${esc(s.branch)}</span><span class="term__what"> · ${esc(s.what)}</span>`)),
      line('term__head term__gap', 'Morning briefing'),
      ...b.items.map((it) => line('term__item', `– ${esc(it.text)} ${it.cites.map(ref).join(' ')}`)),
      line('term__head term__gap', 'Sources'),
      ...b.sources.map((s) => line(`term__source t${col(s.n)}`, `<span data-term-mark="${s.n}">[${s.n}]</span><span> ${esc(s.toolLabel)} · ${esc(s.title)} · ${esc(s.date)}</span>`, ` data-term-source="${s.n}"`)),
    ];
    // The other state of the same panel: the end of the evening's session (the first session of the data) and what Leon keeps.
    const s0 = ctx.sessions[0];
    const endLine = (cls, html) => `<div class="term__line ${cls}" data-term-end>${html}</div>`;
    const end = [
      endLine('term__strong', `Session ended · ${esc(s0.when)}`),
      endLine('term__session', `<span class="term__branch">${esc(s0.branch)}</span><span class="term__what"> · ${esc(s0.what)}</span>`),
      endLine('term__head term__gap', 'Leon · session kept'),
      endLine('term__item', '– What was said, word for word.'),
      endLine('term__item', '– What was done: branch, commits, pull requests, files.'),
      endLine('term__item term__dim', '– Secrets masked. Private to you.'),
    ];
    const repo = esc(ctx.repo.replace(/^github\.com\//, ''));
    return `<figure class="term" data-term aria-label="The coding agent’s terminal"><figcaption class="term__bar"><span data-term-title="evening">claude · ${repo}</span><span data-term-title="morning">codex · ${repo}</span></figcaption><div class="term__screen"><div class="term__body" data-term-body="morning">${out.join('')}</div><div class="term__body" data-term-body="evening">${end.join('')}</div></div></figure>`;
  };

  /* ---------- flags: level with the line where their sentence starts ---------- */
  // Two sentences that start on the same line: their flags sit side by side (--shift), never on a wrong line.
  UI.layoutFlags = function (scope) {
    (scope || document).querySelectorAll('[data-answer]').forEach((a) => {
      const box = a.querySelector('[data-flags]');
      if (!box || !a.offsetParent) return;
      const top0 = a.getBoundingClientRect().top;
      const rows = new Map();
      box.querySelectorAll('[data-for]').forEach((flag) => {
        const seg = a.querySelector(`[data-sentence="${flag.dataset.for}"]`);
        const r = seg && seg.getClientRects()[0];
        if (!r) return;
        flag.style.top = `${Math.round(r.top - top0 + (r.height - flag.offsetHeight) / 2)}px`;
        const key = Math.round(r.top);
        rows.set(key, (rows.get(key) || []).concat(flag));
      });
      rows.forEach((flags) => {
        let shift = 0;
        for (let i = flags.length - 1; i >= 0; i--) { // the last sentence's flag is outermost
          flags[i].style.setProperty('--shift', `${shift}px`);
          shift += flags[i].offsetWidth + 4;
        }
      });
      box.classList.add('is-laid');
    });
  };

  root.LeonUI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
