<script lang="ts">
  // Retraite de 24 h : une proposition de journée pour rattraper, thème par thème, ce qui est en retard ce mois-ci.
  import { formatHeure } from '@core/units.ts';
  import type { Jour, Mois } from '@core/types.ts';
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { blocsDuJour } from '../../data/requetes.ts';
  import { dureeMin } from '../fil/format.ts';
  import { jourCourt } from './vues.ts';
  import { planDeRetraite, planifierAuFil, prochainSamedi } from './retraite.ts';

  let { ouvert, onfermer, mois, jour }: { ouvert: boolean; onfermer: () => void; mois: Mois; jour: Jour } = $props();

  let quand = $state('');
  $effect(() => { if (ouvert) quand = prochainSamedi(jour); });
  const plan = $derived(ouvert ? planDeRetraite(mois, jour) : null);
  const deja = $derived(ouvert && quand ? blocsDuJour(quand).length : 0);
  const couleur = (id: string) => couleurRubrique(magasin.trouver('rubriques', id)?.couleur ?? '#A3A6B1', theme.mode);
  const heure = (min: number) => `${formatHeure(min % 1440)}${min >= 1440 ? ' (lendemain)' : ''}`;
  const ligne = (b: NonNullable<typeof plan>['blocs'][number]) => `${heure(b.debut)} – ${formatHeure((b.debut + b.duree) % 1440)}`;
  const nbActivites = $derived(plan?.blocs.filter((b) => b.type === 'activite').length ?? 0);

  function planifier() {
    if (!plan || !quand) return;
    if (quand < jour) { dire('Choisis un jour à venir.'); return; }
    const n = planifierAuFil(plan, quand);
    dire(`Retraite posée au Fil · ${n} blocs le ${jourCourt(quand)}`);
    onfermer();
  }
</script>

<Volet {ouvert} {onfermer} label="Retraite de 24 h">
  <h2 class="titre">Retraite de 24 h</h2>
  {#if plan}
    {#if !plan.parTheme.length}
      <p class="muted">Tu es à jour dans tous tes thèmes ce mois-ci : rien à rattraper. Une retraite resterait un beau temps d’ouverture, de silence et de bilan.</p>
    {:else}
      <p class="muted">Pour être à jour sur chaque thème au {jourCourt(jour)}, il faudrait environ <strong>{dureeMin(plan.besoinTotal)}</strong> (estimation : chapitres, pages et gestes comptés à un rythme prudent).{plan.manque > 0 ? ` Une journée en contient ${dureeMin(plan.place)} : il resterait ${dureeMin(plan.manque)} à répartir sur la semaine.` : ' Une journée suffit.'}</p>

      <section class="groupe" aria-label="Temps par thème">
        {#each plan.parTheme as t (t.rubriqueId)}
          <div class="theme" style:--c={couleur(t.rubriqueId)}>
            <span class="rang"><span class="gras">{t.rubriqueNom}</span><span class="mono petit">{dureeMin(t.place)}{t.place < t.besoin ? ` sur ${dureeMin(t.besoin)}` : ''}</span></span>
            <span class="piste"><span class="rempli" style:width="{Math.min(100, Math.round((t.place / t.besoin) * 100))}%"></span></span>
          </div>
        {/each}
      </section>
    {/if}

    <label class="champ">Jour de la retraite
      <input type="date" bind:value={quand} min={jour} />
    </label>
    {#if deja}<p class="muted petit">Tu as déjà {deja} bloc{deja > 1 ? 's' : ''} ce jour-là : choisis une journée libre si tu peux.</p>{/if}

    <section class="groupe" aria-label="Déroulé de la journée">
      <span class="etiquette">Déroulé · 06 h 00 → 06 h 00</span>
      <div class="deroule">
        {#each plan.blocs as b, i (i)}
          <div class="bloc {b.type}" style:--c={b.besoin ? couleur(b.besoin.rubriqueId) : 'var(--ligne)'}>
            <span class="mono petit heure">{ligne(b)}</span>
            <span class="col"><span class="gras">{b.besoin ? b.besoin.projetNom : b.titre}</span>
              {#if b.besoin}<span class="muted petit">{b.besoin.rubriqueNom} · {b.besoin.detail}</span>{/if}</span>
            <span class="mono petit muted">{dureeMin(b.duree)}</span>
          </div>
        {/each}
      </div>
    </section>

    <Bouton grand plein desactive={!quand} onclick={planifier}>Poser au Fil{nbActivites ? ` · ${nbActivites} blocs de rattrapage` : ''}</Bouton>
  {/if}
</Volet>

<style>
  .titre { font-size: 22px; }
  .gras { font-weight: 600; }
  .petit { font-size: 12px; }
  .groupe { display: flex; flex-direction: column; gap: 10px; }
  .theme { display: flex; flex-direction: column; gap: 6px; }
  .rang { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 14px; }
  .piste { position: relative; display: block; height: 8px; border-radius: 4px; background: var(--piste); overflow: hidden; }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--c); }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
  .champ input { height: 48px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 16px; }
  .deroule { display: flex; flex-direction: column; gap: 6px; }
  .bloc { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--ligne); border-left: 4px solid var(--c); font-size: 14px; }
  .bloc.nuit, .bloc.repas, .bloc.pause { opacity: 0.65; }
  .col { display: flex; flex-direction: column; min-width: 0; }
  .heure { white-space: nowrap; }
</style>
