<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import Etapes from './Etapes.svelte';
  import Interrupteur from './Interrupteur.svelte';
  import { enregistrerPartage, lirePartage, resumePartage } from './actions.ts';

  /** Étape 3 sur 4 : cinq réglages, dont un seul verrouillé (nécessaire au service). */
  const depart = lirePartage(compteCourant());
  let alertes = $state(depart.alertes), rappelsJ1 = $state(depart.rappelsJ1), partenaires = $state(depart.partenaires), audience = $state(depart.audience);
  let pourquoi = $state(false), politique = $state(false);
  const resume = $derived(resumePartage({ alertes, rappelsJ1, partenaires, audience }));
  function enregistrer() { const c = compteCourant(); if (!c) return; enregistrerPartage(c.id, { alertes, rappelsJ1, partenaires, audience }); aller('/bienvenue-notifications'); }
</script>

<Ecran titre="" face="jour" retour="/profil">
  <Etapes etape={3} />
  <section class="col g8"><h1 class="t-titre">Vous choisissez ce que vous partagez</h1><p class="intro">Cinq réglages, une ligne d'explication chacun. Seul le premier est nécessaire au fonctionnement du compte.</p></section>

  <section class="liste" aria-label="Réglages de partage">
    <div class="verrou">
      <div class="ligne"><span class="col g4"><span class="t">Nécessaire au service</span><span class="s">Compte, connexion sécurisée, achats et registre de vos billets.</span></span>
        <span class="etat"><Icone nom="cadenas" taille={14} />Toujours actif</span></div>
      <button type="button" class="pq" aria-expanded={pourquoi} aria-controls="why-needed" onclick={() => (pourquoi = !pourquoi)}>Pourquoi est-ce verrouillé ?<span class="chev" class:ouvert={pourquoi}><Icone nom="suivant" taille={16} /></span></button>
      {#if pourquoi}<p id="why-needed" class="detail">Sans ces données, impossible de créer votre compte ni de garder la trace des billets que vous détenez. Le détail figure dans la politique de confidentialité.</p>{/if}
    </div>
    <Interrupteur bind:actif={alertes} titre="Alertes de prix et de drops" sous="Utilise vos intérêts et votre aéroport pour vous signaler des départs." />
    <Interrupteur bind:actif={rappelsJ1} titre="Rappels d'échéance J-1" badge="Recommandé" sous="Vous prévient avant la date limite pour nommer le voyageur d'un billet." />
    <Interrupteur bind:actif={partenaires} titre="Offres partenaires" sous="Offres d'agences et de partenaires de voyage. Désactivé par défaut." />
    <Interrupteur bind:actif={audience} titre="Mesure d'audience anonyme" sous="Statistiques d'usage regroupées, sans votre nom, pour améliorer l'app." />
  </section>
  <p class="resume" aria-live="polite">{resume}</p>

  <div class="col g8">
    <button type="button" class="pol" aria-expanded={politique} aria-controls="policy-panel" onclick={() => (politique = !politique)}>
      <span class="row g12"><Icone nom="verifie" taille={20} />Lire la politique de confidentialité</span><span class="chev" class:ouvert={politique}><Icone nom="suivant" taille={18} /></span></button>
    {#if politique}<div id="policy-panel" class="panneau">Maquette : le texte de la politique sera rédigé et validé par un juriste avant le lancement. Ici, aucun engagement n'est pris au-delà des réglages ci-dessus.</div>{/if}
  </div>

  <aside class="sombre"><span class="pic" aria-hidden="true"><Icone nom="info" taille={18} /></span>
    <p><strong>Vous pouvez tout changer dans Compte › Données et consentements.</strong> Retirer un consentement est aussi simple que de le donner.</p></aside>
  {#snippet pied()}<button type="button" class="btn" onclick={enregistrer}>Enregistrer mes choix<Icone nom="suivant" taille={20} /></button>{/snippet}
</Ecran>

<style>
  .t-titre { font: 600 40px/42px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; text-wrap: balance; overflow-wrap: anywhere; }
  .intro { color: var(--ink2); font-size: 15px; line-height: 22px; }
  .liste { display: flex; flex-direction: column; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
  .verrou { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; background: #F5F8FB; }
  .ligne { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; } .t { font: 700 15px/20px 'Barlow', sans-serif; } .s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .etat { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 999px; background: var(--surface2); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
  .pq { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; margin: -8px 0 -8px -2px; padding: 0 2px; border: 0; background: transparent; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .chev { display: inline-flex; transition: transform 0.2s ease; } .chev.ouvert { transform: rotate(90deg); }
  .detail { font-size: 13px; line-height: 19px; color: var(--ink2); }
  .resume { margin-top: -6px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .pol { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 52px; padding: 0 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--accent); font: 600 15px/1 'Barlow', sans-serif; text-align: left; cursor: pointer; }
  .panneau { padding: 12px 14px; border-radius: 12px; background: var(--surface2); font-size: 13px; line-height: 19px; color: var(--ink2); }
  .sombre { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: #0B1B2E; color: #fff; }
  .sombre .pic { flex: none; width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; }
  .sombre p { font-size: 14px; line-height: 20px; color: #C9D3DF; } .sombre strong { color: #fff; font-weight: 600; }
</style>
