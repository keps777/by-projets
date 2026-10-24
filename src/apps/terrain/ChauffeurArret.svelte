<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { ARRET_MAX_MIN, dureeArret, supportBillet } from '../../core/terrain.ts';
  import { aBordIds } from './commun.ts';
  import { avancerColis, billetParId, heureLocale, personneCourante } from '../../domain/actions.ts';
  import { arriverArret, basculerDescente, departEnCours, etapeDe, monterAuArret, prolongerArret, repartir, signalerIncident, TYPES_INCIDENT, bilanVentes } from './actions.ts';
  import { aujourdhui, arretsDe, fcfaF, initiales, mouvementsArret, nbABord, nomPassager } from './commun.ts';
  import { lireSuivi, lireTerrain } from './etat.ts';
  import { dockAgent } from './dock.ts';

  let maintenantMs = $state(maintenant());
  $effect(() => { const t = setInterval(() => (maintenantMs = maintenant()), 1000); return () => clearInterval(t); });
  const agent = $derived(personneCourante());
  const depart = $derived(agent ? departEnCours(agent.id, 'chauffeur', aujourdhui()) : undefined);
  const suivi = $derived(depart ? lireSuivi(depart.id) : undefined);
  const etape = $derived(depart && suivi ? etapeDe(depart, suivi) : 'quai');
  const arrets = $derived(depart ? arretsDe(depart) : []);
  const arret = $derived(suivi ? arrets[Math.min(suivi.k, arrets.length - 1)] : undefined);
  const mouv = $derived(depart && suivi ? mouvementsArret(depart, suivi.k, lireTerrain().montees) : { descendent: [], montent: [] });
  const abord = $derived(depart ? nbABord(depart.id) : 0);
  const ids = $derived(depart ? aBordIds(depart.id) : []);
  const descendants = $derived.by(() => {
    const extra = (suivi?.descendus ?? []).filter((id) => !mouv.descendent.some((b) => b.id === id)).map((id) => billetParId(id)).filter((b) => !!b);
    return [...mouv.descendent, ...extra];
  });
  const autres = $derived(ids.map((id) => billetParId(id)).filter((b) => !!b && !descendants.some((x) => x.id === b.id)));
  const duree = $derived(suivi?.arriveeArretA ? dureeArret(maintenantMs - suivi.arriveeArretA) : '0:00');
  const depasse = $derived(suivi?.arriveeArretA ? (maintenantMs - suivi.arriveeArretA) / 60_000 > ARRET_MAX_MIN : false);
  const colis = $derived(depart && arret ? app.monde.colis.filter((c) => c.departId === depart.id && c.arrivee.includes(arret.nom) && c.statut !== 'annule') : []);
  const convoyeur = $derived(depart?.convoyeurId ? bilanVentes(depart.convoyeurId, depart.id) : null);
  const incidents = $derived(suivi?.incidents.filter((i) => arret && i.arret === arret.nom) ?? []);
  let incidentOuvert = $state(false), typeIncident = $state<string>(TYPES_INCIDENT[0]), noteIncident = $state(''), ajout = $state('');

  function arrive() { if (depart && agent) arriverArret(depart.id, agent.id); }
  function monter(id: string) { if (!depart || !agent) return; const r = monterAuArret(depart.id, id, agent.id); montrer(r.statut === 'ok' ? 'Voyageur à bord' : r.message, r.statut === 'ok' ? 'ok' : 'er'); }
  function deposer(id: string) { if (!agent || !arret) return; avancerColis(id, 'au_relais', `Relais ${arret.nom}`, agent.id); montrer('Colis déposé au relais'); }
  function envoyer() { if (!depart || !agent) return; signalerIncident(depart.id, typeIncident, noteIncident, agent.id); incidentOuvert = false; noteIncident = ''; montrer('Incident signalé à la gare', 'wa'); }
  function repart() { if (!depart || !agent) return; repartir(depart.id, agent.id); aller('/chauffeur'); }
  function ajouter() { if (depart && ajout) { basculerDescente(depart.id, ajout); ajout = ''; } }
  const detail = (b: { siege: string | null; canal: string }) => `${b.siege ?? 'sans place'} · ${({ app: 'app', papier: 'papier', sms: 'SMS' } as const)[supportBillet(b.canal)]}`;
