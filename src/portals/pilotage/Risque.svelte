<script lang="ts">
  import { depasseSeuil, type Indicateurs } from '../../core/pilotage.ts';
  import { basculerRelance, regler } from './actions.ts';
  import { decimal, entier, pourcent } from './format.ts';
  import type { EtatPilotage } from './etat.ts';
  import Barres from './Barres.svelte';
  import JaugeArc from './JaugeArc.svelte';
  import type { Barre } from './types.ts';
  let { ind, e }: { ind: Indicateurs; e: EtatPilotage } = $props();

  const NOMS_RELANCES = ['SMS de rappel à J+3', 'Appel du conseiller à J+10', 'Signalement à l\'employeur à J+15'];
  const SHORT = ['< 10 %', '10-20', '20-25', '25-33', '> 33 %'];
  const taux = $derived(ind.retards.taux);
  const depasse = $derived(depasseSeuil(taux, e.seuil));
  const part = $derived(ind.partSalaire);
  const barres = $derived<Barre[]>(part.classes.map((c, i) => ({
    libelle: SHORT[i], valeur: c.effectif, couleur: c.alerte ? '#ff7a2f' : '#3050ff',
    aria: `${c.libelle} du salaire : ${entier(c.effectif)} emprunteurs${c.local ? ', dont le compte local' : ''}`, texte: `${entier(c.effectif)}${c.local ? ` (dont ${c.local} local)` : ''}`
  })));
  const local = $derived(part.classes.findIndex((c) => c.local > 0));
</script>

<div class="rang">
  <section class="carte a2" aria-labelledby="h-seuil">
    <h2 id="h-seuil">Retards de plus de 30 jours</h2>
    <JaugeArc valeur={taux} max={5} seuil={e.seuil} alerte={depasse} titre="Taux de retard de plus de 30 jours" desc={`${pourcent(taux)} de retards, seuil interne ${pourcent(e.seuil)} sur une échelle de 5 %`} texte={pourcent(taux)} sous={`seuil ${pourcent(e.seuil)}`} />
    <label class="curseur"><span class="stat"><span>Seuil interne</span><strong>{pourcent(e.seuil)}</strong></span>
      <input type="range" min="1" max="5" step="0.5" value={e.seuil} oninput={(ev) => regler('seuil', parseFloat(ev.currentTarget.value))} aria-label="Seuil interne en pourcentage" aria-valuetext={pourcent(e.seuil)} /></label>
    <p class="note" class:alerte={depasse} role="status" aria-live="polite">{depasse ? 'Les retards dépassent le seuil interne : déclenchez les relances et prévenez le partenaire financier.' : `Les retards de plus de 30 jours (${pourcent(taux)}) restent sous le seuil interne.`}</p>
    <p class="doux petit">{entier(ind.retards.retards)} crédit{ind.retards.retards > 1 ? 's' : ''} en retard sur {entier(ind.retards.credits)} en cours{ind.retards.local.credits ? ` (compte local : ${ind.retards.local.retards} sur ${ind.retards.local.credits})` : ''}.</p>
    <h3>Relances automatiques</h3>
    <div class="liste">{#each NOMS_RELANCES as n, i (n)}
      <button class="interrupteur" role="switch" aria-checked={e.relances[i]} onclick={() => basculerRelance(i)}>{n}<span class="piste" aria-hidden="true"><i></i></span></button>{/each}</div>
  </section>

  <section class="carte a3" aria-labelledby="h-part">
    <div><h2 id="h-part">Mensualités de crédit / salaire net</h2><p class="doux petit">Part du salaire prélevée par l'ensemble des crédits en cours. Au-delà de 33 %, un crédit n'est plus accordé. <span class="etiquette">Population simulée + compte local</span></p></div>
    <Barres titre="Emprunteurs par part de salaire" desc="Nombre d'emprunteurs par classe de part du salaire net consacrée aux mensualités ; la classe au-dessus de 33 % est en orange." donnees={barres} unite="emprunteurs" serie="Emprunteurs" hauteur={230} />
    <p class="note" class:alerte={part.alertes > 0}><strong>{entier(part.alertes)}</strong> emprunteur{part.alertes > 1 ? 's' : ''} sur {entier(part.total)} au-dessus de 33 % ({pourcent(part.tauxAlerte)}).
      {#if ind.stockLocal && part.classes.some((c) => c.local)}Compte local : classe « {part.classes[local].libelle} »{#if part.classes[local].alerte} <b>alerte</b>{/if}.{:else if ind.compteLocal && ind.stockLocal}Compte local : aucun crédit en cours.{/if}</p>
  </section>
</div>

<section class="carte" aria-labelledby="h-rep">
  <h2 id="h-rep">Reports de prélèvement</h2>
  {#if !ind.compteLocal}<p class="doux">Aucun compte local : pas de paie à lire.</p>
  {:else if ind.reports.paies === 0}<p class="doux">Aucune paie traitée sur le compte local pour l'instant.</p>
  {:else}
    <div class="tuiles">
      <div class="tuile petite"><span class="k">Paies traitées (compte local)</span><span class="v">{ind.reports.paies}</span></div>
      <div class="tuile petite"><span class="k">Paies avec un report</span><span class="v">{ind.reports.paiesAvecReport}</span><span class="s">{decimal(ind.reports.paies ? (ind.reports.paiesAvecReport / ind.reports.paies) * 100 : 0)} % des paies</span></div>
      <div class="tuile petite"><span class="k">Prélèvements reportés</span><span class="v">{ind.reports.reports}</span><span class="s">reportés sans pénalité au mois suivant</span></div>
    </div>
  {/if}
  <p class="doux petit">Un prélèvement est reporté d'un mois, sans pénalité, quand le solde ne suffit pas le jour de paie. Les reports sont relus dans les notifications de paie du compte local.</p>
</section>

<style>
  .curseur { display: flex; flex-direction: column; gap: 4px; } .petit { font-size: 13px; }
</style>
