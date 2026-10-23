<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { masquerTel } from '../../core/auth.ts';
  import { initiales } from '../../core/inscription.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import Logo from './Logo.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { SaisieConnexion } from './saisieConnexion.svelte.ts';
  import { activerDemo, biometrieSimulee, purgerVerrou } from './actions.ts';
  import { CODE_DEMO } from '../../data/constantes.ts';

  const saisie = new SaisieConnexion((r) => {
    if (r === 'ok') setTimeout(() => aller('/', { remplacer: true }), 650);
    else if (r === 'nouvel_appareil') setTimeout(() => aller('/nouvel-appareil'), 450);
  });
  onMount(() => {
    purgerVerrou();
    if (!app.auth.hash) return;
    if (app.auth.connecte) aller('/', { remplacer: true });
    else if (app.auth.derniereActivite > 0) aller('/session', { remplacer: true });
  });
  const c = $derived(app.compte);
  const biometrie = $derived(app.auth.biometrie || app.mode === 'demo');
  const ton = $derived(saisie.statut === 'faux' || saisie.statut === 'verrouille' ? 'mauvais' : saisie.statut === 'ok' || saisie.statut === 'nouvel_appareil' ? 'ok' : 'neutre');
  const avatar = $derived(saisie.statut === 'ok' || saisie.statut === 'nouvel_appareil' ? 'ok' : ton === 'mauvais' ? 'mauvais' : 'neutre');
  let demoEnCours = $state(false);
  async function demo() { demoEnCours = true; await activerDemo(); aller('/', { remplacer: true }); }
</script>

{#if !app.auth.hash || !c}
  <main class="conn vide">
    <Logo taille={36} nom />
    <div class="centre">
      <h1>Aucun compte sur cet appareil.</h1>
      <p>Créez votre compte en 2 minutes, ou découvrez AssureMe avec un compte de démonstration.</p>
      <Bouton href="/inscription/telephone">Créer mon compte</Bouton>
      <Bouton variante="secondaire" onclick={demo} desactive={demoEnCours}>Essayer avec un compte de démonstration</Bouton>
      <Bouton variante="discret" href="/bienvenue">Retour à l'accueil</Bouton>
    </div>
  </main>
{:else}
  <main class="conn">
    <div class="lueur" aria-hidden="true"></div>
    <header>
      <Logo taille={28} nom />
      {#if biometrie}<a class="bio" href="/connexion/biometrie" aria-label="Se connecter avec Face ID ou l'empreinte" onclick={(e) => { e.preventDefault(); aller('/connexion/biometrie'); }}><Icone nom="empreinte" taille={22} /></a>{/if}
    </header>

    <div class="profil">
      <span class="av {avatar}">{initiales(c.prenom, c.nom)}</span>
      <h1>Bon retour, {c.prenom}.</h1>
      <p class="tel mono">+237 {masquerTel(c.telephone)}</p>
    </div>

    <SaisieCode valeur={saisie.code} variante="points" {ton} secousse={saisie.secousse} etiquette="Votre code" />

    <div class="msg" aria-live="polite">
      {#if saisie.statut === 'faux'}<Alerte ton="erreur">Code incorrect. {saisie.restants} essai{saisie.restants > 1 ? 's' : ''} restant{saisie.restants > 1 ? 's' : ''} avant verrouillage.</Alerte>
      {:else if saisie.statut === 'ok'}<Alerte ton="succes">Code correct. Ouverture de votre espace.</Alerte>
      {:else if saisie.statut === 'nouvel_appareil'}<Alerte ton="avert">Appareil inconnu. Une vérification supplémentaire est nécessaire.</Alerte>
      {:else if saisie.statut === 'verrouille'}<Alerte ton="erreur">Trois erreurs. Pour votre sécurité, le compte est verrouillé 15 minutes.</Alerte>
      {:else if saisie.statut === 'bloque'}<Alerte ton="erreur">Cet appareil a été bloqué après une alerte de sécurité. Réinitialisez votre code par SMS pour le réactiver.</Alerte>
      {:else}<Alerte ton="info">Saisissez votre code{#if app.mode === 'demo'} <span class="mono demo">· démo : {CODE_DEMO}</span>{/if}</Alerte>{/if}
    </div>

    <div class="bas">
      <Clavier onchiffre={(d) => saisie.chiffre(d)} oneffacer={() => saisie.efface()} desactive={saisie.bloquee} />
      {#if saisie.statut === 'ok'}<Bouton onclick={() => aller('/', { remplacer: true })}>Entrer<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
      {:else if saisie.statut === 'verrouille'}<Bouton variante="danger" href="/verrou">Voir le verrouillage<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
      {:else if saisie.statut === 'bloque'}<Bouton href="/code-oublie">Réinitialiser mon code</Bouton>
      {:else if saisie.statut === 'attente' || saisie.statut === 'faux'}
        <div class="liens"><a href="/code-oublie" onclick={(e) => { e.preventDefault(); aller('/code-oublie'); }}>Code oublié ?</a><a class="autre" href="/inscription/telephone" onclick={(e) => { e.preventDefault(); aller('/inscription/telephone'); }}>Ce n'est pas vous ? <span>Changer de compte</span></a></div>
      {/if}
    </div>
  </main>
{/if}

<style>
  .conn { position: relative; display: flex; flex-direction: column; gap: 12px; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 14px) 20px calc(env(safe-area-inset-bottom) + 16px); overflow: hidden; }
  .lueur { position: absolute; top: 40px; left: 50%; margin-left: -180px; width: 360px; height: 360px; border-radius: 50%; background: radial-gradient(closest-side, rgba(48, 80, 255, 0.32), transparent); pointer-events: none; }
  header { position: relative; display: flex; justify-content: space-between; align-items: center; min-height: 48px; }
  .bio { width: 48px; height: 48px; border-radius: 14px; background: var(--carte); border: 1px solid rgba(124, 147, 255, 0.4); display: grid; place-items: center; color: var(--primaire-clair); }
  .profil { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 6px; }
  .av { width: 76px; height: 76px; border-radius: 38px; background: var(--carte2); border: 2px solid rgba(124, 147, 255, 0.5); box-shadow: 0 0 36px rgba(48, 80, 255, 0.45); display: grid; place-items: center; font-weight: 600; font-size: 24px; color: #c9d2ff; transition: all 0.3s; }
  .av.ok { border-color: var(--bon); box-shadow: 0 0 36px rgba(61, 213, 152, 0.45); } .av.mauvais { border-color: var(--danger); box-shadow: 0 0 36px rgba(255, 114, 114, 0.4); }
  h1 { font-size: 26px; font-weight: 650; letter-spacing: -0.04em; line-height: 1.05; text-align: center; } .tel { font-size: 12px; color: var(--muted); letter-spacing: 0.06em; }
  .msg { position: relative; min-height: 46px; } .demo { color: var(--faint); }
  .bas { margin-top: auto; position: relative; display: flex; flex-direction: column; gap: 12px; }
  .liens { display: flex; justify-content: space-between; align-items: center; min-height: 44px; padding: 0 4px; gap: 8px; }
  .liens a { font-size: 14px; font-weight: 550; color: var(--primaire-clair); display: inline-flex; align-items: center; min-height: 44px; } .liens .autre { font-size: 13px; color: var(--muted); font-weight: 400; } .autre span { color: var(--primaire-clair); font-weight: 500; margin-left: 4px; }
  .vide { gap: 28px; } .centre { margin: auto 0; display: flex; flex-direction: column; gap: 12px; } .centre p { color: var(--muted); line-height: 1.45; margin-bottom: 8px; }
</style>
