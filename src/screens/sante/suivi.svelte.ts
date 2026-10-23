/** Vrai quand on lit depuis un `$derived`, un effet ou un gabarit : Svelte y interdit toute modification d'état. */
export const enSuivi = (): boolean => $effect.tracking();
