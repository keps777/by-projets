<script lang="ts">
  // Connexion (planche Connexion) : se connecter ou créer le compte (une seule fois). Sans serveur (mode local), l'app
  // s'ouvre directement sur Le Fil : cet écran n'est jamais montré.
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { session } from '../../data/auth.svelte.ts';
  import { estInstallee } from './push.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  let creation = $state(routeur.params.get('creer') === '1');
  let prenom = $state('');
  let email = $state('');
  let motDePasse = $state('');
  let voir = $state(false);
  let occupe = $state(false);

  const titre = $derived(`${creation ? prenom.trim() || 'Mon' : 'Luther'} Life`);
  const initiales = $derived(`${(creation ? prenom.trim().charAt(0) || 'M' : 'L').toUpperCase()}L`);
  const pret = $derived(email.includes('@') && motDePasse.length > 0 && (!creation || (prenom.trim().length > 0 && motDePasse.length >= 12)));

  async function valider(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!pret || occupe) return;
    occupe = true;
    try {
      if (creation) {
        if (await session.creerCompte(prenom.trim(), email.trim(), motDePasse)) routeur.aller(estInstallee() ? '/autoriser-notifications' : '/installer', true);
      } else if (await session.connecter(email.trim(), motDePasse)) routeur.aller('/', true);
    } finally { occupe = false; }
  }
</script>

<EcranPage onglets={false}>
  <div class="fond" aria-hidden="true">
    <span class="bulle a"></span>
    <span class="bulle b" style:--b={couleurRubrique('#34D1B6', theme.mode)}></span>
  </div>

  <div class="scene">
    <div class="marque">
      <span class="avatar titre">{initiales}</span>
      <h1 class="titre">{titre}</h1>
      <span class="serif devise">Diviser ma vie en plusieurs projets.</span>
    </div>

    <div class="modes" role="tablist">
      <button type="button" role="tab" aria-selected={!creation} class:actif={!creation} onclick={() => (creation = false)}>Se connecter</button>
      <button type="button" role="tab" aria-selected={creation} class:actif={creation} onclick={() => (creation = true)}>Créer un compte</button>
    </div>

    <form class="champs" id="connexion" onsubmit={valider}>
      {#if creation}
        <label>Ton prénom
          <input bind:value={prenom} autocomplete="given-name" required />
          <span class="aide">Il devient le titre de l’app : « {titre} ».</span>
        </label>
      {/if}
      <label>Adresse e-mail
        <input type="email" bind:value={email} autocomplete="email" placeholder="toi@exemple.com" required />
      </label>
      <label>Mot de passe
        <span class="mdp">
          <input type={voir ? 'text' : 'password'} bind:value={motDePasse} autocomplete={creation ? 'new-password' : 'current-password'} minlength={creation ? 12 : undefined} required />
          <button type="button" aria-pressed={voir} aria-label="Afficher le mot de passe" onclick={() => (voir = !voir)}><Icone nom="oeil" taille={20} /></button>
        </span>
        {#if creation}<span class="aide">12 caractères ou plus. Une phrase de passe fonctionne très bien.</span>{/if}
      </label>
      {#if session.erreur}<p class="erreur" role="alert">{session.erreur}</p>{/if}
    </form>

    <div class="bas">
      <button type="submit" form="connexion" class="cta" disabled={!pret || occupe}>{occupe ? 'Un instant…' : creation ? 'Créer mon compte' : 'Se connecter'}</button>
      <span class="muted note">Tes données sont privées et protégées par ton compte. Aucune publicité, aucun suivi, aucun e-mail envoyé. Un seul compte : l’inscription se ferme après sa création.</span>
    </div>
  </div>
</EcranPage>

<style>
  .fond { position: fixed; inset: 0; overflow: hidden; pointer-events: none; max-width: 480px; margin: 0 auto; }
  .bulle { position: absolute; border-radius: 50%; }
  .bulle.a { left: -90px; top: -110px; width: 420px; height: 420px; background: color-mix(in srgb, var(--accent) 22%, var(--fond)); opacity: 0.8; }
  .bulle.b { right: -140px; bottom: 60px; width: 340px; height: 340px; background: color-mix(in srgb, var(--b) 16%, var(--fond)); opacity: 0.6; }
  .scene { position: relative; flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 48px 8px 8px; }
  .marque { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .avatar { width: 56px; height: 56px; border-radius: 18px; background: var(--accent); color: var(--accent-texte); font-size: 22px; display: flex; align-items: center; justify-content: center; }
  h1 { font-size: 40px; letter-spacing: -0.03em; line-height: 1; }
  .devise { font-size: 20px; color: var(--muted); }
  .modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: var(--surface); border-radius: 14px; padding: 4px; gap: 2px; }
  .modes button { min-height: 44px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; }
  .modes button.actif { background: var(--ligne); color: var(--texte); }
  .champs { display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  input { height: 52px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); font-size: 16px; padding: 0 14px; }
  .mdp { display: flex; align-items: center; height: 52px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 4px 0 14px; }
  .mdp input { flex: 1; min-width: 0; height: 100%; border: 0; padding: 0; background: transparent; outline: none; }
  .mdp button { width: 44px; height: 44px; border: 0; background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; }
  .aide { font-size: 12px; font-weight: 400; color: var(--faint); }
  .erreur { color: var(--mauvais); font-size: 14px; font-weight: 600; }
  .bas { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .cta { height: 56px; border-radius: 18px; border: 0; background: var(--accent); color: var(--accent-texte); font-size: 16px; font-weight: 600; }
  .cta:disabled { opacity: 0.5; }
  .note { font-size: 12px; line-height: 1.5; text-align: center; }
</style>
