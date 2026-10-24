<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { jourSemaineLong } from '../../core/dates.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import { choisirTrajet, demarrerCovoit, gainPotentiel, gainsConducteur, mesTrajets, paiementDe, placesLibresCovoit, placesReservees, refuserReservation, simulerReservation, terminerCovoit, trajetCourant } from './actions.ts';
  import { fcfaF, initiales } from './commun.ts';
  import { lireTerrain } from './etat.ts';

  const agent = $derived(personneCourante());
  const trajets = $derived(agent ? mesTrajets(agent.id) : []);
  const o = $derived(agent ? trajetCourant(agent.id) : undefined);
  const gains = $derived(agent ? gainsConducteur(agent.id) : null);
  const reserve = $derived(o ? placesReservees(o) : 0);
  const verse = $derived(o ? lireTerrain().covoit.verses[o.id] : undefined);
  const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const etat = $derived(!o ? null : o.statut === 'terminee' ? { t: 'terminé', c: 'ok' } : o.statut === 'en_route' ? { t: 'en route', c: 'ok' } : o.statut === 'annulee' ? { t: 'annulé', c: 'er' } : reserve >= o.places ? { t: 'complet', c: 'ok' } : { t: `${reserve} / ${o.places} réservées`, c: 'inf' });
  const nomVoyageur = (id: string) => { const p = personne(id); return p ? `${p.prenom} ${p.nom[0]}.` : 'Voyageur'; };
  const demarrer = () => { if (!agent || !o) return; try { demarrerCovoit(o.id, agent.id); montrer(reserve ? `Trajet démarré · position partagée avec ${reserve} passager${reserve > 1 ? 's' : ''}` : 'Trajet démarré'); } catch { montrer('Ce trajet est déjà démarré', 'wa'); } };
  const terminer = () => { if (!agent || !o) return; try { const m = terminerCovoit(o.id, agent.id); montrer(`Trajet terminé · ${fcfaF(m)} versés en MoMo`); } catch { montrer('Le trajet n’est pas en cours', 'wa'); } };
  const refuser = (i: number) => { if (!agent || !o) return; try { refuserReservation(o.id, i, agent.id); montrer('Réservation refusée · voyageur remboursé', 'wa'); } catch { montrer('Trop tard : le trajet est démarré', 'er'); } };
  const demo = () => { if (!o) return; try { simulerReservation(o.id); montrer('Une voyageuse vient de réserver'); } catch { montrer('Plus de place libre', 'wa'); } };
</script>

