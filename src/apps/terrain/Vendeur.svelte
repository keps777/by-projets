<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { codeAffiche } from '../../core/terrain.ts';
  import { heureLocale, ligneDe, placesLibres, personneCourante, departParId, prixDuDepart } from '../../domain/actions.ts';
  import { bilanVendeur, departsVendables, erreurLisible, libelleDestination, remettreEspeces, tauxDe, vendreAmbulant } from './actions.ts';
  import { fcfaF, gareNom, initiales } from './commun.ts';

  let tick = $state(0);
  $effect(() => { const t = setInterval(() => tick++, 30_000); return () => clearInterval(t); });
  const agent = $derived(personneCourante());
  const deps = $derived(agent ? (void tick, departsVendables(agent.compagnieId, 'Yaoundé')) : []);
  const bilan = $derived(agent ? bilanVendeur(agent.id) : null);
  let momo = $state(false), choisi = $state<string | null>(null), tel = $state(''), nom = $state('');
  const dep = $derived(choisi ? departParId(choisi) : undefined);
  const dernier = $derived(bilan?.dernier);
  const dernierDepart = $derived(dernier ? departParId(dernier.departId) : undefined);
  const moyenDernier = $derived(dernier ? (app.monde.paiements.find((p) => p.id === dernier.paiementId)?.moyen === 'momo' ? 'MoMo' : 'espèces') : '');

  function vendre() {
    if (!agent || !dep) return;
    try { const b = vendreAmbulant({ agentId: agent.id, departId: dep.id, moyen: momo ? 'momo' : 'especes', nom, tel }); montrer(`Vendu · ${fcfaF(b.prix)} · code ${codeAffiche(b.code)}${tel ? ' envoyé par SMS' : ''}`); choisi = null; tel = ''; nom = ''; }
    catch (e) { montrer(erreurLisible(e), 'er'); }
  }
  function remettre() { if (!agent) return; const m = remettreEspeces(agent.id); montrer(m ? `${fcfaF(m)} d’espèces remis à la compagnie` : 'Aucune espèce à remettre'); }
</script>

<svelte:window onkeydown={(e) => (e.key === 'Escape') && (choisi = null)} />
<Mobile enteteLibre={entete} sansRetour>
  {#if bilan && agent}
    <div class="gl ac row sp">
      <span class="col"><span class="lab">Vendu aujourd’hui</span><span class="big" aria-live="polite">{bilan.n}</span><span class="t12 mut">billet{bilan.n > 1 ? 's' : ''} · {fcfaF(bilan.total)} encaissés</span></span>
      <span class="col" style="align-items: flex-end"><span class="lab">Ma commission</span><span class="ttl t24 okc">{fcfaF(bilan.commission)}</span><span class="t12 mut">versée ce soir</span></span>
    </div>
    <span class="lab">Touche le départ · le client reçoit un SMS</span>
    {#if deps.length}
      <div class="bento">
        {#each deps as d (d.id)}
          <button type="button" class="bigb" class:on={d.id === choisi} onclick={() => (choisi = d.id)} aria-label="Vendre pour le départ de {d.heure} vers {libelleDestination(d)}">
            <span class="h">{d.heure}</span><span class="t13 b7">{libelleDestination(d)}</span><span class="t12" style="opacity: 0.8">{fcfaF(prixDuDepart(d))} · {placesLibres(d)} libres</span>
          </button>
        {/each}
      </div>
    {:else}<div class="gl c"><span class="t14 b7">Plus de départ à vendre</span><span class="t13 mut">Aucun départ de Bêta Express avec des places libres.</span></div>{/if}
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="col grow"><span class="t14 b6">Dernier client</span><span class="t12 mut">{dernier && dernierDepart ? `${dernierDepart.heure} ${libelleDestination(dernierDepart)} · ${fcfaF(dernier.prix)} · code ${codeAffiche(dernier.code)}${dernier.passager.tel ? ' envoyé par SMS' : ''}` : 'Aucune vente pour l’instant'}</span></span>
        {#if dernier}<span class="pl {moyenDernier === 'MoMo' ? 'ok' : 'inf'}">{moyenDernier}</span>{/if}</div>
      <div class="li"><span class="col grow"><span class="t14 b6">Le client paie</span><span class="t12 mut">{momo ? 'MoMo direct à la compagnie' : 'en espèces à toi'} · bascule pour changer</span></span>
        <button type="button" class="sw" class:on={momo} role="switch" aria-checked={momo} aria-label="MoMo direct à la compagnie" onclick={() => (momo = !momo)}></button></div>
    </div>
    <div class="row g8" style="margin-top: auto">
      <a class="b s grow" href="/ussd" onclick={(e) => { e.preventDefault(); aller('/ussd'); }}>Vendre par *123#</a>
      <button type="button" class="b s grow" onclick={remettre} disabled={bilan.aRemettre <= 0}>Remettre les espèces{bilan.aRemettre ? ` · ${fcfaF(bilan.aRemettre)}` : ''}</button>
    </div>
  {/if}
</Mobile>

{#if dep}
  <div class="voile" role="presentation" onclick={() => (choisi = null)}></div>
  <div class="sheet pop" role="dialog" aria-modal="true" aria-label="Vendre un billet">
    <span class="grab"></span>
    <div class="row sp"><span class="col"><span class="ttl t18">{dep.heure} {libelleDestination(dep)}</span><span class="t13 mut">{ligneDe(dep).de} {gareNom(ligneDe(dep).gareDe)} · {placesLibres(dep)} places libres</span></span><span class="ttl t20">{fcfaF(prixDuDepart(dep))}</span></div>
    <div class="seg2" role="group" aria-label="Moyen de paiement"><button type="button" class:on={!momo} aria-pressed={!momo} onclick={() => (momo = false)}>Espèces à moi</button><button type="button" class:on={momo} aria-pressed={momo} onclick={() => (momo = true)}>MoMo compagnie</button></div>
    <div class="row g8"><label class="fld grow" style="gap: 4px"><span class="lab">Téléphone du client</span><input class="inp" style="min-height: 46px" type="tel" inputmode="tel" autocomplete="off" bind:value={tel} placeholder="6 90 00 00 00" /></label>
      <label class="fld grow" style="gap: 4px"><span class="lab">Nom (facultatif)</span><input class="inp" style="min-height: 46px" bind:value={nom} autocomplete="off" /></label></div>
    <span class="t12 mut">Le code du billet est envoyé par SMS au client. La place est attribuée à l’embarquement.</span>
    <div class="row g8"><button type="button" class="b s" onclick={() => (choisi = null)}>Annuler</button><button type="button" class="b p" onclick={vendre}>Vendre · {fcfaF(prixDuDepart(dep))}</button></div>
  </div>
{/if}

{#snippet entete()}
  <header class="hd">
    <div class="row g10"><a class="av hot" href="/terrain/moi" aria-label="Mon profil" onclick={(e) => { e.preventDefault(); aller('/terrain/moi'); }}>{initiales(agent)}</a>
      <div class="col"><span class="ttl t16">{agent?.prenom}</span><span class="t13 mut">Vendeuse · {agent?.zone ?? ''} · agréée Bêta Express</span></div></div>
    <span class="pl ok">{agent ? tauxDe(agent.id) : 5} % commission</span>
  </header>
{/snippet}

<style>
  .bigb { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 84px; padding: 12px 14px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; }
  .bigb.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; }
  .bigb .h { font: 700 24px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.03em; }
  .g10 { gap: 10px; }
  a.av { text-decoration: none; }
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 40; }
  .pop { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); max-height: 92dvh; overflow-y: auto; z-index: 41; margin: 0; }
</style>
