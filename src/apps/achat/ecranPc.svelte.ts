// Variante PC (≥ 900 px) : la même requête média que les feuilles de style (`@media (min-width: 900px)`), lue aussi côté script.
// Sert aux écrans qui n'ont pas le même cadre sur PC (en-tête d'application) ni le même balisage (récapitulatif collant, boutons dans le contenu).
// Un seul rendu à la fois : jamais de texte en double dans le DOM, donc les tests du mobile ne voient rien de la variante PC.
const REQUETE = '(min-width: 900px)';
const mq = typeof matchMedia === 'function' ? matchMedia(REQUETE) : undefined;
export const ecran = $state({ pc: mq?.matches ?? false });
mq?.addEventListener('change', (e) => { ecran.pc = e.matches; });
