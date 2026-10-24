// Téléchargement d'un fichier texte généré dans le navigateur (aucun envoi réseau).
export function telecharger(nom: string, contenu: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([contenu], { type })), a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
