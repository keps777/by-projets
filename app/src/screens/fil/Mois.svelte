<script lang="ts">
  import { moisSuivant, ajouterJours, premierDuMois } from '@core/dates.ts';
  import { blocsDuJour, progressionRubrique, rubriques } from '../../data/requetes.ts';
  import { aujourdhui as jourCourant } from '../../data/temps.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Segment from '../../ui/Segment.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { moisValide } from './navigation.ts';
  import { chargeDuJour, grilleMois, hauteurCharge, partEcoulee, statsMois, teinteAccompli } from './mois.ts';
  import { cap, dateCourte, dateLongue, dureeMin, nomCourtRubrique, nomDuMois } from './format.ts';

  /** Vue Mois : couche Charge (proportions par rubrique) ou Accompli (intensité), statistiques, progression par rubrique. */
  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const mois = $derived(moisValide(routeur.params.get('mois')) ?? aujourdhui.slice(0, 7));
  const couche = $derived(routeur.params.get('couche') === 'accompli' ? 'accompli' : 'charge');
  const mode = $derived(theme.mode);
  const grille = $derived(grilleMois(mois));
  const jours = $derived(grille.jours.map((jour) => ({ jour, charge: chargeDuJour(blocsDuJour(jour)) })));
  const stats = $derived(statsMois(jours, aujourdhui));
  const attendu = $derived(partEcoulee(mois, aujourdhui));
  const rubs = $derived(rubriques());
  const progs = $derived(rubs.map((r) => ({ id: r.id, nom: nomCourtRubrique(r.nom), couleur: couleurRubrique(r.couleur, mode), pct: progressionRubrique(r.id, mois, aujourdhui) })));

  const allerMois = (n: number) => {
    const m = n > 0 ? moisSuivant(mois) : ajouterJours(premierDuMois(mois), -1).slice(0, 7);
    routeur.definir('mois', m === aujourdhui.slice(0, 7) ? null : m);
  };
  const lien = (j: string) => (j === aujourdhui ? '/' : `/?jour=${j}`);
  const jourDeVue = $derived(aujourdhui.slice(0, 7) === mois ? aujourdhui : premierDuMois(mois));
</script>

