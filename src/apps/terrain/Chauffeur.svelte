<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { hhmm, minutes } from '../../core/retard.ts';
  import { VITESSE_MAX } from '../../core/terrain.ts';
  import { billetsDuDepart, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { accelerer, arriverArret, blocageDepart, checklistComplete, CHECKLIST, choisirDepartRoute, cocher, declarerRetard, departEnCours, etapeDe, feuilleDuJour, partir, signalerIncident } from './actions.ts';
  import { aujourdhui, arretsDe, billetsPayes, heureReelle, libelleDepart, mouvementsArret, nbABord } from './commun.ts';
  import { lireSuivi, lireTerrain } from './etat.ts';
  import { dockAgent } from './dock.ts';

  let tick = $state(0);
  $effect(() => { const t = setInterval(() => tick++, 10_000); return () => clearInterval(t); });
  const agent = $derived(personneCourante());
  const liste = $derived(agent ? (void tick, feuilleDuJour(agent.id, 'chauffeur', aujourdhui())) : []);
  const depart = $derived(agent ? departEnCours(agent.id, 'chauffeur', aujourdhui()) : undefined);
  const suivi = $derived(depart ? lireSuivi(depart.id) : undefined);
  const etape = $derived(depart && suivi ? etapeDe(depart, suivi) : 'quai');
  const arrets = $derived(depart ? arretsDe(depart) : []);
  const bus = $derived(depart ? app.monde.bus.find((b) => b.id === depart.busId) : undefined);
  const abord = $derived(depart ? nbABord(depart.id) : 0);
  const vendus = $derived(depart ? billetsPayes(depart.id).length : 0);
  const nonScannes = $derived(depart ? billetsDuDepart(depart.id).filter((b) => b.statut === 'valide').length : 0);
  const blocage = $derived(depart ? (void tick, blocageDepart(depart)) : null);
  const vite = $derived((suivi?.vitesse ?? 0) > VITESSE_MAX);
  const k = $derived(Math.min(suivi?.k ?? 1, Math.max(0, arrets.length - 1)));
  const pill = $derived(etape === 'termine' ? { t: 'arrivé', c: 'ok' } : etape === 'arret' ? { t: 'à l’arrêt', c: 'inf' } : etape === 'route' ? (vite ? { t: 'trop vite', c: 'er' } : { t: 'en route', c: 'ok' }) : depart?.statut === 'embarquement' ? { t: 'à quai', c: 'wa' } : { t: 'prévu', c: 'wa' });
  const RETARDS = [10, 15, 20, 30, 45];
  const raison = $derived(blocage === 'pas_ouvert' && depart ? `Embarquement ouvert à ${hhmm(minutes(depart.heure) + depart.retardMin - 30)}` : blocage === 'checklist' ? 'Termine la check-list pour partir' : blocage === 'trop_tot' && depart ? `Départ prévu à ${heureReelle(depart)} : trop tôt` : '');
  const nbCases = $derived(suivi ? CHECKLIST.filter((c) => suivi.checklist[c.id]).length : 0);

  const sousStop = (i: number) => { if (!depart) return ''; if (i === 0) return 'départ'; if (i === arrets.length - 1) return 'terminus'; const m = mouvementsArret(depart, i, lireTerrain().montees); const p: string[] = []; if (m.descendent.length) p.push(`${m.descendent.length} descendent`); if (m.montent.length) p.push(`${m.montent.length} montent`); return p.join(' · '); };
  const classeStop = (i: number) => (etape === 'termine' || (etape !== 'quai' && i < k) ? 'ok' : (etape === 'quai' ? i === 0 : i === k) ? 'cur' : '');

  function toggleCase(id: string) { if (depart) cocher(depart.id, id); }
  function declarer(m: number) { if (!depart || !agent) return; declarerRetard(depart.id, m, agent.id); montrer(`Retard de ${m} min annoncé aux voyageurs`, 'wa'); }
  function demarrer() {
    if (!depart || !agent) return;
    try { const d = partir(depart.id, agent.id); montrer(`Bon voyage ! ${nbABord(d.id)} voyageur${nbABord(d.id) > 1 ? 's' : ''} à bord`); } catch (e) { montrer(({ checklist: 'Termine la check-list', pas_ouvert: 'L’embarquement n’est pas encore ouvert', trop_tot: 'Trop tôt pour partir', deja_parti: 'Ce bus est déjà parti' } as Record<string, string>)[(e as Error).message] ?? 'Départ impossible', 'er'); }
  }
  function arrive() { if (!depart || !agent) return; arriverArret(depart.id, agent.id); if (lireSuivi(depart.id).etape === 'arret') aller('/chauffeur/arret'); else montrer('Terminus : bon retour !'); }
  function sos() { if (!depart || !agent) return; signalerIncident(depart.id, 'SOS', 'Demande d’aide immédiate du chauffeur', agent.id); montrer('SOS envoyé : la gare est prévenue', 'er'); }
</script>

<Mobile titre={depart ? `Bus ${libelleDepart(depart)}` : 'Chauffeur'} sous={depart && agent ? `Chauffeur ${agent.prenom} · ${bus?.immat ?? ''} · ${abord} à bord` : agent ? `Chauffeur ${agent.prenom}` : ''} sansRetour dock={dockAgent('chauffeur', 'route')}>
  {#snippet droite()}{#if depart}<span class="pl {pill.c}"><span class="dot"></span>{pill.t}</span>{/if}{/snippet}
  {#if !depart}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="bus" taille={56} /></div><span class="ttl t20">Pas de départ aujourd’hui</span><span class="t14 mut">Aucun départ ne t’est confié pour la journée. Ton superviseur peut t’en affecter un.</span></div>
  {:else}
    {#if liste.length > 1}
      <div class="chips fixe" role="tablist" aria-label="Mes départs du jour">{#each liste as d (d.id)}<button type="button" role="tab" aria-selected={d.id === depart.id} class="ch" class:on={d.id === depart.id} onclick={() => choisirDepartRoute(d.id)}>{libelleDepart(d)}</button>{/each}</div>
    {/if}
    {#if depart.statut === 'annule'}
      <div class="gl col g8"><span class="pl er">annulé</span><span class="t14">Ce départ a été annulé par la compagnie.</span></div>
    {:else if etape === 'quai'}
      <div class="gl ac col g8">
        <div class="row sp"><span class="col"><span class="lab">À bord</span><span class="ttl t24">{abord} / {vendus}</span><span class="t12 mut">voyageurs scannés sur billets vendus</span></span>
          <span class="col" style="align-items: flex-end"><span class="lab">Départ</span><span class="ttl t24">{heureReelle(depart)}</span>{#if depart.retardMin > 0}<span class="t12 wac">+{depart.retardMin} min annoncées</span>{:else}<span class="t12 mut">à l’heure</span>{/if}</span></div>
        <div class="bar fixe" role="progressbar" aria-label="Voyageurs scannés" aria-valuemin="0" aria-valuemax={vendus} aria-valuenow={abord}><i style="width: {vendus ? Math.round((abord / vendus) * 100) : 0}%"></i></div>
        {#if nonScannes > 0}<span class="t12 wac">{nonScannes} billet{nonScannes > 1 ? 's' : ''} payé{nonScannes > 1 ? 's' : ''} pas encore scanné{nonScannes > 1 ? 's' : ''} au quai.</span>{/if}
      </div>
      <div class="row sp"><span class="lab">Check-list de départ</span><span class="t12 mut mono">{nbCases} / {CHECKLIST.length}</span></div>
      <div class="gl col" style="gap: 0">
        {#each CHECKLIST as c (c.id)}
          <label class="li chk"><input type="checkbox" checked={!!suivi?.checklist[c.id]} onchange={() => toggleCase(c.id)} /><span class="col grow"><span class="t14 b6">{c.libelle}</span><span class="t12 mut">{c.id === 'comptage' ? `${abord} scanné${abord > 1 ? 's' : ''} sur ${vendus} vendu${vendus > 1 ? 's' : ''}` : c.sous}</span></span></label>
        {/each}
      </div>
      <span class="lab">Annoncer un retard</span>
      <div class="chips fixe" role="group" aria-label="Retard à annoncer">{#each RETARDS as m (m)}<button type="button" class="ch" class:on={depart.retardMin === m} onclick={() => declarer(m)}>+{m} min</button>{/each}</div>
      <span class="t12 mut">Les voyageurs ayant un billet sont prévenus tout de suite.</span>
      <div class="col g8" style="margin-top: auto">
        <button type="button" class="b p" disabled={!!blocage} onclick={demarrer}>Départ · {abord} à bord</button>
        {#if raison}<span class="t13 mut c" role="status">{raison}</span>{/if}
      </div>
    {:else if etape === 'termine'}
      <div class="center"><div class="ill ok" aria-hidden="true"><Icone nom="ok" taille={64} trait={2.4} /></div><span class="ttl t20">Trajet terminé</span>
        <span class="t14 mut">{ligneDe(depart).de} → {ligneDe(depart).vers} · {abord} voyageur{abord > 1 ? 's' : ''} arrivé{abord > 1 ? 's' : ''}. Bon repos !</span></div>
    {:else}
      <div class="gl ac row sp">
        <span class="col"><span class="lab">Vitesse</span><span class="spd"><b>{suivi?.vitesse ?? 0}</b><span class="t14 mut">km/h</span></span><span class="t12 {vite ? 'erc' : 'okc'}">{etape === 'arret' ? 'à l’arrêt' : vite ? `au-dessus de ${VITESSE_MAX} · la gare est prévenue` : `dans la limite · ${VITESSE_MAX} km/h`}</span></span>
        <span class="col" style="align-items: flex-end"><span class="lab">{etape === 'arret' ? 'Arrêt en cours' : 'Prochain arrêt'}</span><span class="ttl t20">{arrets[k]?.nom}</span><span class="t12 mut">{arrets[k]?.prevu}{sousStop(k) ? ` · ${sousStop(k)}` : ''}</span></span>
      </div>
      <div class="row g8">
        <button type="button" class="b s sm grow" onclick={() => depart && accelerer(depart.id)} disabled={etape === 'arret'}>Accélérer (démo)</button>
        <button type="button" class="b s sm grow" onclick={arrive} disabled={etape === 'arret'}>{k >= arrets.length - 1 ? 'Arrivé au terminus' : 'Arrivé à l’arrêt'}</button>
      </div>
    {/if}
    <span class="lab">Feuille de route</span>
    <div class="gl"><ol class="tl" aria-label="Arrêts du trajet">
      {#each arrets as a, i (a.nom)}<li class="st {classeStop(i)}" aria-current={classeStop(i) === 'cur' ? 'step' : undefined}><span class="grow">{a.nom}</span><span class="t12 mut">{sousStop(i)}</span><span class="mono t13">{a.prevu}</span></li>{/each}
    </ol></div>
    {#if etape === 'route' || etape === 'arret'}
      <div class="row g8" style="margin-top: auto">
        <button type="button" class="b p grow" disabled={etape !== 'arret'} onclick={() => aller('/chauffeur/arret')}>Ouvrir l’arrêt</button>
        <button type="button" class="b sos grow" onclick={sos}>SOS gare</button>
      </div>
    {/if}
  {/if}
</Mobile>

<style>
  .spd { display: flex; align-items: baseline; gap: 6px; }
  .spd b { font: 700 54px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.05em; }
  .tl { position: relative; padding-left: 30px; display: flex; flex-direction: column; list-style: none; margin: 0; }
  .tl:before { content: ''; position: absolute; left: 11px; top: 14px; bottom: 14px; width: 2px; background: rgba(255, 255, 255, 0.12); }
  .st { position: relative; display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 4px 0; color: #b7c0db; }
  .st:before { content: ''; position: absolute; left: -25px; top: 50%; width: 14px; height: 14px; margin-top: -7px; border-radius: 50%; background: #05070d; border: 3px solid rgba(255, 255, 255, 0.3); }
  .st.ok { color: #8e99bb; } .st.ok:before { background: #4ade80; border-color: #4ade80; }
  .st.cur { color: #f2f4ff; font-weight: 600; } .st.cur:before { background: #3de0ff; border-color: #3de0ff; box-shadow: 0 0 14px #3de0ff; }
  .sos { background: #ff6b6b; color: #06080f; }
  .chk { cursor: pointer; } .chk input { flex: none; width: 24px; height: 24px; accent-color: #3de0ff; }
</style>
