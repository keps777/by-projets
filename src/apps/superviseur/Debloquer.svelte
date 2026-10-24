<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { attenduDeCaisse, personne, personneCourante } from '../../domain/actions.ts';
  import { numeroGuichet } from '../../core/gare.ts';
  import { fcfa } from '../../core/money.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { debloquerCaisse, suspendreJournee } from './actions.ts';
  import { dockSuperviseur } from './dock.ts';
  import { gareSuivie } from './etat.svelte.ts';
  import Feuille from './Feuille.svelte';
  import { hhmm, va } from './nav.ts';

  const moi = $derived(personneCourante());
  const gareId = $derived(gareSuivie(moi, param('gare')));
  let figee = $state<string | null>(null);
  const idCible = $derived(figee ?? param('caisse') ?? app.monde.caisses.find((c) => c.gareId === gareId && c.statut === 'bloquee')?.id);
  const caisse = $derived(app.monde.caisses.find((c) => c.id === idCible));
  const agent = $derived(caisse ? personne(caisse.agentId) : undefined);
  const permis = $derived(!!caisse && (moi?.role === 'patron' || caisse.gareId === moi?.gareId));
  const numero = $derived(caisse ? numeroGuichet(app.monde, caisse.gareId, caisse.agentId) : 0);
  const blocage = $derived(caisse ? app.monde.evenements.find((e) => e.type === 'blocage' && e.ref === caisse.id) : undefined);
  const tentatives = $derived(caisse ? app.monde.evenements.filter((e) => e.type === 'pin_faux' && (e.ref === caisse.id || (e.acteurId === caisse.agentId && e.ts >= caisse.ouvertA))).length : 0);
  const derniereVente = $derived(caisse ? app.monde.billets.filter((b) => b.caisseId === caisse.id).sort((a, b) => b.creeLe - a.creeLe)[0] : undefined);
  const moyenVente = $derived(derniereVente ? app.monde.paiements.find((p) => p.id === derniereVente.paiementId)?.moyen : undefined);
  const dedans = $derived(caisse ? attenduDeCaisse(caisse) : 0);

  let visage = $state<'attente' | 'scan' | 'ok'>('attente'), nouveauPin = $state(true), recompter = $state(true), erreur = $state(''), suspendre = $state(false);
  let fait = $state<{ pin?: string; agent: string } | null>(null), minuteur: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(minuteur));
  function reconnaitre() {
    if (visage === 'scan') return; if (visage === 'ok') { visage = 'attente'; return; }
    visage = 'scan'; minuteur = setTimeout(() => (visage = 'ok'), 1100);
  }
  function debloquer() {
    if (!moi || !caisse) return;
    figee = caisse.id;
    const r = debloquerCaisse(moi.id, caisse.id, { visageReconnu: visage === 'ok', nouveauPin, recompter });
    if (r.ok) { fait = { pin: r.pin, agent: agent?.prenom ?? '' }; erreur = ''; montrer(`Guichet ${numero} débloqué`); } else erreur = r.erreur;
  }
  function suspendreAgent() {
    if (!moi || !agent) return; const r = suspendreJournee(moi.id, agent.id); suspendre = false;
    if (r.ok) { montrer(`${agent.prenom} suspendu pour la journée`, 'wa'); aller('/superviseur/equipe'); } else erreur = r.erreur;
  }
</script>

