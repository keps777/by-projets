<script lang="ts">
  import { LIVRES } from '@core/bible.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import EditeurRiche from '../carnet/EditeurRiche.svelte';
  import VoletSignature from '../carnet/VoletSignature.svelte';
  import { dateDuJour, dateValide, historique, retenir, type Signature } from '../../data/actions/livres.ts';
  import {
    chargerLivre, COULEURS_SURL, enregistrerNoteBiblique, NB_ANCIEN, nomLivre, pageDeNote, positionRetenue, referenceTexte, retenirPosition, surlignagesDe, surligner,
    TITRE_CAHIER, VERSIONS, type Position
  } from '../../data/actions/bible.ts';

  /** Bible (spec §19) : lecture sombre, choix du livre et du chapitre, version, soulignement, copie et note vers le cahier de lecture. */
  const p0 = positionRetenue();
  const lireNb = (k: string) => { const n = Number(routeur.params.get(k)); return Number.isInteger(n) && n > 0 ? n : null; };
  const vParam = routeur.params.get('v');
  let pos = $state<Position>({
    v: VERSIONS.some((x) => x.id === vParam) ? vParam! : p0.v,
    l: lireNb('l') !== null && lireNb('l')! <= 66 ? lireNb('l')! - 1 : p0.l, c: lireNb('c') ?? p0.c
  });
  const occ = routeur.params.get('occ');

  let chapitres = $state<string[][] | null>(null);
  let erreur = $state(false);
  $effect(() => {
    const { v, l } = pos;
    chapitres = null; erreur = false;
    let actuel = true;
    chargerLivre(v, l).then((c) => { if (actuel) { chapitres = c; if (pos.c > c.length) pos.c = c.length; } }).catch(() => { if (actuel) erreur = true; });
    return () => { actuel = false; };
  });
  $effect(() => { retenirPosition({ v: pos.v, l: pos.l, c: pos.c }); });

  const versets = $derived(chapitres?.[pos.c - 1] ?? []);
  const surl = $derived(surlignagesDe(pos.l, pos.c));
  const version = $derived(VERSIONS.find((x) => x.id === pos.v)!);
  let choisis = $state<number[]>([]);
  let page: HTMLDivElement | undefined = $state();
  function aller(l: number, c: number) { pos.l = l; pos.c = c; choisis = []; page?.scrollTo({ top: 0 }); }
  async function precedent() {
    if (pos.c > 1) aller(pos.l, pos.c - 1);
    else if (pos.l > 0) { const c = await chargerLivre(pos.v, pos.l - 1).catch(() => null); aller(pos.l - 1, c?.length ?? LIVRES[pos.l - 1].chapitres); }
  }
  function suivant() {
    if (chapitres && pos.c < chapitres.length) aller(pos.l, pos.c + 1);
    else if (pos.l < 65) aller(pos.l + 1, 1);
  }
  const bascule = (n: number) => { choisis = choisis.includes(n) ? choisis.filter((x) => x !== n) : [...choisis, n].sort((a, b) => a - b); };
  const reference = $derived(referenceTexte(pos.l, pos.c, choisis, pos.v));
  const texteChoisi = $derived(choisis.map((n) => versets[n - 1]).join(' '));

  // Navigateur : Ancien / Nouveau Testament → livres → chapitres
  let nav = $state(false);
  let testament = $state<0 | 1>(0);
  let livreChoisi = $state<number | null>(null);
  let nbChoisi = $state(0);
  function ouvrirNav() { testament = pos.l < NB_ANCIEN ? 0 : 1; livreChoisi = null; nav = true; }
  async function choisirLivre(l: number) {
    livreChoisi = l; nbChoisi = LIVRES[l].chapitres;
    const c = await chargerLivre(pos.v, l).catch(() => null);
    if (c && livreChoisi === l) nbChoisi = c.length;
  }
  function choisirChapitre(c: number) { if (livreChoisi === null) return; aller(livreChoisi, c); nav = false; }
  const livresDuTestament = $derived(LIVRES.map((x, i) => ({ x, i })).filter(({ i }) => (testament === 0 ? i < NB_ANCIEN : i >= NB_ANCIEN)));
  let versionOuverte = $state(false);

  async function copier() {
    const t = `« ${texteChoisi} »\n— ${reference} (${version.court})`;
    try { await navigator.clipboard.writeText(t); dire('Copié'); } catch { dire('Copie impossible sur cet appareil'); }
    choisis = [];
  }
  const sombre = (hex: string) => `color-mix(in srgb, ${hex} 30%, transparent)`;
  const couleurSurl = (id: string) => COULEURS_SURL.find((c) => c.id === id)?.hex;

  // Note : page du cahier « Notes pendant ma lecture biblique » (titre vide, ta note puis le verset), puis lieu et date.
  let ed = $state<string | null>(null);
  let attente = $state<string | null>(null);
  let sig = $state<Signature>({ c: '', l: '', d: '' });
  let histo = $state<Record<keyof Signature, string[]>>({ c: [], l: [], d: [] });
  const ouvrirNote = () => { ed = pageDeNote(choisis.map((n) => ({ n, texte: versets[n - 1] })), reference, pos.v); };
  function enregistrer(html: string) {
    sig = { c: '', l: historique('l')[0] ?? '', d: dateDuJour() };
    histo = { c: historique('c'), l: historique('l'), d: [dateDuJour(), ...historique('d').filter((x) => x !== dateDuJour())] };
    attente = html;
  }
  function validerNote() {
    if (attente === null) return;
    if (!dateValide(sig.d)) { dire('La date doit donner au moins l’année (ex. 2026 ou 21/08/26)'); return; }
    retenir(sig);
    if (enregistrerNoteBiblique(attente, { c: sig.c.trim(), l: sig.l.trim(), d: sig.d.trim() })) { dire(`Note enregistrée dans « ${TITRE_CAHIER} »`); choisis = []; }
    else dire('Note vide : rien enregistré');
    attente = null; ed = null;
  }
