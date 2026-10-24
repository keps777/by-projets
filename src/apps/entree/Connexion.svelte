<script lang="ts">
  import { onDestroy } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Logo from './Logo.svelte';
  import { t } from './i18n.ts';
  import { compteAppareil, ouvrirSession } from './actions.ts';
  import { passkeyPossible, tenterPasskey } from './webauthn.ts';
  import { nav } from './lien.ts';

  /** Connexion sans mot de passe : passkey WebAuthn tentée pour de vrai ; sinon reconnaissance du visage simulée (toucher le cadre). */
  const compte = $derived(compteAppareil());
  type Phase = 'repos' | 'lecture' | 'ok' | 'echec';
  let phase = $state<Phase>('repos'), info = $state(''), occupe = $state(false);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(minuteur));

  const pause = (ms: number) => new Promise<void>((r) => { minuteur = setTimeout(r, ms); });
  /** Reconnaissance du visage simulée : 0,8 s, puis « reconnue ». Refusée si le visage n'est pas activé sur ce compte. */
  async function simulerVisage() {
    if (phase === 'lecture' || phase === 'ok') return;
    if (!compte?.visage) { phase = 'echec'; info = 'Le visage n’est pas activé sur ce compte. Utilise ton numéro.'; return; }
    phase = 'lecture'; info = ''; await pause(800); phase = 'ok';
  }
  function entrer() { if (compte) { ouvrirSession(compte.id); aller('/'); } }
  async function continuer() {
    if (phase === 'ok') { entrer(); return; }
    if (occupe || !compte) return;
    occupe = true; info = '';
    try {
      if (compte.passkey && passkeyPossible()) {
        phase = 'lecture';
        const r = await tenterPasskey();
        if (r === 'ok') { entrer(); return; }
        if (r === 'refuse') { phase = 'repos'; info = 'Passkey non validée sur cet appareil. Touche le cadre pour simuler Face ID, ou utilise ton numéro.'; return; }
        info = 'Passkey indisponible ici : on simule Face ID.'; phase = 'repos';
      }
      await simulerVisage();
    } finally { occupe = false; }
  }
  const titre = $derived(phase === 'ok' ? `${t('salut')} ${compte?.prenom ?? ''}` : t('regardeEcran'));
  const sous = $derived(phase === 'ok' ? 'Visage reconnu en 0,8 s · on t’emmène où ?' : (info || t('toucheCadre')));
</script>

<Mobile sansRetour>
  <div class="col c" style="align-items: center; gap: 8px; padding-top: 10px">
    <Logo taille={64} />
    <h1 class="ttl t22">AfriMove</h1>
    <span class="t14 mut">{t('pasMdp')}</span>
  </div>
  <button class="face" class:ok={phase === 'ok'} class:lit={phase === 'lecture'} type="button" onclick={simulerVisage} aria-label={phase === 'ok' ? 'Reconnue' : 'Lancer la reconnaissance'}>
    {#if phase === 'ok'}
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    {:else}
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M8.5 9.5v1.5M15.5 9.5v1.5M12 9.5v4h-1.2M9 15.2a4.5 4.5 0 0 0 6 0" /></svg>
    {/if}
  </button>
  <div class="col c" style="gap: 4px" aria-live="polite">
    <h2 class="ttl t20" data-testid="titre-connexion">{titre}</h2>
    <span class="t14 mut" class:erc={phase === 'echec'}>{sous}</span>
  </div>
  <div class="row g8" style="justify-content: center; flex-wrap: wrap">
    {#if compte?.passkey}
      <span class="key"><Icone nom="cle" taille={16} trait={2} />Passkey · iPhone de {compte.prenom}</span>
      <span class="pl ok">chiffrée sur l’appareil</span>
    {:else}
      <span class="key">Pas encore de passkey · à créer dans Réglages</span>
    {/if}
  </div>
  <div class="col" style="gap: 8px; margin-top: auto">
    <button class="b p" type="button" onclick={continuer} disabled={occupe || !compte}><Icone nom="visage" taille={20} trait={2} />{phase === 'ok' ? t('voirDeparts') : t('continuerFace')}</button>
    <a class="b s" href="/connexion/code" use:nav>{t('utiliserNumero')}</a>
    <p class="t12 mut3 c" style="margin: 0">{t('rienEnvoye')}</p>
  </div>
</Mobile>

<style>
  h1, h2 { margin: 0; }
  .face { position: relative; width: 150px; height: 150px; margin: 0 auto; flex: none; border-radius: 46px; border: 2px solid rgba(255, 255, 255, 0.2); display: grid; place-items: center; background: rgba(255, 255, 255, 0.06); overflow: hidden; cursor: pointer; color: inherit; padding: 0; }
  .face:before { content: ''; position: absolute; inset: 0; background: conic-gradient(from 0deg, transparent 70%, #3de0ff); animation: spin 1.8s linear infinite; opacity: 0.6; }
  .face:after { content: ''; position: absolute; inset: 3px; border-radius: 42px; background: #0b1020; }
  .face svg { position: relative; z-index: 1; color: #7febff; }
  .face.lit:before { animation-duration: 0.6s; opacity: 1; }
  .face.ok:before { animation: none; background: rgba(74, 222, 128, 0.2); }
  .face.ok svg { color: #4ade80; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .key { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); font: 600 13px 'Geist Mono', monospace; color: #b7c0db; }
  .b:disabled { opacity: 0.6; }
</style>