</script>

<svelte:window onkeydown={(e) => (e.key === 'Escape') && (incidentOuvert = false)} />
<Mobile titre={arret && etape === 'arret' ? `Arrêt · ${arret.nom}` : 'Arrêt'} sous={arret && etape === 'arret' ? `${arret.lieu} · prévu ${arret.prevu}${suivi?.arriveeArretA ? ` · arrivé ${heureLocale(suivi.arriveeArretA)}` : ''}` : ''} retourVers="/chauffeur" dock={dockAgent('chauffeur', 'arret')}>
  {#snippet droite()}{#if depart && etape === 'arret'}<span class="pl inf">{abord} à bord</span>{/if}{/snippet}
  {#if !depart}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="pin" taille={56} /></div><span class="ttl t20">Pas de départ aujourd’hui</span></div>
  {:else if etape !== 'arret'}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="pin" taille={56} /></div>
      <span class="ttl t20">{etape === 'termine' ? 'Trajet terminé' : etape === 'quai' ? 'Le bus n’est pas encore parti' : 'Tu n’es pas à un arrêt'}</span>
      <span class="t14 mut">{etape === 'route' ? `Prochain arrêt : ${arret?.nom} · ${arret?.prevu}.` : etape === 'quai' ? 'Démarre le trajet depuis la feuille de route.' : 'Il n’y a plus d’arrêt à faire.'}</span></div>
    {#if etape === 'route'}<button type="button" class="b p" onclick={arrive}>Arrivé à {arret?.nom}</button>{/if}
    <a class="b s" href="/chauffeur" onclick={(e) => { e.preventDefault(); aller('/chauffeur'); }}>Feuille de route</a>
  {:else}
    <div class="gl ac row sp">
      <span class="col"><span class="lab">Temps d’arrêt</span><span class="tm" class:erc={depasse} aria-live="off">{duree}</span><span class="t12 {depasse ? 'erc' : 'mut'}">{depasse ? `au-delà de ${ARRET_MAX_MIN} min · repars vite` : `max ${ARRET_MAX_MIN} min`}{depart.convoyeurId ? ' · le convoyeur vend' : ''}</span></span>
      <button class="b s sm" type="button" onclick={() => depart && prolongerArret(depart.id)}>+1 min (démo)</button>
    </div>
    <span class="lab">Descendent ici · {descendants.length}</span>
    <div class="gl col" style="gap: 0">
      {#each descendants as b, i (b.id)}
        <div class="px"><span class="av sm" class:hot={i % 2}>{initiales({ nom: nomPassager(b).split(' ').at(-1) ?? '', prenom: nomPassager(b).split(' ')[0] })}</span><span class="col grow"><span class="t14 b7 ell">{nomPassager(b)} · {b.siege ?? 'sans place'}</span><span class="t12 mut">billet {detail(b)}</span></span>
          <button type="button" class="sw" class:on={suivi?.descendus.includes(b.id)} role="switch" aria-checked={!!suivi?.descendus.includes(b.id)} aria-label="{nomPassager(b)} descendu" onclick={() => depart && basculerDescente(depart.id, b.id)}></button></div>
      {:else}<span class="t13 mut" style="padding: 10px 0">Personne ne descend ici d’après les billets.</span>{/each}
    </div>
    {#if autres.length}
      <div class="row g8"><select class="inp" aria-label="Autre voyageur qui descend" bind:value={ajout} style="min-height: 46px"><option value="">Un autre voyageur descend…</option>{#each autres as b (b!.id)}<option value={b!.id}>{nomPassager(b!)} · {b!.siege ?? 'sans place'}</option>{/each}</select><button type="button" class="b s sm" disabled={!ajout} onclick={ajouter}>Ajouter</button></div>
    {/if}
    <span class="lab">Montent ici · {mouv.montent.length + colis.length} {mouv.montent.length ? (mouv.montent.length > 1 ? 'réservés' : 'réservé') : 'attendu'}</span>
    <div class="gl col" style="gap: 0">
      {#each mouv.montent as b (b.id)}
        <div class="px">{#if b.statut === 'scanne'}<span class="pl ok">ok</span>{:else}<span class="pl wa">attendu</span>{/if}<span class="grow t14 ell">{nomPassager(b)} · {detail(b)}</span>
          {#if b.statut !== 'scanne'}<button type="button" class="b s sm" onclick={() => monter(b.id)}>Monté</button>{/if}</div>
      {/each}
      {#each colis as c (c.id)}
        <div class="px"><span class="pl {c.statut === 'au_relais' || c.statut === 'livre' ? 'ok' : 'wa'}">{c.statut === 'au_relais' || c.statut === 'livre' ? 'déposé' : 'à déposer'}</span><span class="grow t14 ell">Colis {c.code} · {c.arrivee}</span>
          {#if c.statut !== 'au_relais' && c.statut !== 'livre'}<button type="button" class="b s sm" onclick={() => deposer(c.id)}>Déposé</button>{/if}</div>
      {/each}
      {#if !mouv.montent.length && !colis.length}<span class="t13 mut" style="padding: 10px 0">Personne n’est attendu à cet arrêt.</span>{/if}
    </div>
    {#if convoyeur}<div class="gl row sp"><span class="col"><span class="t14 b6">Ventes du convoyeur</span><span class="t12 mut">{convoyeur.n} billet{convoyeur.n > 1 ? 's' : ''}{convoyeur.enFile ? ` · ${convoyeur.enFile} pas encore synchronisé${convoyeur.enFile > 1 ? 's' : ''}` : ''}</span></span><span class="ttl t18 okc">{fcfaF(convoyeur.total)}</span></div>{/if}
    {#each incidents as i (i.id)}<div class="gl row g8"><span class="pl wa">incident</span><span class="t13 grow">{i.type}{i.note ? ` · ${i.note}` : ''} · {heureLocale(i.ts)}</span></div>{/each}
    <button type="button" class="b s" onclick={() => (incidentOuvert = true)}><Icone nom="alerte" taille={20} /> Signaler un incident</button>
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" onclick={repart}>Repartir · {abord} à bord</button>
    </div>
  {/if}
</Mobile>

{#if incidentOuvert}
  <div class="voile" role="presentation" onclick={() => (incidentOuvert = false)}></div>
  <div class="sheet pop" role="dialog" aria-modal="true" aria-label="Signaler un incident">
    <span class="grab"></span><span class="ttl t18">Signaler un incident</span>
    <div class="chips fixe" style="flex-wrap: wrap" role="group" aria-label="Type d’incident">{#each TYPES_INCIDENT as t (t)}<button type="button" class="ch" class:on={typeIncident === t} onclick={() => (typeIncident = t)}>{t}</button>{/each}</div>
    <label class="fld"><span class="lab">Précision (facultatif)</span><textarea class="inp" style="padding: 12px 14px" rows="2" bind:value={noteIncident} placeholder="Ex. pneu avant gauche, attente du dépanneur"></textarea></label>
    <div class="row g8"><button type="button" class="b s" onclick={() => (incidentOuvert = false)}>Annuler</button><button type="button" class="b p" onclick={envoyer}>Prévenir la gare</button></div>
  </div>
{/if}

<style>
  .tm { font: 700 56px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.05em; }
  .px { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); min-height: 48px; }
  .px:last-child { border: 0; }
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 40; }
  .pop { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); z-index: 41; margin: 0; }
  select.inp { appearance: auto; }
</style>