</script>

<div class="bible">
  <header>
    <button type="button" class="rond" aria-label="Fermer la Bible" onclick={() => routeur.retour('/')}><Icone nom="retour" taille={18} trait={2.2} /></button>
    <button type="button" class="titre-ch" onclick={ouvrirNav} aria-label="Choisir un livre et un chapitre"><span class="serif">{nomLivre(pos.l, pos.v)} {pos.c}</span><Icone nom="bas" taille={16} trait={2.4} /></button>
    <button type="button" class="pilule" onclick={() => (versionOuverte = true)} aria-label="Version : {version.nom}">{version.court}</button>
    {#if occ}<a class="rond" href="/focus?occ={occ}" aria-label="Retour au chrono"><Icone nom="horloge" taille={18} /></a>{/if}
  </header>

  <div class="corps" bind:this={page}>
    {#if erreur}<p class="muted info">Ce livre n’est pas encore sur cet appareil et la connexion manque. Réessaie une fois en ligne : il restera ensuite lisible sans réseau.</p>
    {:else if !chapitres}<p class="muted info">Chargement…</p>
    {:else}
      <h1 class="serif chap">{nomLivre(pos.l, pos.v)}<small>Chapitre {pos.c}</small></h1>
      <p class="texte serif">
        {#each versets as t, i (i)}
          {@const n = i + 1}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span class="vs" class:sel={choisis.includes(n)} class:surl={!!surl[n]} style:--s={surl[n] ? sombre(couleurSurl(surl[n]) ?? '#F2C94C') : null} style:--sc={surl[n] ? couleurSurl(surl[n]) : null}
            role="button" tabindex="0" aria-label="Verset {n}" aria-pressed={choisis.includes(n)} onclick={() => bascule(n)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bascule(n); } }}><sup>{n}</sup>{t} </span>
        {/each}
      </p>
      <div class="pas"><button type="button" onclick={precedent} aria-label="Chapitre précédent" disabled={pos.l === 0 && pos.c === 1}><Icone nom="retour" taille={20} trait={2.2} /></button><span class="muted">{version.nom}</span><button type="button" onclick={suivant} aria-label="Chapitre suivant" disabled={pos.l === 65 && pos.c === chapitres.length}><Icone nom="suivant" taille={20} trait={2.2} /></button></div>
    {/if}
  </div>

  {#if choisis.length}
    <div class="actions" role="toolbar" aria-label="Actions sur {reference}">
      <div class="rang1"><b>{reference}</b>
        <span class="couleurs">
          {#each COULEURS_SURL as c (c.id)}<button type="button" class="couleur" style:background={c.hex} aria-label="Souligner en {c.id}" onclick={() => { surligner(pos.l, pos.c, choisis, c.id); choisis = []; }}></button>{/each}
          <button type="button" class="couleur gomme" aria-label="Retirer le soulignement" onclick={() => { surligner(pos.l, pos.c, choisis, null); choisis = []; }}>∅</button>
        </span>
        <button type="button" class="rond" aria-label="Annuler la sélection" onclick={() => (choisis = [])}><Icone nom="fermer" taille={16} trait={2.4} /></button>
      </div>
      <div class="rang2">
        <button type="button" onclick={copier}><Icone nom="copier" taille={18} /> Copier</button>
        <button type="button" class="prim" onclick={ouvrirNote}><Icone nom="crayon" taille={18} /> Note</button>
      </div>
    </div>
  {/if}
</div>

<Volet ouvert={nav} onfermer={() => (nav = false)} label="Livres et chapitres">
  <div class="nav">
    {#if livreChoisi === null}
      <h2>Livres</h2>
      <div class="onglets" role="tablist"><button type="button" role="tab" aria-selected={testament === 0} class:on={testament === 0} onclick={() => (testament = 0)}>Ancien Testament</button><button type="button" role="tab" aria-selected={testament === 1} class:on={testament === 1} onclick={() => (testament = 1)}>Nouveau Testament</button></div>
      <ul class="livres">
        {#each livresDuTestament as { x, i } (i)}
          <li><button type="button" class:on={i === pos.l} onclick={() => choisirLivre(i)}><span>{nomLivre(i, pos.v)}</span><small class="muted">{x.chapitres} ch.</small></button></li>
        {/each}
      </ul>
    {:else}
      <div class="tete-nav"><button type="button" class="rond" aria-label="Retour aux livres" onclick={() => (livreChoisi = null)}><Icone nom="retour" taille={18} trait={2.2} /></button><h2>{nomLivre(livreChoisi, pos.v)}</h2></div>
      <div class="grille">{#each Array.from({ length: nbChoisi }, (_, k) => k + 1) as c (c)}<button type="button" class:on={livreChoisi === pos.l && c === pos.c} aria-label="Chapitre {c}" onclick={() => choisirChapitre(c)}>{c}</button>{/each}</div>
    {/if}
  </div>
</Volet>

<Volet ouvert={versionOuverte} onfermer={() => (versionOuverte = false)} label="Version de la Bible">
  <div class="nav"><h2>Version</h2>
    <ul class="livres">{#each VERSIONS as v (v.id)}<li><button type="button" class:on={v.id === pos.v} onclick={() => { pos.v = v.id; choisis = []; versionOuverte = false; }}><span>{v.nom}<small class="muted"> · {v.detail}</small></span>{#if v.id === pos.v}<Icone nom="coche" taille={18} trait={2.6} />{/if}</button></li>{/each}</ul>
  </div>
</Volet>

<EditeurRiche livre ouvert={ed !== null} html={ed ?? ''} curseurBloc={1} titre="Note de lecture" onenregistrer={enregistrer} onfermer={() => (ed = null)} />
<VoletSignature ouvert={attente !== null} bind:sig {histo} bouton="Enregistrer dans le cahier" onvalider={validerNote} onfermer={() => (attente = null)} />

<style>
  .bible { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: #0b0c10; color: #e9e4d8; padding-top: var(--haut-sûr, 0px); --texte: #e9e4d8; --muted: #8d887c; --ligne: #2a2c34; --surface: #15171d; --surface-2: #1b1d24; }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; flex: none; }
  .rond { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .titre-ch { flex: 1; min-width: 0; min-height: 44px; border-radius: 22px; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 18px; font-weight: 700; padding: 0 16px; }
  .pilule { min-height: 44px; padding: 0 16px; border-radius: 22px; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); font-size: 14px; font-weight: 700; letter-spacing: .06em; flex: none; }
  .corps { flex: 1; overflow-y: auto; padding: 8px 22px 160px; -webkit-overflow-scrolling: touch; }
  .info { padding: 40px 0; text-align: center; }
  .chap { font-size: 34px; line-height: 1.1; margin: 18px 0 20px; text-align: center; } .chap small { display: block; font-size: 13px; letter-spacing: .3em; text-transform: uppercase; color: var(--muted); font-weight: 500; margin-top: 8px; font-family: inherit; }
  .texte { font-size: 20px; line-height: 1.85; margin: 0 auto; max-width: 38rem; }
  .vs { cursor: pointer; border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 2px 0; }
  .vs.surl { background: var(--s); text-decoration: underline; text-decoration-color: var(--sc); text-decoration-thickness: 2px; text-underline-offset: 5px; }
  .vs.sel { background: rgba(255, 255, 255, .16); text-decoration: underline dotted; text-underline-offset: 5px; }
  sup { font-size: .55em; font-weight: 700; color: var(--muted); margin-right: .25em; font-family: system-ui, sans-serif; vertical-align: super; }
  .pas { display: flex; align-items: center; justify-content: space-between; margin: 34px auto 0; max-width: 38rem; } .pas button { width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); display: inline-flex; align-items: center; justify-content: center; } .pas button:disabled { opacity: .3; }
  .actions { position: absolute; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); background: #1b1d24; border: 1px solid #343743; border-radius: 22px; padding: 12px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 14px 40px rgba(0, 0, 0, .55); z-index: 5; }
  .rang1 { display: flex; align-items: center; gap: 10px; } .rang1 b { font-size: 14px; flex: 1; min-width: 0; } .couleurs { display: flex; gap: 8px; }
  .couleur { width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .25); padding: 0; } .gomme { background: transparent; color: var(--texte); font-size: 15px; }
  .actions .rond { width: 36px; height: 36px; }
  .rang2 { display: flex; gap: 10px; } .rang2 button { flex: 1; min-height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); font-size: 15px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; } .rang2 .prim { background: #e9e4d8; color: #0b0c10; border-color: #e9e4d8; }
  .nav { display: flex; flex-direction: column; gap: 14px; } .nav h2 { margin: 0; font-size: 22px; }
  .onglets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: var(--surface-2); padding: 4px; border-radius: 16px; } .onglets button { min-height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; } .onglets button.on { background: var(--texte); color: var(--surface); }
  .livres { list-style: none; margin: 0; padding: 0; } .livres li + li { border-top: 1px solid var(--ligne); } .livres button { all: unset; box-sizing: border-box; width: 100%; min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 17px; cursor: pointer; } .livres button.on { color: var(--accent-encre, #8fc9ff); font-weight: 700; }
  .tete-nav { display: flex; align-items: center; gap: 12px; }
  .grille { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; } .grille button { aspect-ratio: 1; border-radius: 16px; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); font-size: 17px; font-weight: 600; } .grille button.on { background: var(--texte); color: var(--surface); }
</style>
