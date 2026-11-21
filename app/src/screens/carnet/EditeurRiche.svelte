<script lang="ts">
  import { enregistrerMedia, preparerImage, urlMedia } from '../../data/media.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { hydrater } from './hydrater.ts';
  import { estVide, nettoyer, texteVersHtml } from './riche.ts';
  import './riche.css';

  /**
   * Éditeur de note riche, en plein écran (spec §18, nov. 2026) : paragraphes, titres, gras, italique, souligné, listes, citation, séparateur,
   * liens, images et vidéos. Le contenu est nettoyé à l'enregistrement (`nettoyer`). Une nouvelle note garde un brouillon sur l'appareil.
   */
  let { ouvert, html = '', titre, brouillonCle = null, onenregistrer, onfermer, onsupprimer }: {
    ouvert: boolean; html?: string; titre: string;
    /** Clé de stockage du brouillon (nouvelle note) ; null pour la correction d'une note existante. */
    brouillonCle?: string | null;
    onenregistrer: (html: string) => void; onfermer: () => void; onsupprimer?: () => void;
  } = $props();

  let zone: HTMLDivElement | undefined = $state();
  let vide = $state(true);
  let modifie = $state(false);
  let confirmation = $state(false);
  let figureChoisie: HTMLElement | null = $state(null);
  let styleBloc = $state('p');
  let actifs = $state({ bold: false, italic: false, underline: false, ul: false, ol: false });
  let lienOuvert = $state(false);
  let lienUrl = $state('');
  let occupe = $state(0);
  let saisieImage: HTMLInputElement | undefined = $state();
  let saisieVideo: HTMLInputElement | undefined = $state();
  let selection: Range | null = null;
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  const lire = (): string | null => { try { return brouillonCle ? localStorage.getItem(brouillonCle) : null; } catch { return null; } };
  const ecrireBrouillon = (v: string | null) => { try { if (!brouillonCle) return; if (v) localStorage.setItem(brouillonCle, v); else localStorage.removeItem(brouillonCle); } catch { /* sans stockage */ } };

  /** À chaque ouverture (la zone est recréée) : le contenu de la note, ou le brouillon d'une nouvelle note, puis l'affichage des médias. */
  function initialiser(noeud: HTMLDivElement) {
    const brouillon = lire();
    noeud.innerHTML = nettoyer(html || brouillon || '') || '<p><br></p>'; // toujours un bloc pour écrire : le style (titre, citation…) s'applique à lui
    if (!html && brouillon) dire('Brouillon repris');
    hydrater(noeud);
    modifie = false; confirmation = false; lienOuvert = false; figureChoisie = null;
    vide = estVide(noeud.innerHTML);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignoré */ }
    noeud.focus();
  }

  // La sélection dans la zone est gardée : les boutons, le sélecteur de fichiers et le champ du lien la rendent.
  $effect(() => {
    if (!ouvert) return;
    const suivre = () => {
      const s = document.getSelection();
      if (!zone || !s || !s.rangeCount || !zone.contains(s.anchorNode)) return;
      selection = s.getRangeAt(0).cloneRange();
      majEtat();
    };
    document.addEventListener('selectionchange', suivre);
    return () => document.removeEventListener('selectionchange', suivre);
  });

  function majEtat() {
    try {
      actifs = { bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline'), ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList') };
      const b = String(document.queryCommandValue('formatBlock')).toLowerCase().replace(/[<>]/g, '');
      styleBloc = ['h1', 'h2', 'blockquote'].includes(b) ? b : 'p';
    } catch { /* ignoré */ }
  }

  function rendreSelection() {
    if (!zone) return;
    zone.focus();
    const s = document.getSelection();
    if (!s) return;
    // La sélection vit encore dans la zone (cas courant) : on n'y touche pas. La copie gardée peut être en retard d'un geste.
    if (s.rangeCount && zone.contains(s.anchorNode)) return;
    s.removeAllRanges();
    if (selection && zone.contains(selection.startContainer)) s.addRange(selection);
    else { const r = document.createRange(); r.selectNodeContents(zone); r.collapse(false); s.addRange(r); }
  }

  function changer() {
    if (!zone) return;
    modifie = true;
    vide = estVide(zone.innerHTML);
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { if (zone && brouillonCle) ecrireBrouillon(vide ? null : nettoyer(zone.innerHTML)); }, 600);
  }

  function commande(nom: string, valeur?: string) {
    rendreSelection();
    document.execCommand(nom, false, valeur);
    changer(); majEtat();
  }
  function bloc(tag: string) {
    rendreSelection();
    // Un deuxième appui sur le même style revient au paragraphe.
    const actuel = String(document.queryCommandValue('formatBlock')).toLowerCase().replace(/[<>]/g, '');
    document.execCommand('formatBlock', false, actuel === tag ? 'p' : tag);
    changer(); majEtat();
  }

  function appliquerLien() {
    const url = lienUrl.trim();
    lienOuvert = false;
    if (!url) return;
    const complet = /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(url) ? `mailto:${url}` : `https://${url}`;
    rendreSelection();
    const s = document.getSelection();
    if (s && s.isCollapsed) document.execCommand('insertHTML', false, `<a href="${complet.replace(/"/g, '&quot;')}">${complet.replace(/</g, '&lt;')}</a>&nbsp;`);
    else document.execCommand('createLink', false, complet);
    changer();
  }

  async function inserer(fichiers: FileList | File[] | null, type: 'image' | 'video') {
    if (!fichiers || !fichiers.length) return;
    occupe++;
    try {
      for (const f of Array.from(fichiers)) {
        try {
          const blob = type === 'image' ? await preparerImage(f) : f;
          const id = await enregistrerMedia(blob, type);
          const url = (await urlMedia(id)) ?? '';
          const media = type === 'image' ? `<img data-media="${id}" src="${url}" alt="">` : `<video data-media="${id}" src="${url}" controls playsinline preload="metadata"></video>`;
          rendreSelection();
          document.execCommand('insertHTML', false, `<figure contenteditable="false">${media}</figure><p><br></p>`);
          changer();
        } catch (e) {
          dire(e instanceof Error ? e.message : 'Fichier impossible à ajouter');
        }
      }
    } finally { occupe--; }
  }

  function collage(e: ClipboardEvent) {
    const d = e.clipboardData;
    if (!d) return;
    e.preventDefault();
    const images = Array.from(d.files).filter((f) => f.type.startsWith('image/'));
    if (images.length) { void inserer(images, 'image'); return; }
    const h = d.getData('text/html');
    const propre = h ? nettoyer(h) : texteVersHtml(d.getData('text/plain'));
    if (!propre) return;
    document.execCommand('insertHTML', false, propre);
    changer();
  }

  /** Toucher un média le choisit (contour) ; le bouton « Retirer le média » apparaît. */
  function toucher(e: MouseEvent) {
    const fig = (e.target as Element).closest('figure');
    if (figureChoisie && figureChoisie !== fig) figureChoisie.classList.remove('choisie');
    figureChoisie = fig && zone?.contains(fig) ? (fig as HTMLElement) : null;
    figureChoisie?.classList.add('choisie');
  }
  function retirerMedia() {
    const f = figureChoisie;
    if (!f) return;
    f.remove(); figureChoisie = null;
    changer();
  }

  function enregistrer() {
    if (!zone) return;
    const h = nettoyer(zone.innerHTML);
    if (estVide(h)) { dire('La note est vide'); return; }
    clearTimeout(minuteur);
    ecrireBrouillon(null);
    onenregistrer(h);
  }
  function fermer() {
    if (brouillonCle) { if (zone && modifie && !vide) { ecrireBrouillon(nettoyer(zone.innerHTML)); dire('Brouillon gardé'); } onfermer(); return; }
    if (modifie && !confirmation) { confirmation = true; return; }
    onfermer();
  }
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape' && !lienOuvert) { e.preventDefault(); fermer(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); enregistrer(); }
  }
  const garder = (e: Event) => e.preventDefault(); // un bouton de la barre ne prend pas le focus : la sélection du texte reste
