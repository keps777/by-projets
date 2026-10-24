<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { CODE_SMS_DEMO } from '../../data/constantes.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { formaterSaisie, normaliserTel, telInternational } from '../../core/telephone.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { t } from './i18n.ts';
  import { creerCompteVoyageur, ErreurCompte, ouvrirSession, personneParTel } from './actions.ts';
  import { nav } from './lien.ts';

  /** Connexion par code SMS : numéro camerounais → code à 4 chiffres (lecture auto simulée, renvoi après 0:42) → connexion ou création d'un compte voyageur. */
  type Etape = 'numero' | 'code' | 'nom' | 'equipe';
  const DELAI_RENVOI = 42, ESSAIS_MAX = 3;
  let etape = $state<Etape>('numero'), saisie = $state(param('tel') ? formaterSaisie(param('tel')!) : ''), tel = $state(''), erreur = $state('');
  let code = $state(''), essais = $state(0), reste = $state(DELAI_RENVOI), lu = $state(false), nomSaisi = $state(''), parrainSaisi = $state('');
  let tLecture: ReturnType<typeof setTimeout> | undefined, tCompte: ReturnType<typeof setInterval> | undefined;
  const nettoyer = () => { clearTimeout(tLecture); clearInterval(tCompte); };
  onDestroy(nettoyer);
  onMount(() => { if (normaliserTel(saisie) && param('tel')) envoyer(); });

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  /** Lance le décompte de renvoi et la lecture automatique (le SMS « arrive » après 1,5 s : les chiffres s'inscrivent un à un). */
  function demarrerCode() {
    nettoyer(); code = ''; lu = false; erreur = ''; essais = 0; reste = DELAI_RENVOI;
    tCompte = setInterval(() => { reste = Math.max(0, reste - 1); if (reste === 0) clearInterval(tCompte); }, 1000);
    tLecture = setTimeout(() => {
      if (code.length > 0) return; lu = true;
      let k = 0; const pas = setInterval(() => { if (!lu || code.length >= 4) { clearInterval(pas); return; } code += CODE_SMS_DEMO[k++]; if (k >= 4) clearInterval(pas); }, 180);
    }, 1500);
  }
  function envoyer() {
    const n = normaliserTel(saisie);
    if (!n) { erreur = 'Numéro camerounais invalide : 9 chiffres, qui commencent par 6.'; return; }
    tel = n; erreur = ''; etape = 'code'; demarrerCode(); montrer(`SMS simulé envoyé au ${telInternational(n)}`);
  }
  function chiffre(c: string) { if (etape !== 'code' || code.length >= 4 || essais >= ESSAIS_MAX) return; lu = false; clearTimeout(tLecture); erreur = ''; code += c; }
  const effacer = () => { lu = false; clearTimeout(tLecture); code = code.slice(0, -1); erreur = ''; };
  function valider() {
    if (code.length < 4) return;
    if (code !== CODE_SMS_DEMO) {
      essais++; code = ''; lu = false;
      erreur = essais >= ESSAIS_MAX ? 'Trop d’essais. Demande un nouveau code.' : `Code incorrect · ${ESSAIS_MAX - essais} essai${ESSAIS_MAX - essais > 1 ? 's' : ''} restant${ESSAIS_MAX - essais > 1 ? 's' : ''}.`; return;
    }
    nettoyer(); const p = personneParTel(tel);
    if (!p) { etape = 'nom'; erreur = ''; return; }
    if (p.role !== 'voyageur') { etape = 'equipe'; return; }
    ouvrirSession(p.id); aller('/');
  }
  function creer() {
    try { const p = creerCompteVoyageur(tel, nomSaisi, parrainSaisi); ouvrirSession(p.id); montrer(`Bienvenue ${p.prenom} !`); aller('/'); }
    catch (e) { if (e instanceof ErreurCompte) erreur = e.code === 'nom_invalide' ? 'Écris ton prénom (2 lettres au moins).' : e.code === 'tel_invalide' ? 'Numéro invalide.' : 'Ce numéro a déjà un compte.'; else throw e; }
  }
  function clavier(e: KeyboardEvent) {
    if (etape !== 'code') return;
    if (/^\d$/.test(e.key)) chiffre(e.key); else if (e.key === 'Backspace') effacer(); else if (e.key === 'Enter') valider();
  }
  function retourEtape() { if (etape === 'numero') aller('/connexion'); else { nettoyer(); etape = 'numero'; code = ''; erreur = ''; } }
</script>

<svelte:window onkeydown={clavier} />

