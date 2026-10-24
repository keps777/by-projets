<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { billetsDe, deconnecter, personneCourante } from '../../domain/actions.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { formaterTel } from '../../core/telephone.ts';
  import { LANGUES, t } from './i18n.ts';
  import { definirLangue, effacerMondeDemo } from './actions.ts';
  import { preferences } from './etat.ts';
  import { creerPasskey } from './webauthn.ts';
  import { nav } from './lien.ts';

  /** Réglages de la voyageuse : langue, apparence, visage et passkey, notifications, données et hors ligne, déconnexion, remise à zéro du monde de démo. */
  const prefs = preferences();
  const moi = $derived(personneCourante());
  const horsLigneBillets = $derived(moi ? billetsDe(moi.id).filter((b) => b.statut === 'valide').length : 0);
  let confirmer = $state(false), passkeyOccupee = $state(false);
  const ALERTES = [
    { cle: 'retard', nom: 'Bus au quai, retard', sous: 'avant chaque départ' }, { cle: 'colis', nom: 'Colis', sous: 'chargé, arrivé, retiré' },
    { cle: 'bonsPlans', nom: 'Bons plans', sous: 'prix bas sur tes lignes' }, { cle: 'proches', nom: 'Proches', sous: 'quand ils paient ou voyagent' }
  ] as const;
  const THEMES = [{ id: 'sombre', nom: 'Sombre' }, { id: 'clair', nom: 'Clair' }, { id: 'auto', nom: 'Auto' }] as const;

  function basculerVisage() { if (!moi) return; moi.visage = !moi.visage; montrer(moi.visage ? 'Visage activé pour payer et te connecter' : 'Visage désactivé : le code reste demandé', moi.visage ? 'ok' : 'wa'); }
  async function basculerPasskey() {
    if (!moi || passkeyOccupee) return;
    if (moi.passkey) { moi.passkey = false; montrer('Passkey retirée de cet appareil', 'wa'); return; }
    passkeyOccupee = true;
    try {
      const r = await creerPasskey({ nom: `${moi.prenom} ${moi.nom}`.trim(), id: moi.id });
      if (r === 'refuse') montrer('Création de la passkey annulée', 'wa');
      else { moi.passkey = true; montrer(r === 'ok' ? 'Passkey enregistrée sur cet appareil' : 'Passkey simulée : cet appareil ne la gère pas', r === 'ok' ? 'ok' : 'wa'); }
    } finally { passkeyOccupee = false; }
  }
  function basculerHorsLigne() { app.session.hors_ligne = !app.session.hors_ligne; montrer(app.session.hors_ligne ? 'Mode hors ligne : les billets signés restent utilisables' : 'De retour en ligne'); }
  function sortir() { deconnecter(); aller('/connexion'); }
  function effacer() { effacerMondeDemo(); montrer('Monde de démonstration remis à zéro'); aller('/splash'); }
</script>

