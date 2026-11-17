/* Leon « Papier » v2 : Documents. Adding files by the button or by dropping them anywhere on the page.
   Nothing leaves the browser: a file becomes a row "Reading the file…", then a read document. The page is whole
   without this script (the file button still opens the picker; the states are at #empty and #rejected). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const drop = $('[data-drop]');
  const input = $('#file');
  const body = $('[data-docs] tbody');
  const tpl = $('#doc-row');
  if (!drop || !input || !body || !tpl) return;
  const rejected = $('#rejected');
  const TYPES = { pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', ppt: 'powerpoint', pptx: 'powerpoint' };
  const size = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const quote = (names) => names.map((n) => `“${n}”`).join(', ');

  function add(files) {
    const typeOf = (f) => TYPES[f.name.split('.').pop().toLowerCase()];
    const bad = [...files].filter((f) => !typeOf(f)).map((f) => f.name);
    if (bad.length < files.length && location.hash === '#empty') body.replaceChildren(); // the empty state really had no rows
    [...files].forEach((f) => {
      const type = typeOf(f);
      if (!type) return;
      const row = tpl.content.firstElementChild.cloneNode(true);
      $('.logo', row).src = `../shared/logos/${type}.svg`;
      $('[data-name]', row).textContent = f.name;
      $('[data-date]', row).textContent = `Today, ${new Date().toTimeString().slice(0, 5)}`;
      if ($('#vis').value === 'Team') $('[data-vis]', row).textContent = 'Team';
      body.prepend(row);
      // shortcut: reading is a 2.4s wait, replace with the real state of the file when a server exists
      setTimeout(() => {
        $('.cell__sub', row).textContent = size(f.size);
        const btn = $('button', row);
        btn.disabled = false;
        btn.title = 'Not in this prototype';
      }, 2400);
    });
    if (bad.length) $('[data-bad]', rejected).textContent = `${quote(bad)} ${bad.length > 1 ? 'were' : 'was'} not added`;
    rejected.classList.toggle('is-on', bad.length > 0);
    if (bad.length < files.length && location.hash === '#empty') location.hash = 'docs'; // the list comes back
    else if (location.hash === '#rejected') location.hash = 'docs'; // the alert is now driven by .is-on only
    const n = body.rows.length;
    $('[data-count]').textContent = `${n} ${n === 1 ? 'document' : 'documents'}`;
    input.value = '';
  }

  input.addEventListener('change', () => add(input.files));
  // Dropping works anywhere on the page; the strip shows that the file will be taken
  const held = (e) => [...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files');
  document.addEventListener('dragover', (e) => { if (held(e)) { e.preventDefault(); drop.classList.add('is-over'); } });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('is-over'); });
  document.addEventListener('drop', (e) => {
    if (!held(e)) return;
    e.preventDefault();
    drop.classList.remove('is-over');
    add(e.dataTransfer.files);
  });
  $('[data-dismiss]', rejected).addEventListener('click', (e) => {
    e.preventDefault();
    rejected.classList.remove('is-on');
    if (location.hash === '#rejected') location.hash = 'docs';
  });
})();
