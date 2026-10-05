<script lang="ts">
  import { ajouterJours, utcVersLocal } from '@core/dates.ts';
  import { disponibilite } from '@core/disponibilite.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { COULEUR_SANS_PROJET, blocsDuJour, creneauxDuJour, profil } from '../../data/requetes.ts';
  import { fuseau } from '../../data/temps.svelte.ts';
  import { reporter } from '../../data/actions/taches.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Volet from '../../ui/Volet.svelte';
  import { dureeMin, hm, puceJour } from './format.ts';
  import Disponibilite from './Disponibilite.svelte';
  import { styleTeinte } from './teintes.ts';

  /** Reporter une occurrence : jour, heure, rappel, disponibilité et créneaux libres les plus proches (spec §7.2, §7.3). */
  let { occId, aujourdhui, onfermer, onvalide }: { occId: string | null; aujourdhui: string; onfermer: () => void; onvalide: () => void } = $props();

  const occ = $derived(occId ? magasin.trouver('occurrences', occId) : undefined);
  const tache = $derived(occ ? magasin.trouver('taches', occ.tache_id) : undefined);
  const couleur = $derived.by(() => {
    const p = tache?.projet_id ? magasin.trouver('projets', tache.projet_id) : undefined;
    return (p && magasin.trouver('rubriques', p.rubrique_id)?.couleur) || COULEUR_SANS_PROJET;
  });
  const duree = $derived(occ ? Math.max(5, Math.round((Date.parse(occ.fin) - Date.parse(occ.debut)) / 60000)) : 30);
  const jours = $derived(Array.from({ length: 6 }, (_, i) => ajouterJours(aujourdhui, i)));

  let jour = $state('');
  let debut = $state(0);
  let rappel = $state(true);
  let avance = $state(10);

  // Réinitialise le formulaire à chaque ouverture.
  let ouvertPour: string | null = null;
  $effect(() => {
    if (!occ || ouvertPour === occ.id) { if (!occ) ouvertPour = null; return; }
    ouvertPour = occ.id;
    const loc = utcVersLocal(Date.parse(occ.debut), fuseau());
    jour = loc.jour >= aujourdhui ? loc.jour : aujourdhui;
    debut = loc.minutes;
    const r = tache?.rappel_min ?? profil()?.rappel_defaut_min ?? 10;
    rappel = tache?.rappel_min != null;
    avance = [0, 5, 10, 15].includes(r) ? r : 10;
  });

  const creneaux = $derived(occId && jour ? creneauxDuJour(jour, occId) : []);
  const dispo = $derived(disponibilite(creneaux, debut, duree));
  const occupant = $derived(dispo.occupePar ? blocsDuJour(jour).find((b) => b.occ.id === dispo.occupePar!.id) : undefined);

  const deplacer = (delta: number) => { debut = Math.max(0, Math.min(1440 - duree, debut + delta)); };

  function valider() {
    if (!occId) return;
    reporter(occId, { jour, debutMin: debut, rappelMin: rappel ? avance : null });
    const quand = jour === aujourdhui ? 'Reporté à ' : `Reporté ${puceJour(jour, aujourdhui).toLowerCase()} à `;
    dire(quand + hm(debut) + (rappel ? (avance ? ` · rappel ${avance} min avant` : ' · rappel à l’heure') : ''));
    onvalide();
  }
</script>

<Volet ouvert={!!occ} {onfermer} label="Reporter">
  {#if occ && tache}
    <div class="rep" style={styleTeinte(couleur, theme.mode)}>
      <div class="col">
        <span class="kicker">Reporter · {dureeMin(duree)}</span>
        <h2 class="titre">{tache.titre}</h2>
      </div>

      <div class="jours">
        {#each jours as j (j)}
          <button type="button" class:actif={j === jour} aria-pressed={j === jour} onclick={() => (jour = j)}>{puceJour(j, aujourdhui)}</button>
        {/each}
      </div>

      <div class="heure">
        <button type="button" aria-label="Une heure plus tôt" onclick={() => deplacer(-60)}>−1 h</button>
        <button type="button" aria-label="15 minutes plus tôt" onclick={() => deplacer(-15)}>−15</button>
        <div class="col centre">
          <span class="mono debut">{hm(debut)}</span>
          <span class="muted fin">jusqu’à {hm(debut + duree)}</span>
        </div>
        <button type="button" aria-label="15 minutes plus tard" onclick={() => deplacer(15)}>+15</button>
        <button type="button" aria-label="Une heure plus tard" onclick={() => deplacer(60)}>+1 h</button>
      </div>

      <div class="rappel">
        <button type="button" class="bascule" aria-pressed={rappel} onclick={() => (rappel = !rappel)}>
          <span class="sw" class:on={rappel}><span></span></span>
          Me rappeler
        </button>
        <div class="avances" class:eteint={!rappel}>
          {#each [0, 5, 10, 15] as a (a)}
            <button type="button" class:actif={rappel && a === avance} onclick={() => { avance = a; rappel = true; }}>{a ? `${a} min` : 'À l’heure'}</button>
          {/each}
        </div>
      </div>

      <Disponibilite {dispo} {duree} {occupant} detaille onchoisir={(m) => (debut = m)} />

      <button type="button" class="valider" onclick={valider}>{dispo.libre ? 'Valider le report' : 'Chevaucher quand même'}</button>
    </div>
  {/if}
</Volet>

<style>
  .rep { display: flex; flex-direction: column; gap: 14px; }
  .col { display: flex; flex-direction: column; gap: 2px; }
  .centre { align-items: center; }
  .kicker { font-size: 12px; font-weight: 600; color: var(--c-titre); }
  h2 { font-size: 24px; }
  .jours { display: flex; gap: 6px; overflow-x: auto; margin: 0 -18px; padding: 0 18px; }
  .jours button { transition: background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.12s ease; flex: none; height: 44px; padding: 0 14px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); font-size: 14px; font-weight: 600; }
  .jours button.actif { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .heure { display: flex; align-items: center; justify-content: space-between; background: var(--surface-2); border-radius: 18px; padding: 8px; }
  .heure button { width: 44px; height: 44px; border-radius: 14px; border: 0; background: var(--surface); font-size: 12px; font-weight: 600; }
  .debut { font-size: 28px; letter-spacing: -0.02em; }
  .fin { font-size: 11px; }
  .rappel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
  .bascule { flex: none; display: flex; align-items: center; gap: 10px; border: 0; background: transparent; font-size: 14px; font-weight: 600; padding: 0; min-height: 44px; }
  .sw { width: 44px; height: 26px; border-radius: 13px; background: var(--piste); position: relative; transition: background 0.2s; }
  .sw.on { background: var(--c); }
  .sw span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 10px; background: var(--carte-texte); transition: left 0.2s; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .sw.on span { left: 21px; }
  .avances { display: flex; gap: 6px; }
  .avances.eteint { opacity: 0.4; }
  .avances button { min-height: 44px; padding: 0 10px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .avances button.actif { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .valider { height: 54px; border-radius: 18px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 16px; font-weight: 600; }
</style>
