<script lang="ts">
  import { onMount } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { jourCourt, heure, jourDe } from '../../core/dates.ts';
  import { masquerTel } from '../../core/auth.ts';
  import Etape from './Etape.svelte';
  import SaisieOtp from './SaisieOtp.svelte';
  import { approuverAppareil, envoyerOtp, securiserCompte } from './actions.ts';
  import { descriptionAppareil } from './appareil.ts';
  import { temp } from './memoire.svelte.ts';

  let etape = $state<1 | 2 | 3 | 4 | 5>(1);
  let verifie = $state(false);
  let analyse = $state(false);
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const appareil = descriptionAppareil();
  const maint = maintenant();
  const quand = `${jourCourt(jourDe(new Date(maint)))} · ${heure(maint)}`;
  const tel = $derived(app.compte?.telephone ?? '');
  const LIBELLES = { 1: 'ALERTE DE SÉCURITÉ', 2: 'VÉRIFICATION 1 / 2 · SMS', 3: 'VÉRIFICATION 2 / 2 · VISAGE', 4: 'TERMINÉ', 5: 'COMPTE PROTÉGÉ' } as const;

  onMount(() => {
    // Ce parcours n'a de sens qu'après un code correct sur un appareil inconnu.
    if (!app.auth.hash) aller('/bienvenue', { remplacer: true });
    else if (!temp.codeVerifie && !app.auth.connecte) aller('/connexion', { remplacer: true });
    return () => clearTimeout(minuterie);
  });

  async function oui() { await envoyerOtp(tel); verifie = false; etape = 2; }
  function pasMoi() { clearTimeout(minuterie); securiserCompte(); analyse = false; etape = 5; }
  function verifier() {
    analyse = true;
    minuterie = setTimeout(() => { approuverAppareil(); analyse = false; etape = 4; }, 2200);
  }
  function retour() { clearTimeout(minuterie); analyse = false; if (etape === 2 || etape === 3) etape = (etape - 1) as 1 | 2; else aller('/connexion', { remplacer: true }); }
</script>

<Etape onretour={retour} repere={LIBELLES[etape]} titre={etape === 1 ? 'Nouvel appareil détecté.' : etape === 2 ? 'Confirmez par SMS.' : etape === 3 ? 'Vérifions votre visage.' : etape === 4 ? 'Appareil approuvé.' : 'Compte sécurisé.'}
  sous={etape === 1 ? 'Quelqu\'un essaie d\'ouvrir votre compte depuis ce téléphone. Est-ce vous ?'
    : etape === 2 ? `Un code vient d'être envoyé au +237 ${masquerTel(tel)}.`
    : etape === 3 ? 'Pour un nouvel appareil, AssureMe compare un selfie à la photo de votre CNI.'
    : etape === 4 ? `Ce ${appareil.nom} est désormais de confiance. Vous pouvez le retirer à tout moment dans Sécurité.`
    : 'Ce téléphone est bloqué et tous les appareils ont été déconnectés. Changez votre code pour terminer.'}>
  {#if etape === 1}
    <div class="fiche">
      <div class="tete"><span class="ic"><Icone nom="telephone" taille={24} /></span><div><b>{appareil.nom}</b><small>{appareil.systeme} · première connexion</small></div></div>
      <dl><div><dt>Lieu</dt><dd>Cameroun</dd></div><div><dt>Date</dt><dd class="mono">{quand}</dd></div><div><dt>Adresse IP</dt><dd class="mono">41.202.•••.•••</dd></div></dl>
    </div>
  {:else if etape === 2}
    <SaisieOtp numero={tel} bind:verifie compact />
  {:else if etape === 3}
    <div class="selfie" class:analyse aria-live="polite"><span class="visage"><Icone nom="profil" taille={56} trait={1.4} /></span>{#if analyse}<i class="balai"></i>{/if}</div>
    <p class="muted centre">{analyse ? 'Comparaison avec la CNI…' : 'Aucune photo ne quitte cet écran : la comparaison est simulée dans cette démonstration.'}</p>
  {:else if etape === 4}
    <div class="fin"><span class="ok" aria-hidden="true"><Icone nom="ok" taille={34} trait={2.4} /></span></div>
  {:else}
    <div class="fin"><span class="ok danger" aria-hidden="true"><Icone nom="protection" taille={34} trait={2} /></span></div>
  {/if}

  {#snippet pied()}
    {#if etape === 1}
      <Bouton onclick={oui}>Oui, c'est moi<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
      <Bouton variante="danger" onclick={pasMoi}>Ce n'est pas moi</Bouton>
    {:else if etape === 2}
      <Bouton desactive={!verifie} onclick={() => (etape = 3)}>Vérifier<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
      <Bouton variante="discret" onclick={retour}>Étape précédente</Bouton>
    {:else if etape === 3}
      <Bouton desactive={analyse} onclick={verifier}>Lancer la vérification<Icone nom="camera" taille={18} /></Bouton>
      <Bouton variante="danger" onclick={pasMoi}>Ce n'est pas moi</Bouton>
    {:else if etape === 4}
      <Bouton onclick={() => aller('/', { remplacer: true })}>Entrer dans AssureMe<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else}
      <Bouton onclick={() => aller('/code-oublie')}>Changer mon code</Bouton>
      <Bouton variante="discret" onclick={() => aller('/connexion', { remplacer: true })}>Retour à la connexion</Bouton>
    {/if}
  {/snippet}
</Etape>

<style>
  .fiche { padding: 16px; border-radius: 20px; background: var(--carte); border: 1px solid rgba(255, 122, 47, 0.4); display: flex; flex-direction: column; gap: 14px; }
  .tete { display: flex; align-items: center; gap: 12px; } .ic { width: 48px; height: 48px; border-radius: 14px; background: rgba(255, 122, 47, 0.14); color: var(--alerte); display: grid; place-items: center; flex: none; } .tete div { display: flex; flex-direction: column; } .tete b { font-size: 16px; } small { color: var(--muted); font-size: 12.5px; }
  dl { display: flex; flex-direction: column; } dl div { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--ligne); font-size: 14px; } dt { color: var(--muted); } dd { font-weight: 500; }
  .selfie { position: relative; align-self: center; width: 200px; height: 240px; border-radius: 100px; border: 2px dashed rgba(255, 255, 255, 0.2); display: grid; place-items: center; color: #6e778c; overflow: hidden; margin: 8px 0; transition: all 0.3s; } .selfie.analyse { border-style: solid; border-color: #7c93ff; color: #7c93ff; box-shadow: 0 0 40px rgba(48, 80, 255, 0.4); }
  .balai { position: absolute; left: 6%; right: 6%; height: 2px; background: #7c93ff; box-shadow: 0 0 14px #7c93ff; animation: balai 1.6s ease-in-out infinite; } .centre { text-align: center; font-size: 13px; line-height: 1.45; }
  .fin { flex: 1; display: grid; place-items: center; } .ok { width: 84px; height: 84px; border-radius: 42px; background: rgba(61, 213, 152, 0.14); color: var(--bon); display: grid; place-items: center; box-shadow: 0 0 50px rgba(61, 213, 152, 0.3); } .ok.danger { background: rgba(255, 114, 114, 0.12); color: var(--danger); box-shadow: 0 0 50px rgba(255, 114, 114, 0.25); }
  @keyframes balai { 0%, 100% { top: 6%; } 50% { top: 92%; } }
</style>
