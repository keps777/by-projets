<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from '../bagages/Picto.svelte';
  import { aller } from '../../router.svelte.ts';
  import { jourDe, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { TAUX_COMMISSION, TAUX_COMMISSION_PASS, echeanceDe } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, departDuVol, droitDe, volDe } from '../../domain/marche.ts';
  import { villeDe } from './compat.ts';
  import { accordDe, intentionDe, ordinal, rangDetenteur } from './modele.ts';
  import { libelleSource } from './vues.ts';
  import { heure, instantJourMois, jourLong, jourMois } from './temps.ts';
  import { pourcent } from '../bagages/format.ts';

  /** Accord conclu (planche m3-27) : le droit est dans le portefeuille, à nommer avant l'échéance. */
  let { id }: { id: string } = $props();
  const compte = $derived(compteCourant());
  const i = $derived(intentionDe(id));
  const a = $derived(i ? accordDe(i) : undefined);
  const droit = $derived(a ? droitDe(a.droitId) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const echeance = $derived(vol ? echeanceDe(departDuVol(vol)) : 0);
  const avantLe = $derived(`${jourMois(jourDe(echeance))} ${heure(echeance)}`);
  const nomme = $derived(droit?.statut === 'nomme' || droit?.statut === 'voyage');
  const rang = $derived(droit ? rangDetenteur(droit) : 1);
  const fait = $derived(a ? (maintenant() - a.quand < 600_000 ? 'Fait à l’instant.' : `Fait le ${instantJourMois(a.quand)}${instantJourMois(a.quand).endsWith('.') ? '' : '.'}`) : '');
  const sansAutres = $derived(!a || a.refusees === 0 ? '' : ` ; ${a.refusees === 1 ? 'l’autre proposition a été déclinée' : `les ${a.refusees} autres propositions ont été déclinées`} automatiquement`);
</script>

<Ecran titre="Accord conclu" face="jour" sansRetour>
  <h1 class="sr">Accord conclu</h1>
  {#if !i || !a || !droit || !vol || !cie || !compte || i.compteId !== compte.id}
    <section class="carte vide"><h2 class="t-section">Pas encore d’accord</h2><p class="t-sec">Cette intention n’a pas d’accord conclu : les propositions reçues sont dans vos intentions.</p><button type="button" class="btn" onclick={() => aller('/intentions')}>Mes intentions</button></section>
  {:else}
    <div class="titre"><span class="rond" aria-hidden="true"><Picto nom="ok" taille={32} trait={2.25} /></span><p class="t1">Vous détenez ce droit de voyage</p><p class="p15">Un vendeur a accepté votre prix. Le billet que vous cherchiez est devenu le vôtre.</p></div>

    <div class="cadre"><span class="contour" aria-hidden="true"></span>
      <section class="billet" aria-label="Billet {droit.ref}, {cie.nom}, {villeDe(vol.de)} {vol.de} vers {villeDe(vol.vers)} {vol.vers}, {jourLong(vol.jour).toLowerCase()}">
        <div class="b-haut">
          <div class="ent"><span class="sur">{cie.nom} · Vol {vol.numero.split(' ')[1]}</span><span class="mono ref">{droit.ref}</span></div>
          <div class="codes"><span class="code">{vol.de}</span><span class="liaison" aria-hidden="true"><span class="pts"></span><Picto nom="avion" taille={20} trait={1.75} /><span class="pts"></span></span><span class="code">{vol.vers}</span></div>
          <div class="horaires">
            <div class="col g1"><span class="mono h">{vol.heureDepart}</span><span class="t-sec">{villeDe(vol.de)}</span></div>
            <span class="duree">{Math.floor(vol.dureeMin / 60)} h {String(vol.dureeMin % 60).padStart(2, '0')} · {vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'direct'}</span>
            <div class="col g1 fin"><span class="arr"><span class="mono h">{vol.heureArrivee}</span>{#if vol.plusJours}<span class="mono plus">+{vol.plusJours}</span>{/if}</span><span class="t-sec">{villeDe(vol.vers)}</span></div>
          </div>
          <div class="jour"><Picto nom="calendrier" taille={18} trait={1.75} />{jourLong(vol.jour)}</div>
        </div>
        <div class="perf" aria-hidden="true"><span class="tiret"></span><span class="e g"></span><span class="e d"></span></div>
        <div class="b-bas"><span class="col g2"><span class="sur">Prix de l’accord</span><span class="mono prix">{fmt(a.prix)}</span></span><span class="chip">{nomme ? 'Nommé' : 'À nommer'}</span></div>
      </section>
    </div>

    <section class="col g10" aria-labelledby="pay-title"><h2 id="pay-title" class="sur">Vos fonds réservés</h2>
      <div class="recap">
        <dl class="dl">
          <div><dt>Réservés le {instantJourMois(i.creeLe)}</dt><dd class="mono">{fmt(a.reserve)}</dd></div>
          <div><dt>Capturés pour cet accord</dt><dd class="mono fort">{fmt(a.capture)}</dd></div>
          <div><dt>Débité en plus</dt><dd class="mono fort" class:vert={a.enPlus === 0}>{a.enPlus === 0 ? '0 $' : `+${fmt(a.enPlus)}`}</dd></div>
        </dl>
        <div class="total"><span class="col g2"><span class="tt">Total payé</span><span class="aide">{libelleSource(a.source, compte)} · reçu de démo</span></span><span class="mono grand">{fmt(a.prix)}</span></div>
      </div>
      <p class="aide">Commission de revente à la charge du vendeur (hypothèse&nbsp;: {pourcent(TAUX_COMMISSION)}, ou {pourcent(TAUX_COMMISSION_PASS)} avec le Pass). Intention {i.id} fermée{sansAutres}.</p>
    </section>

    {#if !nomme}
      <div class="note" role="note"><Picto nom="identite" taille={24} trait={1.75} /><span><strong>Nommer le voyageur avant le {avantLe}.</strong> Vous ou un proche. Sans nom à l’échéance, vous serez nommé voyageur par défaut.</span></div>
    {/if}

    <section class="col g10" aria-labelledby="next-title"><h2 id="next-title" class="t-bloc">Et maintenant</h2>
      <ol class="etapes">
        <li><span class="pt ok" aria-hidden="true"><Picto nom="ok" taille={18} trait={2.25} /></span><span class="col g2"><span class="e1">Inscrit à votre nom dans le registre</span><span class="e2">{fait} Vous êtes le {ordinal(rang)} détenteur de ce droit de voyage.</span></span></li>
        <li class="sep"><span class="pt jaune mono" aria-hidden="true">2</span><span class="col g2"><span class="e1">{nomme ? 'Voyageur nommé' : `Nommez le voyageur avant le ${avantLe}`}</span><span class="e2">{nomme ? 'Le billet est nominatif.' : 'Vous ou un proche. Le billet devient alors nominatif ; d’ici là, vous pouvez encore le revendre ou le transférer.'}</span></span></li>
        <li class="sep"><span class="pt vide-p mono" aria-hidden="true">3</span><span class="col g2"><span class="e1">Recevez la carte d’embarquement</span><span class="e2">Une fois le voyageur nommé et confirmé par la compagnie, elle apparaît dans Portefeuille.</span></span></li>
      </ol></section>
  {/if}

  {#snippet droite()}<button type="button" class="fermer" aria-label="Fermer" onclick={() => aller('/')}><Picto nom="croix" taille={22} trait={1.75} /></button>{/snippet}
  {#snippet pied()}
    {#if droit && a && !nomme}<button type="button" class="btn" onclick={() => aller(`/nommer/${droit.id}`)}><Picto nom="identite" taille={20} trait={1.75} />Nommer le voyageur</button>{/if}
    {#if droit && a}<a class="btn sec" href="/portefeuille" onclick={(e) => { e.preventDefault(); aller('/portefeuille'); }}><Picto nom="portefeuille" taille={20} trait={1.75} />Voir mon portefeuille</a>{/if}
  {/snippet}
</Ecran>

<style>
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .titre { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding-top: 4px; }
  .rond { width: 64px; height: 64px; box-sizing: border-box; border-radius: 999px; background: rgba(11, 122, 85, 0.1); border: 2px solid #0b7a55; color: #0b7a55; display: grid; place-items: center; animation: nx-check 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) 1.1s both; }
  .t1 { margin: 0; font: 600 clamp(28px, 8.7vw, 34px)/1.1 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; } .p15 { margin: 0; font: 400 15px/22px 'Barlow', sans-serif; color: #3e4f66; }
  .cadre { position: relative; } .contour { position: absolute; inset: -6px; border-radius: 22px; border: 2px dashed #5e6e84; opacity: 1; animation: nx-outline 1.4s ease-out forwards; pointer-events: none; }
  .billet { position: relative; background: #fff; color: #0b1b2e; border-radius: 18px; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); animation: nx-materialize 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s both; }
  .b-haut { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 12px; } .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; } .ref { font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.04em; }
  .sur { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; }
  .codes { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(38px, 12.3vw, 48px)/48px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .liaison { flex: 1; display: flex; align-items: center; gap: 6px; color: #1a64c8; } .pts { flex: 1; border-top: 2px dotted #b9c5d3; }
  .horaires { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8px; } .col.g1 { gap: 1px; } .col.g2 { gap: 2px; } .col.g10 { gap: 10px; } .col.fin { align-items: flex-end; } .h { font: 600 18px/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .duree { font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; text-align: center; } .arr { display: flex; align-items: flex-start; gap: 2px; } .plus { font: 600 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #3e4f66; }
  .jour { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; border-radius: 10px; background: #eef3f8; font: 600 14px/20px 'Barlow', sans-serif; }
  .perf { position: relative; height: 22px; } .tiret { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed #d3dce6; } .e { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .e.g { left: -11px; } .e.d { right: -11px; }
  .b-bas { padding: 4px 18px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; } .prix { font: 600 32px/36px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(255, 210, 63, 0.3); color: #5c4600; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .recap { border-radius: 20px; background: #fff; border: 1px solid #d3dce6; overflow: hidden; } .dl { margin: 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; } .dl div { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .dl dt { font: 400 15px/20px 'Barlow', sans-serif; color: #3e4f66; } .dl dd { margin: 0; font: 500 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .fort { font-weight: 600 !important; } .vert { color: #0b7a55; }
  .total { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 16px; border-top: 1px dashed #b9c5d3; } .tt { font: 700 16px/22px 'Barlow', sans-serif; } .grand { font: 600 26px/30px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .aide { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; }
  .note { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: rgba(255, 210, 63, 0.3); color: #5c4600; font: 400 14px/20px 'Barlow', sans-serif; } .note :global(svg) { flex: none; } .note strong { font-weight: 700; }
  .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .etapes { list-style: none; margin: 0; padding: 0 16px; border-radius: 20px; background: #fff; border: 1px solid #d3dce6; } .etapes li { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; } .etapes li.sep { border-top: 1px solid #d3dce6; }
  .pt { flex: none; width: 32px; height: 32px; box-sizing: border-box; border-radius: 999px; display: grid; place-items: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; } .pt.ok { background: rgba(11, 122, 85, 0.1); color: #0b7a55; } .pt.jaune { background: #ffd23f; color: #0b1b2e; } .pt.vide-p { border: 2px dashed #b9c5d3; color: #3e4f66; }
  .e1 { font: 600 15px/20px 'Barlow', sans-serif; } .e2 { font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; }
  .fermer { width: 44px; height: 44px; box-sizing: border-box; border-radius: 999px; background: #fff; border: 1px solid #d3dce6; display: grid; place-items: center; color: #0b1b2e; cursor: pointer; }
  @keyframes nx-outline { 0%, 45% { opacity: 1; } 100% { opacity: 0; } } @keyframes nx-materialize { 0% { box-shadow: 0 0 0 rgba(11, 27, 46, 0); } 100% { box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); } } @keyframes nx-check { 0% { transform: scale(0.6); } 100% { transform: scale(1); } }
</style>
