<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { codeAffiche } from '../../core/terrain.ts';
  import { departParId, heureLocale, ligneDe, personneCourante, placesLibres } from '../../domain/actions.ts';
  import { abandonnerVente, bilanVentes, choisirDepartRoute, departEnCours, erreurLisible, especesRemises, etapeDe, feuilleDuJour, prixAuDepart, reglerHorsLigne, remettreEspecesConvoyeur, smsCode, synchroniser, tauxDe, vendreEnRoute, ventesRecentes } from './actions.ts';
  import { aujourdhui, arretsDe, fcfaF, libelleDepart, mouvementsArret, nbABord } from './commun.ts';
  import { convoyeurEtat, lireConvoyeur, lireSuivi, lireTerrain } from './etat.ts';
  import { dockAgent } from './dock.ts';

  const agent = $derived(personneCourante());
  const liste = $derived(agent ? feuilleDuJour(agent.id, 'convoyeur', aujourdhui()) : []);
  const depart = $derived(agent ? departEnCours(agent.id, 'convoyeur', aujourdhui()) : undefined);
  const etat = $derived(lireConvoyeur());
  const suivi = $derived(depart ? lireSuivi(depart.id) : undefined);
  const etape = $derived(depart && suivi ? etapeDe(depart, suivi) : 'quai');
  const arrets = $derived(depart ? arretsDe(depart) : []);
  const k = $derived(Math.min(Math.max(1, suivi?.k ?? 1), arrets.length - 1));
  const candidats = $derived(arrets.map((a, i) => ({ a, i })).filter(({ i }) => i >= k && i < arrets.length - 1));
  const sel = $derived(candidats.length ? Math.max(candidats[0].i, Math.min(etat.arret ?? candidats[0].i, candidats.at(-1)!.i)) : -1);
  const bilan = $derived(agent && depart ? bilanVentes(agent.id, depart.id) : null);
  const abord = $derived(depart ? nbABord(depart.id) : 0);
  const libres = $derived(depart ? placesLibres(depart) : 0);
  const file = $derived(etat.file.filter((v) => v.departId === depart?.id));
  const recentes = $derived(agent && depart ? ventesRecentes(agent.id, depart.id) : []);
  const prix = $derived(depart && sel >= 0 ? prixAuDepart(depart.id, sel) : 0);
  const vendable = $derived(!!depart && depart.statut !== 'annule' && etape !== 'termine' && sel >= 0 && libres - file.length > 0);
  const aRemettre = $derived(agent && depart && bilan ? Math.max(0, bilan.especes - especesRemises(agent.id, aujourdhui())) : 0);
  let tel = $state(''), nom = $state('');

  $effect(() => {
    const hors = () => { if (!lireConvoyeur().horsLigne) { reglerHorsLigne(true); montrer('Réseau perdu : les ventes seront mises en file', 'wa'); } };
    const en = () => { const r = reglerHorsLigne(false); if (r) montrer(r.envoyees ? `${r.envoyees} vente${r.envoyees > 1 ? 's' : ''} synchronisée${r.envoyees > 1 ? 's' : ''}` : 'Réseau revenu'); };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) hors();
    window.addEventListener('offline', hors); window.addEventListener('online', en);
    return () => { window.removeEventListener('offline', hors); window.removeEventListener('online', en); };
  });
  function basculer() {
    const r = reglerHorsLigne(!etat.horsLigne);
    if (r) montrer(r.echecs ? `${r.envoyees} envoyée(s) · ${r.echecs} en échec` : r.envoyees ? `${r.envoyees} vente${r.envoyees > 1 ? 's' : ''} synchronisée${r.envoyees > 1 ? 's' : ''}` : 'Réseau rétabli', r.echecs ? 'wa' : 'ok'); else montrer('Hors ligne : les ventes partent en file', 'wa');
  }
  function vendre(moyen: 'especes' | 'momo') {
    if (!agent || !depart || sel < 0) return;
    try {
      const { vente, enFile } = vendreEnRoute({ agentId: agent.id, departId: depart.id, arret: sel, moyen, nom, tel });
      montrer(enFile ? `Vente mise en file · code ${codeAffiche(vente.code)}` : `Vendu · ${fcfaF(vente.prix)} · code ${codeAffiche(vente.code)}`, enFile ? 'wa' : 'ok'); nom = ''; tel = '';
    } catch (e) { montrer(erreurLisible(e), 'er'); }
  }
  function sync() { const r = synchroniser(); montrer(r.echecs ? `${r.envoyees} envoyée(s) · ${r.echecs} en échec` : `${r.envoyees} vente${r.envoyees > 1 ? 's' : ''} synchronisée${r.envoyees > 1 ? 's' : ''}`, r.echecs ? 'wa' : 'ok'); }
  function remettre() { if (!agent || !depart) return; const m = remettreEspecesConvoyeur(agent.id, depart.id, aujourdhui()); montrer(m ? `${fcfaF(m)} remis à la gare` : 'Rien à remettre'); }
  const pillTxt = $derived(etat.horsLigne ? 'hors ligne' : etat.file.length ? `${etat.file.length} à sync.` : 'synchronisé');
  const attendus = (i: number) => (depart ? mouvementsArret(depart, i, lireTerrain().montees).montent.filter((b) => b.statut !== 'scanne').length : 0);
