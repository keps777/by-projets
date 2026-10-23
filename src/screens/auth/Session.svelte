<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { CODE_DEMO } from '../../data/constantes.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { SaisieConnexion } from './saisieConnexion.svelte.ts';
  import { purgerVerrou } from './actions.ts';

  const saisie = new SaisieConnexion((r) => {
    if (r === 'ok') setTimeout(() => aller('/', { remplacer: true }), 650);
    else if (r === 'nouvel_appareil') aller('/nouvel-appareil');
  });
  onMount(() => {
    purgerVerrou();
    if (!app.auth.hash) aller('/bienvenue', { remplacer: true });
    else if (app.auth.connecte) aller('/', { remplacer: true });
  });
  const ton = $derived(saisie.statut === 'faux' || saisie.statut === 'verrouille' ? 'mauvais' : saisie.statut === 'ok' ? 'ok' : 'neutre');
</script>

<main class="session">
  <div class="fond" aria-hidden="true">
    <small>SOLDE</small><b class="mono">••••••</b>
    <i></i><i></i><i></i>
  </div>
  <div class="voile" aria-hidden="true"></div>

  <section class="feuille" aria-labelledby="titre-session">
    <span class="poignee" aria-hidden="true"></span>
    <div class="tete"><span class="ic" aria-hidden="true"><Icone nom="verrou" taille={22} trait={2} /></span><div><h1 id="titre-session">Session expirée</h1><p>Inactif depuis 5 minutes. Retapez votre code.</p></div></div>
    <SaisieCode valeur={saisie.code} variante="points" {ton} secousse={saisie.secousse} etiquette="Votre code" />
    <div class="msg" aria-live="polite">
      {#if saisie.statut === 'faux'}<Alerte ton="erreur">Code incorrect. {saisie.restants} essai{saisie.restants > 1 ? 's' : ''} restant{saisie.restants > 1 ? 's' : ''}.</Alerte>
      {:else if saisie.statut === 'ok'}<Alerte ton="succes">Session rétablie.</Alerte>
      {:else if saisie.statut === 'verrouille'}<Alerte ton="erreur">Trop d'erreurs. Compte verrouillé 15 minutes.</Alerte>
      {:else if saisie.statut === 'bloque'}<Alerte ton="erreur">Cet appareil est bloqué. Réinitialisez votre code par SMS.</Alerte>
      {:else}<Alerte ton="info">Votre code{#if app.mode === 'demo'} <span class="mono demo">· démo : {CODE_DEMO}</span>{/if}</Alerte>{/if}
    </div>
    <Clavier compact onchiffre={(d) => saisie.chiffre(d)} oneffacer={() => saisie.efface()} desactive={saisie.bloquee} />
    {#if saisie.statut === 'ok'}<Bouton onclick={() => aller('/', { remplacer: true })}>Reprendre ma session<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else if saisie.statut === 'verrouille'}<Bouton variante="danger" href="/verrou">Voir le verrouillage<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else if saisie.statut === 'bloque'}<Bouton href="/code-oublie">Réinitialiser mon code</Bouton>
    {:else}<Bouton variante="secondaire" href="/deconnexion">Se déconnecter</Bouton>{/if}
  </section>
</main>

<style>
  .session { position: relative; min-height: 100dvh; overflow: hidden; }
  .fond { padding: calc(env(safe-area-inset-top) + 24px) 20px; display: flex; flex-direction: column; gap: 14px; filter: blur(2px); } .fond small { font: 500 10.5px var(--mono); letter-spacing: 0.12em; color: var(--muted); } .fond b { font-size: 40px; font-weight: 500; letter-spacing: -0.03em; }
  .fond i { display: block; height: 96px; border-radius: 20px; background: var(--carte); }
  .voile { position: absolute; inset: 0; background: linear-gradient(rgba(7, 9, 15, 0.35), rgba(7, 9, 15, 0.8)); }
  .feuille { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 28px 28px 0 0; background: #0b0f1a; border-top: 1px solid rgba(124, 147, 255, 0.35); box-shadow: 0 -30px 80px -20px rgba(48, 80, 255, 0.45); padding: 10px 20px calc(env(safe-area-inset-bottom) + 20px); display: flex; flex-direction: column; gap: 12px; animation: monte 0.35s ease-out both; }
  .poignee { align-self: center; width: 40px; height: 4px; border-radius: 2px; background: #2a3347; }
  .tete { display: flex; align-items: center; gap: 12px; } .ic { width: 44px; height: 44px; border-radius: 14px; background: rgba(48, 80, 255, 0.16); color: var(--primaire-clair); display: grid; place-items: center; flex: none; }
  h1 { font-size: 18px; font-weight: 650; letter-spacing: -0.02em; } .tete p { font-size: 12px; color: var(--muted); } .msg { min-height: 46px; } .demo { color: var(--faint); }
  @keyframes monte { from { transform: translateY(40px); opacity: 0; } }
</style>
