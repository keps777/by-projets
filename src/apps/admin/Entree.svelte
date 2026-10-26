<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { connecter, compteCourant, estAdmin } from '../../domain/compte.ts';
  import { consigner } from '../../domain/audit.ts';
  import Logo from '../../ui/Logo.svelte';
  import Icone from '../../ui/Icone.svelte';
  /** Entrée de la console : en démonstration, un bouton ouvre la session de l'administrateur adm-01 (double authentification simulée). */
  const admin = $derived(estAdmin(compteCourant()));
  function entrer() { if (connecter('adm-01')) { consigner('adm-01', 'Connexion à la console', 'Administration', 'Double authentification vérifiée (démo).', 'info'); aller('/admin/droits'); } }
</script>
<div class="nx entree" data-face="nuit">
  <div class="carte col g16">
    <Logo taille={30} /><span class="puce">Administration</span>
    <h1 class="t-ecran">Console d’administration</h1>
    <p class="t-sec">Registre interne des droits de voyage, drops, agences partenaires et journal d’audit. Réservée aux comptes administrateurs.</p>
    {#if admin}<button type="button" class="btn" onclick={() => aller('/admin/droits')}>Ouvrir la console</button>
    {:else}<button type="button" class="btn" onclick={entrer}><Icone nom="verifie" taille={20} />Entrer comme adm-01 (démo)</button><p class="t-aide">Démonstration : la double authentification (MFA) est simulée, aucun mot de passe n’est demandé.</p>{/if}
  </div>
</div>
<style>.entree { min-height: 100dvh; display: grid; place-items: center; padding: 24px; } .carte { width: min(100%, 480px); }</style>