{#snippet interrupteur(on: boolean, nom: string, action: () => void, desactive = false)}
  <button type="button" role="switch" class="sw" class:on aria-checked={on} aria-label={nom} onclick={action} disabled={desactive}></button>
{/snippet}

<Mobile titre={t('reglages')} sous="AfriMove · démonstration" retourVers="/moi">
  <span class="lab">{t('langue')}</span>
  <div class="seg2" role="group" aria-label={t('langue')}>
    {#each LANGUES as l (l.id)}<button type="button" class:on={app.session.langue === l.id} aria-pressed={app.session.langue === l.id} onclick={() => definirLangue(l.id)}>{l.nom}</button>{/each}
  </div>

  <span class="lab">{t('apparence')}</span>
  <div class="seg2" role="group" aria-label="Thème">
    {#each THEMES as th (th.id)}<button type="button" class:on={prefs.theme === th.id} aria-pressed={prefs.theme === th.id} onclick={() => (prefs.theme = th.id)}>{th.nom}</button>{/each}
  </div>
  {#if prefs.theme !== 'sombre'}<p class="t12 mut3" style="margin: 0">Le thème clair n’est pas encore disponible : l’app reste sombre (nuit par défaut).</p>{/if}

  <span class="lab">{t('securite')}</span>
  <div class="gl col" style="gap: 0">
    <div class="li"><span class="col grow"><span class="t14 b6">{t('confirmerVisage')}</span><span class="t12 mut">paiement et connexion sans code</span></span>{@render interrupteur(!!moi?.visage, 'Visage', basculerVisage)}</div>
    <div class="li"><span class="col grow"><span class="t14 b6">Passkey</span><span class="t12 mut">{moi?.passkey ? 'enregistrée sur cet appareil' : 'connexion sans mot de passe'}</span></span>{@render interrupteur(!!moi?.passkey, 'Passkey', basculerPasskey, passkeyOccupee)}</div>
    <a class="li" href="/paiement" use:nav><span class="col grow"><span class="t14 b6">Moyen par défaut</span><span class="t12 mut">MTN MoMo · {moi ? formaterTel(moi.tel) : ''}</span></span><span class="t13 aq">changer</span></a>
    <a class="li" href="/autorisations" use:nav><span class="col grow"><span class="t14 b6">{t('autorisations')}</span><span class="t12 mut">caméra, position, contacts, micro</span></span><span class="t13 aq">voir</span></a>
  </div>

  <span class="lab">{t('ceQuiReveille')}</span>
  <div class="gl col" style="gap: 0">
    {#each ALERTES as al (al.cle)}
      <div class="li"><span class="col grow"><span class="t14 b6">{al.nom}</span><span class="t12 mut">{al.sous}</span></span>{@render interrupteur(prefs.alertes[al.cle], al.nom, () => (prefs.alertes[al.cle] = !prefs.alertes[al.cle]))}</div>
    {/each}
  </div>

  <span class="lab">{t('donnees')}</span>
  <div class="gl col" style="gap: 0">
    <div class="li"><span class="col grow"><span class="t14 b6">Économie de données</span><span class="t12 mut">cartes en relief allégées · {prefs.economieDonnees ? 'activée' : 'désactivée'}</span></span>{@render interrupteur(prefs.economieDonnees, 'Économie de données', () => (prefs.economieDonnees = !prefs.economieDonnees))}</div>
    <div class="li"><span class="col grow"><span class="t14 b6">Mode hors ligne</span><span class="t12 mut">{app.session.hors_ligne ? 'activé · tu utilises ce qui est sur l’appareil' : 'désactivé · l’app se synchronise'}</span></span>{@render interrupteur(app.session.hors_ligne, 'Mode hors ligne', basculerHorsLigne)}</div>
    <div class="li"><span class="col grow"><span class="t14 b6">Sons et jingle</span><span class="t12 mut">{prefs.sons ? 'jingle de bienvenue activé' : 'silencieux'}</span></span>{@render interrupteur(prefs.sons, 'Sons et jingle', () => (prefs.sons = !prefs.sons))}</div>
    <a class="li" href="/pass/hors-ligne" use:nav><span class="col grow"><span class="t14 b6">Billets hors ligne</span><span class="t12 mut">{horsLigneBillets} billet{horsLigneBillets > 1 ? 's' : ''} signé{horsLigneBillets > 1 ? 's' : ''} sur l’appareil</span></span><span class="t13 aq">voir</span></a>
  </div>

  <button class="b g" type="button" onclick={sortir}>{t('seDeconnecter')}</button>
  <button class="b g erc" type="button" onclick={() => (confirmer = true)}>Effacer le monde de démo</button>
</Mobile>

{#if confirmer}
  <div class="voile" role="presentation" onclick={() => (confirmer = false)}></div>
  <div class="sheet confirm" role="alertdialog" aria-modal="true" aria-labelledby="t-eff" aria-describedby="d-eff">
    <span class="grab"></span>
    <span class="ttl t18 c" id="t-eff">Tout remettre à zéro ?</span>
    <span class="t13 mut c" id="d-eff">Billets, colis, points, dossiers et réglages reviennent à la démonstration de départ. Tu seras déconnectée.</span>
    <button class="b d" type="button" onclick={effacer}>Oui, tout effacer</button>
    <button class="b s" type="button" onclick={() => (confirmer = false)}>Annuler</button>
  </div>
{/if}

<style>
  .sw { position: relative; }
  .sw::before { content: ''; position: absolute; inset: -8px -4px; }
  .sw:disabled { opacity: 0.5; }
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; }
  .confirm { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); z-index: 41; margin: 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
</style>
