import { describe, expect, it } from 'vitest';
import { storageToText } from './storage';

describe('confluence : format de stockage en texte', () => {
  it('rend les titres, paragraphes, listes et entités', () => {
    const text = storageToText(
      '<h1>Objectifs</h1><p>La <strong>version 2</strong> de l&rsquo;application&nbsp;!</p>' +
        '<ul><li><p>Onboarding</p></li><li><p>Export CSV</p></li></ul>' +
        '<ol><li><p>Tarifs</p></li></ol>',
    );

    expect(text).toBe(
      [
        'Objectifs',
        '',
        'La version 2 de l’application !',
        '',
        '- Onboarding',
        '- Export CSV',
        '',
        '- Tarifs',
      ].join('\n'),
    );
  });

  it('garde une cellule de tableau sur la ligne de sa rangée', () => {
    const text = storageToText(
      '<table><tbody><tr><th><p>Jalon</p></th><th><p>Date</p></th></tr>' +
        '<tr><td><p>Bêta</p></td><td><p>1er novembre</p></td></tr></tbody></table>',
    );

    expect(text).toBe('Jalon Date\nBêta 1er novembre');
  });

  it('garde le titre d’un encart mais pas ses autres paramètres', () => {
    const text = storageToText(
      '<ac:structured-macro ac:name="info" ac:schema-version="1">' +
        '<ac:parameter ac:name="title">Décision</ac:parameter>' +
        '<ac:parameter ac:name="icon">false</ac:parameter>' +
        '<ac:rich-text-body><p>Le périmètre est gelé.</p></ac:rich-text-body></ac:structured-macro>',
    );

    expect(text).toBe('Décision\n\nLe périmètre est gelé.');
  });

  it('rend les tâches avec leur état, sans leur numéro', () => {
    const text = storageToText(
      '<ac:task-list>' +
        '<ac:task><ac:task-id>1</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body>Valider le budget</ac:task-body></ac:task>' +
        '<ac:task><ac:task-id>2</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>Recruter</ac:task-body></ac:task>' +
        '</ac:task-list>',
    );

    expect(text).toBe('- [ ] Valider le budget\n- [x] Recruter');
  });

  it('garde un bloc de code tel quel, avec ses signes < et &', () => {
    const text = storageToText(
      '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">bash</ac:parameter>' +
        '<ac:plain-text-body><![CDATA[if [ $a < 3 ] && true; then\n  echo "ok"\nfi]]></ac:plain-text-body></ac:structured-macro>',
    );

    expect(text).toBe('if [ $a < 3 ] && true; then\n  echo "ok"\nfi');
  });

  it('rend la date d’un champ date', () => {
    expect(storageToText('<p>Avant le <time datetime="2026-12-15" />.</p>')).toBe(
      'Avant le 2026-12-15.',
    );
  });

  it('rend le texte d’un lien, ou à défaut le titre de la page visée', () => {
    const withBody =
      '<p>Voir <ac:link><ri:page ri:content-title="Astreinte" /><ac:plain-text-link-body><![CDATA[la procédure]]></ac:plain-text-link-body></ac:link>.</p>';
    const rich =
      '<p>Voir <ac:link><ri:page ri:content-title="Astreinte" ri:space-key="OPS" /><ac:link-body>la <strong>procédure</strong></ac:link-body></ac:link>.</p>';
    const bare =
      '<p>Voir <ac:link><ri:page ri:content-title="Astreinte &amp; garde" /></ac:link>.</p>';

    expect(storageToText(withBody)).toBe('Voir la procédure.');
    expect(storageToText(rich)).toBe('Voir la procédure.');
    expect(storageToText(bare)).toBe('Voir Astreinte & garde.');
  });

  it('ne laisse ni emoticône, ni image, ni texte d’aide à la saisie', () => {
    const text = storageToText(
      '<p>Merci <ac:emoticon ac:name="smile" /></p>' +
        '<ac:image><ri:attachment ri:filename="schema.png" /></ac:image>' +
        '<p><ac:placeholder>Tapez @ pour mentionner quelqu’un</ac:placeholder></p>',
    );

    expect(text).toBe('Merci');
  });

  it('rend un texte vide pour un corps vide', () => {
    expect(storageToText('')).toBe('');
    expect(storageToText('<p />')).toBe('');
  });

  it('ne fait pas passer pour du balisage une valeur d’attribut piégée', () => {
    const text = storageToText('<p><ri:page ri:content-title="&lt;b&gt;gras&lt;/b&gt;" /></p>');

    expect(text).toBe('<b>gras</b>');
    // Un « < » brut dans une valeur n'ouvre pas un bloc script qui avalerait la suite.
    expect(storageToText('<ri:page ri:content-title="<script>" /><p>après</p>')).toContain('après');
  });

  it('reste rapide sur des balises jamais fermées', () => {
    const size = 300_000;
    for (const piece of [
      '<ac:parameter ',
      '<ri:page ',
      '<![CDATA[',
      '<time ',
      '<li>  ',
      '<ac:task-id>',
    ]) {
      const started = Date.now();
      storageToText(piece.repeat(size / piece.length));
      expect(Date.now() - started, piece).toBeLessThan(2000);
    }
  });
});
