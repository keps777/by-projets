<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { connecter, personne, personneCourante } from '../../domain/actions.ts';
  import { court } from '../../core/money.ts';
  import { formaterTel, GAIN_COURSE, gainMensuelLivreur, normaliserTel } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { candidatureDe, candidaterLivreur, repondreCandidature } from './actions.ts';
  import type { Candidature } from './etat.ts';
  import Pic from './Pic.svelte';

  const moi = personneCourante();
  const EXIGENCES = ['Une moto en règle', 'Permis A et CNI', 'Un casque pour toi et un pour le colis', 'Un compte MoMo ou OM à ton nom'];
  let ok = $state([true, true, false, false]), titulaire = $state(moi ? `${moi.prenom} ${moi.nom}`.trim() : ''), tel = $state(''), erreur = $state(''), envoyee = $state<Candidature | undefined>(undefined), pin = $state('');
  const n = $derived(ok.filter(Boolean).length);
  const suivi = $derived(envoyee ?? candidatureDe(moi?.id, 'livreur'));
  const compte = $derived(suivi ? personne(suivi.personneId) : undefined);
  const parrain = moi?.role === 'livreur';

  function candidater() {
    erreur = '';
    const r = candidaterLivreur(moi!.id, { conditions: ok, titulaire, tel });
    if (r.ok) { envoyee = r.candidature; montrer('Candidature envoyée · réponse sous 48 h'); } else erreur = r.message;
  }
  function reponse(accepte: boolean) { if (!suivi) return; const r = repondreCandidature(suivi.id, accepte); if (r.ok && r.pin) pin = r.pin; else if (!r.ok) montrer(r.message, 'er'); }
  function entrer() { if (!compte) return; connecter(compte.id); aller('/livreur'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Livreur moto" retourVers={parrain ? '/livreur' : '/moi'} dock={parrain ? undefined : dockVoyageur('moi')}>
  {#snippet droite()}<span class="pl ac">{GAIN_COURSE.toLocaleString('fr-FR')} F / course</span>{/snippet}

  <div class="gl ac">
    <div class="moto" aria-hidden="true"><svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#7FEBFF" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l4-8h5l3 8M10 9l-2-3h3" /></svg></div>
    <span class="ttl t20 c" style="display: block">Livre les colis à l’arrivée des bus</span>
    <p class="t14 mut c" style="margin: 6px 0 0">Courses groupées autour des gares, payées à chaque remise contre code.</p>
  </div>
  <div class="row g8">
    <div class="gl grow col"><span class="lab">Courses / jour</span><span class="ttl t24">6 à 12</span></div>
    <div class="gl grow col"><span class="lab">Gain / mois</span><span class="ttl t24 okc">dès {court(gainMensuelLivreur(6))} F</span><span class="t12 mut">jusqu’à {court(gainMensuelLivreur(12))} F</span></div>
  </div>

  {#if suivi}
    <div class="gl col g8" role="status">
      <span class="row sp"><span class="t14 b7">Ta candidature</span><span class="pl {suivi.statut === 'acceptee' ? 'ok' : suivi.statut === 'refusee' ? 'er' : 'wa'}">{suivi.statut === 'attente' ? 'en attente' : suivi.statut === 'acceptee' ? 'acceptée' : 'refusée'}</span></span>
      <span class="t13 mut">{suivi.statut === 'attente' ? 'Notre équipe vérifie ta moto et tes papiers. Réponse sous 48 h, par notification.' : suivi.statut === 'acceptee' ? 'Bienvenue ! Ton code PIN t’est envoyé par SMS (simulé).' : 'Ta candidature n’a pas pu être retenue pour l’instant.'}</span>
    </div>
    {#if suivi.statut === 'attente'}
      <div class="row g8"><button type="button" class="b p sm" onclick={() => reponse(true)}>Simuler l’acceptation</button><button type="button" class="b s sm" onclick={() => reponse(false)}>Simuler un refus</button></div>
    {:else if suivi.statut === 'acceptee'}
      {#if pin}<div class="gl ac c"><span class="lab">Ton code PIN</span><span class="ttl t30" aria-label="PIN {pin}">{pin}</span></div>{/if}
      <button type="button" class="b p" onclick={entrer}>Entrer dans l’app livreur (démo)</button>
    {/if}
  {:else}
    <span class="lab" id="lab-req">Vérifie ce que tu as</span>
    <div class="gl col" style="gap: 0" role="group" aria-labelledby="lab-req">
      {#each EXIGENCES as r, i (r)}<div class="li"><span class="grow t14 b6" id="req-{i}">{r}</span><button type="button" role="switch" aria-checked={ok[i]} aria-labelledby="req-{i}" class="sw" class:on={ok[i]} onclick={() => (ok[i] = !ok[i])}></button></div>{/each}
    </div>
    <div class="fld"><label class="lab" for="l-nom">Nom sur ta CNI</label><input id="l-nom" class="inp" bind:value={titulaire} autocomplete="name" maxlength="60" />
      <label class="lab" for="l-tel">Numéro MoMo ou OM</label><input id="l-tel" class="inp" type="tel" inputmode="tel" bind:value={tel} placeholder="6 99 11 22 33" autocomplete="tel" aria-invalid={!!tel && !normaliserTel(tel)} />
      {#if tel && !normaliserTel(tel)}<span class="t12 erc" role="alert">Numéro camerounais invalide (ex. 6 99 11 22 33)</span>{:else if normaliserTel(tel)}<span class="t12 okc">{formaterTel(normaliserTel(tel)!)}</span>{/if}</div>
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" disabled={n < 4} onclick={candidater}>{n === 4 ? 'Candidater · réponse sous 48 h' : `Coche les 4 conditions (${n} / 4)`}</button>
      <a class="b g" href="/entree" onclick={(e) => lien(e, '/entree')}>Voir l’app du livreur (démo)</a>
    </div>
  {/if}
</Mobile>

<style>
  .moto { height: 130px; display: grid; place-items: center; perspective: 600px; }
  .moto svg { transform: rotateY(-25deg) rotateX(10deg); filter: drop-shadow(0 20px 30px rgba(61, 224, 255, 0.4)); animation: roule 6s ease-in-out infinite; }
  @keyframes roule { 50% { transform: rotateY(25deg) rotateX(10deg); } }
  button:disabled { opacity: 0.45; }
  button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