<Mobile enteteLibre={entete} sansRetour>
  {#if !o || !gains}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="taxi" taille={56} /></div><span class="ttl t20">Aucun trajet</span><span class="t14 mut">Propose un trajet pour recevoir des réservations.</span></div>
    <a class="b p" href="/covoit/conduire" onclick={(e) => { e.preventDefault(); aller('/covoit/conduire'); }}>Proposer un trajet</a>
  {:else}
    {#if trajets.length > 1}<div class="chips fixe" role="tablist" aria-label="Mes trajets">{#each trajets as t (t.id)}<button type="button" role="tab" aria-selected={t.id === o.id} class="ch" class:on={t.id === o.id} onclick={() => choisirTrajet(t.id)}>{t.heure} {t.vers}</button>{/each}</div>{/if}
    <div class="gl ac">
      <div class="row sp"><span class="col"><span class="lab">{maj(jourSemaineLong(o.jour))} · {o.heure}</span><span class="ttl t20">{o.de} → {o.vers}</span><span class="t13 mut">Départ {o.depart} · {o.places} place{o.places > 1 ? 's' : ''} · {fcfaF(o.prix)}</span></span>
        <span class="sts" role="img" aria-label="{reserve} place{reserve > 1 ? 's' : ''} réservée{reserve > 1 ? 's' : ''} sur {o.places}">{#each Array(o.places) as _, i (i)}<i class:f={i < reserve}></i>{/each}</span></div>
      <div class="row sp" style="margin-top: 10px"><span class="t14 b7">{fcfaF(gainPotentiel(o))} si complet</span><span class="pl {etat?.c}">{etat?.t}</span></div>
    </div>
    <span class="lab">Réservations</span>
    <div class="gl col" style="gap: 0">
      {#each o.reservations as r, i (r.paiementId)}
        {@const p = paiementDe(r)}
        <div class="bk"><span class="av sm" class:hot={i % 2 === 0}>{initiales(personne(r.voyageurId))}</span>
          <span class="col grow"><span class="t14 b7">{nomVoyageur(r.voyageurId)}</span><span class="t12 mut">{r.places} place{r.places > 1 ? 's' : ''} · {p?.statut === 'ok' ? `payé ${fcfaF(p.montant)}` : p?.statut === 'rembourse' ? 'remboursé' : 'paiement en attente'}</span></span>
          {#if o.statut === 'ouverte'}<span class="pl ok">accepté</span><button type="button" class="b g sm" onclick={() => refuser(i)} aria-label="Refuser {nomVoyageur(r.voyageurId)}">Refuser</button>
          {:else}<span class="pl ok">{o.statut === 'terminee' ? 'arrivé' : 'à bord'}</span>{/if}</div>
      {:else}<span class="t13 mut" style="padding: 12px 0">Aucune réservation pour l’instant. Ton annonce est visible des voyageurs.</span>{/each}
    </div>
    <div class="row g8" style="align-items: stretch">
      <div class="gl grow kc"><span class="lab">Ce mois</span><span class="ttl t20">{fcfaF(gains.mois)}</span><span class="t12 mut">{gains.passagersMois} passager{gains.passagersMois > 1 ? 's' : ''} · {gains.trajetsMois} trajet{gains.trajetsMois > 1 ? 's' : ''}</span></div>
      <div class="gl grow kc"><span class="lab">Versé</span><span class="ttl t20 okc">{verse ? fcfaF(verse.montant) : 'MoMo'}</span><span class="t12 mut">{verse ? 'sur ton MoMo' : 'à l’arrivée, après scan'}</span></div>
    </div>
    {#if gains.aVenir > 0}<span class="t13 mut c">À venir : {fcfaF(gains.aVenir)} de réservations en attente de trajet.</span>{/if}
    <div class="col g8" style="margin-top: auto">
      {#if o.statut === 'ouverte'}<button type="button" class="b p" onclick={demarrer}>Démarrer · partager ma position</button>
      {:else if o.statut === 'en_route'}<button type="button" class="b p" onclick={terminer}>Terminer le trajet · encaisser {fcfaF(reserve * o.prix)}</button>
      {:else if o.statut === 'terminee'}<div class="gl c"><span class="t14 b7">Trajet terminé</span><span class="t12 mut">{verse ? `${fcfaF(verse.montant)} versés en MoMo` : 'Merci pour ce trajet.'}</span></div>
      {:else}<div class="gl c"><span class="t14 b7">Trajet annulé</span></div>{/if}
      {#if o.statut === 'ouverte' && placesLibresCovoit(o) > 0}<button type="button" class="b g sm" style="align-self: center" onclick={demo}>Démo · simuler une réservation</button>{/if}
    </div>
  {/if}
</Mobile>

{#snippet entete()}
  <header class="hd">
    <div class="row g10"><a class="av" href="/terrain/moi" aria-label="Mon profil" onclick={(e) => { e.preventDefault(); aller('/terrain/moi'); }}>{initiales(agent)}</a>
      <div class="col"><span class="ttl t16">{agent?.prenom}</span><span class="t13 mut">Conducteur · {agent?.vehicule ?? 'véhicule'} · ★ {(agent?.note ?? 0).toFixed(1).replace('.', ',')}</span></div></div>
    <a class="pl ac" href="/covoit/conduire" style="min-height: 44px; padding: 0 14px" onclick={(e) => { e.preventDefault(); aller('/covoit/conduire'); }}>+ trajet</a>
  </header>
{/snippet}

<style>
  .bk { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); min-height: 60px; }
  .bk:last-child { border: 0; }
  .sts { display: flex; gap: 4px; }
  .sts i { width: 16px; height: 20px; border-radius: 4px 4px 2px 2px; background: rgba(255, 255, 255, 0.14); }
  .sts i.f { background: #3de0ff; }
  .g10 { gap: 10px; }
  a.av { text-decoration: none; }
</style>
