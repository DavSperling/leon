/** Remonte en haut du panneau (et de la page sur mobile) : après une pagination ou un changement de filtre. */
export function scrollToTop(): void {
  document.getElementById('contenu')?.scrollTo(0, 0);
  window.scrollTo(0, 0);
}