<Mobile sansRetour>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g12" style="min-width: 0">
        <button type="button" class="ib" aria-label="Retour" onclick={retourEtape}><Icone nom="retour" /></button>
        <div class="col"><h1 class="ttl t16 ell">{etape === 'nom' ? 'Bienvenue' : etape === 'numero' ? 'Ton numéro' : t('codeSms')}</h1><span class="t13 mut ell">{etape === 'numero' ? 'Un code à 4 chiffres par SMS' : telInternational(tel)}</span></div>
      </div>
      {#if etape === 'code'}<span class="pl ac">{t('lectureAuto')}</span>{/if}
    </header>
  {/snippet}

  {#if etape === 'numero'}
    <form class="col" style="gap: 12px" onsubmit={(e) => { e.preventDefault(); envoyer(); }}>
      <label class="fld"><span class="lab">Numéro de téléphone</span>
        <span class="inp on"><span class="mono mut3">+237</span><input class="champ" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="6 91 22 10 08" value={saisie} oninput={(e) => { saisie = formaterSaisie(e.currentTarget.value); e.currentTarget.value = saisie; erreur = ''; }} aria-invalid={!!erreur} aria-describedby="err-tel" /></span></label>
      <span id="err-tel" class="t13 erc" role="alert">{erreur}</span>
      <button class="b p" type="submit">Recevoir le code par SMS</button>
      <button class="b s" type="button" onclick={() => { saisie = '6 91 22 10 08'; erreur = ''; }}>Démo · numéro d’Aïcha (6 91 22 10 08)</button>
      <p class="t12 mut3 c" style="margin: 0">Aucun SMS n’est réellement envoyé. Un numéro inconnu crée un compte voyageur.</p>
    </form>
  {:else if etape === 'code'}
    <div class="otp" role="group" aria-label="Code à 4 chiffres">
      {#each [0, 1, 2, 3] as k (k)}<span class:on={code.length === k} aria-label="Chiffre {k + 1}">{code[k] ?? ''}</span>{/each}
    </div>
    <div class="row sp" style="min-height: 44px">
      {#if reste > 0 && essais < ESSAIS_MAX}<span class="t13 mut" aria-live="off">{t('renvoyerDans')} {mmss(reste)}</span>
      {:else}<button class="b g sm" type="button" onclick={demarrerCode}>{t('renvoyer')}</button>{/if}
      <span class="t13 {erreur ? 'erc' : 'mut'}" role={erreur ? 'alert' : 'status'}>{erreur || (code.length === 4 ? 'code complet' : lu ? 'code lu automatiquement…' : 'tape le code ou attends la lecture auto')}</span>
    </div>
    <div class="chips"><a class="ch" href="/ussd" use:nav>{t('ussdSansInternet')}</a><a class="ch" href="/ussd?canal=whatsapp" use:nav>{t('codeWhatsapp')}</a></div>
    <p class="t12 mut3" style="margin: 0">Démo : le code envoyé est <span class="mono">{CODE_SMS_DEMO}</span>.</p>
    <div class="pad" style="margin-top: auto">
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as c (c)}<button type="button" onclick={() => chiffre(c)} aria-label={c}>{c}</button>{/each}
      <a class="lienpad" href="/ussd" use:nav>*123#</a>
      <button type="button" onclick={() => chiffre('0')} aria-label="0">0</button>
      <button type="button" onclick={effacer} aria-label="Effacer">⌫</button>
    </div>
    <button class="b p" type="button" disabled={code.length < 4} onclick={valider}>{t('continuer')}</button>
  {:else if etape === 'nom'}
    <div class="gl ac col" style="gap: 4px"><span class="t16 b7">Nouveau numéro</span><span class="t13 mut">Aucun compte avec le {telInternational(tel)}. Dis-nous comment t’appeler pour le créer.</span></div>
    <form class="col" style="gap: 12px" onsubmit={(e) => { e.preventDefault(); creer(); }}>
      <label class="fld"><span class="lab">Ton nom</span><span class="inp on"><input class="champ" type="text" autocomplete="name" placeholder="Prénom Nom" bind:value={nomSaisi} aria-describedby="err-nom" /></span></label>
      <label class="fld"><span class="lab">Code parrain (facultatif)</span><span class="inp"><input class="champ" type="text" autocapitalize="characters" placeholder="AICHA-24" bind:value={parrainSaisi} /></span></label>
      <span id="err-nom" class="t13 erc" role="alert">{erreur}</span>
      <button class="b p" type="submit">Créer mon compte</button>
    </form>
  {:else}
    <div class="gl col" style="gap: 8px"><span class="t16 b7">Compte de l’équipe</span><span class="t13 mut">Ce numéro appartient à un agent AfriMove. Les agents entrent avec leur PIN.</span><a class="b s" href="/entree" use:nav>Entrer avec mon PIN</a></div>
  {/if}
</Mobile>

<style>
  .otp { display: flex; gap: 8px; justify-content: center; margin-top: 8px; }
  .otp span { width: 52px; height: 62px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; font: 700 26px 'Geist Mono', monospace; }
  .otp span.on { border-color: #3de0ff; box-shadow: 0 0 0 3px rgba(61, 224, 255, 0.25); }
  .lienpad { display: grid; place-items: center; min-height: 54px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; background: rgba(255, 255, 255, 0.06); font: 600 16px 'Geist Mono', monospace; }
  h1 { margin: 0; }
  .champ { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; font: 500 16px 'Sora Variable', 'Sora', sans-serif; color: inherit; min-height: 48px; }
  .b:disabled { opacity: 0.45; pointer-events: none; }
</style>
