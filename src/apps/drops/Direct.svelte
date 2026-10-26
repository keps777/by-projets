<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { prises } from '../../domain/drop.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import type { Compte, Drop } from '../../domain/types.ts';
  import { va } from '../voyager/lien.ts';
  import { jourSemaine } from '../voyager/format.ts';
  import Prochains from './Prochains.svelte';
  import Rebours from './Rebours.svelte';
  import Reserver from './Reserver.svelte';

  /** Drop membres en direct : compte à rebours réel, places restantes sur 6, prix membre contre prix équivalent, réservation (membre du Pass) ou invitation au Pass. */
  let { drop, now, compte }: { drop: Drop; now: number; compte?: Compte } = $props();
  const vol = $derived(volDe(drop.volId));
  const ville = $derived(vol ? (app.monde.aeroports.find((a) => a.code === vol.vers)?.ville ?? vol.vers) : '');
  const membre = $derived(!!compte?.pass.actif);
  const maPlace = $derived(compte ? app.monde.droits.find((d) => d.dropId === drop.id && d.detenteurId === compte.id) : undefined);
  const servi = $derived(!!compte && drop.servis.includes(compte.id));
  const depart = $derived(vol ? Date.parse(`${vol.jour}T${vol.heureDepart}`) : 0);
  const trajet = $derived(vol ? `${vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'Direct'} · ${vol.heureDepart} → ${vol.heureArrivee} · 1 voyageur` : '');
  const prix = $derived(fmt(drop.prixMembre));
  let regles = $state(false), feuille = $state(false);
</script>

