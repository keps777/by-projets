<script lang="ts">
  // Archives des rapports (planche Archives) : par jour, semaine, mois ; recherche ; marque « envoyé ».
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Puces from '../../ui/Puces.svelte';
  import Anneau from '../../ui/Anneau.svelte';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { COULEUR_SANS_PROJET, profil } from '../../data/requetes.ts';
  import { ajouterJours, lundiDe, moisDe, dernierDuMois, premierDuMois } from '@core/dates.ts';
  import { formaterMesures } from '@core/rapport.ts';
  import { preparer, resumeCourt } from './calcul.ts';
  import { donneesRapport, premierJour } from './donnees.ts';
  import { calculerJours, formatPct, pctJours, type JourCalcule } from './syntheses.ts';
  import { jourAbrege, libelleJourLong, libelleMois, libelleSemaine } from './periodes.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  type Filtre = 'tous' | 'jours' | 'semaines' | 'mois' | 'envoyes';
  let filtre = $state<Filtre>('tous');
  let recherche = $state('');
  let limite = $state(4);
  let ouvertes = $state<string[]>([]);

  const auj = $derived(aujourdhui());
  const langue = $derived(profil()?.langue_rapport ?? 'fr');
  const d = $derived(donneesRapport());
  const prep = $derived(preparer(d));
  const debut = $derived(premierJour(auj));
  const envoyes = $derived(new Set(magasin.lignes.rapports.filter((r) => r.envoye_a).map((r) => r.jour)));

  const lundis = $derived.by(() => {
    const res: string[] = [];
    for (let l = lundiDe(auj); l >= lundiDe(debut); l = ajouterJours(l, -7)) res.push(l);
    return res;
  });
  const moisListe = $derived.by(() => {
    const res: string[] = [];
    for (let m = moisDe(auj); m >= moisDe(debut); m = moisDe(ajouterJours(premierDuMois(m), -1))) res.push(m);
    return res;
  });

  // Calculs à la demande, mémorisés tant que les données ne changent pas.
  let cache = new Map<string, JourCalcule[]>();
  let cacheDe: unknown = null;
  let cacheJour = '';
  function semaine(lundi: string): JourCalcule[] {
    if (cacheDe !== prep || cacheJour !== auj) { cache = new Map(); cacheDe = prep; cacheJour = auj; }
    let j = cache.get(lundi);
    if (!j) { j = calculerJours(prep, d, lundi, ajouterJours(lundi, 6), auj).filter((x) => !x.futur && x.jour >= debut).reverse(); cache.set(lundi, j); }
    return j;
  }
  function mois(m: string): JourCalcule[] {
    return calculerJours(prep, d, premierDuMois(m), dernierDuMois(m), auj).filter((x) => !x.futur && x.jour >= debut);
  }

  // Carte du mois : le mois précédent s'il a des rapports, sinon le mois en cours.
  const moisVedette = $derived(moisListe.length > 1 ? moisListe[1] : moisListe[0]);
  const joursVedette = $derived(mois(moisVedette));

  const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const trouves = $derived.by(() => {
    const q = sansAccents(recherche.trim());
    if (!q) return [];
    const res: JourCalcule[] = [];
    for (const l of lundis) for (const j of semaine(l)) {
      const texte = `${libelleJourLong(j.jour)} ${j.points.map((p) => `${p.point.code} ${formaterMesures(p.mesures, langue)}`).join(' ')}`;
      if (sansAccents(texte).includes(q)) res.push(j);
    }
    return res;
  });

  const nbEnvoyes = (jours: JourCalcule[]) => jours.filter((j) => envoyes.has(j.jour)).length;
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const couleur = (c: string | null) => couleurRubrique(c ?? COULEUR_SANS_PROJET, theme.mode);
  const etat = (r: number | null) => (r == null ? 'neutre' : r >= 1 ? 'bon' : r > 0 ? 'partiel' : 'mauvais');
  const basculer = (l: string) => { ouvertes = ouvertes.includes(l) ? ouvertes.filter((x) => x !== l) : [...ouvertes, l]; };
</script>

