<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { NIVEAUX } from '../../core/credit.ts';
  import { pointsPourNiveau } from '../../core/score.ts';
  import { NOM_NIVEAU, limitesAvance } from '../../core/avance-loyer.ts';
  import { fcfa } from '../../core/money.ts';
  import { niveauActuel } from './etat.ts';

  /** État vide : compte vierge ou niveau insuffisant. Explique comment monter de niveau. */
  const niveau = $derived(niveauActuel());
  const manque = $derived(pointsPourNiveau(app.score.valeur, 'PLUS'));
  const sansCompte = $derived(!app.compte);
</script>

<Carte>
  <div class="tete">
    <span class="rond"><Icone nom="logement" taille={24} /></span>
    <div>
      <Pastille ton="alerte">Niveau {NOM_NIVEAU[niveau]} · {app.score.valeur} pts</Pastille>
      <h2>{sansCompte ? 'Créez votre compte pour commencer' : "L'avance de loyer s'ouvre au niveau Plus"}</h2>
    </div>
  </div>
  <p class="muted">
    {#if sansCompte}Pour demander une avance de loyer, AssureMe a besoin de votre salaire et de votre jour de paie.
    {:else}AssureMe paie jusqu'à {limitesAvance('PLUS').moisMax} mois d'avance au bailleur dès le niveau Plus (600 points). Il vous manque <b>{manque} points</b>.{/if}
  </p>
</Carte>

<section aria-labelledby="niv">
  <h3 id="niv">Ce que chaque niveau finance</h3>
  <ul class="niveaux">
    {#each NIVEAUX as n (n)}
      {@const l = limitesAvance(n)}
      <li class:actuel={n === niveau}>
        <b>{NOM_NIVEAU[n]}</b>
        <span class="muted">{l.disponible ? `jusqu'à ${l.moisMax} mois d'avance · loyer ${fcfa(l.loyerMax)} au plus` : 'pas d’avance de loyer'}</span>
        {#if n === niveau}<Pastille ton="primaire">Vous</Pastille>{/if}
      </li>
    {/each}
  </ul>
</section>

<section aria-labelledby="monter">
  <h3 id="monter">Comment monter de niveau</h3>
  <ul class="conseils">
    <li><Icone nom="ok" taille={16} trait={2.4} /><span>Payez vos factures et vos mensualités à l'heure : c'est 35 % du score.</span></li>
    <li><Icone nom="ok" taille={16} trait={2.4} /><span>Épargnez chaque mois dans un coffre, même une petite somme.</span></li>
    <li><Icone nom="ok" taille={16} trait={2.4} /><span>Complétez votre dossier : adresse vérifiée, garant ou proche.</span></li>
  </ul>
</section>

<Bouton href={sansCompte ? '/bienvenue' : '/score'}>{sansCompte ? 'Créer mon compte' : 'Voir mon score et gagner des points'}</Bouton>

<style>
  .tete { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 10px; } .tete > div { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .rond { width: 48px; height: 48px; border-radius: 16px; background: var(--primaire-fond); color: var(--pale); display: grid; place-items: center; flex: none; }
  h2 { font-size: 19px; font-weight: 650; letter-spacing: -0.02em; } h3 { font-size: 16px; font-weight: 650; margin-bottom: 8px; } p b { color: var(--texte); }
  ul { list-style: none; background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; }
  .niveaux li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--ligne); } .niveaux li:last-child { border: 0; }
  .niveaux li b { min-width: 52px; } .niveaux .muted { flex: 1; min-width: 160px; font-size: 13px; } .niveaux li.actuel { background: var(--primaire-fond); border-radius: 18px; }
  .conseils li { display: flex; gap: 10px; padding: 12px 14px; font-size: 14px; color: var(--doux); border-bottom: 1px solid var(--ligne); } .conseils li:last-child { border: 0; }
  .conseils :global(svg) { color: var(--bon); flex: none; margin-top: 2px; }
</style>
