<script lang="ts">
  import type { Niveau } from '../../core/credit.ts';
  import { libelleMoisCourt, type Indicateurs } from '../../core/pilotage.ts';
  import { entier, grand, maj, pourcent } from './format.ts';
  import type { EtatPilotage } from './etat.ts';
  import Barres from './Barres.svelte';
  import BarresH from './BarresH.svelte';
  import BarreEmpilee from './BarreEmpilee.svelte';
  import { aller, choisirMode } from './actions.ts';
  import type { Barre, LigneH } from './types.ts';
  let { ind, e, sources }: { ind: Indicateurs; e: EtatPilotage; sources: { cle: string; libelle: string; presente: boolean }[] } = $props();

  const MOIS_PLEINS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const COUL_PRODUIT = ['#3050ff', '#2c3448', '#9daeff', '#ff7a2f', '#7c93ff', '#cdd2de'];
  const COUL_NIVEAU: Record<Niveau, string> = { START: '#cdd2de', PLUS: '#9daeff', PRO: '#3050ff', ELITE: '#2c3448' };
  const annee = $derived(ind.periode.cle.slice(0, 4));
  const defaut = $derived(Number(ind.periode.cle.slice(5, 7)) - 1);
  let choix = $state<number | null>(null); let pilier = $state(-1);
  $effect(() => { void ind.periode.cle; choix = null; pilier = -1; });
  const bar = $derived(choix ?? defaut);

  const mensuel = $derived(ind.tresorerie);
  const cumul = $derived(mensuel.reduce<number[]>((a, v) => (a.push((a.at(-1) ?? 0) + v), a), []));
  const valeurs = $derived(e.mode === 'mensuel' ? mensuel : cumul);
  const barres = $derived<Barre[]>(valeurs.map((v, i) => ({
    libelle: libelleMoisCourt(`${annee}-${String(i + 1).padStart(2, '0')}`).replace('.', ''), valeur: v,
    couleur: i === bar ? '#ff7a2f' : e.mode === 'mensuel' && mensuel[i] >= 260 ? '#3050ff' : '#9daeff',
    aria: `${MOIS_PLEINS[i]} : ${entier(v)} millions`, texte: `${entier(v)} M`
  })));
  const lecture = $derived(e.mode === 'mensuel'
    ? `${maj(MOIS_PLEINS[bar])} : ${entier(mensuel[bar])} millions de FCFA décaissés, soit ${Math.round((mensuel[bar] / cumul[11]) * 100)} % de l'année.`
    : `Cumul à fin ${MOIS_PLEINS[bar]} : ${entier(cumul[bar])} millions sur ${entier(cumul[11])} pour l'année.`);

  const produits = $derived<LigneH[]>(ind.encours.lignes.map((l, i) => ({
    libelle: l.libelle, valeur: l.valeur, texte: `${grand(l.valeur)}`, couleur: COUL_PRODUIT[i % COUL_PRODUIT.length],
    note: l.local > 0 ? `dont compte local ${entier(l.local)}` : undefined
  })));
  const noteProduit = $derived(pilier < 0 ? "Touchez un produit pour isoler sa part de l'encours." : `${ind.encours.lignes[pilier]?.libelle} : ${pourcent(ind.encours.lignes[pilier]?.part ?? 0)} de l'encours affiché (${grand(ind.encours.total)}).`);
  const niveaux = $derived<LigneH[]>(ind.niveaux.lignes.map((n) => ({
    libelle: `Niveau ${n.niveau}`, valeur: n.effectif, texte: `${entier(n.effectif)} · ${pourcent(n.part)}`, couleur: COUL_NIVEAU[n.niveau], note: n.local > 0 ? 'dont le compte local' : undefined
  })));
</script>

<div class="rang">
  <section class="carte a3" aria-labelledby="h-tres">
    <div class="tete">
      <div><h2 id="h-tres">Besoin de trésorerie par mois</h2><p class="doux">Millions de FCFA décaissés. La rentrée concentre le besoin en août et septembre. <span class="etiquette">Population simulée</span></p></div>
      <div class="segment" role="group" aria-label="Mode d'affichage">
        <button aria-pressed={e.mode === 'mensuel'} onclick={() => choisirMode('mensuel')}>Mensuel</button><button aria-pressed={e.mode === 'cumule'} onclick={() => choisirMode('cumule')}>Cumulé</button>
      </div>
    </div>
    <Barres titre="Besoin de trésorerie par mois" desc={`Décaissements de ${annee} en millions de FCFA, ${e.mode === 'mensuel' ? 'mois par mois' : 'cumulés'}. Pic en septembre.`} donnees={barres} selection={bar} onchoisir={(i) => (choix = i)} unite="millions de FCFA" serie={e.mode === 'mensuel' ? 'Décaissé' : 'Cumulé'} />
    <p class="note" role="status" aria-live="polite">{lecture}</p>
    <button class="note alerte bouton" onclick={() => aller('tresorerie')}>Ligne de refinancement de la rentrée à confirmer avec le partenaire avant juillet. Ouvrir la trésorerie ›</button>
  </section>

  <section class="carte a2" aria-labelledby="h-enc">
    <h2 id="h-enc">Encours par produit</h2>
    <BarreEmpilee lignes={produits} selection={pilier} titre="Encours par produit" />
    <BarresH lignes={produits} selection={pilier} onchoisir={(i) => (pilier = pilier === i ? -1 : i)} titre="Encours par produit" />
    <p class="doux petit">{noteProduit}</p>
    <p class="doux petit">Capital restant dû : amortissement linéaire sur la durée, crédits terminés exclus.</p>
  </section>
</div>

<div class="rang">
  <section class="carte a1" aria-labelledby="h-niv">
    <h2 id="h-niv">Membres par niveau de score</h2>
    <BarresH lignes={niveaux} titre="Membres par niveau de score" />
    <p class="doux petit">{entier(ind.niveaux.total)} membres. Niveaux : START dès 500, PLUS dès 600, PRO dès 700, ELITE dès 800.</p>
  </section>
  <section class="carte a1" aria-labelledby="h-src">
    <h2 id="h-src">Sources lues</h2>
    <p class="doux">Lecture seule du magasin local. Une fonctionnalité apparaît ici dès que le membre l'a ouverte.</p>
    <ul class="liste">
      <li class="stat"><span>Compte local</span><strong>{ind.compteLocal ? 'inclus' : 'aucun compte'}</strong></li>
      {#each sources as s (s.cle)}<li class="stat"><span>{s.libelle}</span><strong class:doux={!s.presente}>{s.presente ? 'lue' : 'absente'}</strong></li>{/each}
    </ul>
    {#if ind.compteLocal && !ind.stockLocal}<p class="note">Pour les mois passés, les crédits, coffres et le score du compte local ne sont pas inclus (pas d'historique conservé).</p>{/if}
  </section>
</div>

<style>
  .tete { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; } .tete p { margin-top: 4px; font-size: 14px; }
  .bouton { text-align: left; min-height: 44px; } .petit { font-size: 13px; }
</style>
