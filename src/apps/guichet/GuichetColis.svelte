<script lang="ts">
  import './guichet.css';
  import { app, aujourdhui, maintenant } from '../../data/store.svelte.ts';
  import { tick } from 'svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { caisseOuverte, ligneDe } from '../../domain/actions.ts';
  import { TAILLES, SUPPLEMENT_ASSURANCE, SUPPLEMENT_MOTO } from '../../core/colis.ts';
  import { fcfa } from '../../core/money.ts';
  import { libelleErreur, normaliserTel } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Lecture from './Lecture.svelte';
  import Etiquette from './Etiquette.svelte';
  import { dockAgent } from './dock.ts';
  import { etat } from './etat.ts';
  import { compterImpression, contexte, departsVers, enregistrerColis, nomGare, prixDuColis, relaisDe } from './actions.ts';

  const ctx = $derived(contexte()), agent = $derived(ctx.agent);
  const caisse = $derived(agent ? caisseOuverte(agent.id) : undefined);
  const gareId = $derived(agent?.gareId ?? '');
  const compagnie = $derived(app.monde.compagnies.find((c) => c.id === agent?.compagnieId)?.nom ?? 'AfriMove');
  const villes = $derived([...new Set(app.monde.lignes.filter((l) => l.gareDe === gareId && l.actif).map((l) => l.vers))]);

  let colisId = $state(param('colis') ?? '');
  let taille = $state<keyof typeof TAILLES>('M'), vers = $state(''), departId = $state(''), remise = $state<string>('auto'), assurance = $state(false), moto = $state(false);
  let expNom = $state(''), expTel = $state(''), destNom = $state(''), destTel = $state(''), erreur = $state(''), occupe = $state(false);
  const ville = $derived(vers || villes[0] || '');
  const departs = $derived(departsVers(gareId, ville, 4));
  const depart = $derived(departs.find((d) => d.id === departId) ?? departs[0]);
  const relais = $derived(relaisDe(ville));
  const remiseEff = $derived(!relais.length ? 'gare' : remise);
  const relaisChoisi = $derived(remiseEff === 'auto' ? relais[0]?.id : remiseEff === 'gare' ? undefined : remiseEff);
  const prix = $derived(prixDuColis(taille, { moto, assurance }));
  const colis = $derived(colisId ? app.monde.colis.find((c) => c.id === colisId) : undefined);
  const destTelNorm = $derived(normaliserTel(destTel));
  const copies = $derived(colis ? (etat().copies[colis.id] ?? 0) : 0);
  const maintenantJour = () => { const d = new Date(maintenant()); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const remiseLibelle = $derived(relaisChoisi ? `relais Chez ${app.monde.personnes.find((p) => p.id === relaisChoisi)?.prenom}` : `gare ${ville}`);

  function imprimer(cle: string) { compterImpression(cle); if (typeof window.print === 'function') window.print(); }
  async function encaisser() {
    if (!agent || ctx.lecture) return; erreur = '';
    if (!destNom.trim() || !destTelNorm) { erreur = 'Nom et téléphone (9 chiffres) du destinataire à renseigner'; return; }
    if (expTel.trim() && !normaliserTel(expTel)) { erreur = 'Téléphone de l’expéditeur illisible'; return; }
    occupe = true;
    try {
      const c = enregistrerColis({ agentId: agent.id, expediteur: { nom: expNom, tel: expTel }, destinataire: { nom: destNom, tel: destTel }, taille, options: { moto, assurance }, vers: ville, relaisId: relaisChoisi, departId: depart?.id });
      colisId = c.id; montrer(`Colis ${c.code} encaissé · ${fcfa(c.prix)} F`); await tick(); imprimer(c.id);
    } catch (e) { erreur = libelleErreur(e); } finally { occupe = false; }
  }
  function suivant() { colisId = ''; expNom = expTel = destNom = destTel = ''; assurance = moto = false; taille = 'M'; erreur = ''; if (param('colis')) aller('/guichet/colis', { remplacer: true }); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const dateDepart = $derived(depart ? `${depart.jour === aujourdhui() ? '' : 'demain '}${depart.heure}` : '');
</script>

<Mobile titre="Colis au guichet" sous={colis ? `colis ${colis.code}` : depart ? `part avec le ${depart.heure} ${ligneDe(depart).vers}` : 'pas de départ à venir'} retourVers="/guichet" dock={dockAgent()}>
  {#snippet droite()}<span class="pl {colis ? 'ok' : 'wa'}">{colis ? (copies > 1 ? `étiquette · copie ${copies}` : 'colis enregistré') : 'à encaisser'}</span>{/snippet}
  {#if ctx.lecture}<Lecture {agent} />{/if}

  {#if !colis && !caisse && !ctx.lecture}
    <div class="gl col g12"><span class="pl wa">caisse fermée</span><p class="t14">Le colis est encaissé en espèces : ouvre ta caisse d’abord.</p><a class="b p" href="/caisse" onclick={(e) => lien(e, '/caisse')}>Ouvrir la caisse</a></div>
  {:else if !colis}
    <div class="sz" role="group" aria-label="Taille du colis">
      {#each Object.entries(TAILLES) as [k, t] (k)}<button type="button" class:on={taille === k} aria-pressed={taille === k} onclick={() => (taille = k as keyof typeof TAILLES)}>{k} · {fcfa(t.prix)} F<small>{t.nom.split(' · ')[1]}</small></button>{/each}
    </div>
    <div class="gl col g8" style="padding: 10px 12px">
      <span class="lab">Expéditeur</span>
      <div class="row g8"><label class="fld grow"><span class="t12 mut">Nom</span><input class="inp" bind:value={expNom} placeholder="Client du guichet" autocomplete="off" /></label><label class="fld grow"><span class="t12 mut">Téléphone</span><input class="inp" bind:value={expTel} inputmode="tel" placeholder="sans téléphone" autocomplete="off" /></label></div>
    </div>
    <div class="gl col g8" style="padding: 10px 12px">
      <span class="lab">Destinataire</span>
      <div class="row g8"><label class="fld grow"><span class="t12 mut">Nom</span><input class="inp" bind:value={destNom} placeholder="Maman E." autocomplete="off" /></label><label class="fld grow"><span class="t12 mut">Téléphone</span><input class="inp" bind:value={destTel} inputmode="tel" placeholder="6 77 10 22 33" autocomplete="off" aria-invalid={destTel.trim() !== '' && !destTelNorm} /></label></div>
    </div>
    <div class="gl col g8" style="padding: 10px 12px">
      <span class="lab" id="lab-dest">Destination et remise</span>
      <div class="chips g-fix" role="group" aria-labelledby="lab-dest">{#each villes as v (v)}<button type="button" class="ch" class:on={ville === v} aria-pressed={ville === v} onclick={() => { vers = v; departId = ''; remise = 'auto'; }}>{v}</button>{/each}</div>
      <label class="fld"><span class="t12 mut">Départ du bus</span>
        <select class="inp" value={depart?.id ?? ''} onchange={(e) => (departId = e.currentTarget.value)}>{#each departs as d (d.id)}<option value={d.id}>{d.heure} {d.jour !== departs[0].jour ? '(demain) ' : ''}· {ligneDe(d).vers}</option>{:else}<option value="">Aucun départ à venir</option>{/each}</select></label>
      <label class="fld"><span class="t12 mut">Remise</span>
        <select class="inp" value={remiseEff} onchange={(e) => (remise = e.currentTarget.value)}>{#if relais.length}<option value="auto">relais Chez {relais[0].prenom} · {relais[0].zone}</option>{#each relais.slice(1) as r (r.id)}<option value={r.id}>relais Chez {r.prenom} · {r.zone}</option>{/each}{/if}<option value="gare">à la gare de {ville}</option></select></label>
    </div>
    <div class="gl row sp" style="min-height: 56px"><span class="col"><span class="t14 b7">Assurance 50 000 F</span><span class="t12 mut">+ {fcfa(SUPPLEMENT_ASSURANCE)} F</span></span><button type="button" class="sw" class:on={assurance} role="switch" aria-checked={assurance} aria-label="Assurance" onclick={() => (assurance = !assurance)}></button></div>
    {#if app.monde.params.modules.moto}<div class="gl row sp" style="min-height: 56px"><span class="col"><span class="t14 b7">Livraison moto</span><span class="t12 mut">+ {fcfa(SUPPLEMENT_MOTO)} F</span></span><button type="button" class="sw" class:on={moto} role="switch" aria-checked={moto} aria-label="Livraison moto" onclick={() => (moto = !moto)}></button></div>{/if}
    <div class="gl ac row sp"><span class="col"><span class="lab">À encaisser</span><span class="ttl t24" aria-live="polite">{fcfa(prix)} F</span></span><span class="t12 mut">espèces · {remiseLibelle}</span></div>
    <div class="g-papier"><Etiquette {compagnie} apercu={{ taille, depart: nomGare(gareId), arrivee: `${ville} · ${remiseLibelle}`, destinataire: { nom: destNom || '—', tel: destTelNorm ?? '' }, expediteur: { nom: expNom, tel: normaliserTel(expTel) ?? '' }, jour: `${maintenantJour()} ${dateDepart}` }} /></div>
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    <button type="button" class="b p" disabled={occupe || ctx.lecture || !depart} onclick={encaisser}>Encaisser {fcfa(prix)} F · imprimer l’étiquette</button>
    {#if !depart}<span class="t12 wac">Aucun départ à venir vers {ville} : le colis ne peut pas partir.</span>{/if}
  {:else}
    <div class="g-papier a-imprimer"><Etiquette {colis} {compagnie} /></div>
    <div class="gl col g4"><span class="t14 b7">{fcfa(colis.prix)} F encaissés en espèces</span><span class="t13 mut">Le colis est déposé et part avec le prochain bus. Le destinataire reçoit le code de retrait par SMS.</span></div>
    <button type="button" class="b s" onclick={() => imprimer(colis.id)}>{copies ? 'Réimprimer l’étiquette' : 'Imprimer l’étiquette'}</button>
    <button type="button" class="b p" onclick={suivant}>Colis suivant</button>
  {/if}
  <a class="b g" href="/depot" onclick={(e) => lien(e, '/depot')}>Colis déjà payé dans l’app ? Scanner</a>
</Mobile>

<style>
  .sz { display: flex; gap: 8px; }
  .sz button { flex: 1; min-height: 60px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #b7c0db; font: 700 14px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .sz button small { font: 500 11px 'Sora Variable', 'Sora', sans-serif; opacity: 0.85; }
  .sz .on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; }
  select.inp { appearance: auto; }
</style>