</script>

{#if ouvert}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="editeur" role="dialog" aria-modal="true" aria-label={titre} tabindex="-1" onkeydown={touche}>
    <header>
      <button type="button" class="rond" aria-label="Fermer l’éditeur" onclick={fermer}><Icone nom="fermer" taille={18} trait={2.2} /></button>
      <h2 class="titre">{titre}</h2>
      {#if onsupprimer}<button type="button" class="rond danger" aria-label="Supprimer la note" onclick={onsupprimer}><Icone nom="poubelle" taille={18} /></button>{/if}
      <button type="button" class="enreg" disabled={vide || occupe > 0} onclick={enregistrer}>Enregistrer</button>
    </header>

    {#if confirmation}
      <div class="confirmation" role="alert">
        <span>Abandonner les modifications ?</span>
        <button type="button" onclick={() => (confirmation = false)}>Continuer</button>
        <button type="button" class="danger" onclick={() => { confirmation = false; onfermer(); }}>Abandonner</button>
      </div>
    {/if}

    <div class="barre" role="toolbar" aria-label="Mise en forme" tabindex="-1" onpointerdown={garder}>
      <select aria-label="Style du paragraphe" value={styleBloc} onchange={(e) => { const v = e.currentTarget.value; if (v === 'p') commande('formatBlock', 'p'); else bloc(v); }} onpointerdown={(e) => e.stopPropagation()}>
        <option value="p">Paragraphe</option><option value="h1">Titre</option><option value="h2">Sous-titre</option><option value="blockquote">Citation</option>
      </select>
      <button type="button" class:actif={actifs.bold} aria-pressed={actifs.bold} aria-label="Gras" onclick={() => commande('bold')}><b>G</b></button>
      <button type="button" class:actif={actifs.italic} aria-pressed={actifs.italic} aria-label="Italique" onclick={() => commande('italic')}><i>I</i></button>
      <button type="button" class:actif={actifs.underline} aria-pressed={actifs.underline} aria-label="Souligné" onclick={() => commande('underline')}><u>S</u></button>
      <button type="button" class:actif={actifs.ul} aria-pressed={actifs.ul} aria-label="Liste à puces" onclick={() => commande('insertUnorderedList')}>•≡</button>
      <button type="button" class:actif={actifs.ol} aria-pressed={actifs.ol} aria-label="Liste numérotée" onclick={() => commande('insertOrderedList')}>1.</button>
      <button type="button" aria-label="Séparateur" onclick={() => commande('insertHorizontalRule')}>―</button>
      <button type="button" aria-label="Ajouter un lien" onclick={() => { lienUrl = ''; lienOuvert = !lienOuvert; }}><Icone nom="chaine" taille={18} trait={2} /></button>
      <button type="button" aria-label="Ajouter une image" onclick={() => saisieImage?.click()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>
      </button>
      <button type="button" aria-label="Ajouter une vidéo" onclick={() => saisieVideo?.click()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="3" /><path d="M16 10l5-3v10l-5-3z" /></svg>
      </button>
      <button type="button" aria-label="Annuler la dernière action" onclick={() => commande('undo')}>↶</button>
      <button type="button" aria-label="Rétablir" onclick={() => commande('redo')}>↷</button>
      {#if figureChoisie}<button type="button" class="retirer" aria-label="Retirer le média" onclick={retirerMedia}><Icone nom="poubelle" taille={18} /> Retirer</button>{/if}
    </div>

    {#if lienOuvert}
      <form class="lien" onsubmit={(e) => { e.preventDefault(); appliquerLien(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="https://…" aria-label="Adresse du lien" bind:value={lienUrl} autofocus />
        <button type="submit">Ajouter</button>
      </form>
    {/if}

    <div class="feuille">
      {#if vide}<span class="placeholder" aria-hidden="true">Écris ici… des paragraphes, des titres, des photos, des vidéos.</span>{/if}
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div class="riche zone" bind:this={zone} use:initialiser contenteditable="true" role="textbox" aria-multiline="true" aria-label="Contenu de la note" tabindex="0"
        oninput={changer} onpaste={collage} onclick={toucher}></div>
    </div>
    {#if occupe > 0}<p class="occupe" role="status">Ajout du média…</p>{/if}

    <input bind:this={saisieImage} type="file" accept="image/*" multiple hidden aria-label="Choisir des images" onchange={(e) => { void inserer(e.currentTarget.files, 'image'); e.currentTarget.value = ''; }} />
    <input bind:this={saisieVideo} type="file" accept="video/*" hidden aria-label="Choisir une vidéo" onchange={(e) => { void inserer(e.currentTarget.files, 'video'); e.currentTarget.value = ''; }} />
  </div>
{/if}

<style>
  .editeur { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; background: var(--fond); color: var(--texte); height: 100dvh; padding-top: var(--haut-sûr, 0px); }
  header { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 16px 8px; }
  h2 { flex: 1; min-width: 0; font-size: 19px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0; }
  .rond { flex: none; width: 44px; height: 44px; border-radius: 22px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); display: inline-flex; align-items: center; justify-content: center; }
  .rond.danger { color: var(--mauvais); }
  .enreg { flex: none; height: 44px; padding: 0 18px; border-radius: 22px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 15px; font-weight: 600; }
  .enreg:disabled { opacity: 0.35; }
  .confirmation { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--alerte-fond); color: var(--alerte); font-size: 14px; }
  .confirmation span { flex: 1; }
  .confirmation button { height: 40px; border-radius: 12px; border: 1px solid currentColor; background: transparent; color: inherit; font-weight: 600; padding: 0 12px; }
  .confirmation .danger { background: var(--mauvais); border-color: var(--mauvais); color: #fff; }
  .barre { flex: none; display: flex; gap: 6px; align-items: center; overflow-x: auto; padding: 6px 16px; border-top: 1px solid var(--ligne); border-bottom: 1px solid var(--ligne); scrollbar-width: none; }
  .barre::-webkit-scrollbar { display: none; }
  .barre button, .barre select { flex: none; min-width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 16px; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
  .barre button.actif { background: var(--accent-fond); border-color: var(--accent); color: var(--accent-encre); }
  .barre .retirer { color: var(--mauvais); font-size: 14px; font-weight: 600; }
  .barre select { font-weight: 600; max-width: 150px; }
  .lien { flex: none; display: flex; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--ligne); }
  .lien input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 16px; padding: 0 12px; }
  .lien button { height: 44px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--accent); color: var(--accent-texte); font-weight: 600; }
  .feuille { position: relative; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 16px 16px calc(40px + var(--bas-sûr, 0px)); }
  .zone { min-height: 50dvh; outline: none; caret-color: var(--accent); -webkit-user-select: text; user-select: text; }
  .placeholder { position: absolute; left: 16px; right: 16px; top: 16px; color: var(--faint); font-size: 16px; pointer-events: none; }
  .occupe { position: absolute; left: 50%; bottom: calc(18px + var(--bas-sûr, 0px)); transform: translateX(-50%); margin: 0; padding: 8px 14px; border-radius: 16px; background: var(--inverse); color: var(--inverse-texte); font-size: 13px; }
</style>
