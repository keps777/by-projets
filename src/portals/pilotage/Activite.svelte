<script lang="ts">
  import type { Indicateurs } from '../../core/pilotage.ts';
  import { decimal, entier, grand, pourcent } from './format.ts';
  import Courbe from './Courbe.svelte';
  import BarresH from './BarresH.svelte';
  import BarreEmpilee from './BarreEmpilee.svelte';
  import type { LigneH, Serie } from './types.ts';
  let { ind }: { ind: Indicateurs } = $props();

  const s = $derived(ind.sante), c = $derived(ind.coffres);
  const moisM = (v: number) => `${decimal(v / 1e6)} M`;
  const paie = $derived(ind.paie.total);
  const dernier = $derived(paie.at(-1));
  const series = $derived<Serie[]>([
    { nom: 'Mensualités de crédit', valeurs: paie.map((p) => p.credits), couleur: '#3050ff' },
    { nom: 'Versements aux coffres', valeurs: paie.map((p) => p.coffres), couleur: '#ff7a2f', tirets: '6 4' },
    { nom: 'Pass santé', valeurs: paie.map((p) => p.pass), couleur: '#2c3448', tirets: '2 4' }
  ]);
  const sante = $derived<LigneH[]>([
    { libelle: 'Payé par AssureMe', valeur: s.assureMe, texte: grand(s.assureMe), couleur: '#3050ff' },
    { libelle: 'Part des patients', valeur: s.partPatient, texte: grand(s.partPatient), couleur: '#ff7a2f' }
  ]);
  const partenaires = $derived<LigneH[]>(ind.activite.map((a, i) => ({
    libelle: a.libelle, valeur: a.volume, texte: grand(a.volume), couleur: ['#3050ff', '#2c3448', '#9daeff', '#ff7a2f', '#7c93ff', '#cdd2de'][i % 6],
    note: `${entier(a.operations)} ${a.unite} · ${entier(a.partenaires)} partenaire${a.partenaires > 1 ? 's' : ''}${a.local ? ` · dont ${a.local} local` : ''}`
  })));
</script>

<div class="rang">
  <section class="carte a2" aria-labelledby="h-sante">
    <h2 id="h-sante">Paiements santé</h2>
    <div class="tuiles">
      <div class="tuile petite"><span class="k">Volume facturé</span><span class="v">{grand(s.volume)}</span><span class="s">FCFA · {entier(s.factures)} factures</span></div>
      <div class="tuile petite"><span class="k">Factures en retard</span><span class="v">{entier(s.enRetard)}</span><span class="s">{pourcent(s.tauxRetard)} des factures du mois</span></div>
    </div>
    <BarreEmpilee lignes={sante} titre="Répartition du volume santé" />
    <BarresH lignes={sante} titre="Répartition du volume santé" />
    <p class="doux petit">Compte local : {entier(s.local.factures)} facture{s.local.factures > 1 ? 's' : ''}, {entier(s.local.volume)} FCFA. <span class="etiquette">Population simulée + compte local</span></p>
  </section>

  <section class="carte a2" aria-labelledby="h-cof">
    <h2 id="h-cof">Coffres d'épargne</h2>
    <div class="tuiles">
      <div class="tuile petite"><span class="k">Total épargné</span><span class="v">{grand(c.epargne)}</span><span class="s">FCFA</span></div>
      <div class="tuile petite"><span class="k">Coffres ouverts</span><span class="v">{entier(c.nb)}</span><span class="s">versements automatiques : {grand(c.mensuel)} / mois</span></div>
    </div>
    <p class="doux petit">Compte local : {entier(c.local.nb)} coffre{c.local.nb > 1 ? 's' : ''}, {entier(c.local.epargne)} FCFA épargnés{ind.compteLocal && !ind.stockLocal ? ' (non inclus pour un mois passé)' : ''}. Le filtre produit ne s'applique pas aux coffres ni à la santé.</p>
  </section>
</div>

<section class="carte" aria-labelledby="h-paie">
  <div><h2 id="h-paie">Flux de la paie</h2>
    <p class="doux petit">Prélèvements sur salaire, en millions de FCFA, sur six mois. Salaires versés via les employeurs partenaires ce mois-ci : <strong>{dernier ? grand(dernier.salaires) : '—'} FCFA</strong>.</p></div>
  <Courbe titre="Prélèvements sur paie" desc="Courbes des mensualités de crédit, des versements aux coffres et du Pass santé prélevés sur les salaires, sur six mois." libelles={paie.map((p) => p.libelle)} {series} format={moisM} unite="M FCFA" />
</section>

<section class="carte" aria-labelledby="h-part">
  <h2 id="h-part">Activité des partenaires</h2>
  <p class="doux petit">Volume traité ce mois-ci par type de partenaire (la barre suit le volume en FCFA).</p>
  <BarresH lignes={partenaires} titre="Volume par type de partenaire" />
</section>

<style>.petit { font-size: 13px; }</style>
