// Vrai quand une touche à une lettre doit rester à ce qui a la main : on écrit quelque part, ou un
// menu, un sélecteur ou un dialogue (de confirmation compris) est ouvert. Un éditeur en lecture seule
// (commentaire) porte contenteditable="false" : on n'y écrit pas.
export function isTypingOrBusy(): boolean {
  const target = document.activeElement;
  const typing = target?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  );
  return (
    Boolean(typing) ||
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
  );
}