<Ecran titre="Drops" face="nuit" onglet="drops" sansRetour>
  {#if vol}
    <section class="hero" aria-labelledby="drop-route">
      <p class="live"><span class="pouls" data-nx-motion="1" aria-hidden="true"></span>Drop N° {drop.n} · en direct</p>
      <div class="col g4">
        <h2 id="drop-route" class="route">{vol.de} → {vol.vers}</h2>
        <p class="l1">{ville} · {jourSemaine(depart, { avecAnnee: true })} · {compagnieDe(vol).nom}</p>
        <p class="l2">{trajet}</p>
      </div>

      <div class="boite">
        <span class="sur">Fin du drop dans</span>
        <Rebours reste={drop.fin - now} />
        <div class="filet"></div>
        <div class="col g8 places">
          <div class="rang"><span class="sur">Places</span><span class="n"><span class="m">{drop.restantes}</span> restante{drop.restantes > 1 ? 's' : ''} sur {drop.places}</span></div>
          <div class="jauge" aria-hidden="true">{#each Array(drop.places) as _, i (i)}<span class:prise={i < prises(drop)}></span>{/each}</div>
        </div>
      </div>

      <div class="prixs">
        <div class="col g2"><span class="etiq">Prix membre</span>{#if membre}<span class="grand">{prix}</span>{:else}<span class="grand cache" role="img" aria-label="Prix réservé aux membres du Pass NexG">•••&nbsp;$</span>{/if}</div>
        <div class="col g2 fin"><span class="eq">Prix équivalent</span><span class="eq-p"><s>≈ {fmt(drop.prixEquivalent)}</s></span></div>
      </div>

      {#if membre && servi}<span class="pass"><Icone nom="ok" taille={14} trait={2.5} />Votre place est réservée</span>
      {:else if membre}<span class="pass"><Icone nom="ok" taille={14} trait={2.5} />Vous êtes membre du Pass NexG</span>
      {:else}<span class="pass"><Icone nom="cadenas" taille={14} trait={2.5} />Réservé aux membres du Pass NexG</span>{/if}

      {#if membre && servi}
        {#if maPlace}<a class="cta" href={`/confirmation/${encodeURIComponent(maPlace.id)}`} onclick={(e) => va(e, `/confirmation/${encodeURIComponent(maPlace.id)}`)}>Voir ma place<Icone nom="suivant" taille={20} trait={2} /></a>
        {:else}<span class="cta inactif" aria-disabled="true">Une place par membre et par drop</span>{/if}
      {:else if membre}
        <button type="button" class="cta" onclick={() => (feuille = true)}>Réserver · <span class="mono">{prix}</span><Icone nom="suivant" taille={20} trait={2} /></button>
      {:else}
        <a class="cta" href="/pass" onclick={(e) => va(e, '/pass')}>Rejoindre le Pass NexG<Icone nom="suivant" taille={20} trait={2} /></a>
        <p class="invit">Le prix membre est révélé aux membres du Pass NexG. Ouvert à tous les membres, au premier arrivé.</p>
      {/if}
    </section>
  {/if}

  <Prochains {compte} {now} />

  <section class="col g12" aria-labelledby="how-title">
    <h2 id="how-title" class="sec-t">Comment ça marche</h2>
    <ol class="liste-plain etapes">
      <li><span class="num" aria-hidden="true">1</span><span>NexG-TT met en vente des billets à prix réduit, par petits lots, au fil de la demande.</span></li>
      <li><span class="num" aria-hidden="true">2</span><span>Seuls les membres du Pass NexG peuvent réserver pendant le drop.</span></li>
      <li><span class="num" aria-hidden="true">3</span><span>Le billet rejoint votre portefeuille, comme tout autre droit de voyage.</span></li>
    </ol>
    <p class="attrib">Attribution au premier arrivé.
      <button type="button" class="regles-b" aria-expanded={regles} aria-controls="regles-drop" onclick={() => (regles = !regles)}>Règles du drop</button></p>
    {#if regles}
      <div id="regles-drop" class="regles">
        <ul>
          <li>Une place par membre et par drop.</li><li>La place est attribuée à la fin du paiement, dans l’ordre d’arrivée.</li>
          <li>Même règle d’accès pour tous les membres, quel que soit le lieu de connexion.</li><li>Revente possible ensuite, dans la limite du plafond de prix.</li>
        </ul>
        <span class="hyp">Règles provisoires — hypothèses à valider.</span>
      </div>
    {/if}
  </section>
</Ecran>

{#if vol && compte && membre}<Reserver bind:ouvert={feuille} {drop} {vol} {compte} />{/if}

<style>
  .hero { margin: -8px -20px 0; padding: clamp(12px, 2.4dvh, 24px) 20px clamp(14px, 2.6dvh, 24px); background: #ffd23f; color: #0d0e11; border-radius: 0 0 28px 28px; display: flex; flex-direction: column; gap: clamp(8px, 1.9dvh, 18px); }
  .hero :global(:focus-visible) { outline-color: #0d0e11; }
  .live { display: inline-flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
  .pouls { width: 8px; height: 8px; border-radius: 999px; background: #0d0e11; animation: nx-pulse 1.4s ease-in-out infinite; }
  .route { font: 700 clamp(42px, 6.8dvh, 60px) / 0.9 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .l1 { font: 600 15px/20px 'Barlow', sans-serif; } .l2 { font: 500 13px/18px 'Barlow', sans-serif; }
  .boite { display: flex; flex-direction: column; gap: clamp(6px, 1.4dvh, 12px); padding: clamp(10px, 1.8dvh, 14px) 12px clamp(12px, 2dvh, 16px); border-radius: 18px; background: #060708; color: #f3f4f6; }
  .sur { padding: 0 4px; font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #8c93a3; }
  .filet { height: 1px; background: #1a1c21; } .places { padding: 0 4px; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .rang .sur { padding: 0; } .n { font: 600 14px/20px 'Barlow', sans-serif; } .m { font: 600 14px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: #ffd23f; }
  .jauge { display: flex; gap: 6px; } .jauge span { flex: 1; height: 10px; border-radius: 3px; background: #ffd23f; } .jauge span.prise { background: #262a33; }
  .prixs { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .etiq { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; }
  .grand { font: 600 clamp(32px, 5.4dvh, 46px) / 1.08 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .grand.cache { letter-spacing: 0.04em; }
  .fin { align-items: flex-end; text-align: right; padding-bottom: 6px; } .eq { font: 500 13px/18px 'Barlow', sans-serif; } .eq-p { font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .pass { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 12px; border-radius: 999px; background: #0d0e11; color: #ffd23f; font: 700 12px/1.2 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .cta { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: clamp(50px, 7.6dvh, 56px); border: 0; border-radius: 14px; background: #0d0e11; color: #ffd23f; font: 700 17px/1.2 'Barlow', sans-serif; cursor: pointer; text-decoration: none; padding: 0 16px; width: 100%; }
  .cta.inactif { background: rgba(13, 14, 17, 0.55); cursor: not-allowed; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .invit { font: 500 13px/18px 'Barlow', sans-serif; }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .etapes { display: flex; flex-direction: column; gap: 12px; } .etapes li { display: flex; align-items: flex-start; gap: 12px; font: 400 15px/22px 'Barlow', sans-serif; } .etapes li > span:last-child { padding-top: 4px; }
  .num { flex: none; width: 22px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1c1f25; box-shadow: inset 0 -15px 0 #15171b; font: 600 17px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); }
  .attrib { display: flex; align-items: center; flex-wrap: wrap; column-gap: 6px; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .regles-b { min-height: 44px; padding: 0; background: none; border: 0; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .regles { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .regles ul { margin: 0; padding: 0 0 0 18px; display: flex; flex-direction: column; gap: 6px; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .hyp { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); }
</style>
