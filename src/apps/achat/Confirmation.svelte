<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt } from '../../core/argent.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, totalAPayer, volDe } from '../../domain/marche.ts';
  import { droitDuCompte } from './actions.ts';
  import { chronologie, statutVoyage } from './chrono.ts';
  import { heure, jourComplet, jourMoisHeure } from './dates.ts';
  import Introuvable from './Introuvable.svelte';
  import { naviguer } from './lien.ts';

  /** Confirmation d'achat : le droit de voyage est détenu ; ce qu'il reste à faire (garder, nommer, compagnie). */
  let { droitId = '' }: { droitId?: string } = $props();
  const compte = $derived(compteCourant());
  const droit = $derived(droitDuCompte(droitId, compte?.id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const ch = $derived(vol ? chronologie(vol, maintenant()) : undefined);
  const nomme = $derived(droit ? statutVoyage(droit) !== 'a_nommer' : false);
  const arrivee = $derived(vol ? `${vol.heureArrivee}${vol.plusJours ? ` (+${vol.plusJours})` : ''}` : '');
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !droit || !vol || !ch}
  <Introuvable titre="Droit introuvable" message="Ce droit de voyage n’est pas dans votre portefeuille." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/" />
{:else}
  <Ecran titre="Confirmation" face="jour" retour="/">
    <section class="hero" aria-labelledby="conf-t">
      <span class="halo" aria-hidden="true"><span class="coche"><Icone nom="ok" taille={44} trait={2.5} /></span></span>
      <h1 id="conf-t" class="t-conf">Vous détenez ce droit de voyage</h1>
      <p class="sous" role="status">Paiement de démonstration accepté — aucun débit réel.</p>
    </section>

    <section class="billet" aria-label="Votre billet {vol.de} → {vol.vers}">
      <div class="haut">
        <div class="trajet"><span class="code">{vol.de}</span>
          <span class="fil" aria-hidden="true"><span class="pointille"></span><Icone nom="avion" taille={18} /><span class="pointille"></span></span>
          <span class="code">{vol.vers}</span></div>
        <span class="t-sec">{jourComplet(ch.depart)} · {heure(ch.depart)} → {arrivee} · {compagnieDe(vol).nom} {vol.numero.split(' ')[1]} · {vol.cabine}</span>
      </div>
      <div class="perfore" aria-hidden="true"></div>
      <div class="bas">
        {#if nomme}<span class="puce ready"><Icone nom="ok" taille={14} trait={2} />Voyageur nommé</span>
        {:else}<span class="puce signal"><Icone nom="horloge" taille={14} trait={2} />À nommer avant le {jourMoisHeure(ch.echeance)}</span>{/if}
        <div class="refs">
          <div class="col g4"><span class="etiq">Référence</span><span class="mono ref">{droit.ref}</span></div>
          <div class="col g4 fin"><span class="etiq">Payé (démo)</span><span class="mono prix">{fmt(totalAPayer(droit.prixPaye))}</span></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="suite-t" class="col g12">
      <h2 id="suite-t" class="t-h2">Et maintenant</h2>
      <ol class="etapes liste-plain">
        <li><span class="num on" aria-hidden="true">1</span><span class="tx"><span class="t1">Gardez-le, revendez-le ou transférez-le</span><span class="t-sec">Depuis votre portefeuille, jusqu’au {jourMoisHeure(ch.echeance)}.</span></span></li>
        <li><span class="num" aria-hidden="true">2</span><span class="tx"><span class="t1">Nommez le voyageur au plus tard à J-1</span><span class="t-sec">Vous ou un proche.</span></span></li>
        <li><span class="num" aria-hidden="true">3</span><span class="tx"><span class="t1">La compagnie émet le billet nominatif</span><span class="t-sec">Il apparaît dans votre portefeuille, prêt à voyager.</span></span></li>
      </ol>
    </section>

    {#snippet pied()}
      <a class="btn" href="/portefeuille" onclick={(e) => naviguer(e, '/portefeuille')}><Icone nom="portefeuille" taille={20} />Voir mon portefeuille</a>
      {#if !nomme && ch.ouvert}<a class="btn sec" href="/nommer/{droit.id}" onclick={(e) => naviguer(e, `/nommer/${droit.id}`)}><Icone nom="piece" taille={20} />Nommer le voyageur maintenant</a>
      {:else}<a class="btn sec" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}><Icone nom="avion" taille={20} />Voir mon voyage</a>{/if}
    {/snippet}
  </Ecran>
{/if}

<style>
  .hero { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  .halo { width: 112px; height: 112px; border-radius: 999px; border: 1px solid rgba(9, 106, 73, 0.3); display: flex; align-items: center; justify-content: center; }
  .coche { width: 88px; height: 88px; border-radius: 999px; background: var(--ok-soft); border: 2px solid var(--ok); color: var(--ok); display: flex; align-items: center; justify-content: center; }
  @media (max-height: 760px) { .halo { width: 88px; height: 88px; } .coche { width: 68px; height: 68px; } .hero { gap: 8px; } .t-conf { font-size: 30px; line-height: 32px; } }
  .t-conf { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; }
  .sous { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .billet { position: relative; background: var(--surface); border-radius: 18px; box-shadow: var(--ombre); }
  .haut { padding: 14px 18px 12px; display: flex; flex-direction: column; gap: 8px; }
  .trajet { display: flex; align-items: center; gap: 10px; }
  .code { font: 700 40px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: var(--accent); min-width: 0; }
  .pointille { flex: 1; border-top: 2px dotted var(--line-strong); }
  .billet .perfore { margin: 0 18px; border-top-color: var(--line); top: 0; }
  .billet .perfore::before { left: -29px; } .billet .perfore::after { right: -29px; }
  .bas { padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 12px; }
  .bas .puce { align-self: flex-start; white-space: normal; min-height: 26px; padding-block: 4px; }
  .refs { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
  .fin { align-items: flex-end; }
  .etiq { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .ref { font-weight: 600; font-size: 18px; letter-spacing: 0.04em; }
  .prix { font-weight: 600; font-size: 18px; font-variant-numeric: tabular-nums; }
  .t-h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .etapes { display: flex; flex-direction: column; }
  .etapes li { position: relative; display: grid; grid-template-columns: 32px 1fr; gap: 14px; padding-bottom: 18px; }
  .etapes li:not(:last-child)::before { content: ''; position: absolute; left: 15px; top: 36px; bottom: 2px; border-left: 2px solid var(--line); }
  .etapes li:last-child { padding-bottom: 0; }
  .num { width: 32px; height: 32px; border-radius: 999px; background: var(--surface2); color: var(--ink); display: flex; align-items: center; justify-content: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; }
  .num.on { background: #0b1b2e; color: #fff; }
  .tx { display: flex; flex-direction: column; gap: 2px; padding-top: 5px; }
  .t1 { font: 600 15px/20px 'Barlow', sans-serif; }
</style>
