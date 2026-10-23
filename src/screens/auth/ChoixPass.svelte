<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fcfa } from '../../core/money.ts';
  import { planDe, tarifPass, trouverEmployeur } from '../../core/inscription.ts';
  import Etape from './Etape.svelte';
  import ListePass from './ListePass.svelte';
  import { etatAuth } from './etat.ts';

  const b = etatAuth().brouillon;
  onMount(() => { if (b.etape < 3) aller(b.etape < 2 ? '/inscription/telephone' : '/inscription/identite', { remplacer: true }); });
  const employeur = trouverEmployeur(b.employeur);
  let pass = $state(b.pass);
  let facturation = $state(b.facturation);
  let detail = $state(false);
  const plan = $derived(planDe(pass));
  const tarif = $derived(tarifPass(pass, facturation, employeur));
  function activer() {
    b.pass = pass; b.facturation = facturation; b.etape = Math.max(b.etape, 4) as typeof b.etape;
    aller('/inscription/creer-code');
  }
</script>

<Etape retourVers="/inscription/identite" repere="ÉTAPE 4 / 5 · VOTRE PASS" segments={5} segmentActif={4} titre="Choisissez votre Pass. Changeable à tout moment."
  sous={employeur ? `${employeur.nom.replace('Groupe ', '')} prend en charge ${Math.round(employeur.part * 100)} % jusqu'à ${fcfa(employeur.plafond)} FCFA par mois.` : 'Sans code employeur, vous payez le Pass en entier. Vous pourrez ajouter un code plus tard dans votre profil.'}>
  <ListePass bind:pass bind:facturation {employeur} />
  <button type="button" class="incl" onclick={() => (detail = true)}>Voir l'inclus<Icone nom="suivant" taille={16} trait={2.2} /></button>

  <div class="recap" aria-live="polite">
    <div class="l"><span>Pass {plan.nom}</span><b class="mono">{fcfa(tarif.total)}</b></div>
    {#if employeur}<div class="l"><span>Part employeur</span><b class="mono bon">− {fcfa(tarif.employeur)}</b></div>{/if}
    <div class="l tot"><span>Prélevé sur votre salaire</span><b class="mono">{fcfa(tarif.membre)} <small>FCFA / {tarif.unite}</small></b></div>
  </div>

  {#snippet pied()}
    <Bouton onclick={activer}>Activer le Pass {plan.nom}<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  {/snippet}
</Etape>

<Feuille bind:ouverte={detail} titre={plan.nom} sous="Pass">
  <p class="muted">Ce que votre Pass couvre dès demain 8 h.</p>
  <ul class="inclus">{#each plan.inclus as [t, v] (t)}<li><span class="v"><Icone nom="ok" taille={16} trait={2.4} /></span><span class="t">{t}</span><b class="mono">{v}</b></li>{/each}</ul>
  <Bouton onclick={() => (detail = false)}>Choisir le Pass {plan.nom}</Bouton>
</Feuille>

<style>
  .incl { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; color: var(--primaire-clair); font-weight: 600; font-size: 14px; }
  .recap { padding: 14px 16px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 8px; }
  .l { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; color: var(--doux); } .bon { color: var(--bon); } small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .tot { border-top: 1px solid var(--ligne); padding-top: 10px; color: var(--texte); font-weight: 600; } .tot b { font-size: 18px; }
  .inclus { list-style: none; display: flex; flex-direction: column; } .inclus li { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--ligne); } .t { flex: 1; font-size: 14px; } .v { color: var(--bon); display: flex; } .inclus b { font-size: 13px; color: var(--pale); font-weight: 500; }
</style>