<Mobile titre={caisse ? `Guichet ${numero} ${fait || caisse.statut === 'ouverte' ? 'débloqué' : 'bloqué'}` : 'Débloquer un guichet'} sous={caisse && agent ? `${agent.prenom} · ${blocage?.texte ?? 'blocage de sécurité'}${blocage ? ` à ${hhmm(blocage.ts)}` : ''}` : ''} retourVers="/superviseur" dock={dockSuperviseur('gare')}>
  {#snippet droite()}{#if caisse}<span class="pl {fait || caisse.statut === 'ouverte' ? 'ok' : 'er'}">{fait || caisse.statut === 'ouverte' ? 'ouvert' : 'bloqué'}</span>{/if}{/snippet}

  {#if !caisse}
    <div class="center"><span class="ill ok"><Icone nom="ok" taille={60} trait={1.8} /></span><span class="t16 b7">Aucun guichet bloqué</span><span class="t13 mut">Un guichet se bloque après 3 PIN faux ou un écart non justifié.</span></div>
    <a class="b p" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a>
  {:else if !permis}
    <div class="gl erc t14" role="alert">Cette caisse n’est pas dans ta gare.</div>
  {:else if fait || caisse.statut === 'ouverte'}
    <div class="center" style="flex: none"><span class="ill ok"><Icone nom="ok" taille={60} trait={1.8} /></span>
      <span class="t16 b7">Guichet {numero} débloqué</span>
      <span class="t13 mut">{agent?.prenom} peut reprendre les ventes{recompter && fait ? ' après avoir recompté sa caisse' : ''} · journalisé</span>
      {#if fait?.pin}<span class="t13 okc">Nouveau PIN envoyé par SMS au {agent ? agent.tel.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : ''}</span>{/if}</div>
    <div class="col g8" style="margin-top: auto"><a class="b p" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a><a class="b g" href="/superviseur/equipe" onclick={va('/superviseur/equipe')}>Voir l’équipe</a></div>
  {:else if caisse.statut !== 'bloquee'}
    <div class="gl t14" role="status">Cette caisse n’est pas bloquée.</div>
  {:else}
    <div class="gl col" style="gap: 0">
      <div class="li kv"><span class="t14">Dernière vente</span><span class="t14 b7">{derniereVente ? `${hhmm(derniereVente.creeLe)} · ${fcfa(derniereVente.prix)} F ${moyenVente === 'especes' ? 'espèces' : (moyenVente ?? '')}` : 'aucune'}</span></div>
      <div class="li kv"><span class="t14">Tentatives</span><span class="t14 b7" class:erc={tentatives >= 3}>{tentatives || '—'}{tentatives ? ' PIN faux' : ''}</span></div>
      <div class="li kv"><span class="t14">Caisse</span><span class="t14 b7">verrouillée · {fcfa(dedans)} F dedans</span></div>
    </div>
    <span class="lab c">1 · {agent?.prenom} se présente à toi</span>
    <button type="button" class="face {visage === 'ok' ? 'ok' : ''}" class:scan={visage === 'scan'} onclick={reconnaitre} aria-label={visage === 'ok' ? `${agent?.prenom} reconnu` : `Reconnaître ${agent?.prenom}`}>
      <Icone nom="visage" taille={52} trait={1.6} />
    </button>
    <span class="t13 mut c" role="status" aria-live="polite">{visage === 'ok' ? `${agent?.prenom} reconnu${agent?.visage ? '' : ' · visage enrôlé à l’instant'}` : visage === 'scan' ? 'Reconnaissance en cours…' : `Touche le cadre : ${agent?.prenom} regarde ton téléphone`}</span>
    <span class="lab c">2 · Tu confirmes</span>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14 b6" id="l-pin">Envoyer un nouveau PIN à {agent?.prenom}</span><button type="button" class="sw" class:on={nouveauPin} role="switch" aria-checked={nouveauPin} aria-labelledby="l-pin" onclick={() => (nouveauPin = !nouveauPin)}></button></div>
      <div class="li"><span class="grow t14 b6" id="l-cnt">Recompter la caisse avant réouverture</span><button type="button" class="sw" class:on={recompter} role="switch" aria-checked={recompter} aria-labelledby="l-cnt" onclick={() => (recompter = !recompter)}></button></div>
    </div>
    {#if erreur}<div class="gl erc t13" role="alert">{erreur}</div>{/if}
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" disabled={visage !== 'ok'} onclick={debloquer}>Débloquer le guichet {numero}</button>
      {#if visage !== 'ok'}<span class="t12 mut c">Reconnais d’abord le visage de {agent?.prenom}.</span>{/if}
      <button type="button" class="b g" onclick={() => (suspendre = true)}>Suspendre {agent?.prenom} pour la journée</button>
    </div>
    <Feuille bind:ouvert={suspendre} titre="Suspendre {agent?.prenom} ?" texte="Son compte est désactivé jusqu’à demain. Sa caisse reste verrouillée." confirmer="Suspendre pour la journée" ton="d" onconfirmer={suspendreAgent} />
  {/if}
</Mobile>

<style>
  .face { position: relative; width: 118px; height: 118px; margin: 0 auto; border-radius: 38px; border: 2px solid rgba(255, 255, 255, 0.2); display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); overflow: hidden; cursor: pointer; color: #f2f4ff; flex: none; }
  .face::before { content: ''; position: absolute; inset: 0; background: conic-gradient(from 0deg, transparent 70%, #3de0ff); opacity: 0.35; }
  .face.scan::before { animation: spin 1.1s linear infinite; opacity: 0.8; }
  .face::after { content: ''; position: absolute; inset: 3px; border-radius: 34px; background: #0b1020; }
  .face :global(svg) { position: relative; z-index: 1; color: #7febff; }
  .face.ok::before { animation: none; background: rgba(74, 222, 128, 0.25); opacity: 1; }
  .face.ok :global(svg) { color: #4ade80; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .kv { align-items: baseline; } .kv > :first-child { flex: none; } .kv > :last-child { flex: 1; text-align: right; overflow-wrap: anywhere; }
  .sw::before { content: ''; position: absolute; inset: -8px -4px; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