<EcranPage gap={14}>
  <div class="tete">
    <div class="col serre">
      <span class="annee">{mois.slice(0, 4)}</span>
      <h1 class="titre">{cap(nomDuMois(premierDuMois(mois)))}</h1>
    </div>
    <div class="nav">
      <button type="button" class="rond" aria-label="Mois précédent" onclick={() => allerMois(-1)}><Icone nom="retour" taille={16} trait={2.2} /></button>
      <button type="button" class="rond" aria-label="Mois suivant" onclick={() => allerMois(1)}><Icone nom="suivant" taille={16} trait={2.2} /></button>
    </div>
  </div>

  <div class="col g8">
    <Segment valeur="mois" options={[
      { valeur: 'jour', label: 'Jour', href: lien(jourDeVue) },
      { valeur: 'semaine', label: 'Semaine', href: jourDeVue === aujourdhui ? '/semaine' : `/semaine?semaine=${jourDeVue}` },
      { valeur: 'mois', label: 'Mois' }
    ]} />
    <div class="couches">
      <button type="button" class:actif={couche === 'charge'} aria-pressed={couche === 'charge'} onclick={() => routeur.definir('couche', null)}>Charge du jour</button>
      <button type="button" class:actif={couche === 'accompli'} aria-pressed={couche === 'accompli'} onclick={() => routeur.definir('couche', 'accompli')}>Accompli</button>
    </div>
  </div>

  <div class="calendrier">
    {#each ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as l, i (i)}<span class="jsem">{l}</span>{/each}
    {#each { length: grille.avant } as _, i (i)}<span></span>{/each}
    {#each jours as { jour, charge } (jour)}
      {@const estAuj = jour === aujourdhui}
      {@const passe = jour <= aujourdhui && charge.total > 0}
      {@const pct = charge.total ? Math.round((charge.faits / charge.total) * 100) : 0}
      <a class="case" class:auj={estAuj} href={lien(jour)} aria-label="{dateLongue(jour)} : {charge.total} blocs, {dureeMin(charge.minutes)}"
        style:background={couche === 'accompli' && passe ? `color-mix(in srgb, var(--bon) ${teinteAccompli(pct)}%, var(--surface))` : null}>
        <span class="num" class:auj={estAuj}>{+jour.slice(8)}</span>
        {#if couche === 'charge'}
          {#if charge.minutes > 0}
            <span class="barre" style:height="{hauteurCharge(charge.minutes)}px">
              {#each charge.segments as s (s.couleur)}<span style:flex={s.minutes} style:background={couleurRubrique(s.couleur, mode)}></span>{/each}
            </span>
          {/if}
        {:else}
          <span class="mono pct" class:vide={!passe}>{passe ? `${pct} %` : '·'}</span>
        {/if}
      </a>
    {/each}
  </div>

  <div class="legende">
    {#if couche === 'charge'}
      {#each progs as r (r.id)}<span><i style:background={r.couleur}></i>{r.nom}</span>{/each}
    {:else}
      <span><i style:background="color-mix(in srgb, var(--bon) 60%, transparent)"></i>Plus foncé = plus accompli</span>
      <span><i style:background="var(--maintenant)"></i>Jour rouge = aujourd’hui</span>
    {/if}
  </div>

  <div class="stats">
    <div class="carte stat"><span class="titre">{dureeMin(stats.moyenneMin)}</span><span class="muted">charge moyenne / jour</span></div>
    <div class="carte stat"><span class="titre">{stats.accompliPct ?? 0} %</span><span class="muted">accompli à ce jour</span></div>
    <div class="carte stat"><span class="titre">{stats.pic ? dateCourte(stats.pic).replace('.', '') : '—'}</span><span class="muted">jour le plus chargé</span></div>
  </div>

  <div class="carte prog">
    <span class="fort">Progression du mois par rubrique</span>
    {#each progs as r (r.id)}
      <div class="ligne-prog">
        <span class="muted">{r.nom}</span>
        <span class="piste"><span style:width="{r.pct ?? 0}%" style:background={r.couleur}></span><i style:left="{attendu}%"></i></span>
        <span class="mono">{r.pct == null ? '—' : `${r.pct} %`}</span>
      </div>
    {/each}
  </div>
</EcranPage>

<style>
  /* Marges de la maquette : 18 px en haut, 18 px sur les côtés pour l'en-tête (12 + 6), 12 px pour le calendrier. */
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -2px 2px 0; }
  .col.serre { gap: 0; }
  .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .g8 { gap: 8px; padding: 0 2px; }
  .annee { font-size: 13px; font-weight: 600; color: var(--maintenant); }
  h1 { font-size: 28px; }
  .nav { display: flex; gap: 6px; }
  .couches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .couches button { position: relative; height: 40px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .couches button.actif { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .calendrier { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin: 0 -4px; }
  .jsem { text-align: center; font-size: 11px; font-weight: 600; color: var(--muted); }
  .case { transition: transform 0.12s ease, background-color 0.25s ease; }
  .case { height: 66px; border-radius: 10px; background: var(--surface); border: 1px solid var(--ligne); padding: 4px; display: flex; flex-direction: column; justify-content: space-between; }
  .case.auj { border-color: var(--maintenant); }
  .num { align-self: flex-start; min-width: 22px; height: 22px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
  .num.auj { background: var(--jour-aujourdhui); color: var(--jour-aujourdhui-texte); }
  .barre { display: flex; flex-direction: column-reverse; border-radius: 3px; overflow: hidden; gap: 1px; }
  .pct { font-size: 11px; }
  .pct.vide { color: var(--faint); }
  .legende { display: flex; flex-wrap: wrap; gap: 10px 14px; padding: 0 2px; font-size: 11px; color: var(--muted); }
  .legende span { display: flex; align-items: center; gap: 5px; }
  .legende i { width: 10px; height: 10px; border-radius: 3px; }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .stat { border-radius: 16px; padding: 10px 12px; display: flex; flex-direction: column; }
  .stat .titre { font-size: 20px; }
  .stat .muted { font-size: 11px; }
  .prog { border-radius: 22px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .fort { font-size: 14px; font-weight: 600; }
  .ligne-prog { display: grid; grid-template-columns: 108px minmax(0, 1fr) 38px; gap: 10px; align-items: center; font-size: 12px; }
  .ligne-prog .mono { text-align: right; }
  .piste { position: relative; height: 8px; border-radius: 4px; background: var(--piste); }
  .piste span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; }
  .piste i { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--texte); opacity: 0.45; }
  /* Dessin de la maquette (40 px ou 36 px), zone d'appui portée à 44 px (spec §14). */
  .couches button::after { content: ''; position: absolute; inset: -2px 0; }
</style>
