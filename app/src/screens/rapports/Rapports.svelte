<script lang="ts">
  import { HEURE_RAPPORT_DEFAUT } from '@core/defauts.ts';
  // Rapports (planches Rapport, RapportSemaine, RapportMois, JourRapport) : jour, semaine, mois, puis export.
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Segment from '../../ui/Segment.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { aujourdhui, horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { COULEUR_SANS_PROJET, profil } from '../../data/requetes.ts';
  import { moisDe } from '@core/dates.ts';
  import { atteint, calculerPoints, contenuDuJour, modifieDepuis, preparer, texteDuContenu, type PointCalcule } from './calcul.ts';
  import { donneesRapport, rapportDuJour } from './donnees.ts';
  import { calculerJours, ratiosDuPoint } from './syntheses.ts';
  import { decaler, estVue, libellePeriode, nomMois, periodeDe, semaineIso, type Vue } from './periodes.ts';
  import { styleCouleur } from '../../ui/couleurs.ts';
  import VoletSaisie from '../projets/VoletSaisie.svelte';
  import VoletSession from './VoletSession.svelte';
  import { chronos } from '../../data/chronos.svelte.ts';
  import { enregistrerSession, type ValeurSession } from './session.ts';
  import { mesuresDuPoint } from './mesures-point.ts';
  import CartePoint from './CartePoint.svelte';
  import PanneauExport from './PanneauExport.svelte';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const auj = $derived(aujourdhui());
  const vue = $derived<Vue>(estVue(routeur.params.get('onglet')) ? (routeur.params.get('onglet') as Vue) : 'jour');
  const jourParam = $derived(routeur.params.get('jour'));
  const p = $derived(profil());
  // On ouvre toujours sur la journée en cours ; avant l'heure du rapport (23:45 par défaut), elle est « en cours » : un zéro n'est pas un échec.
  const minutesRapport = $derived.by(() => { const [h, m] = (p?.heure_rapport ?? HEURE_RAPPORT_DEFAUT).split(':').map(Number); return (h || 0) * 60 + (m || 0); });
  const avantRapport = $derived(maintenantLocal().minutes < minutesRapport);
  const periode = $derived(periodeDe(vue, jourParam && /^\d{4}-\d{2}-\d{2}$/.test(jourParam) ? jourParam : auj));
  const suivanteFuture = $derived(decaler(periode, 1).debut > auj);
  /** Journée pas encore close : rien n'est « manqué », on n'affiche pas de rouge. */
  const enCours = $derived(vue === 'jour' && periode.debut === auj && avantRapport);

  const nom = $derived(p?.nom_rapport?.trim() || p?.prenom || '');
  const langue = $derived(p?.langue_rapport ?? 'fr');

  const d = $derived(donneesRapport());
  const prep = $derived(preparer(d));
  const points = $derived(calculerPoints(prep, d, periode.debut, periode.fin));
  const jours = $derived(vue === 'jour' ? [] : calculerJours(prep, d, periode.debut, periode.fin, auj));
  const nbAtteints = $derived(points.filter((x) => atteint(x.ratio)).length);
  const joursPasses = $derived(jours.filter((j) => !j.futur).length);

  const resume = $derived(enCours && !nbAtteints ? `Journée en cours · rapport à ${p?.heure_rapport ?? HEURE_RAPPORT_DEFAUT}` : vue === 'jour'
    ? `${enCours ? 'En cours · ' : ''}${nbAtteints} point${nbAtteints > 1 ? 's' : ''} atteint${nbAtteints > 1 ? 's' : ''} sur ${points.length}`
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
  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  // Modifier à la main les valeurs d'un point (jour) : même saisie manuelle que dans les sous-projets, qui se mettent à jour d'eux-mêmes.
  let edition = $state<PointCalcule | null>(null);
  const mesuresEdition = $derived(edition ? mesuresDuPoint(edition.point, d, periode.debut, periode.fin) : null);
  const metriquesEdition = $derived(mesuresEdition?.metriques ?? []);
  const periodeEdition = $derived(mesuresEdition?.periode ?? { debut: periode.debut, fin: null });
  // Chrono d'un point (jour en cours seulement) : ▶ lance, ■ arrête et ouvre la pop-up des autres mesures, puis on valide.
  const chronometrable = $derived(vue === 'jour' && periode.debut === auj);
  const peutChronometrer = (x: PointCalcule) => chronometrable && !!x.point.projet_id && (x.point.mesures ?? []).some((m) => m.cle === 'temps');
  let sessionPour = $state<PointCalcule | null>(null);
  const mesuresSession = $derived(sessionPour ? mesuresDuPoint(sessionPour.point, d, periode.debut, periode.fin) : null);
  function chronoDe(x: PointCalcule) { return { etat: chronos.etat(x.point.id), secondes: chronos.secondes(x.point.id, horloge.maintenant) }; }
  function toucherChrono(x: PointCalcule): void {
    const etat = chronos.etat(x.point.id);
    if (etat === 'repos') { chronos.demarrer(x.point.id); return; }
    if (etat === 'cours') chronos.arreter(x.point.id);
    sessionPour = x;
  }
  function validerSession(autres: ValeurSession[], secondes: number): void {
    const x = sessionPour;
    const s = x && chronos.sessions[x.point.id];
    if (!x || !s || !x.point.projet_id) return;
    // Le temps enregistré est celui du volet : le chrono, ou ce que l'utilisateur a corrigé.
    enregistrerSession(x.point.projet_id, s.jour, secondes, autres);
    chronos.oublier(x.point.id);
    sessionPour = null;
    dire(`Session ajoutée à ${x.point.code}`);
  }
  function annulerSession(): void {
    if (sessionPour) chronos.oublier(sessionPour.point.id);
    sessionPour = null;
    dire('Session annulée');
  }

  function modifier(x: PointCalcule): void {
    if (!x.point.projet_id) { dire('Ce point n’est lié à aucun projet : choisis-en un dans les Réglages pour y saisir des valeurs.'); return; }
    if (!x.point.mesures?.length) { dire('Ce point n’a aucune mesure : choisis-les dans les Réglages.'); return; }
    edition = x;
  }

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

  <Segment options={[{ valeur: 'jour', label: 'Jour' }, { valeur: 'semaine', label: 'Semaine' }, { valeur: 'mois', label: 'Mois' }]} valeur={vue} onchoisir={changerVue} hauteur={38} ample />

  <div class="periode">
    <button type="button" class="fleche" aria-label="Période précédente" onclick={() => aller(-1)}><Icone nom="retour" taille={16} trait={2.2} /></button>
    <div class="libelle">
      <span class="nom">{libellePeriode(periode)}</span>
      <span class="muted resume">{resume}</span>
    </div>
    <button type="button" class="fleche" aria-label="Période suivante" disabled={suivanteFuture} onclick={() => aller(1)}><Icone nom="suivant" taille={16} trait={2.2} /></button>
  </div>

  <!-- La maquette laisse un espace (deux écarts) entre la période et les cartes. -->
  <div class="espace" aria-hidden="true"></div>

  {#if enregistre?.envoye_a}
    <div class="envoi" class:modifie>
      <Icone nom={modifie ? 'reporter' : 'coche'} taille={15} trait={2.4} />
      <span>{modifie ? `Modifié depuis l’envoi (${heureEnvoi})` : `Envoyé le ${heureEnvoi}`}</span>
      {#if modifie && ancienTexte}<button type="button" onclick={() => (ancienOuvert = true)}>Voir l’envoi</button>{/if}
    </div>
  {/if}

  {#if !points.length}
    <div class="carte vide">
      <p class="serif">Ton rapport t’attend.</p>
      <p class="muted petit">Choisis ce que tu veux suivre chaque jour : il se remplira tout seul avec tes saisies.</p>
      <a href="/reglages#points">Choisir les points</a>
    </div>
  {/if}

  {#each points as x, i (x.point.id)}
    <CartePoint p={x} n={i + 1} {vue} {langue} {enCours} couleur={couleur(x.couleur)} ratios={vue === 'jour' ? [] : ratiosDuPoint(jours, x.point.id)}
      lettres={vue === 'semaine' ? LETTRES : []} {sousTitre} onmodifier={vue === 'jour' ? () => modifier(x) : undefined}
      chrono={peutChronometrer(x) ? chronoDe(x) : undefined} onchrono={peutChronometrer(x) ? () => toucherChrono(x) : undefined} />
  {/each}

  <div class="flottant">
    <button type="button" onclick={() => (exportOuvert = true)}><Icone nom="partager" taille={18} trait={2.2} />Exporter le rapport</button>
  </div>
</EcranPage>

<div style={edition ? styleCouleur(couleur(edition.couleur)) : ''}>
  <VoletSaisie ouvert={edition != null} onfermer={() => (edition = null)} projetId={edition?.point.projet_id ?? ''} metriques={metriquesEdition} jour={periode.debut} aujourdhui={auj} periode={periodeEdition} />
</div>

<div style={sessionPour ? styleCouleur(couleur(sessionPour.couleur)) : ''}>
  <VoletSession ouvert={sessionPour != null} titre={sessionPour ? `${sessionPour.point.code} · ${sessionPour.point.libelle}` : ''} secondes={sessionPour ? chronos.secondes(sessionPour.point.id, horloge.maintenant) : 0}
    metriques={mesuresSession?.metriques ?? []} onvalider={validerSession} onannuler={annulerSession} onfermer={() => (sessionPour = null)} />
</div>

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
  h1 { font-size: 30px; line-height: normal; }
  .boutons { display: flex; gap: 6px; }
  .pilule { height: 44px; padding: 0 14px; border-radius: 22px; background: var(--surface); border: 1px solid var(--ligne); font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .periode { display: flex; align-items: center; gap: 8px; }
  .fleche { width: 44px; height: 44px; flex: none; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; display: flex; align-items: center; justify-content: center; }
  .fleche:disabled { opacity: 0.35; cursor: default; }
  .libelle { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .nom { font-size: 15px; font-weight: 600; }
  .resume { font-size: 12px; }
  .espace { flex: none; height: 0; }
  .envoi { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--bon); background: var(--bon-fond); border-radius: 12px; padding: 8px 12px; }
  .envoi.modifie { color: var(--alerte); background: var(--alerte-fond); }
  .envoi span { flex: 1; }
  .envoi button { min-height: 44px; margin: -8px 0; border: 0; background: none; color: inherit; font-size: 13px; font-weight: 700; text-decoration: underline; padding: 0; }
  .vide { padding: 16px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .vide .serif { font-size: 19px; }
  .vide a { color: var(--accent-encre); font-weight: 600; min-height: 44px; display: flex; align-items: center; }
  /* Comme la maquette : 8 px au-dessus de la barre d'onglets (la zone qui défile a 24 px de marge basse). */
  .flottant { position: sticky; bottom: -17px; z-index: 2; margin-top: auto; padding-top: 8px; display: flex; }
  .flottant button { flex: 1; height: 54px; border-radius: 18px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: var(--ombre-flottante); }
  .petit { font-size: 13px; }
  .ancien { background: var(--surface-2); border-radius: 14px; padding: 12px 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
