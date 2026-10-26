<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import Etapes from './Etapes.svelte';
  import Interrupteur from './Interrupteur.svelte';
  import { largeur } from './largeur.svelte.ts';
  import { enregistrerPartage, lirePartage, resumePartage } from './actions.ts';

  /** Étape 3 sur 4 : cinq réglages, dont un seul verrouillé (nécessaire au service). */
  const depart = lirePartage(compteCourant());
  let alertes = $state(depart.alertes), rappelsJ1 = $state(depart.rappelsJ1), partenaires = $state(depart.partenaires), audience = $state(depart.audience);
  let pourquoi = $state(false), politique = $state(false);
  const resume = $derived(resumePartage({ alertes, rappelsJ1, partenaires, audience }));
  const recap = $derived([{ t: 'Alertes de prix et de drops', on: alertes }, { t: 'Rappels d\'échéance J-1', on: rappelsJ1 }, { t: 'Offres partenaires', on: partenaires }, { t: 'Mesure d\'audience anonyme', on: audience }]);
  function enregistrer() { const c = compteCourant(); if (!c) return; enregistrerPartage(c.id, { alertes, rappelsJ1, partenaires, audience }); aller('/bienvenue-notifications'); }
</script>

{#snippet piedMobile()}<button type="button" class="btn" onclick={enregistrer}>Enregistrer mes choix<Icone nom="suivant" taille={20} /></button>{/snippet}
<Ecran titre="" face="jour" retour="/profil" large pied={largeur.pc ? undefined : piedMobile}>
  <div class="grille">
    <div class="gauche">
      <Etapes etape={3} ensuite="Ensuite : notifications" />
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

      {#if !largeur.pc}<aside class="sombre"><span class="pic" aria-hidden="true"><Icone nom="info" taille={18} /></span>
        <p><strong>Vous pouvez tout changer dans Compte › Données et consentements.</strong> Retirer un consentement est aussi simple que de le donner.</p></aside>{/if}
      {#if largeur.pc}<button type="button" class="btn cta" onclick={enregistrer}>Enregistrer mes choix<Icone nom="suivant" taille={20} /></button>{/if}
    </div>

    {#if largeur.pc}
      <aside class="recap" data-surface="panel" aria-labelledby="recap-titre">
        <h2 id="recap-titre">Votre récapitulatif</h2>
        <ul class="liste-plain lignes" aria-labelledby="recap-titre">
          <li><span>Nécessaire au service</span><span class="v">Toujours actif</span></li>
          {#each recap as r (r.t)}<li><span>{r.t}</span><span class="v" class:on={r.on}>{r.on ? 'Activé' : 'Désactivé'}</span></li>{/each}
        </ul>
        <div class="info"><span class="pic" aria-hidden="true"><Icone nom="info" taille={20} /></span>
          <p><strong>Vous pouvez tout changer dans Compte › Données et consentements.</strong> Retirer un consentement est aussi simple que de le donner.</p></div>
        <p class="hyp"><span class="h">[H]</span><span>Liste et textes des consentements : à valider avec un juriste. Consentements séparés (conditions, marketing) selon EF-01.</span></p>
      </aside>
    {/if}
  </div>
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
  .grille, .gauche { display: contents; } .recap { display: none; }
  @media (min-width: 900px) {
    .grille { display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, 38%, 440px); gap: 24px; align-items: start; }
    .gauche { display: flex; flex-direction: column; gap: 20px; max-width: 760px; min-width: 0; }
    .t-titre { font-size: 40px; line-height: 40px; letter-spacing: 0; } .intro { font-size: 17px; line-height: 26px; }
    .verrou { padding: 16px 18px; border-radius: 20px 20px 0 0; gap: 8px; } .ligne .col { gap: 3px; } .t { font-size: 17px; line-height: 22px; } .s { font-size: 14px; line-height: 20px; }
    .etat { min-height: 32px; height: auto; padding: 0 12px; background: var(--surface2); border: 1px solid #7A8597; color: var(--ink); font-size: 13px; letter-spacing: 0; }
    .pq { margin: 0 0 0 -4px; padding: 0 4px; font-size: 15px; font-weight: 700; } .detail { font-size: 14px; line-height: 21px; color: var(--ink); }
    .resume { margin: 0; font: 600 15px/22px 'Barlow', sans-serif; color: var(--ink); }
    .pol { min-height: 56px; padding: 0 18px; border-radius: 16px; border-color: #7A8597; color: var(--accent-2); font-size: 16px; font-weight: 700; }
    .panneau { padding: 14px 16px; border-radius: 14px; background: var(--surface); border: 1px dashed #7A8597; font-size: 14px; line-height: 21px; }
    .cta { width: auto; min-width: 280px; min-height: 56px; padding: 8px 22px; font-size: 17px; align-self: flex-start; }
    .recap { display: flex; flex-direction: column; gap: 14px; padding: 22px; border-radius: 20px; background: #0B1B2E; color: #fff; position: sticky; top: 16px; min-width: 0; }
    .recap h2 { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
    .lignes li { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 6px 0; border-top: 1px solid rgba(255, 255, 255, 0.14); font-size: 15px; line-height: 20px; }
    .v { flex: none; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #C9D3DF; } .v.on { color: #7CE3B5; }
    .info { display: flex; align-items: flex-start; gap: 12px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.14); }
    .info .pic { flex: none; width: 36px; height: 36px; border-radius: 10px; background: rgba(255, 255, 255, 0.12); color: #fff; display: flex; align-items: center; justify-content: center; }
    .info p { margin: 0; font-size: 15px; line-height: 22px; color: #C9D3DF; } .info strong { color: #fff; font-weight: 600; }
    .hyp { margin: 0; display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 20px; color: #C9D3DF; }
    .h { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; background: rgba(255, 210, 63, 0.16); color: #FFD23F; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
  }
</style>
