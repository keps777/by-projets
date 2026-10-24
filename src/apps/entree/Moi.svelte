<script lang="ts">
  import { onMount } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { colisDe, nonLues, personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { fcfa } from '../../core/money.ts';
  import { formaterTel } from '../../core/telephone.ts';
  import { pointsAvantBilletOffert } from '../../core/fidelite.ts';
  import { cagnotteDe } from '../route/etat.ts';
  import { t } from './i18n.ts';
  import { avancerLitiges, billetsAVenir, litigesEnCours, bonsDisponibles, palierDeLaPersonne, preparerFidelite, proches, voyagesPasses } from './actions.ts';
  import { nav } from './lien.ts';

  /** Moi : profil de la voyageuse et accès bento à ses billets, points, proches, colis, réglages, autorisations et signalements. */
  const moi = $derived(personneCourante());
  { const m = personneCourante(); if (m) preparerFidelite(m.id); }
  onMount(() => avancerLitiges(maintenant()));
  const initiales = $derived(moi ? `${moi.prenom[0] ?? ''}${moi.nom[0] ?? ''}`.toUpperCase() : '');
  const aVenir = $derived(moi ? billetsAVenir(moi.id).length : 0);
  const passes = $derived(moi ? voyagesPasses(moi.id).length : 0);
  const points = $derived(moi?.points ?? 0);
  const cagnotte = $derived(cagnotteDe(moi?.id));
  const nbBons = $derived(moi ? bonsDisponibles(moi.id).length : 0);
  const palier = $derived(moi ? palierDeLaPersonne(moi.id) : null);
  const prochesNoms = $derived(moi ? proches(moi.id).map((p) => p.prenom) : []);
  const colisEnRoute = $derived(moi ? colisDe(moi.id).filter((c) => c.statut !== 'livre' && c.statut !== 'annule').length : 0);
  const dossiers = $derived(moi ? litigesEnCours(moi.id) : 0);
  const nonLu = $derived(moi ? nonLues(moi.id) : 0);
  const pl = (n: number, s: string, p = s + 's') => `${n} ${n > 1 ? p : s}`;
  const reste = $derived(pointsAvantBilletOffert(points));
</script>

{#snippet picto(d: string)}<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>{/snippet}

<Mobile titre={t('moi')} sansRetour dock={dockVoyageur('moi')}>
  {#snippet droite()}
    <a class="ib notif" href="/notifications" use:nav aria-label={nonLu ? `Notifications, ${pl(nonLu, 'non lue')}` : 'Notifications'}><Icone nom="cloche" />{#if nonLu}<span class="badge" aria-hidden="true">{nonLu > 9 ? '9+' : nonLu}</span>{/if}</a>
  {/snippet}
  {#if moi}
    <div class="gl ac hero">
      <span class="av" aria-hidden="true">{initiales}</span>
      <span class="col grow">
        <h2 class="ttl t20 ell" style="margin: 0">{moi.prenom} {moi.nom}</h2>
        <span class="t13 mut">{formaterTel(moi.tel)}{moi.ville ? ` · ${moi.ville}` : ''}</span>
        <span class="row g8 wrapf" style="margin-top: 6px">{#if moi.visage}<span class="pl ok">{t('visageActive')}</span>{/if}{#if palier}<span class="pl ac">{t('niveau')} {palier.nom}</span>{/if}{#if app.session.hors_ligne}<span class="pl wa">hors ligne</span>{/if}</span>
      </span>
    </div>
    <div class="bento">
      <a class="tile" href="/pass" use:nav>{@render picto('M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z')}<span class="t15 b7">{t('mesBillets')}</span><span class="t12 mut">{aVenir} à venir · {passes} passé{passes > 1 ? 's' : ''}</span></a>
      <a class="tile ac" href="/moi/fidelite" use:nav>{@render picto('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z')}<span class="t15 b7">{fcfa(points)} point{points > 1 ? 's' : ''}</span><span class="t12 mut">{reste > 0 ? `${fcfa(reste)} avant un billet offert` : 'billet offert disponible'}</span>{#if cagnotte > 0 || nbBons > 0}<span class="t12 okc" data-testid="avantages">{[cagnotte > 0 ? `cagnotte ${fcfa(cagnotte)} F` : '', nbBons > 0 ? `${nbBons} bon${nbBons > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span>{/if}</a>
      <a class="tile" href="/moi/proches" use:nav>{@render picto('M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z')}<span class="t15 b7">{t('mesProches')}</span><span class="t12 mut">{prochesNoms.length ? prochesNoms.join(', ') : 'ajoute tes proches'}</span></a>
      <a class="tile" href="/colis/suivi" use:nav>{@render picto('M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5L12 12l8-4.5M12 12v9')}<span class="t15 b7">{t('mesColis')}</span><span class="t12 mut">{colisEnRoute ? `${colisEnRoute} en route` : 'aucun colis en cours'}</span></a>
      <a class="tile w2" href="/reglages" use:nav style="flex-direction: row; align-items: center; min-height: 64px">{@render picto('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1')}<span class="col grow"><span class="t15 b7">{t('reglages')}</span><span class="t12 mut">langue, paiement par défaut, visage, notifications</span></span></a>
      <a class="tile" href="/autorisations" use:nav>{@render picto('M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z')}<span class="t15 b7">{t('autorisations')}</span><span class="t12 mut">caméra, position, contacts</span></a>
      <a class="tile" href="/litige" use:nav>{@render picto('M12 3l9.5 17h-19zM12 10v4M12 17.5v.5')}<span class="t15 b7">{t('signaler')}</span><span class="t12 mut">{dossiers ? `${pl(dossiers, 'dossier')} en cours` : 'aucun dossier en cours'}</span></a>
    </div>
    <span class="lab">{t('gagner')}</span>
    <div class="bento">
      <a class="tile hot" href="/relais/devenir" use:nav><span class="t15 b7">Devenir point relais</span><span class="t12 mut">ta boutique reçoit les colis · 300 F chacun</span></a>
      <a class="tile hot" href="/livreur/devenir" use:nav><span class="t15 b7">Devenir livreur</span><span class="t12 mut">moto · 1 000 F la course</span></a>
      <a class="tile w2" href="/covoit/conduire" use:nav style="flex-direction: row; align-items: center; min-height: 60px"><span class="col grow"><span class="t15 b7">Je conduis · covoiturage</span><span class="t12 mut">remplis ta voiture vers Douala</span></span><span class="pl ac" title="3 places à 4 500 F">+13 500 F</span></a>
    </div>
    <a class="b g" href="/ussd" use:nav>{t('aide')}</a>
  {/if}
</Mobile>

<style>
  .hero { display: flex; align-items: center; gap: 14px; flex: none; }
  .hero .av { width: 64px; height: 64px; font-size: 22px; box-shadow: 0 20px 40px -16px rgba(124, 108, 255, 0.8); }
  .notif { position: relative; }
  .badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #ff5bde; color: #06080f; font: 700 11px 'Geist Mono', monospace; display: grid; place-items: center; }
  .tile { flex: none; }
</style>
