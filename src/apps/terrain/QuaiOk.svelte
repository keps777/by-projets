<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { quand } from '../../core/dates.ts';
  import { planSieges } from '../../core/sieges.ts';
  import { codeAffiche } from '../../core/terrain.ts';
  import { billetParId, departParId, ligneDe } from '../../domain/actions.ts';
  import { compteurABord, passageParId } from './actions.ts';
  import { fcfaF, libelleMoyen } from './commun.ts';
  import { dockAgent } from './dock.ts';

  const passage = $derived(passageParId(param('passage')));
  const billet = $derived(passage?.billetId ? billetParId(passage.billetId) : undefined);
  const depart = $derived(passage ? departParId(passage.departId) : undefined);
  const n = $derived(passage ? compteurABord(passage.departId) : 0);
  const siege = $derived(billet && depart && billet.siege ? planSieges(ligneDe(depart).classe, depart.capacite).find((s) => s.id === billet.siege) : undefined);
  const paiement = $derived(billet ? app.monde.paiements.find((p) => p.id === billet.paiementId) : undefined);
  const colis = $derived(billet ? app.monde.colis.filter((c) => c.departId === billet.departId && c.expediteurId === billet.acheteurId && c.statut !== 'annule') : []);
  const preuve = $derived(!passage ? '' : passage.via === 'code' ? 'code saisi à la main' : billet?.canal === 'app' ? 'hologramme signé' : 'sceau vérifié');
  const ok = $derived(passage?.statut === 'ok' && !!billet);

  // Retour automatique au radar après 2 s ; « Suivant » enchaîne directement sur le scan suivant.
  $effect(() => {
    if (passage && passage.statut !== 'ok') { aller(`/quai/refus?passage=${passage.id}`, { remplacer: true }); return; }
    if (!ok) return;
    const t = setTimeout(() => aller('/quai', { remplacer: true }), 2000);
    return () => clearTimeout(t);
  });
</script>

<Mobile titre="Billet valide" retourVers="/quai" dock={dockAgent('quai', 'quai')}>
  {#snippet droite()}{#if depart}<span class="pl ok">{n} / {depart.capacite}</span>{/if}{/snippet}
  {#if !ok || !billet}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="scan" taille={56} /></div><span class="ttl t20">Aucun scan à afficher</span><span class="t14 mut">Scanne un billet depuis le radar pour voir son détail.</span></div>
    <a class="b p" href="/quai" onclick={(e) => { e.preventDefault(); aller('/quai'); }}>Retour au radar</a>
  {:else}
    <div class="center" style="flex: none; padding: 16px 0 0">
      <div class="rond" aria-hidden="true"><Icone nom="ok" taille={66} trait={2.4} /></div>
      <span class="ttl t24" role="status">{billet.passager.nom || 'Sans nom'}</span>
      <span class="t16 mut">{#if billet.siege}place <b class="aq">{billet.siege}</b>{siege?.fenetre ? ' · fenêtre' : siege ? ' · couloir' : ''}{siege?.devant ? ' · devant' : ''}{:else}<b class="aq">Placement libre</b>{/if} · billet {billet.canal === 'app' ? 'dans l’app' : billet.canal === 'guichet' ? 'papier guichet' : 'SMS'}</span>
    </div>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14">Code</span><span class="mono b7">{codeAffiche(billet.code)}</span></div>
      <div class="li"><span class="grow t14">Payé</span><span class="t14 b7 c">{fcfaF(billet.prix)} · {paiement ? libelleMoyen(paiement.moyen) : '—'} · {quand(billet.creeLe, maintenant()).toLowerCase()}</span></div>
      <div class="li"><span class="grow t14">Preuve</span><span class="pl ac">{preuve}</span></div>
      <div class="li"><span class="grow t14">Colis à charger</span><span class="t14 b7">{colis.length ? colis.map((c) => c.code).join(', ') : 'non'}</span></div>
    </div>
    <span class="t13 mut c" aria-live="polite">Retour automatique au radar dans 2 s</span>
    <div class="col g8" style="margin-top: auto">
      <button class="b p" type="button" onclick={() => aller('/quai?scan=1')}>Suivant · {n} montés</button>
      <a class="b g" href="/quai" onclick={(e) => { e.preventDefault(); aller('/quai'); }}>Retour au radar</a>
    </div>
  {/if}
</Mobile>

<style>
  .rond { position: relative; width: 124px; height: 124px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; color: #06080f; background: #4ade80; box-shadow: 0 0 0 10px rgba(74, 222, 128, 0.18), 0 30px 60px -20px rgba(74, 222, 128, 0.8); animation: pop 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }
</style>