</script>

<Mobile titre={depart ? `Convoyeur · bus ${libelleDepart(depart)}` : 'Convoyeur'} sous={agent && depart ? `${agent.prenom} · Bêta Express → ${ligneDe(depart).vers}` : agent ? agent.prenom : ''} sansRetour dock={dockAgent('convoyeur', 'ventes')}>
  {#snippet droite()}<span class="pl {etat.horsLigne ? 'er' : etat.file.length ? 'wa' : 'ok'}"><span class="dot"></span>{pillTxt}</span>{/snippet}
  {#if !depart || !bilan}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="billet" taille={56} /></div><span class="ttl t20">Pas de bus aujourd’hui</span><span class="t14 mut">Aucun départ ne t’est confié pour la journée.</span></div>
  {:else}
    {#if liste.length > 1}<div class="chips fixe" role="tablist" aria-label="Mes bus du jour">{#each liste as d (d.id)}<button type="button" role="tab" aria-selected={d.id === depart.id} class="ch" class:on={d.id === depart.id} onclick={() => choisirDepartRoute(d.id)}>{libelleDepart(d)}</button>{/each}</div>{/if}
    <div class="row g8" style="align-items: stretch">
      <div class="gl grow kc"><span class="lab">À bord</span><span class="ttl t24">{abord} / {depart.capacite}</span></div>
      <div class="gl grow kc"><span class="lab">Vendu en route</span><span class="ttl t24 okc">{fcfaF(bilan.total)}</span><span class="t12 mut">{bilan.n} billet{bilan.n > 1 ? 's' : ''} · commission {tauxDe(agent!.id)} % : {fcfaF(bilan.commission)}</span></div>
    </div>
    <div class="gl row sp g12"><span class="col grow"><span class="t14 b6">Mode hors ligne</span><span class="t12 mut">{etat.horsLigne ? 'Réseau coupé : les ventes attendent dans la file.' : 'Coupe le réseau pour t’entraîner à vendre sans connexion.'}</span></span>
      <button type="button" class="sw" class:on={etat.horsLigne} role="switch" aria-checked={etat.horsLigne} aria-label="Mode hors ligne" onclick={basculer}></button></div>
    <span class="lab">Prochain arrêt · qui monte</span>
    {#if candidats.length}
      <div class="col g8" role="radiogroup" aria-label="Arrêt de montée">
        {#each candidats as { a, i } (a.nom)}
          {@const att = attendus(i)}
          <button type="button" role="radio" aria-checked={i === sel} class="stopb" class:on={i === sel} onclick={() => { convoyeurEtat().arret = i; }}>
            <span class="col grow"><span class="t15 b7">{a.nom}</span><span class="t12 mut">{att ? `${att} réservé${att > 1 ? 's' : ''} dans l’app` : a.lieu}</span></span>
            <span class="col" style="align-items: flex-end"><span class="t14 b7 aq">{fcfaF(prixAuDepart(depart.id, i))}</span><span class="t12 mut3">{a.prevu}</span></span>
          </button>
        {/each}
      </div>
    {:else}<div class="gl"><span class="t14 mut">Plus d’arrêt avant le terminus : plus de vente possible.</span></div>{/if}
    <div class="row g8">
      <label class="fld grow" style="gap: 4px"><span class="lab">Téléphone du passager</span><input class="inp" style="min-height: 46px" type="tel" inputmode="tel" autocomplete="off" bind:value={tel} placeholder="6 90 00 00 00" /></label>
      <label class="fld grow" style="gap: 4px"><span class="lab">Nom (facultatif)</span><input class="inp" style="min-height: 46px" bind:value={nom} autocomplete="off" placeholder="Passager" /></label>
    </div>
    <div class="row g8">
      <button class="sellb" type="button" disabled={!vendable} onclick={() => vendre('especes')}>+1 espèces · {fcfaF(prix)}</button>
      <button class="sellb" type="button" style="background: #ffcc00" disabled={!vendable} onclick={() => vendre('momo')}>+1 MoMo</button>
    </div>
    {#if sel >= 0 && libres - file.length <= 0}<span class="t13 erc" role="alert">Bus complet : plus de place libre.</span>{/if}
    {#if etat.derniere}
      {@const v = etat.derniere}
      <div class="gl col g4" aria-live="polite"><div class="row sp"><span class="t14 b6">Dernier passager · {v.arret}</span><span class="pl {v.enFile ? 'wa' : 'ok'}">{v.enFile ? 'en file' : 'synchronisé'}</span></div>
        <span class="t12 mut">{v.tel ? `SMS ${v.enFile ? 'à envoyer' : 'envoyé'} au ${v.tel}` : 'Pas de téléphone : note le code'} · code <b class="mono">{codeAffiche(v.code)}</b> · {fcfaF(v.prix)} {v.moyen === 'momo' ? 'MoMo' : 'espèces'}</span>
        {#if depart && v.tel}<span class="t12 mut3">{smsCode(v.nom, depart, codeAffiche(v.code), v.arret)}</span>{/if}</div>
    {/if}
    {#if file.length}
      <div class="row sp"><span class="lab">File d’attente · {file.length}</span><button type="button" class="b s sm" onclick={sync} disabled={etat.horsLigne}>Synchroniser</button></div>
      <div class="gl col" style="gap: 0">
        {#each file as v (v.id)}<div class="li"><span class="pl {v.etat === 'echec' ? 'er' : 'wa'}">{v.etat === 'echec' ? 'échec' : 'en file'}</span><span class="col grow"><span class="t14 b7">{arretsDe(departParId(v.departId)!)[v.arret]?.nom} · {fcfaF(v.prix)}</span><span class="t12 {v.erreur ? 'erc' : 'mut'}">{v.erreur ?? `${heureLocale(v.ts)} · ${v.moyen === 'momo' ? 'MoMo à confirmer' : 'espèces'} · ${codeAffiche(v.code)}`}</span></span>{#if v.etat === 'echec'}<button type="button" class="b g sm" onclick={() => abandonnerVente(v.id)}>Retirer</button>{/if}</div>{/each}
      </div>
    {/if}
    {#if recentes.length}
      <span class="lab">Ventes de la route</span>
      <div class="gl col" style="gap: 0">{#each recentes as b (b.id)}<div class="li"><span class="pl ok">ok</span><span class="col grow"><span class="t14 b7">{b.passager.nom} · {fcfaF(b.prix)}</span><span class="t12 mut">{heureLocale(b.creeLe)} · {codeAffiche(b.code)}</span></span></div>{/each}</div>
    {/if}
    <details class="gl"><summary class="t14 b6">Feuille de route du bus</summary>
      <ol class="col g6 stops">{#each arrets as a, i (a.nom)}<li class="row sp"><span class="t14" class:mut={etape !== 'quai' && i < k}>{a.nom}</span><span class="mono t13 mut">{a.prevu}</span></li>{/each}</ol></details>
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b s" onclick={remettre} disabled={aRemettre <= 0}>Remettre les espèces à la gare · {fcfaF(aRemettre)}</button>
      <span class="t12 mut c">Ta commission de {tauxDe(agent!.id)} % ({fcfaF(bilan.commission)}) t’est versée ce soir.</span>
    </div>
    <div class="toast"><span class="bub aq">✓</span><span class="t13 grow">Chaque vente génère un code SMS pour le passager et se synchronise au prochain réseau.</span></div>
  {/if}
</Mobile>

<style>
  .stopb { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; }
  .stopb.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .sellb { flex: 1; min-height: 64px; border-radius: 18px; border: 0; cursor: pointer; color: #06080f; font: 700 16px 'Sora Variable', 'Sora', sans-serif; background: linear-gradient(135deg, #8b7cff, #3de0ff); }
  .sellb:disabled { opacity: 0.45; cursor: not-allowed; }
  summary { cursor: pointer; min-height: 32px; display: flex; align-items: center; }
  .stops { margin: 10px 0 0; padding: 0; list-style: none; }
  .t15 { font-size: 15px; }
</style>
