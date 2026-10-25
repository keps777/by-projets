<script lang="ts">
  import { enDate, jourDe, jourSemaineLong, moisAnnee, type Jour } from '../../core/dates.ts';
  import { classePrix, grilleMois, prixCourt } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { prixBasDuJour } from './offres.ts';

  /** Mini-calendrier du mois, dans la fenêtre du trajet : le prix le plus bas de chaque jour pour la ligne choisie. Les jours passés ou sans départ sont grisés. */
  let { de, vers, jour = $bindable() }: { de: string; vers: string | null; jour: Jour } = $props();
  const MOIS_MAX = 6, auj = aujourdhui(), ce = enDate(auj), debut = ce.getFullYear() * 12 + ce.getMonth();
  const cible = enDate(jour);
  let mois = $state(Math.max(0, Math.min(MOIS_MAX, cible.getFullYear() * 12 + cible.getMonth() - debut)));
  const total = $derived(debut + mois), annee = $derived(Math.floor(total / 12)), m0 = $derived(total % 12), grille = $derived(grilleMois(annee, m0));
  const premier = $derived(jourDe(new Date(annee, m0, 1, 12)));
  const avecPrix = $derived(app.monde.params.tarifs.calendrierBas !== false && vers !== null);
  const cases = $derived(Array.from({ length: grille.jours }, (_, i) => {
    const j = jourDe(new Date(annee, m0, i + 1, 12)), passe = j < auj, px = passe || !vers ? null : prixBasDuJour(j, de, vers);
    return { j, n: i + 1, px, passe, vide: !passe && vers !== null && px === null };
  }));
  const prix = $derived(cases.flatMap((c) => (c.px === null ? [] : [c.px])));
  const bornes = $derived({ min: prix.length ? Math.min(...prix) : 0, max: prix.length ? Math.max(...prix) : 0 });
  const libelle = (c: (typeof cases)[number]) => `${jourSemaineLong(c.j)}${c.passe ? ', passé' : c.vide ? ', aucun départ' : avecPrix && c.px !== null ? `, dès ${fmtF(c.px)}` : ''}`;
  const titre = $derived(moisAnnee(premier).replace(/^./, (c) => c.toUpperCase()));
</script>

<div class="cal-fenetre">
  <div class="row sp">
    <button class="ib mo" type="button" onclick={() => (mois = Math.max(0, mois - 1))} disabled={mois === 0} aria-label="Mois précédent"><Icone nom="retour" /></button>
    <span class="ttl t16" aria-live="polite">{titre}</span>
    <button class="ib mo" type="button" onclick={() => (mois = Math.min(MOIS_MAX, mois + 1))} disabled={mois >= MOIS_MAX} aria-label="Mois suivant"><Icone nom="suivant" /></button>
  </div>
  <div class="cal" role="group" aria-label="Choisir le jour">
    {#each ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'] as w (w)}<span class="wd" aria-hidden="true">{w}</span>{/each}
    {#each Array(grille.decalage) as _, i (i)}<span class="dc blank" aria-hidden="true"></span>{/each}
    {#each cases as c (c.j)}
      {@const classe = c.px !== null && avecPrix ? classePrix(c.px, bornes.min, bornes.max) : ''}
      <button type="button" class="dc" class:on={c.j === jour} class:lo={classe === 'bas'} class:hi={classe === 'fort'} disabled={c.passe || c.vide} aria-pressed={c.j === jour} aria-current={c.j === auj ? 'date' : undefined}
        aria-label={libelle(c)} data-jour={c.j} onclick={() => (jour = c.j)}><b>{c.n}</b><small>{c.px !== null && avecPrix ? prixCourt(c.px) : ''}</small></button>
    {/each}
  </div>
  <p class="t12 mut3">{avecPrix ? 'Le prix affiché est le moins cher du jour. Les jours grisés n’ont aucun départ.' : vers ? 'Les jours grisés n’ont aucun départ à vendre.' : 'Choisis d’abord une arrivée pour voir les prix.'}</p>
</div>

<style>
  .cal-fenetre { display: flex; flex-direction: column; gap: 8px; }
  .cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; }
  .wd { font: 600 11px 'Geist Mono', monospace; color: #a1accb; text-align: center; padding: 2px 0; text-transform: uppercase; }
  .dc { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; min-height: 44px; min-width: 0; border-radius: 11px; border: 1px solid transparent; background: rgba(255, 255, 255, 0.05); color: #f2f4ff; cursor: pointer; padding: 2px 0; font: inherit; }
  .dc b { font: 700 14px 'Sora Variable', 'Sora', sans-serif; } .dc small { font: 600 9.5px 'Geist Mono', monospace; color: #a1accb; min-height: 11px; }
  .dc.lo small { color: #4ade80; } .dc.hi small { color: #ffc24b; }
  .dc:disabled { opacity: 0.32; cursor: not-allowed; }
  .dc.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; box-shadow: 0 8px 20px -10px rgba(124, 108, 255, 0.9); } .dc.on small { color: #06080f; }
  .dc.blank { visibility: hidden; }
  .dc[aria-current='date'] { border-color: rgba(127, 235, 255, 0.6); }
  .mo { width: 44px; height: 44px; } .mo:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
