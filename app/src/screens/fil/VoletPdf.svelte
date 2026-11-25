<script lang="ts">
  import { dire } from '../../ui/toast.svelte.ts';
  import Volet from '../../ui/Volet.svelte';
  import Icone from '../../ui/Icone.svelte';

  /** PDF prêt (journée, livre) : le partager (Fichiers, Mail, WhatsApp…), le télécharger ou l'ouvrir. */
  let { fichier, onfermer, titre = 'Ma journée en PDF' }: { fichier: File | null; onfermer: () => void; titre?: string } = $props();

  const peutPartager = $derived(!!fichier && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [fichier] }));
  const taille = $derived(fichier ? (fichier.size > 1024 * 1024 ? `${(fichier.size / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(fichier.size / 1024))} Ko`) : '');

  let url: string | null = null;
  const adresse = () => (url ??= URL.createObjectURL(fichier!));
  $effect(() => { if (!fichier && url) { URL.revokeObjectURL(url); url = null; } });

  async function partager() {
    if (!fichier) return;
    try { await navigator.share({ files: [fichier], title: fichier.name.replace(/\.pdf$/, '') }); }
    catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) dire('Partage impossible : télécharge le PDF à la place'); }
  }
  function telecharger() {
    if (!fichier) return;
    const a = document.createElement('a');
    a.href = adresse(); a.download = fichier.name;
    document.body.appendChild(a); a.click(); a.remove();
    dire('PDF téléchargé');
  }
  function ouvrir() { if (fichier) window.open(adresse(), '_blank', 'noopener'); }
</script>

<Volet ouvert={!!fichier} {onfermer} label={titre}>
  <div class="pdf">
    <h2 class="titre">{titre}</h2>
    {#if fichier}
      <p class="muted petit"><Icone nom="rapports" taille={14} trait={2} /> {fichier.name} · {taille}</p>
      <p class="muted petit">Le PDF reste sur ton appareil : rien n’est envoyé ailleurs.</p>
      {#if peutPartager}<button type="button" class="principal" onclick={partager}><Icone nom="partager" taille={18} trait={2.2} /> Partager ou enregistrer</button>{/if}
      <button type="button" class:principal={!peutPartager} onclick={telecharger}>Télécharger le PDF</button>
      <button type="button" onclick={ouvrir}>Ouvrir pour le lire</button>
    {/if}
  </div>
</Volet>

<style>
  .pdf { display: flex; flex-direction: column; gap: 10px; }
  .titre { font-size: 22px; margin: 0 0 2px; }
  .petit { font-size: 13px; margin: 0; display: flex; align-items: center; gap: 6px; }
  button { min-height: 52px; border-radius: 16px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 16px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
  button.principal { background: var(--inverse); color: var(--inverse-texte); border-color: var(--inverse); }
</style>
