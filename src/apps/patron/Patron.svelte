<script lang="ts">
  import { untrack } from 'svelte';
  import { jourSemaineLong } from '../../core/dates.ts';
  import { tableau, libelleVariation } from '../../core/indicateurs.ts';
  import { OFFRES, scoreConfiance, simuler } from '../../core/financement.ts';
  import { recetteMensuelleEstimee } from '../../core/assistant.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { nonLues, personneCourante } from '../../domain/actions.ts';
  import { aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import Colonne from './Colonne.svelte';
  import { entreesConfiance } from './confiance.ts';
  import { assurerHistorique } from './actions.ts';
  import { dockPatron } from './dockPatron.ts';
  import { compagnieNom, contexte, francs, gareNom, millions, pourcent, signe } from './lecture.ts';
  import { moduleActif } from './modules.ts';
  import { ouvrirNotifications } from '../../ui/overlays.svelte.ts';

  let now = $state(maintenant());
  $effect(() => { const t = setInterval(() => (now = maintenant()), 30_000); return () => clearInterval(t); });
  $effect(() => { untrack(() => assurerHistorique()); });

  const moi = $derived(personneCourante());
  const ctx = $derived(contexte(now));
  const t = $derived(tableau(app.monde, { jour: ctx.jour, now, compagnieId: ctx.compagnieId }));
  const heure = $derived(new Date(now).toTimeString().slice(0, 5));
  const ouvertes = $derived(t.gares.filter((g) => g.billets > 0 || g.bus > 0));
  const pire = $derived([...t.gares].filter((g) => (g.variation ?? 0) <= -10).sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0))[0]);
  const tuiles = $derived.by(() => { const top = t.gares.slice(0, 3); if (pire && !top.some((g) => g.gareId === pire.gareId)) return [...top.slice(0, 2), pire]; return top; });
  const equipe = $derived(app.monde.personnes.filter((p) => p.compagnieId === ctx.compagnieId && p.role !== 'patron' && p.role !== 'voyageur'));
  const suspendus = $derived(equipe.filter((p) => !p.actif).length);
  const finance = $derived.by(() => {
    const mensuelle = recetteMensuelleEstimee(ctx), s = simuler(OFFRES[0], { montant: OFFRES[0].montantMax, duree: OFFRES[0].dureeDefaut, recetteMensuelle: mensuelle });
    const c = scoreConfiance(entreesConfiance(ctx));
    return { mensuelle, s, c };
  });
  const question = $derived(pire ? `Pourquoi ${gareNom(pire.gareId)} baisse ?` : 'Quelle ligne rapporte le plus par bus ?');
  const nbAlertes = $derived(nonLues(moi?.id));

  // Cartes 3D : elles s'inclinent vers le doigt ou le pointeur (désactivé si l'utilisateur préfère moins d'animations)
  const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function incliner(e: PointerEvent) {
    if (calme) return;
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * 12).toFixed(1)}deg`); el.style.setProperty('--ry', `${(px * 12).toFixed(1)}deg`); el.dataset.lift = '1';
  }
  function poser(e: Event) { const el = e.currentTarget as HTMLElement; delete el.dataset.lift; el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); }
  const levee = (e: Event) => { if (!calme) (e.currentTarget as HTMLElement).dataset.lift = '1'; };
  const aire = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile dock={dockPatron('tableau')} sansRetour>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g10">
        <span class="av hot" aria-hidden="true">{moi ? `${moi.prenom[0]}${moi.nom[0]}` : 'LN'}</span>
        <div class="col"><span class="ttl t16">{moi?.prenom ?? 'Patron'} · {compagnieNom(ctx.compagnieId)}</span><span class="t13 mut">{t.gares.length} gares · {jourSemaineLong(ctx.jour)} · {heure}</span></div>
      </div>
      <button type="button" class="ib" aria-haspopup="dialog" aria-label="Alertes{nbAlertes ? `, ${nbAlertes} non lues` : ''}" onclick={ouvrirNotifications}>
        <Icone nom="cloche" />{#if nbAlertes}<span class="badge" aria-hidden="true">{nbAlertes}</span>{/if}
      </button>
    </header>
  {/snippet}
<Colonne>

  {#if app.session.hors_ligne}<div class="gl row g8 t13"><span class="pl wa">hors ligne</span><span class="mut">Chiffres gardés sur ce téléphone, mis à jour au retour du réseau.</span></div>{/if}

  <div class="b3">
    <a class="gl ac row sp hero" href="/siege/analyses" onclick={(e) => aire(e, '/siege/analyses')}>
      <span class="col"><span class="lab">Recette du jour · {t.gares.length} gares</span><span class="big mono-nowrap" aria-live="polite">{francs(t.recette)}</span>
        <span class="t12 {t.variation !== null && t.variation < 0 ? 'erc' : 'okc'}">{libelleVariation(t.variation)} vs même heure {new Date(`${ctx.jour}T12:00`).toLocaleDateString('fr-FR', { weekday: 'long' })} dernier · {t.bus} bus · {pourcent(t.remplissage)} remplis</span></span>
      <span class="ringp" style="--p: {Math.round(t.remplissage * 100)}%" role="img" aria-label="Remplissage moyen {pourcent(t.remplissage)}"><span class="t13 b7">{pourcent(t.remplissage)}</span></span>
    </a>

    {#if t.billets === 0 && app.monde.billets.length < 40}
      <div class="gl col g8" style="margin-top: 10px"><span class="t14 b7">Pas encore de ventes</span><span class="t13 mut">Dès qu’un billet est vendu au guichet ou dans l’app, il apparaît ici avec sa recette.</span></div>
    {/if}

    <div class="bento" style="margin-top: 10px">
      {#each tuiles as g (g.gareId)}
        {@const hot = pire?.gareId === g.gareId}
        {@const vers = hot && moduleActif('assistant') ? `/assistant/reponse?q=${encodeURIComponent(`Pourquoi ${gareNom(g.gareId)} baisse ?`)}` : `/patron/gare?gare=${g.gareId}`}
        <a class="tile" class:hot href={vers} onclick={(e) => aire(e, vers)} onpointermove={incliner} onpointerleave={poser} onpointercancel={poser} onfocus={levee} onblur={poser}>
          <span class="lab">{gareNom(g.gareId)}</span><span class="ttl t18 nowrap">{francs(g.recette)}</span>
          <span class="t12 {g.variation !== null && g.variation < 0 ? 'erc' : 'okc'}">{libelleVariation(g.variation)}{g.ecart !== 0 ? ` · écart ${signe(g.ecart)}` : ' · RAS'}</span>
        </a>
      {:else}
        <div class="gl w2 t13 mut">Aucune gare n’a encore de départ aujourd’hui.</div>
      {/each}
      {#if moduleActif('colis')}
        <a class="tile" href="/inter-agences" onclick={(e) => aire(e, '/inter-agences')} onpointermove={incliner} onpointerleave={poser} onpointercancel={poser} onfocus={levee} onblur={poser}>
          <span class="lab">Colis</span><span class="ttl t18">{t.colis.envoyes} envoyé{t.colis.envoyes > 1 ? 's' : ''}</span><span class="t12 mut">{francs(t.colis.chiffre)} aujourd’hui</span>
        </a>
      {/if}
      <a class="tile" href="/patron/equipe" onclick={(e) => aire(e, '/patron/equipe')} onpointermove={incliner} onpointerleave={poser} onpointercancel={poser} onfocus={levee} onblur={poser}>
        <span class="lab">Équipe</span><span class="ttl t18">{equipe.length} personnes</span><span class="t12 {suspendus ? 'wac' : 'mut'}">{suspendus ? `${suspendus} suspendu${suspendus > 1 ? 's' : ''}` : `${ouvertes.length} gares en activité`}</span>
      </a>
      {#if moduleActif('financement')}
        <a class="tile ac" href="/financement" onclick={(e) => aire(e, '/financement')} onpointermove={incliner} onpointerleave={poser} onpointercancel={poser} onfocus={levee} onblur={poser}>
          <span class="lab">Financement</span><span class="ttl t18">{millions(finance.mensuelle)}</span><span class="t12 vi">/ mois · {finance.c.eligible && !finance.s.depasse ? 'prêt bus éligible' : finance.c.eligible ? 'plafond à regarder' : 'historique trop court'}</span>
        </a>
      {/if}
    </div>
  </div>

  {#if moduleActif('assistant')}
    <a class="gl row g12 carte-ass" href="/assistant/reponse?q={encodeURIComponent(question)}" onclick={(e) => aire(e, `/assistant/reponse?q=${encodeURIComponent(question)}`)}>
      <span class="orb pet" aria-hidden="true"><Icone nom="orbe" taille={20} trait={2.2} /></span>
      <span class="col grow"><span class="t14 b7">« {question} »</span><span class="t12 mut">demande à l’assistant · il lit tes chiffres</span></span>
    </a>
  {/if}
  <div class="liens">
    <a class="b s sm" href="/siege/comptable" onclick={(e) => aire(e, '/siege/comptable')}>Comptable</a>
    <a class="b s sm" href="/siege/config" onclick={(e) => aire(e, '/siege/config')}>Configuration</a>
    <a class="b s sm" href="/siege/controle" onclick={(e) => aire(e, '/siege/controle')}>Salle de contrôle</a>
    {#if moduleActif('interAgences')}<a class="b s sm" href="/inter-agences" onclick={(e) => aire(e, '/inter-agences')}>Inter-agences</a>{/if}
  </div>
</Colonne>
</Mobile>

<style>
  .b3 { perspective: 900px; }
  .b3 .bento { transform-style: preserve-3d; }
  .b3 .tile { transition: transform 0.25s, box-shadow 0.25s; transform: translateZ(0); will-change: transform; touch-action: manipulation; }
  .b3 :global(.tile[data-lift]) { transform: translateZ(26px) rotateX(var(--rx, -4deg)) rotateY(var(--ry, 0deg)); box-shadow: 0 30px 50px -24px rgba(124, 108, 255, 0.8); }
  .b3 .tile:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .hero { text-decoration: none; color: inherit; }
  .liens { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .liens .b { width: 100%; }
  .mono-nowrap, .nowrap { white-space: nowrap; }
  .big { font-size: 30px; }
  .carte-ass { text-decoration: none; color: inherit; }
  .pet { margin: 0; width: 44px; height: 44px; min-width: 44px; min-height: 44px; box-shadow: none; }
  .ib { position: relative; }
  .badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #ff5bde; color: #06080f; font: 700 11px 'Geist Mono', monospace; display: grid; place-items: center; }
  @media (prefers-reduced-motion: reduce) { .b3 :global(.tile[data-lift]) { transform: none; } }
</style>
