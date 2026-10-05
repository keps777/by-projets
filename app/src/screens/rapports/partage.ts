// Partage manuel du rapport : menu de partage du téléphone (donc WhatsApp), sinon presse-papiers. Aucun envoi automatique.

export type ResultatPartage = 'partage' | 'copie' | 'annule' | 'echec';

export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texte); return true; }
  } catch { /* on essaie l'ancienne méthode */ }
  try {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand('copy');
    zone.remove();
    return ok;
  } catch { return false; }
}

export async function partagerTexte(texte: string, titre?: string): Promise<ResultatPartage> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ text: texte, title: titre }); return 'partage'; } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'annule';
    }
  }
  return (await copierTexte(texte)) ? 'copie' : 'echec';
}
