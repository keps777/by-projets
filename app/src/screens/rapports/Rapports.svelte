<script lang="ts">
  // Rapports (planches Rapport, RapportSemaine, RapportMois, JourRapport) : jour, semaine, mois, puis export.
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Segment from '../../ui/Segment.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { COULEUR_SANS_PROJET, profil } from '../../data/requetes.ts';
  import { moisDe } from '@core/dates.ts';
  import { atteint, calculerPoints, contenuDuJour, modifieDepuis, preparer, texteDuContenu } from './calcul.ts';
  import { donneesRapport, rapportDuJour } from './donnees.ts';
  import { calculerJours, ratiosDuPoint } from './syntheses.ts';
  import { decaler, estVue, libellePeriode, nomMois, periodeDe, semaineIso, type Vue } from './periodes.ts';
  import CartePoint from './CartePoint.svelte';
  import PanneauExport from './PanneauExport.svelte';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const auj = $derived(aujourdhui());
  const vue = $derived<Vue>(estVue(routeur.params.get('onglet')) ? (routeur.params.get('onglet') as Vue) : 'jour');
  const jourParam = $derived(routeur.params.get('jour'));
  const periode = $derived(periodeDe(vue, jourParam && /^\d{4}-\d{2}-\d{2}$/.test(jourParam) ? jourParam : auj));
  const suivanteFuture = $derived(decaler(periode, 1).debut > auj);

  const p = $derived(profil());
  const nom = $derived(p?.nom_rapport?.trim() || p?.prenom || '');
  const langue = $derived(p?.langue_rapport ?? 'fr');

  const d = $derived(donneesRapport());
  const prep = $derived(preparer(d));
  const points = $derived(calculerPoints(prep, d, periode.debut, periode.fin));
  const jours = $derived(vue === 'jour' ? [] : calculerJours(prep, d, periode.debut, periode.fin, auj));
  const nbAtteints = $derived(points.filter((x) => atteint(x.ratio)).length);
  const joursPasses = $derived(jours.filter((j) => !j.futur).length);

  const resume = $derived(vue === 'jour'
    ? `${nbAtteints} point${nbAtteints > 1 ? 's' : ''} atteint${nbAtteints > 1 ? 's' : ''} sur ${points.length}`
    : `Récapitulatif de ${joursPasses} rapport${joursPasses > 1 ? 's' : ''}`);
  const sousTitre = $derived(vue === 'semaine' ? `semaine ${semaineIso(periode.debut)}` : nomMois(moisDe(periode.debut)));

  // Rapport enregistré (envoyé) pour ce jour, et s'il a changé depuis.
  const enregistre = $derived(vue === 'jour' ? rapportDuJour(periode.debut) : undefined);
  const modifie = $derived(!!enregistre?.envoye_a && modifieDepuis(enregistre.contenu, contenuDuJour(periode.debut, points)));
  const heureEnvoi = $derived(enregistre?.envoye_a ? new Date(enregistre.envoye_a).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  let ancienOuvert = $state(false);
  const ancienTexte = $derived(enregistre ? texteDuContenu(enregistre.contenu, nom, langue) : null);

  let exportOuvert = $state(routeur.params.get('export') === '1');

  const couleur = (c: string | null) => couleurRubrique(c ?? COULEUR_SANS_PROJET, theme.mode);
  const etatBande = (r: number | null) => (r == null ? 'neutre' : r >= 1 ? 'bon' : r > 0 ? 'partiel' : 'mauvais');
  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function changerVue(v: Vue): void { routeur.definir('onglet', v); }
  function aller(n: number): void { routeur.definir('jour', decaler(periode, n).debut); }
</script>

<EcranPage gap={14}>
  <div class="haut">
    <h1 class="titre">Rapports</h1>
    <div class="boutons">
      <a class="pilule" href="/rapports/archives"><Icone nom="archive" taille={16} />Archives</a>
      <a class="rond" href="/reglages#points" aria-label="Paramétrer les points du rapport"><Icone nom="reglages" taille={18} /></a>
    </div>
  </div>

  <Segment options={[{ valeur: 'jour', label: 'Jour' }, { valeur: 'semaine', label: 'Semaine' }, { valeur: 'mois', label: 'Mois' }]} valeur={vue} onchoisir={changerVue} />

  <div class="periode">
    <button type="button" class="fleche" aria-label="Période précédente" onclick={() => aller(-1)}><Icone nom="retour" taille={16} trait={2.2} /></button>
    <div class="libelle">
      <span class="nom">{libellePeriode(periode)}</span>
      <span class="muted resume">{resume}</span>
    </div>
    <button type="button" class="fleche" aria-label="Période suivante" disabled={suivanteFuture} onclick={() => aller(1)}><Icone nom="suivant" taille={16} trait={2.2} /></button>
  </div>

  <div class="bande" aria-hidden="true">
    {#each points as x (x.point.id)}<span class={etatBande(x.ratio)} style:--c={couleur(x.couleur)}></span>{/each}
  </div>

  {#if enregistre?.envoye_a}
    <div class="envoi" class:modifie>
      <Icone nom={modifie ? 'reporter' : 'coche'} taille={15} trait={2.4} />
      <span>{modifie ? `Modifié depuis l’envoi (${heureEnvoi})` : `Envoyé le ${heureEnvoi}`}</span>
      {#if modifie && ancienTexte}<button type="button" onclick={() => (ancienOuvert = true)}>Voir l’envoi</button>{/if}
    </div>
  {/if}

  {#if !points.length}
    <div class="carte vide">
      <p>Aucun point dans ton rapport.</p>
      <a href="/reglages#points">Choisir les points</a>
    </div>
  {/if}

  {#each points as x, i (x.point.id)}
    <CartePoint p={x} n={i + 1} {vue} {langue} couleur={couleur(x.couleur)} ratios={vue === 'jour' ? [] : ratiosDuPoint(jours, x.point.id)}
      lettres={vue === 'semaine' ? LETTRES : []} {sousTitre} />
  {/each}

  <div class="flottant">
    <button type="button" onclick={() => (exportOuvert = true)}><Icone nom="partager" taille={18} trait={2.2} />Exporter le rapport</button>
  </div>
</EcranPage>

<Volet ouvert={exportOuvert} onfermer={() => (exportOuvert = false)} label="Exporter le rapport">
  <PanneauExport {periode} {points} {nom} {langue} />
</Volet>

<Volet ouvert={ancienOuvert} onfermer={() => (ancienOuvert = false)} label="Texte envoyé">
  <h2 class="titre">Texte envoyé</h2>
  <p class="muted petit">Le rapport a changé depuis son envoi ({heureEnvoi}). Voici ce qui était parti.</p>
  <div class="ancien">{ancienTexte}</div>
</Volet>

<style>
  .haut { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 30px; }
  .boutons { display: flex; gap: 6px; }
  .pilule { height: 44px; padding: 0 14px; border-radius: 22px; background: var(--surface); border: 1px solid var(--ligne); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .periode { display: flex; align-items: center; gap: 8px; }
  .fleche { width: 44px; height: 44px; flex: none; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; display: flex; align-items: center; justify-content: center; }
  .fleche:disabled { opacity: 0.35; cursor: default; }
  .libelle { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .nom { font-size: 15px; font-weight: 600; }
  .resume { font-size: 12px; }
  .bande { flex: none; display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 2px; }
  .bande span { flex: 1; background: var(--piste); }
  .bande .bon { background: var(--bon); }
  .bande .partiel { background: var(--c); }
  .bande .mauvais { background: var(--mauvais); }
  .envoi { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--bon); background: var(--bon-fond); border-radius: 12px; padding: 8px 12px; }
  .envoi.modifie { color: var(--alerte); background: var(--alerte-fond); }
  .envoi span { flex: 1; }
  .envoi button { min-height: 32px; border: 0; background: none; color: inherit; font-size: 13px; font-weight: 700; text-decoration: underline; padding: 0; }
  .vide { padding: 16px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .vide a { color: var(--accent-encre); font-weight: 600; min-height: 44px; display: flex; align-items: center; }
  .flottant { position: sticky; bottom: 0; margin-top: auto; padding-top: 8px; display: flex; }
  .flottant button { flex: 1; height: 54px; border-radius: 18px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: var(--ombre); }
  .petit { font-size: 13px; }
  .ancien { background: var(--surface-2); border-radius: 14px; padding: 12px 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