{#snippet ligneJour(j: JourCalcule)}
  <a class="jour" href="/rapports?onglet=jour&jour={j.jour}">
    <span class="date"><span class="muted wd">{jourAbrege(j.jour)}</span><span class="titre num">{Number(j.jour.slice(8))}</span></span>
    <span class="milieu">
      <span class="points" aria-hidden="true">{#each j.points as p (p.point.id)}<span class={etat(p.ratio)} style:--c={couleur(p.couleur)}></span>{/each}</span>
      <span class="muted resume">{resumeCourt(j.points, langue)}</span>
    </span>
    <span class="score">
      <span class="mono">{j.atteints}/{j.points.length}</span>
      {#if envoyes.has(j.jour)}<span class="envoye">envoyé</span>{/if}
    </span>
  </a>
{/snippet}

{#snippet carteMois(m: string, jours: JourCalcule[])}
  {@const pct = pctJours(jours)}
  <a class="mois" href="/rapports?onglet=mois&jour={premierDuMois(m)}">
    <Anneau pct={pct ?? 0} taille={58} epaisseur={6}><span class="mono pct">{formatPct(pct)}</span></Anneau>
    <span class="textes">
      <span class="sur">Rapport mensuel</span>
      <span class="grand">{libelleMois(m)}</span>
      <span class="muted petit">{pluriel(jours.length, 'rapport')} · {pluriel(nbEnvoyes(jours), 'envoyé')}</span>
    </span>
  </a>
{/snippet}

{#snippet resumeSemaine(l: string, jours: JourCalcule[])}
  <button type="button" class="carte recap" aria-expanded={ouvertes.includes(l)} onclick={() => basculer(l)}>
    <span class="muted petit">{pluriel(jours.length, 'rapport')} · {pluriel(nbEnvoyes(jours), 'envoyé')}</span>
    <span class="mono">{formatPct(pctJours(jours))}</span>
  </button>
{/snippet}

<EcranPage gap={14}>
  <div class="haut">
    <button type="button" class="rond" aria-label="Retour aux rapports" onclick={() => routeur.retour('/rapports')}><Icone nom="retour" taille={18} trait={2.2} /></button>
    <h1 class="titre">Archives</h1>
  </div>

  <label class="cherche">
    <Icone nom="recherche" taille={16} trait={2.2} />
    <input type="search" aria-label="Rechercher un rapport" placeholder="Rechercher : « BR 0/7 », « septembre »…" bind:value={recherche} />
  </label>

  {#if !recherche.trim()}
    <div class="filtres"><Puces defile petit options={[{ valeur: 'tous', label: 'Tous' }, { valeur: 'jours', label: 'Jours' }, { valeur: 'semaines', label: 'Semaines' }, { valeur: 'mois', label: 'Mois' }, { valeur: 'envoyes', label: 'Envoyés' }]}
      valeur={filtre} onchoisir={(v) => (filtre = v as Filtre)} /></div>
  {/if}

  {#if recherche.trim()}
    {#if trouves.length}
      <div class="carte liste">{#each trouves as j (j.jour)}{@render ligneJour(j)}{/each}</div>
    {:else}
      <p class="muted vide">Aucun rapport ne correspond à « {recherche.trim()} ».</p>
    {/if}
  {:else if filtre === 'mois'}
    {#each moisListe.slice(0, limite + 2) as m (m)}{@render carteMois(m, mois(m))}{/each}
    {#if moisListe.length > limite + 2}<button type="button" class="plus" onclick={() => (limite += 6)}>Afficher plus</button>{/if}
  {:else}
    {#if filtre === 'tous'}{@render carteMois(moisVedette, joursVedette)}{/if}
    {#each lundis.slice(0, limite) as l, i (l)}
      {@const jours = semaine(l)}
      {@const lignes = filtre === 'envoyes' ? jours.filter((j) => envoyes.has(j.jour)) : jours}
      {#if lignes.length || filtre === 'tous' || filtre === 'semaines'}
        <section class="semaine">
          <div class="entete">
            <span class="petit fort">{libelleSemaine(l)}</span>
            <a class="recap-lien" href="/rapports?onglet=semaine&jour={l}">Récap · {formatPct(pctJours(jours))}</a>
          </div>
          {#if filtre === 'semaines' || (filtre === 'tous' && i > 0 && !ouvertes.includes(l))}
            {@render resumeSemaine(l, jours)}
          {:else}
            <div class="carte liste">{#each lignes as j (j.jour)}{@render ligneJour(j)}{/each}</div>
            {#if filtre === 'tous' && i > 0}<button type="button" class="replier" onclick={() => basculer(l)}>Replier</button>{/if}
          {/if}
        </section>
      {/if}
    {/each}
    {#if lundis.length > limite}<button type="button" class="plus" onclick={() => (limite += 4)}>Afficher plus</button>{/if}
    {#if filtre === 'envoyes' && !envoyes.size}<p class="muted vide">Aucun rapport envoyé pour l’instant. Partage-le depuis l’écran Rapports.</p>{/if}
  {/if}
</EcranPage>

<style>
  .haut { display: flex; align-items: center; gap: 10px; }
  h1 { font-size: 26px; }
  .cherche { display: flex; align-items: center; gap: 8px; height: 46px; border-radius: 14px; background: var(--surface); border: 1px solid var(--ligne); padding: 0 12px; color: var(--muted); }
  .cherche input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 15px; outline: none; }
  .mois { background: var(--accent-fond); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--accent-fond)); border-radius: 22px; padding: 16px; display: flex; align-items: center; gap: 14px; }
  .pct { font-size: 13px; }
  .textes { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .sur { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-encre); }
  .grand { font-size: 17px; font-weight: 600; }
  .petit { font-size: 13px; }
  .fort { font-weight: 600; }
  .semaine { display: flex; flex-direction: column; gap: 8px; }
  .entete { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .recap-lien { color: var(--accent-encre); font-size: 13px; font-weight: 600; min-height: 32px; display: flex; align-items: center; flex: none; }
  .liste { flex: none; overflow: hidden; }
  .jour { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-height: 44px; }
  .jour + .jour { border-top: 1px solid var(--ligne); }
  .date { flex: none; width: 40px; display: flex; flex-direction: column; align-items: center; }
  .wd { font-size: 11px; }
  .num { font-size: 20px; }
  .milieu { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .points { display: flex; gap: 3px; }
  .points span { flex: 1; height: 6px; border-radius: 3px; background: var(--piste); }
  .points .bon { background: var(--bon); }
  .points .partiel { background: color-mix(in srgb, var(--c) 65%, var(--surface)); }
  .points .mauvais { background: color-mix(in srgb, var(--mauvais) 30%, var(--surface)); }
  .resume { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .score { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 13px; }
  .envoye { font-size: 10px; font-weight: 600; color: var(--bon); }
  .recap { width: 100%; padding: 14px; display: flex; align-items: center; justify-content: space-between; min-height: 48px; font-size: 13px; text-align: left; }
  .plus, .replier { min-height: 44px; border: 0; background: none; color: var(--accent-encre); font-size: 14px; font-weight: 600; }
  .replier { align-self: center; color: var(--muted); font-size: 13px; }
  .vide { font-size: 14px; text-align: center; padding: 20px 8px; }
</style>
