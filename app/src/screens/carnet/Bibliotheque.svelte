<script lang="ts">
  import { routeur } from '../../routeur.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { ajouterChapitre, COULEURS_LIVRE, creerLivre, echangerChapitres, livres, modifierLivre, supprimerLivre, titreChapitre, type Livre } from '../../data/actions/livres.ts';
  import { modifierNoteRiche, supprimerNote } from '../../data/actions/notes.ts';
  import { hydraterAction } from './hydrater.ts';
  import { nettoyer, texteVersHtml } from './riche.ts';
  import EditeurRiche from './EditeurRiche.svelte';
  import Journal from './Carnet.svelte';
  import './riche.css';

  const tous = $derived(livres());
  const idOuvert = $derived(routeur.params.get('livre'));
  const livre = $derived(tous.find((l) => l.id === idOuvert) ?? null);
  const lecture = $derived(routeur.params.get('lire') === '1');
  // Le journal s'ouvre pour ses adresses (?vue, ?ecrire, ?riche, ?jour) et le reste tant qu'on est sur cet écran (il retire lui-même ses paramètres).
  let journal = $state(['vue', 'ecrire', 'riche', 'jour'].some((k) => routeur.params.has(k)));
  $effect(() => { if (['vue', 'ecrire', 'riche', 'jour'].some((k) => routeur.params.has(k))) journal = true; });
  const fonce = (c: string) => `color-mix(in srgb, ${c} 62%, #000)`;
  const couv = (c: string) => `linear-gradient(145deg, color-mix(in srgb, ${c} 88%, #fff) 0%, ${c} 38%, ${fonce(c)} 100%)`;

  // Nouveau livre / réglages de la couverture
  let volet = $state<'nouveau' | 'reglages' | null>(null);
  let titre = $state(''); let couleur = $state(COULEURS_LIVRE[5]);
  function ouvrirNouveau() { titre = ''; couleur = COULEURS_LIVRE[Math.floor(Math.random() * COULEURS_LIVRE.length)]; volet = 'nouveau'; }
  function ouvrirReglages() { if (!livre) return; titre = livre.titre; couleur = livre.couleur; volet = 'reglages'; }
  function valider() {
    if (!titre.trim()) { dire('Donne un titre à ton livre'); return; }
    if (volet === 'nouveau') { const id = creerLivre(titre, couleur); if (id) routeur.definir('livre', id); }
    else if (livre) modifierLivre(livre, titre, couleur);
    volet = null;
  }
  let confirmeSupp = $state(false);

  // Éditeur de chapitre
  let ed = $state<{ id: string | null; html: string } | null>(null);
  const enregistrer = (html: string) => {
    if (!livre || !ed) return;
    if (ed.id) modifierNoteRiche(ed.id, html); else ajouterChapitre(livre.id, html);
    ed = null; dire('Chapitre enregistré');
  };

  // Lecteur : colonnes CSS, une page = une largeur d'écran
  let lecteur: HTMLDivElement | undefined = $state();
  let page = $state(1); let nbPages = $state(1);
  const contenuLivre = $derived(livre ? livre.chapitres.map((c, i) => `<section class="chap"><p class="num">Chapitre ${i + 1}</p>${nettoyer(c.contenu ?? texteVersHtml(c.texte))}</section>`).join('') : '');
  function mesurer() {
    const el = lecteur; if (!el) return;
    el.style.columnWidth = `${el.clientWidth - 56}px`;
    requestAnimationFrame(() => { nbPages = Math.max(1, Math.round(el.scrollWidth / el.clientWidth)); page = Math.min(nbPages, Math.round(el.scrollLeft / el.clientWidth) + 1); });
  }
  $effect(() => { void contenuLivre; if (lecteur) { mesurer(); setTimeout(mesurer, 300); } });
  const aller = (p: number) => lecteur?.scrollTo({ left: (Math.max(1, Math.min(nbPages, p)) - 1) * lecteur.clientWidth, behavior: 'smooth' });
  function toucheLecteur(e: MouseEvent) {
    if ((e.target as Element).closest('a, video')) return;
    const x = e.clientX / window.innerWidth;
    aller(page + (x > 0.6 ? 1 : x < 0.4 ? -1 : 0));
  }
</script>

