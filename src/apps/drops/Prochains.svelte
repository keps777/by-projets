<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { alerterDrop, prochainsDrops, retirerAlerteDrop } from '../../domain/drop.ts';
  import type { Compte } from '../../domain/types.ts';
  import { ligneProchain, type LigneProchain } from './vues.ts';

  /** Prochains drops : jour et heure d'ouverture (heure de Montréal), zone, destination masquée (« ? ? ? ») ; « M'alerter » active ou retire l'alerte du compte. */
  let { compte, now }: { compte?: Compte; now: number } = $props();
  const lignes = $derived(prochainsDrops(now).map((d) => ligneProchain(d, compte?.id)));
  const libelle = (l: LigneProchain) => `${l.alerte ? 'Retirer l’alerte pour' : 'M’alerter pour'} le drop ${l.zone} de ${l.jourLong} ${l.heure}`;
  function basculer(l: LigneProchain) {
    if (!compte) { aller('/inscription'); return; }
    if (l.alerte) { retirerAlerteDrop(l.id, compte.id); montrer(`Alerte retirée : drop ${l.zone} de ${l.jourLong} ${l.heure}.`, 'wa'); }
    else if (alerterDrop(l.id, compte.id)) montrer(`Alerte activée : drop ${l.zone} de ${l.jourLong} ${l.heure}.`);
  }
</script>

<section class="col g8" aria-labelledby="next-title">
  <div class="entete"><h2 id="next-title" class="sec-t">Prochains drops</h2><span class="fuseau">Heure de Montréal</span></div>
  <div class="tableau">
    <div class="tete" aria-hidden="true"><span>Ouvre</span><span>Zone</span><span></span></div>
    {#if lignes.length === 0}
      <p class="aucun">Aucun drop annoncé pour le moment.</p>
    {:else}
      <ul class="liste-plain">
        {#each lignes as l (l.id)}
          <li class="ligne">
            <span class="quand"><span class="jour">{l.jour}</span><span class="heure">{l.heure}</span></span>
            <span class="col g6 zone"><span class="z">{l.zone}</span>
              <span class="masque"><span class="case" aria-hidden="true">?</span><span class="case" aria-hidden="true">?</span><span class="case" aria-hidden="true">?</span><span class="dm">Destination masquée</span></span>
            </span>
            <button type="button" class="alerter" class:on={l.alerte} aria-pressed={l.alerte} aria-label={libelle(l)} onclick={() => basculer(l)}>
              {#if l.alerte}<Icone nom="ok" taille={16} trait={2.25} />Alerte activée{:else}<Icone nom="cloche" taille={16} trait={2} />M’alerter{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="note">La destination exacte est révélée à l’ouverture du drop.</p>
  </div>
</section>

<style>
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .entete { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .fuseau { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); }
  .tableau { border-radius: 16px; background: #060708; border: 1px solid var(--line); overflow: hidden; }
  .tete { display: grid; grid-template-columns: 52px 1fr auto; gap: 12px; padding: 10px 14px 6px; font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); }
  .ligne { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 72px; padding: 10px 14px; border-top: 1px solid #1a1c21; }
  .quand { display: flex; flex-direction: column; gap: 2px; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .jour { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; text-transform: uppercase; color: var(--ink3); } .heure { font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); }
  .z { font: 600 15px/20px 'Barlow', sans-serif; } .zone { min-width: 0; }
  .masque { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
  .case { width: 16px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 3px; background: #1c1f25; box-shadow: inset 0 -11px 0 #15171b; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .dm { margin-left: 6px; font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); }
  .alerter { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 12px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; white-space: nowrap; }
  .alerter.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  .note, .aucun { padding: 10px 14px 12px; border-top: 1px solid #1a1c21; font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); } .aucun { border-top: 0; padding-top: 4px; font-size: 13px; color: var(--ink2); }
  @media (max-width: 350px) { .alerter { padding: 0 8px; font-size: 13px; } .ligne { gap: 8px; } }
</style>
