<script lang="ts">
  import { routeur } from '../../routeur.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { ajouterChapitre, COULEURS_LIVRE, creerLivre, dateDuJour, dateValide, echangerChapitres, enregistrerNoteLibre, TITRE_LIBRES, historique, livres, modifierChapitre, modifierLivre, parTheme, supprimerChapitre, themesDe, voisin, retenir, signatureDe, texteSignature, supprimerLivre, titreChapitre, type Livre } from '../../data/actions/livres.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { urlMedia } from '../../data/media.svelte.ts';
  import { mediasCites, supprimerNote } from '../../data/actions/notes.ts';
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
  let filtre = $state('tous');
  const themes = $derived(themesDe(tous));
  const groupes = $derived(parTheme(tous).filter((g) => filtre === 'tous' || (filtre === '' ? g.theme === '' : g.theme === filtre)));
  let theme = $state('');
  let filtreOuvert = $state(false);
  const libelleFiltre = $derived(filtre === 'tous' ? 'Tous les thèmes' : filtre === '' ? 'Sans thème' : filtre);
  const compteVisible = $derived(groupes.reduce((t, g) => t + g.livres.length, 0));
  const compteDe = (t: string) => tous.filter((l) => l.theme === t).length;
  // Classement rapide d'un livre : un thème (nouveau ou déjà utilisé, ou une suggestion) depuis sa tuile.
  let classe = $state<Livre | null>(null);
  let themeClasse = $state('');
  const SUGGESTIONS = ['Bible', 'Prière', 'Croisade', 'Lectures', 'Famille', 'Vie spirituelle'];
  const choixThemes = $derived([...new Set([...themes, ...SUGGESTIONS])]);
  function ouvrirClasse(l: Livre) { classe = l; themeClasse = l.theme; }
  function classer(t: string) { if (classe) modifierLivre(classe, classe.titre, classe.couleur, t.trim()); classe = null; dire(t.trim() ? `Rangé dans « ${t.trim()} »` : 'Livre sans thème'); }
  const fonce = (c: string) => `color-mix(in srgb, ${c} 62%, #000)`;
  const couv = (c: string) => `linear-gradient(145deg, color-mix(in srgb, ${c} 88%, #fff) 0%, ${c} 38%, ${fonce(c)} 100%)`;

  // Nouveau livre / réglages de la couverture
  let volet = $state<'nouveau' | 'reglages' | null>(null);
  let titre = $state(''); let couleur = $state(COULEURS_LIVRE[5]);
  function ouvrirNouveau() { titre = ''; theme = filtre !== 'tous' ? filtre : ''; couleur = COULEURS_LIVRE[Math.floor(Math.random() * COULEURS_LIVRE.length)]; volet = 'nouveau'; }
  function ouvrirReglages() { if (!livre) return; titre = livre.titre; couleur = livre.couleur; theme = livre.theme; volet = 'reglages'; }
  function valider() {
    if (!titre.trim()) { dire('Donne un titre à ton livre'); return; }
    if (volet === 'nouveau') { const id = creerLivre(titre, couleur, theme); if (id) routeur.definir('livre', id); }
    else if (livre) modifierLivre(livre, titre, couleur, theme);
    volet = null;
  }
  let confirmeSupp = $state(false);

  // Images gardées sur l'appareil mais citées par aucune note : on peut les retrouver (chacune devient un chapitre à classer).
  let orphelines = $state<{ id: string; url: string }[] | null>(null);
  async function chercherImages() {
    const cites = mediasCites();
    const tous = (await magasin.db?.media.toArray()) ?? [];
    const res: { id: string; url: string }[] = [];
    for (const m of tous) if (m.type === 'image' && !cites.has(m.id)) { const url = await urlMedia(m.id); if (url) res.push({ id: m.id, url }); }
    orphelines = res;
  }
  function reprendre(id: string) { if (livre) { ajouterChapitre(livre.id, `<figure><img data-media="${id}" alt=""></figure>`); dire('Image ajoutée comme chapitre'); orphelines = orphelines?.filter((o) => o.id !== id) ?? null; } }

  // Éditeur de chapitre
  let ed = $state<{ id: string | null; html: string; parent: string | null } | null>(null);
  let replies = $state<Set<string>>(new Set());
  const basculerPlie = (id: string) => { const s = new Set(replies); if (s.has(id)) s.delete(id); else s.add(id); replies = s; };
  /** Nœuds visibles : une page disparaît si l'un de ses ancêtres est replié. */
  const visibles = $derived.by(() => { if (!livre) return []; const cache = new Map(livre.arbre.map((x) => [x.note.id, x])); const masque = (x: (typeof livre.arbre)[number]): boolean => { let p = x.parent; while (p) { if (replies.has(p)) return true; p = cache.get(p)?.parent ?? null; } return false; }; return livre.arbre.map((x, i) => ({ x, i })).filter(({ x }) => !masque(x)); });
  // Signature du chapitre (circonstance, lieu, date) demandée à l'enregistrement.
  let attente = $state<string | null>(null);
  let sig = $state({ c: '', l: '', d: '' });
  let histo = $state({ c: [] as string[], l: [] as string[], d: [] as string[] });
  // Note libre (bouton de l'en-tête) : une page du livre « Notes libres à classer », avec circonstance, lieu et date.
  let libre = $state(false);
  const enregistrer = (html: string) => {
    if (libre) { sig = { c: '', l: histoPremier('l'), d: dateDuJour() }; histo = { c: historique('c'), l: historique('l'), d: [dateDuJour(), ...historique('d').filter((x) => x !== dateDuJour())] }; attente = html; return; }
    if (!ed) return;
    const chap = ed.id ? livre?.chapitres.find((c) => c.id === ed!.id) : undefined;
    const ex = chap ? signatureDe(chap) : null;
    sig = ex ?? { c: '', l: histoPremier('l'), d: dateDuJour() };
    histo = { c: historique('c'), l: historique('l'), d: [dateDuJour(), ...historique('d').filter((x) => x !== dateDuJour())] };
    attente = html;
  };
  const histoPremier = (k: 'c' | 'l' | 'd') => historique(k)[0] ?? '';
  function validerSignature() {
    if (attente === null || (!libre && (!livre || !ed))) return;
    if (!dateValide(sig.d)) { dire('La date doit donner au moins l’année (ex. 2026 ou 21/08/26)'); return; }
    retenir(sig);
    const g = { c: sig.c.trim(), l: sig.l.trim(), d: sig.d.trim() };
    if (libre) { const ok = enregistrerNoteLibre(attente, g); attente = null; libre = false; dire(ok ? `Note rangée dans « ${TITRE_LIBRES} »` : 'Note vide : rien enregistré'); return; }
    if (!livre || !ed) return;
    const chap = ed.id ? livre.chapitres.find((c) => c.id === ed!.id) : undefined;
    if (chap) modifierChapitre(livre.id, chap, attente, g); else ajouterChapitre(livre.id, attente, g, ed.parent);
    attente = null; ed = null; dire('Chapitre enregistré');
  }

  // Lecteur : colonnes CSS déplacées par transformation (une page = une largeur d'écran), sans dépendre du défilement natif
  let vue: HTMLDivElement | undefined = $state(); let cols: HTMLDivElement | undefined = $state();
  let page = $state(1); let nbPages = $state(1);
  const ECART = 56;
  const contenuLivre = $derived(livre ? livre.arbre.map(({ note: c, niveau, numero }) => `<section class="chap"><p class="num">${niveau ? 'Page' : 'Chapitre'} ${numero}</p>${nettoyer(c.contenu ?? texteVersHtml(c.texte))}${(() => { const g = signatureDe(c); return g && texteSignature(g) ? `<p class="sig">${texteSignature(g).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : ''; })()}</section>`).join('') : '');
  function mesurer() {
    if (!vue || !cols) return;
    const w = vue.clientWidth;
    cols.style.columnWidth = `${w}px`; cols.style.columnGap = `${ECART}px`; cols.style.height = `${vue.clientHeight}px`; cols.style.width = `${w}px`;
    requestAnimationFrame(() => { nbPages = Math.max(1, Math.round((cols!.scrollWidth + ECART) / (w + ECART))); page = Math.min(page, nbPages); });
  }
  $effect(() => { void contenuLivre; if (vue && cols) { mesurer(); setTimeout(mesurer, 300); } });
  const aller = (p: number) => { page = Math.max(1, Math.min(nbPages, p)); };
  const decalage = $derived(vue ? (page - 1) * (vue.clientWidth + ECART) : 0);
  let papier = $state((() => { try { return localStorage.getItem('luther-life:fond-livre') === 'papier'; } catch { return false; } })());
  const basculerFond = () => { papier = !papier; try { localStorage.setItem('luther-life:fond-livre', papier ? 'papier' : 'noir'); } catch { /* ignoré */ } };
  let depart: { x: number; y: number } | null = null;
  function glisseDebut(e: TouchEvent) { const t = e.touches[0]; depart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }
  function glisseFin(e: TouchEvent) {
    const d = depart; depart = null; const t = e.changedTouches[0];
    if (!d || !t) return;
    const dx = t.clientX - d.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(t.clientY - d.y)) { ignorerClic = true; setTimeout(() => (ignorerClic = false), 350); aller(page + (dx < 0 ? 1 : -1)); }
  }
  let ignorerClic = false;
  function toucheLecteur(e: MouseEvent) {
    if (ignorerClic) return;
    if ((e.target as Element).closest('a, video')) return;
    const x = e.clientX / window.innerWidth;
    aller(page + (x > 0.6 ? 1 : x < 0.4 ? -1 : 0));
  }
</script>

<svelte:window onkeydown={(e) => { if (!lecture) return; if (e.key === 'ArrowRight') aller(page + 1); if (e.key === 'ArrowLeft') aller(page - 1); }} />

{#if journal}
  <Journal />
{:else if livre && lecture}
  <div class="liseuse" class:papier style:--c={livre.couleur}>
    <header><button type="button" class="rond" aria-label="Fermer la lecture" onclick={() => routeur.definir('lire', null)}><Icone nom="fermer" taille={18} trait={2.2} /></button><span class="lt">{livre.titre}</span><button type="button" class="rond" aria-label="Fond : {papier ? 'noir' : 'papier'}" onclick={basculerFond}>{papier ? '☾' : '☀'}</button></header>
    <span class="num-page mono" aria-live="polite">{page}</span>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="lecteur riche" bind:this={vue} onclick={toucheLecteur} ontouchstart={glisseDebut} ontouchend={glisseFin}>
     <div class="cols" bind:this={cols} use:hydraterAction={contenuLivre} style:transform="translateX(-{decalage}px)">
      <section class="titre-page"><div class="mini" style:background={couv(livre.couleur)}></div><h1 class="serif">{livre.titre}</h1><p>{livre.nbChapitres} chapitre{livre.nbChapitres > 1 ? 's' : ''} · {livre.pages} page{livre.pages > 1 ? 's' : ''}</p></section>
      {@html contenuLivre}
     </div>
    </div>
    <div class="barre-lec"><span class="mono total">{page} / {nbPages}</span><input type="range" min="1" max={nbPages} value={page} aria-label="Page" oninput={(e) => aller(+e.currentTarget.value)} /></div>
  </div>
{:else if livre}
  <EcranPage gap={16}>
    <header class="tete"><button type="button" class="rond" aria-label="Bibliothèque" onclick={() => routeur.definir('livre', null)}><Icone nom="retour" taille={18} trait={2.2} /></button><span class="grow"></span><button type="button" class="rond" aria-label="Réglages du livre" onclick={ouvrirReglages}><Icone nom="reglages" taille={18} /></button></header>
    <div class="heros" style:--c={livre.couleur}>
      <div class="couv grande" style:background={couv(livre.couleur)}><span class="reliure"></span><h2 class="serif">{livre.titre}</h2><span class="filet"></span><small>Luther</small></div>
      <div class="infos">
        <h1 class="titre">{livre.titre}</h1>
        <p class="muted">{livre.nbChapitres} chapitre{livre.nbChapitres > 1 ? 's' : ''}{livre.chapitres.length > livre.nbChapitres ? ` · ${livre.chapitres.length - livre.nbChapitres} page${livre.chapitres.length - livre.nbChapitres > 1 ? 's' : ''}` : ''} · {livre.mots.toLocaleString('fr-CA')} mots · ≈ {livre.pages} page{livre.pages > 1 ? 's' : ''}</p>
        <div class="progres"><span style:width="{Math.min(100, livre.pages)}%"></span></div><small class="muted">Objectif 100 pages · {Math.min(100, livre.pages)} %</small>
        <button type="button" class="lire" disabled={!livre.chapitres.length} onclick={() => routeur.definir('lire', '1')}><Icone nom="livre" taille={18} /> Lire le livre</button>
      </div>
    </div>
    <button type="button" class="retrouver" onclick={chercherImages}>Retrouver mes images</button>
    <div class="sect"><h3>Table des matières</h3><button type="button" class="plus" onclick={() => (ed = { id: null, parent: null, html: '<h1>Titre du chapitre</h1><p><br></p>' })}><Icone nom="plus" taille={15} trait={2.4} /> Nouveau chapitre</button></div>
    <ol class="toc" aria-label="Arborescence du livre">
      {#each visibles as { x, i } (x.note.id)}
        {@const c = x.note}
        <li class:page={x.niveau > 0} style:--niv={x.niveau}>
          {#if x.enfants}<button type="button" class="plie" aria-label="{replies.has(c.id) ? 'Déplier' : 'Replier'} {titreChapitre(c)}" aria-expanded={!replies.has(c.id)} onclick={() => basculerPlie(c.id)}>{replies.has(c.id) ? '▸' : '▾'}</button>{:else}<span class="plie vide-p"></span>{/if}
          <button type="button" class="ch" onclick={() => (ed = { id: c.id, parent: x.parent, html: c.contenu ?? texteVersHtml(c.texte) })}>
            <span class="n mono">{x.numero}</span><span class="col"><b>{titreChapitre(c)}</b><small class="muted">{x.niveau ? 'Page' : 'Chapitre'}{x.enfants ? ` · ${x.enfants} page${x.enfants > 1 ? 's' : ''}` : ''} · ≈ {Math.max(1, Math.ceil(c.texte.split(/\s+/).length / 250))} p.</small></span></button>
          <button type="button" class="ajout" aria-label="Ajouter une page à {titreChapitre(c)}" onclick={() => { replies.delete(c.id); ed = { id: null, parent: c.id, html: '<h1>Titre de la page</h1><p><br></p>' }; }}><Icone nom="plus" taille={15} trait={2.4} /></button>
          <span class="ord"><button type="button" aria-label="Monter" disabled={!voisin(livre.arbre, i, -1)} onclick={() => echangerChapitres(voisin(livre.arbre, i, -1)!, c)}>↑</button><button type="button" aria-label="Descendre" disabled={!voisin(livre.arbre, i, 1)} onclick={() => echangerChapitres(c, voisin(livre.arbre, i, 1)!)}>↓</button></span>
        </li>
      {:else}<li class="vide muted">Aucun chapitre. Touche « Nouveau chapitre », puis le « + » d’un chapitre pour lui ajouter des pages.</li>{/each}
    </ol>
  </EcranPage>
{:else}
  <EcranPage gap={18}>
    <header class="tete"><button type="button" class="rond" aria-label="Retour" onclick={() => routeur.retour('/')}><Icone nom="retour" taille={18} trait={2.2} /></button><h1 class="titre grow">Bibliothèque</h1><button type="button" class="rond" aria-label="Note libre" onclick={() => (libre = true)}><Icone nom="crayon" taille={18} trait={2.2} /></button></header>
    <p class="muted acc">Chaque livre est fait de notes : un chapitre, une note.</p>
    {#if tous.length}
      <div class="barre-filtre">
        <button type="button" class="deroulant" class:actif={filtre !== 'tous'} aria-haspopup="dialog" aria-label="Filtrer par thème : {libelleFiltre}" onclick={() => (filtreOuvert = true)}>
          <span class="pt" style:background={filtre === 'tous' ? 'conic-gradient(#B5452F, #C9A227, #4E8F5A, #2F6DB5, #7B4BB5, #B5452F)' : (groupes[0]?.livres[0]?.couleur ?? 'var(--muted)')}></span>
          <span class="lib">{libelleFiltre}</span><Icone nom="bas" taille={16} trait={2.4} />
        </button>
        {#if filtre !== 'tous'}<button type="button" class="effacer" aria-label="Voir tous les thèmes" onclick={() => (filtre = 'tous')}>Tout voir</button>{/if}
        <span class="grow"></span><span class="compte muted">{compteVisible} livre{compteVisible > 1 ? 's' : ''}</span>
      </div>
    {/if}
    {#if tous.length && !themes.length}
      <div class="invite"><span class="serif">Range ta bibliothèque par thème</span><p class="muted">Touche « ＋ Thème » sous un livre : Bible, Prière, Croisade, Lectures… Les livres d’un même thème se retrouvent alors sur la même étagère.</p></div>
    {/if}
    {#each groupes as g (g.theme)}
      <section class="rayon-bloc" style:--g={g.livres[0].couleur} aria-label={g.theme || 'Sans thème'}>
        {#if themes.length}<h3 class="theme-t"><span class="serif">{g.theme || 'Sans thème'}</span><small>{g.livres.length}</small><span class="fil-g"></span></h3>{/if}
        <div class={filtre === 'tous' && themes.length ? 'rayon' : 'etagere'}>
          {#each g.livres as l (l.id)}
            <div class="item">
              <button type="button" class="livre" onclick={() => routeur.definir('livre', l.id)} aria-label="{l.titre}, {l.nbChapitres} chapitres">
                <span class="couv" style:background={couv(l.couleur)}><span class="reliure"></span><span class="serif t">{l.titre}</span><span class="filet"></span></span>
                <span class="meta"><b>{l.titre}</b><small class="muted">{l.nbChapitres} ch. · ≈ {l.pages} p.</small></span>
              </button>
              <button type="button" class="etiq" class:vide={!l.theme} aria-label="Thème de {l.titre}" onclick={() => ouvrirClasse(l)}><span class="ico-tag" aria-hidden="true">⌗</span>{l.theme || 'Thème'}</button>
            </div>
          {/each}
        </div>
        {#if filtre === 'tous' && themes.length}<div class="planche"></div>{/if}
      </section>
    {/each}
    <div class="etagere"><button type="button" class="livre nouveau" onclick={ouvrirNouveau} aria-label="Nouveau livre"><span class="couv vide"><Icone nom="plus" taille={30} trait={1.8} /></span><span class="meta"><b>Nouveau livre</b></span></button></div>
    {#if !tous.length}<p class="muted acc">Crée ton premier livre : un titre, une couleur de couverture, puis écris-le chapitre par chapitre.</p>{/if}
  </EcranPage>
{/if}

<Volet ouvert={volet !== null} onfermer={() => (volet = null)} label="Couverture du livre">
  <div class="form">
    <h2 class="titre">{volet === 'nouveau' ? 'Nouveau livre' : 'Réglages du livre'}</h2>
    <div class="apercu"><div class="couv grande" style:background={couv(couleur)}><span class="reliure"></span><h2 class="serif">{titre || 'Titre du livre'}</h2><span class="filet"></span></div></div>
    <input type="text" placeholder="Titre du livre" aria-label="Titre du livre" bind:value={titre} maxlength="80" />
    <input type="text" placeholder="Thème (ex. Prière, Croisade, Lectures)" aria-label="Thème du livre" bind:value={theme} maxlength="40" />
    {#if themes.length}<div class="puces">{#each themes as t (t)}<button type="button" class="puce" class:on={theme === t} onclick={() => (theme = t)}>{t}</button>{/each}</div>{/if}
    <div class="palette" role="group" aria-label="Couleur de la couverture">
      {#each COULEURS_LIVRE as c (c)}<button type="button" class:on={couleur === c} style:background={c} aria-label="Couleur {c}" aria-pressed={couleur === c} onclick={() => (couleur = c)}></button>{/each}
      <input type="color" value={couleur} aria-label="Couleur personnalisée" oninput={(e) => (couleur = e.currentTarget.value)} />
    </div>
    <button type="button" class="ok" onclick={valider}>{volet === 'nouveau' ? 'Créer le livre' : 'Enregistrer'}</button>
    {#if volet === 'reglages' && livre}<button type="button" class="danger" onclick={() => { if (!confirmeSupp) { confirmeSupp = true; return; } supprimerLivre(livre); volet = null; confirmeSupp = false; routeur.definir('livre', null); dire('Livre supprimé'); }}>{confirmeSupp ? 'Toucher encore : supprimer le livre et ses chapitres' : 'Supprimer le livre'}</button>{/if}
  </div>
</Volet>

<Volet ouvert={filtreOuvert} onfermer={() => (filtreOuvert = false)} label="Filtrer par thème">
  <div class="choix-theme">
    <h2 class="titre">Thèmes</h2>
    <ul class="liste-themes">
      <li><button type="button" class:on={filtre === 'tous'} onclick={() => { filtre = 'tous'; filtreOuvert = false; }}><span class="pt arc"></span><span class="lib">Tous les thèmes</span><small class="muted">{tous.length}</small>{#if filtre === 'tous'}<Icone nom="coche" taille={18} trait={2.6} />{/if}</button></li>
      {#each themes as t (t)}
        <li><button type="button" class:on={filtre === t} onclick={() => { filtre = t; filtreOuvert = false; }}><span class="pt" style:background={tous.find((l) => l.theme === t)?.couleur}></span><span class="lib">{t}</span><small class="muted">{compteDe(t)}</small>{#if filtre === t}<Icone nom="coche" taille={18} trait={2.6} />{/if}</button></li>
      {/each}
      {#if themes.length && tous.some((l) => !l.theme)}<li><button type="button" class:on={filtre === ''} onclick={() => { filtre = ''; filtreOuvert = false; }}><span class="pt vide-pt"></span><span class="lib">Sans thème</span><small class="muted">{tous.filter((l) => !l.theme).length}</small>{#if filtre === ''}<Icone nom="coche" taille={18} trait={2.6} />{/if}</button></li>{/if}
    </ul>
  </div>
</Volet>

<Volet ouvert={classe !== null} onfermer={() => (classe = null)} label="Thème du livre">
  <form class="form" onsubmit={(e) => { e.preventDefault(); classer(themeClasse); }}>
    <h2 class="titre">Ranger « {classe?.titre} »</h2>
    <p class="muted">Choisis une étagère ou invente un thème.</p>
    <div class="grille-themes">{#each choixThemes as t (t)}<button type="button" class="puce" class:on={themeClasse === t} onclick={() => classer(t)}>{t}</button>{/each}</div>
    <input type="text" placeholder="Autre thème…" aria-label="Nouveau thème" bind:value={themeClasse} maxlength="40" />
    <button type="submit" class="ok">Ranger</button>
    {#if classe?.theme}<button type="button" class="danger" onclick={() => classer('')}>Retirer du thème</button>{/if}
  </form>
</Volet>

<Volet ouvert={orphelines !== null} onfermer={() => (orphelines = null)} label="Images retrouvées">
  <div class="form"><h2 class="titre">Images retrouvées</h2>
    {#if orphelines?.length}<p class="muted">Touche une image pour l’ajouter à ce livre.</p><div class="grille-img">{#each orphelines as o (o.id)}<button type="button" onclick={() => reprendre(o.id)} aria-label="Ajouter cette image"><img src={o.url} alt="" /></button>{/each}</div>
    {:else}<p class="muted">Aucune image orpheline sur cet appareil.</p>{/if}</div>
</Volet>

<Volet ouvert={attente !== null} onfermer={() => (attente = null)} label="Signature du chapitre">
  <form class="form" onsubmit={(e) => { e.preventDefault(); validerSignature(); }}>
    <h2 class="titre">Signature du chapitre</h2>
    <p class="muted apercu-sig">{texteSignature(sig) || '—'}</p>
    {#each [['c', 'Circonstance', 'Durant la nuit de prière de CMCI PAT'], ['l', 'Lieu', 'Montréal'], ['d', 'Date (au moins l’année)', '21/08/26']] as [k, nom, ex] (k)}
      <label class="champ">{nom}{k === 'd' ? '' : ' · facultatif'}
        <input type="text" placeholder={ex} bind:value={sig[k as 'c' | 'l' | 'd']} autocomplete="off" aria-label={nom} />
      </label>
      {#if histo[k as 'c' | 'l' | 'd'].length}<div class="puces">{#each histo[k as 'c' | 'l' | 'd'].slice(0, 6) as h (h)}<button type="button" class="puce" onclick={() => (sig[k as 'c' | 'l' | 'd'] = h)}>{h}</button>{/each}</div>{/if}
    {/each}
    <button type="submit" class="ok">Enregistrer le chapitre</button>
  </form>
</Volet>

<EditeurRiche livre ouvert={libre || ed !== null} curseurBloc={libre ? 1 : -1} html={libre ? '<h1><br></h1><p><br></p>' : (ed?.html ?? '')} titre={libre ? 'Note libre' : ed?.id ? (ed.parent ? 'Modifier la page' : 'Modifier le chapitre') : ed?.parent ? 'Nouvelle page' : 'Nouveau chapitre'} onenregistrer={enregistrer} onfermer={() => { ed = null; libre = false; }} onsupprimer={ed?.id && livre ? () => { const n = livre.chapitres.find((c) => c.id === ed!.id); if (n) supprimerChapitre(livre.id, n, livre.chapitres); ed = null; } : undefined} />

<style>
  .toc, .heros, .sect, .etagere, .tete { flex: none; }
  .tete { display: flex; align-items: center; gap: 10px; } .grow { flex: 1; } h1.titre { font-size: 28px; margin: 0; }
  .acc { font-size: 14px; margin: -6px 0 0; }
  .etagere { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 16px; padding-bottom: 12px; }
  .livre { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; cursor: pointer; min-height: 44px; }
  .couv { position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; aspect-ratio: 2 / 3; border-radius: 4px 10px 10px 4px; padding: 16px 14px 16px 22px; color: #fff; text-align: center; overflow: hidden;
    box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 18px 28px -10px rgba(0,0,0,.65), 0 3px 6px rgba(0,0,0,.35); transition: transform .25s cubic-bezier(.2,.8,.2,1); transform-origin: left center; }
  .livre:active .couv { transform: perspective(700px) rotateY(-14deg) scale(.97); }
  @media (hover: hover) { .livre:hover .couv { transform: perspective(700px) rotateY(-12deg) translateY(-4px); } }
  .couv::before { content: ''; position: absolute; inset: 9px 9px 9px 19px; border: 1px solid rgba(255,255,255,.2); border-radius: 3px; pointer-events: none; z-index: 1; }
  .couv::after { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 60% at 30% 0%, rgba(255,255,255,.22), transparent 55%); pointer-events: none; }
  .reliure { position: absolute; left: 0; top: 0; bottom: 0; width: 11px; background: linear-gradient(90deg, rgba(0,0,0,.35), rgba(255,255,255,.14) 55%, rgba(0,0,0,.18)); }
  .couv .t, .couv h2 { font-size: 19px; line-height: 1.12; font-weight: 600; text-shadow: 0 2px 8px rgba(0,0,0,.35); overflow-wrap: break-word; hyphens: auto; padding-top: 22px; margin: 0; display: -webkit-box; -webkit-line-clamp: 5; line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .filet { width: 34px; height: 2px; background: rgba(255,255,255,.7); border-radius: 1px; } .couv small { opacity: .8; letter-spacing: .2em; text-transform: uppercase; font-size: 10px; }
  .couv.vide { background: transparent; border: 1.5px dashed var(--ligne); box-shadow: none; color: var(--muted); } .couv.vide::after, .couv.vide::before, .couv.grande::before { display: none; }
  .meta { display: flex; flex-direction: column; gap: 2px; padding: 0 2px; } .meta b { font-size: 14px; line-height: 1.25; } .meta small { font-size: 12px; }
  .heros { display: flex; gap: 18px; align-items: flex-end; } .couv.grande { width: 132px; flex: none; } .couv.grande h2 { font-size: 17px; }
  .infos { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; } .infos .titre { font-size: 24px; margin: 0; line-height: 1.1; } .infos p { margin: 0; font-size: 13px; }
  .progres { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; } .progres span { display: block; height: 100%; background: var(--c); border-radius: 3px; }
  .retrouver { flex: none; align-self: flex-start; border: 0; background: none; color: var(--muted); font-size: 13px; text-decoration: underline; min-height: 36px; }
  .grille-img { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .grille-img button { padding: 0; border: 0; background: none; aspect-ratio: 1; } .grille-img img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); } .champ input { height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 16px; padding: 0 12px; }
  .puces { display: flex; gap: 6px; overflow-x: auto; margin-top: -6px; } .puce { flex: none; min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 13px; white-space: nowrap; } .apercu-sig { font-style: italic; margin: 0; font-size: 14px; }
  .invite { flex: none; border-radius: 20px; padding: 16px 18px; border: 1px dashed color-mix(in srgb, var(--accent-encre, #8fc9ff) 55%, transparent); background: color-mix(in srgb, var(--accent-encre, #8fc9ff) 7%, transparent); display: flex; flex-direction: column; gap: 6px; } .invite .serif { font-size: 20px; font-style: italic; } .invite p { margin: 0; font-size: 14px; line-height: 1.45; }
  .rayon-bloc { flex: none; display: flex; flex-direction: column; gap: 14px; }
  .theme-t { flex: none; margin: 10px 0 0; display: flex; gap: 10px; align-items: baseline; } .theme-t .serif { font-size: 28px; font-style: italic; font-weight: 600; letter-spacing: -.015em; line-height: 1; } .theme-t small { font-size: 13px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; } .fil-g { flex: 1; align-self: center; height: 1px; background: linear-gradient(90deg, color-mix(in srgb, var(--g) 70%, transparent), transparent); }
  .rayon { display: flex; gap: 18px; overflow-x: auto; scroll-snap-type: x proximity; margin: 0 -16px; padding: 4px 16px 6px; scrollbar-width: none; } .rayon::-webkit-scrollbar { display: none; } .rayon .item { flex: none; width: 140px; scroll-snap-align: start; }
  .rayon-bloc { position: relative; isolation: isolate; } .rayon-bloc::before { content: ''; position: absolute; left: -16px; right: -16px; top: 30px; height: 270px; background: radial-gradient(70% 90% at 25% 30%, color-mix(in srgb, var(--g) 16%, transparent), transparent 70%); pointer-events: none; z-index: -1; }
  .planche { height: 12px; margin: -10px -16px 10px; border-radius: 2px; background: linear-gradient(180deg, #3a3d49 0%, #24262f 38%, #14151a 100%); box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 14px 22px -8px rgba(0,0,0,.8); }
  .item { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; } .etiq { position: absolute; top: 8px; right: 8px; z-index: 2; min-height: 30px; max-width: calc(100% - 16px); padding: 0 11px 0 8px; border-radius: 15px; border: 1px solid rgba(255,255,255,.28); background: rgba(10,11,15,.55); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #fff; font-size: 11.5px; font-weight: 600; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 5px; } .etiq.vide { opacity: .75; border-style: dashed; } .ico-tag { opacity: .8; font-size: 12px; }
  .barre-filtre { display: flex; align-items: center; gap: 10px; flex: none; } .grow { flex: 1; } .compte { font-size: 13px; font-variant-numeric: tabular-nums; }
  .deroulant { min-height: 48px; max-width: 70%; padding: 0 16px 0 12px; border-radius: 24px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 0 rgba(255,255,255,.05) inset; } .deroulant .lib { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .deroulant.actif { border-color: color-mix(in srgb, var(--accent-encre, #8fc9ff) 70%, transparent); }
  .pt { flex: none; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255,255,255,.14) inset; } .pt.arc { background: conic-gradient(#B5452F, #C9A227, #4E8F5A, #2F6DB5, #7B4BB5, #B5452F); } .pt.vide-pt { background: transparent; border: 1.5px dashed var(--muted); box-shadow: none; }
  .effacer { border: 0; background: transparent; color: var(--accent-encre, #8fc9ff); font-size: 13px; font-weight: 600; min-height: 44px; padding: 0 4px; }
  .choix-theme { display: flex; flex-direction: column; gap: 10px; } .choix-theme .titre { margin: 0; font-size: 24px; }
  .liste-themes { list-style: none; margin: 0; padding: 0; } .liste-themes li + li { border-top: 1px solid var(--ligne); } .liste-themes button { all: unset; box-sizing: border-box; width: 100%; min-height: 58px; display: flex; align-items: center; gap: 14px; cursor: pointer; font-size: 17px; } .liste-themes .lib { flex: 1; min-width: 0; } .liste-themes button.on { font-weight: 700; color: var(--accent-encre, #8fc9ff); } .liste-themes small { font-size: 14px; font-variant-numeric: tabular-nums; }
  .grille-themes { display: flex; flex-wrap: wrap; gap: 8px; } .grille-themes .puce { min-height: 44px; padding: 0 18px; font-size: 15px; border-radius: 22px; }
  .lire { min-height: 48px; border: 0; border-radius: 16px; background: var(--c); color: #fff; font-size: 16px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px; } .lire:disabled { opacity: .35; }
  .sect { display: flex; align-items: center; justify-content: space-between; } .sect h3 { margin: 0; font-size: 18px; }
  .plus { min-height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
  .toc { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--ligne); border-radius: 20px; overflow: hidden; }
  .toc li { display: flex; align-items: center; } .toc li + li { border-top: 1px solid var(--ligne); } .toc .vide { padding: 22px 16px; font-size: 14px; }
  .ch { all: unset; box-sizing: border-box; flex: 1; min-width: 0; display: flex; gap: 12px; align-items: center; padding: 12px 8px 12px 14px; min-height: 56px; cursor: pointer; }
  .n { flex: none; width: 30px; height: 30px; border-radius: 9px; background: var(--accent-fond); color: var(--accent-encre); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
  .col { display: flex; flex-direction: column; min-width: 0; } .col b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toc li { padding-left: calc(var(--niv, 0) * 22px); } .toc li.page { background: color-mix(in srgb, var(--surface-2) 55%, transparent); border-left: 0; } .toc li.page .n { background: transparent; border: 1px solid var(--ligne); color: var(--muted); width: auto; min-width: 30px; padding: 0 6px; }
  .plie { all: unset; box-sizing: border-box; flex: none; width: 32px; align-self: stretch; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); cursor: pointer; font-size: 14px; } .ajout { flex: none; width: 36px; height: 36px; border-radius: 12px; border: 0; background: transparent; color: var(--accent-encre); display: inline-flex; align-items: center; justify-content: center; }
  .ord { display: flex; flex-direction: column; padding-right: 8px; } .ord button { width: 36px; height: 24px; border: 0; background: transparent; color: var(--muted); font-size: 15px; } .ord button:disabled { opacity: .25; }
  .form { display: flex; flex-direction: column; gap: 14px; } .form .titre { font-size: 22px; margin: 0; } .apercu { display: flex; justify-content: center; }
  .form input[type='text'] { height: 52px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 18px; padding: 0 14px; }
  .palette { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; align-items: center; } .palette button { aspect-ratio: 1; border-radius: 50%; border: 3px solid transparent; box-shadow: 0 0 0 1px rgba(255,255,255,.2) inset; } .palette button.on { border-color: var(--texte); } .palette input { width: 100%; aspect-ratio: 1; border: 0; padding: 0; background: none; }
  .ok, .danger { min-height: 52px; border-radius: 16px; border: 0; font-size: 16px; font-weight: 600; } .ok { background: var(--inverse); color: var(--inverse-texte); } .danger { background: transparent; border: 1px solid var(--mauvais); color: var(--mauvais); }
  .liseuse { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: #0b0c10; color: #e9e4d8; height: 100dvh; padding-top: var(--haut-sûr, 0px); --texte: #e9e4d8; --muted: #8d887c; --ligne: #2a2c34; --accent: var(--c); --accent-encre: color-mix(in srgb, var(--c) 60%, #fff); --surface-2: #1b1d24; }
  .liseuse.papier { background: #f6f1e7; color: #2a2620; --texte: #2a2620; --muted: #7a7266; --ligne: #ddd3c0; --accent-encre: var(--c); --surface-2: #e8dfcd; }
  .liseuse header { display: flex; align-items: center; gap: 10px; padding: 10px 16px 0; } .liseuse .rond { background: var(--surface-2); color: var(--texte); border-color: var(--ligne); }
  .lt { flex: 1; min-width: 0; font-family: Georgia, serif; font-size: 14px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
  .num-page { position: absolute; left: 28px; top: calc(var(--haut-sûr, 0px) + 66px); font-size: 12px; color: var(--muted); font-style: italic; z-index: 2; }
  .lecteur { flex: 1; min-height: 0; overflow: hidden; margin: 40px 28px 16px; font-family: Georgia, 'Iowan Old Style', serif; font-size: 18px; line-height: 1.66; text-align: justify; hyphens: auto; touch-action: pan-y; color: var(--texte); }
  .cols { column-fill: auto; transition: transform .3s cubic-bezier(.2,.8,.2,1); } .lecteur :global(.sig) { text-align: right; font-style: italic; text-indent: 0 !important; margin-top: 2em; color: var(--muted); font-size: 15px; }
  .lecteur :global(p) { margin: 0 0 .45em; text-indent: 1.2em; } .lecteur :global(h1), .lecteur :global(h2) { font-family: Georgia, serif; text-indent: 0; text-align: center; color: var(--texte); }
  .lecteur :global(h1), .lecteur :global(h2), .lecteur :global(h3), .lecteur :global(strong) { font-weight: 700 !important; } .lecteur :global(em) { font-style: italic; }
  .lecteur :global(h1) { text-transform: uppercase; font-size: 21px; letter-spacing: .04em; margin: .2em 0 1.8em; }
  .lecteur :global(.chap) { break-before: column; } .lecteur :global(.num) { text-indent: 0; text-align: center; text-transform: uppercase; letter-spacing: .3em; font-size: 10px; color: var(--accent-encre); margin: 10vh 0 1.2em; } .lecteur :global(.chap p) { text-indent: 1.2em; }
  .titre-page { text-align: center; padding-top: 12vh; } .titre-page h1 { font-size: 28px !important; text-transform: none !important; margin: 22px 0 8px !important; } .mini { width: 90px; aspect-ratio: 2 / 3; margin: 0 auto; border-radius: 3px 8px 8px 3px; box-shadow: 0 14px 24px -10px rgba(0,0,0,.6); } .titre-page p { text-indent: 0 !important; color: var(--muted); font-size: 14px; }
  .barre-lec { display: flex; align-items: center; gap: 12px; padding: 6px 24px calc(14px + var(--bas-sûr, 0px)); } .barre-lec input { flex: 1; accent-color: var(--c); } .total { font-size: 12px; color: var(--muted); }
</style>