{#if journal}
  <Journal />
{:else if livre && lecture}
  <div class="liseuse" style:--c={livre.couleur}>
    <header><button type="button" class="rond" aria-label="Fermer la lecture" onclick={() => routeur.definir('lire', null)}><Icone nom="fermer" taille={18} trait={2.2} /></button><span class="lt">{livre.titre}</span><span class="mono pg">p. {page} / {nbPages}</span></header>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lecteur riche" bind:this={lecteur} use:hydraterAction={contenuLivre} onscroll={mesurer} onclick={toucheLecteur}>
      <section class="titre-page"><div class="mini" style:background={couv(livre.couleur)}></div><h1 class="serif">{livre.titre}</h1><p>{livre.chapitres.length} chapitre{livre.chapitres.length > 1 ? 's' : ''} · {livre.pages} page{livre.pages > 1 ? 's' : ''}</p></section>
      {@html contenuLivre}
    </div>
    <div class="barre-lec"><input type="range" min="1" max={nbPages} value={page} aria-label="Page" oninput={(e) => aller(+e.currentTarget.value)} /></div>
  </div>
{:else if livre}
  <EcranPage gap={16}>
    <header class="tete"><button type="button" class="rond" aria-label="Bibliothèque" onclick={() => routeur.definir('livre', null)}><Icone nom="retour" taille={18} trait={2.2} /></button><span class="grow"></span><button type="button" class="rond" aria-label="Réglages du livre" onclick={ouvrirReglages}><Icone nom="reglages" taille={18} /></button></header>
    <div class="heros" style:--c={livre.couleur}>
      <div class="couv grande" style:background={couv(livre.couleur)}><span class="reliure"></span><h2 class="serif">{livre.titre}</h2><span class="filet"></span><small>Luther</small></div>
      <div class="infos">
        <h1 class="titre">{livre.titre}</h1>
        <p class="muted">{livre.chapitres.length} chapitre{livre.chapitres.length > 1 ? 's' : ''} · {livre.mots.toLocaleString('fr-CA')} mots · ≈ {livre.pages} page{livre.pages > 1 ? 's' : ''}</p>
        <div class="progres"><span style:width="{Math.min(100, livre.pages)}%"></span></div><small class="muted">Objectif 100 pages · {Math.min(100, livre.pages)} %</small>
        <button type="button" class="lire" disabled={!livre.chapitres.length} onclick={() => routeur.definir('lire', '1')}><Icone nom="livre" taille={18} /> Lire le livre</button>
      </div>
    </div>
    <div class="sect"><h3>Table des matières</h3><button type="button" class="plus" onclick={() => (ed = { id: null, html: '<h1>Titre du chapitre</h1><p><br></p>' })}><Icone nom="plus" taille={15} trait={2.4} /> Nouveau chapitre</button></div>
    <ol class="toc">
      {#each livre.chapitres as c, i (c.id)}
        <li><button type="button" class="ch" onclick={() => (ed = { id: c.id, html: c.contenu ?? texteVersHtml(c.texte) })}>
          <span class="n mono">{i + 1}</span><span class="col"><b>{titreChapitre(c)}</b><small class="muted">≈ {Math.max(1, Math.ceil(c.texte.split(/\s+/).length / 250))} p.</small></span></button>
          <span class="ord"><button type="button" aria-label="Monter" disabled={i === 0} onclick={() => echangerChapitres(livre.chapitres[i - 1], c)}>↑</button><button type="button" aria-label="Descendre" disabled={i === livre.chapitres.length - 1} onclick={() => echangerChapitres(c, livre.chapitres[i + 1])}>↓</button></span></li>
      {:else}<li class="vide muted">Aucun chapitre. Chaque chapitre ou sous-chapitre est une note : touche « Nouveau chapitre ».</li>{/each}
    </ol>
  </EcranPage>
{:else}
  <EcranPage gap={18}>
    <header class="tete"><button type="button" class="rond" aria-label="Retour" onclick={() => routeur.retour('/')}><Icone nom="retour" taille={18} trait={2.2} /></button><h1 class="titre grow">Bibliothèque</h1><button type="button" class="rond" aria-label="Journal du jour" onclick={() => routeur.definir('vue', 'journal')}><Icone nom="calendrier" taille={18} /></button></header>
    <p class="muted acc">Chaque livre est fait de notes : un chapitre, une note.</p>
    <div class="etagere">
      {#each tous as l (l.id)}
        <button type="button" class="livre" onclick={() => routeur.definir('livre', l.id)} aria-label="{l.titre}, {l.chapitres.length} chapitres">
          <span class="couv" style:background={couv(l.couleur)}><span class="reliure"></span><span class="serif t">{l.titre}</span><span class="filet"></span></span>
          <span class="meta"><b>{l.titre}</b><small class="muted">{l.chapitres.length} ch. · ≈ {l.pages} p.</small></span>
        </button>
      {/each}
      <button type="button" class="livre nouveau" onclick={ouvrirNouveau} aria-label="Nouveau livre"><span class="couv vide"><Icone nom="plus" taille={30} trait={1.8} /></span><span class="meta"><b>Nouveau livre</b></span></button>
    </div>
    {#if !tous.length}<p class="muted acc">Crée ton premier livre : un titre, une couleur de couverture, puis écris-le chapitre par chapitre.</p>{/if}
  </EcranPage>
{/if}

<Volet ouvert={volet !== null} onfermer={() => (volet = null)} label="Couverture du livre">
  <div class="form">
    <h2 class="titre">{volet === 'nouveau' ? 'Nouveau livre' : 'Réglages du livre'}</h2>
    <div class="apercu"><div class="couv grande" style:background={couv(couleur)}><span class="reliure"></span><h2 class="serif">{titre || 'Titre du livre'}</h2><span class="filet"></span></div></div>
    <input type="text" placeholder="Titre du livre" aria-label="Titre du livre" bind:value={titre} maxlength="80" />
    <div class="palette" role="group" aria-label="Couleur de la couverture">
      {#each COULEURS_LIVRE as c (c)}<button type="button" class:on={couleur === c} style:background={c} aria-label="Couleur {c}" aria-pressed={couleur === c} onclick={() => (couleur = c)}></button>{/each}
      <input type="color" value={couleur} aria-label="Couleur personnalisée" oninput={(e) => (couleur = e.currentTarget.value)} />
    </div>
    <button type="button" class="ok" onclick={valider}>{volet === 'nouveau' ? 'Créer le livre' : 'Enregistrer'}</button>
    {#if volet === 'reglages' && livre}<button type="button" class="danger" onclick={() => { if (!confirmeSupp) { confirmeSupp = true; return; } supprimerLivre(livre); volet = null; confirmeSupp = false; routeur.definir('livre', null); dire('Livre supprimé'); }}>{confirmeSupp ? 'Toucher encore : supprimer le livre et ses chapitres' : 'Supprimer le livre'}</button>{/if}
  </div>
</Volet>

<EditeurRiche ouvert={ed !== null} html={ed?.html ?? ''} titre={ed?.id ? 'Modifier le chapitre' : 'Nouveau chapitre'} onenregistrer={enregistrer} onfermer={() => (ed = null)} onsupprimer={ed?.id ? () => { supprimerNote(ed!.id!); ed = null; } : undefined} />

<style>
  .tete { display: flex; align-items: center; gap: 10px; } .grow { flex: 1; } h1.titre { font-size: 28px; margin: 0; }
  .acc { font-size: 14px; margin: -6px 0 0; }
  .etagere { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 16px; padding-bottom: 12px; }
  .livre { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; cursor: pointer; min-height: 44px; }
  .couv { position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; aspect-ratio: 2 / 3; border-radius: 4px 10px 10px 4px; padding: 16px 14px 16px 22px; color: #fff; text-align: center; overflow: hidden;
    box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 18px 28px -10px rgba(0,0,0,.65), 0 3px 6px rgba(0,0,0,.35); transition: transform .25s cubic-bezier(.2,.8,.2,1); transform-origin: left center; }
  .livre:active .couv { transform: perspective(700px) rotateY(-14deg) scale(.97); }
  @media (hover: hover) { .livre:hover .couv { transform: perspective(700px) rotateY(-12deg) translateY(-4px); } }
  .couv::after { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 60% at 30% 0%, rgba(255,255,255,.22), transparent 55%); pointer-events: none; }
  .reliure { position: absolute; left: 0; top: 0; bottom: 0; width: 11px; background: linear-gradient(90deg, rgba(0,0,0,.35), rgba(255,255,255,.14) 55%, rgba(0,0,0,.18)); }
  .couv .t, .couv h2 { font-size: 20px; line-height: 1.12; font-weight: 600; text-shadow: 0 2px 8px rgba(0,0,0,.35); overflow-wrap: anywhere; margin: 0; display: -webkit-box; -webkit-line-clamp: 5; line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .filet { width: 34px; height: 2px; background: rgba(255,255,255,.7); border-radius: 1px; } .couv small { opacity: .8; letter-spacing: .2em; text-transform: uppercase; font-size: 10px; }
  .couv.vide { background: transparent; border: 1.5px dashed var(--ligne); box-shadow: none; color: var(--muted); } .couv.vide::after { display: none; }
  .meta { display: flex; flex-direction: column; gap: 2px; padding: 0 2px; } .meta b { font-size: 14px; line-height: 1.25; } .meta small { font-size: 12px; }
  .heros { display: flex; gap: 18px; align-items: flex-end; } .couv.grande { width: 132px; flex: none; } .couv.grande h2 { font-size: 17px; }
  .infos { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; } .infos .titre { font-size: 24px; margin: 0; line-height: 1.1; } .infos p { margin: 0; font-size: 13px; }
  .progres { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; } .progres span { display: block; height: 100%; background: var(--c); border-radius: 3px; }
  .lire { min-height: 48px; border: 0; border-radius: 16px; background: var(--c); color: #fff; font-size: 16px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px; } .lire:disabled { opacity: .35; }
  .sect { display: flex; align-items: center; justify-content: space-between; } .sect h3 { margin: 0; font-size: 18px; }
  .plus { min-height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
  .toc { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--ligne); border-radius: 20px; overflow: hidden; }
  .toc li { display: flex; align-items: center; } .toc li + li { border-top: 1px solid var(--ligne); } .toc .vide { padding: 22px 16px; font-size: 14px; }
  .ch { all: unset; box-sizing: border-box; flex: 1; min-width: 0; display: flex; gap: 12px; align-items: center; padding: 12px 8px 12px 14px; min-height: 56px; cursor: pointer; }
  .n { flex: none; width: 30px; height: 30px; border-radius: 9px; background: var(--accent-fond); color: var(--accent-encre); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
  .col { display: flex; flex-direction: column; min-width: 0; } .col b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord { display: flex; flex-direction: column; padding-right: 8px; } .ord button { width: 36px; height: 24px; border: 0; background: transparent; color: var(--muted); font-size: 15px; } .ord button:disabled { opacity: .25; }
  .form { display: flex; flex-direction: column; gap: 14px; } .form .titre { font-size: 22px; margin: 0; } .apercu { display: flex; justify-content: center; }
  .form input[type='text'] { height: 52px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 18px; padding: 0 14px; }
  .palette { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; align-items: center; } .palette button { aspect-ratio: 1; border-radius: 50%; border: 3px solid transparent; box-shadow: 0 0 0 1px rgba(255,255,255,.2) inset; } .palette button.on { border-color: var(--texte); } .palette input { width: 100%; aspect-ratio: 1; border: 0; padding: 0; background: none; }
  .ok, .danger { min-height: 52px; border-radius: 16px; border: 0; font-size: 16px; font-weight: 600; } .ok { background: var(--inverse); color: var(--inverse-texte); } .danger { background: transparent; border: 1px solid var(--mauvais); color: var(--mauvais); }
  .liseuse { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: #f6f1e7; color: #2a2620; height: 100dvh; padding-top: var(--haut-sûr, 0px); --texte: #2a2620; --muted: #7a7266; --ligne: #ddd3c0; --accent: var(--c); --accent-encre: var(--c); --surface-2: #e8dfcd; }
  .liseuse header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; } .liseuse .rond { background: #ece4d3; color: #2a2620; border-color: #ddd3c0; }
  .lt { flex: 1; min-width: 0; font-family: Georgia, serif; font-size: 14px; color: #7a7266; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; } .pg { font-size: 12px; color: #7a7266; }
  .lecteur { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; column-gap: 56px; padding: 8px 28px 16px; font-family: Georgia, 'Iowan Old Style', serif; font-size: 18px; line-height: 1.62; scrollbar-width: none; column-fill: auto; text-align: justify; hyphens: auto; }
  .lecteur::-webkit-scrollbar { display: none; } .lecteur :global(p) { margin: 0 0 .9em; text-indent: 1.2em; } .lecteur :global(h1), .lecteur :global(h2) { font-family: Georgia, serif; text-indent: 0; text-align: left; }
  .lecteur :global(.chap) { break-before: column; } .lecteur :global(.num) { text-indent: 0; text-transform: uppercase; letter-spacing: .25em; font-size: 11px; color: var(--c); margin-top: 18vh; } .lecteur :global(.chap p:nth-of-type(2)) { text-indent: 0; }
  .titre-page { text-align: center; padding-top: 10vh; } .titre-page h1 { font-size: 30px; margin: 22px 0 8px; } .mini { width: 90px; aspect-ratio: 2 / 3; margin: 0 auto; border-radius: 3px 8px 8px 3px; box-shadow: 0 14px 24px -10px rgba(0,0,0,.5); } .titre-page p { text-indent: 0; color: #7a7266; font-size: 14px; }
  .barre-lec { padding: 6px 24px calc(14px + var(--bas-sûr, 0px)); } .barre-lec input { width: 100%; accent-color: var(--c); }
</style>
