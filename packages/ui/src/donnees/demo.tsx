import { useState } from "react";
import type { ReactNode } from "react";
import { ApercuBilletThermique } from "./ApercuBilletThermique";
import { ApercuEtiquetteColis } from "./ApercuEtiquetteColis";
import { BandeauAssistant } from "./BandeauAssistant";
import { BarreRemplissage } from "./BarreRemplissage";
import { BulleWhatsApp, ConversationWhatsApp } from "./BulleWhatsApp";
import { CarteDonnees } from "./CarteDonnees";
import { EcranUssd } from "./EcranUssd";
import { FeuilleModale } from "./FeuilleModale";
import { Histogramme } from "./Histogramme";
import type { BarreHistogramme } from "./Histogramme";
import { LigneAlerte } from "./LigneAlerte";
import { LigneListe } from "./LigneListe";
import { ListeGlissable } from "./ListeGlissable";
import { TableauColonnesFixes } from "./TableauColonnesFixes";
import type { ColonneTableau } from "./TableauColonnesFixes";
import { ChiffreCle, TuileKpi } from "./TuileKpi";
import styles from "./demo.module.css";

/*
 * Pages de démo du kit « données ». Chaque fonction reproduit la zone « données » d'une planche
 * de docs/maquettes-v3/ avec les valeurs de la planche, à la taille de la planche : 390 × 844
 * pour le téléphone, 1280 de large pour la salle de contrôle. Le banc de fidélité (AM-004)
 * compare ces cadres aux planches. Les en-têtes, barres de navigation et boutons d'écran
 * appartiennent aux tickets d'écran : ils sont ici réduits à un titre.
 */

interface CadreProps {
  titre: string;
  sousTitre?: string;
  children: ReactNode;
  large?: boolean;
  ariaLabel: string;
}

function Cadre({ titre, sousTitre, children, large = false, ariaLabel }: CadreProps) {
  return (
    <div
      className={large ? styles.cadreLarge : styles.cadreTelephone}
      role="region"
      aria-label={ariaLabel}
    >
      <header className={styles.entete}>
        <span className={styles.titreEcran}>{titre}</span>
        {sousTitre ? <span className={styles.sousTitreEcran}>{sousTitre}</span> : null}
      </header>
      <main className={styles.principal}>{children}</main>
    </div>
  );
}

/* ---------- Patron ---------- */

export function DemoPatron() {
  return (
    <Cadre ariaLabel="Démo Patron" titre="Alpha Voyages" sousTitre="M. Kamga · 3 gares · 14 bus">
      <TuileKpi
        taille="affiche"
        etiquette="Aujourd'hui · en direct"
        etiquetteAmbre
        note="vs mardi dernier"
        valeur="2,61 M"
        tendance="+ 8 %"
      >
        <div className={styles.grille4}>
          <ChiffreCle valeur="612" libelle="billets" />
          <ChiffreCle valeur="188" libelle="colis" />
          <ChiffreCle valeur="86 %" libelle="remplissage" />
          <ChiffreCle valeur="− 1 000" libelle="écart total" etat="ambre" />
        </div>
      </TuileKpi>
      <BandeauAssistant
        titre="L'assistant a 2 choses à te dire"
        detail="Le 09:30 Oméga te prend 40 clients · Guichet 2 : 3 écarts en 10 jours"
        href="#assistant"
      />
      <ListeGlissable titre="Alertes · 6" mention="1 touche · glisser" hauteur="libre">
        <LigneAlerte
          etat="ambre"
          heure="14:00"
          href="#gare"
          texte={
            <>
              Guichet 2 Akwa · écart − 1 000 · 3<sup>e</sup> en 10 jours
            </>
          }
        />
        <LigneAlerte
          etat="bleu"
          heure="12:30"
          href="#inter"
          texte="6 colis Oméga en correspondance chez toi · à régler lundi"
        />
        <LigneAlerte
          etat="rouge"
          heure="09:40"
          href="#equipe"
          texte="Guichet 3 Akwa · Pauline N. bloquée · 3 PIN faux"
        />
        <LigneAlerte
          etat="rouge"
          heure="hier"
          href="#bus"
          texte={
            <>
              LT 207 AB · 2<sup>e</sup> panne en 10 jours · révision conseillée
            </>
          }
        />
        <LigneAlerte
          etat="ambre"
          heure="hier"
          href="#comptable"
          texte="4 transactions MoMo sans correspondance · 16 000"
        />
        <LigneAlerte
          etat="vert"
          heure="hier"
          href="#financement"
          texte="Avance 6 M · dossier AV-2027-0041 en analyse"
        />
      </ListeGlissable>
    </Cadre>
  );
}

/* ---------- Analyses ---------- */

const RECETTE_JOURS: BarreHistogramme[] = [
  { etiquette: "L", valeur: 62 },
  { etiquette: "M", valeur: 58 },
  { etiquette: "M", valeur: 55 },
  { etiquette: "J", valeur: 60 },
  { etiquette: "V", valeur: 88, accent: "ambre" },
  { etiquette: "S", valeur: 100, accent: "ambre" },
  { etiquette: "D", valeur: 70 },
];

const LIGNES: Array<{ nom: string; pourcent: number; valeur: string }> = [
  { nom: "Douala → Yaoundé", pourcent: 91, valeur: "91 % · 14,2 M" },
  { nom: "Douala → Bafoussam", pourcent: 78, valeur: "78 % · 8,1 M" },
  { nom: "Yaoundé → Bafoussam", pourcent: 61, valeur: "61 % · 4,0 M" },
  { nom: "Douala → Bamenda", pourcent: 83, valeur: "83 % · 3,6 M" },
  { nom: "Yaoundé → Douala", pourcent: 88, valeur: "88 % · 12,9 M" },
  { nom: "Bafoussam → Douala", pourcent: 74, valeur: "74 % · 6,2 M" },
  { nom: "Colis · toutes lignes", pourcent: 84, valeur: "2 104 · 2,1 M" },
];

const BUS: Array<{
  plaque: string;
  chauffeur: string;
  trajets: string;
  net: string;
  netEtat: "vert" | "rouge";
  note: string;
  noteEtat: "neutre" | "ambre" | "rouge";
}> = [
  {
    plaque: "LT 412 AB",
    chauffeur: "Mbarga",
    trajets: "9 trajets",
    net: "+ 2,8 M",
    netEtat: "vert",
    note: "0 incident",
    noteEtat: "neutre",
  },
  {
    plaque: "LT 118 AB",
    chauffeur: "Fotso",
    trajets: "8 trajets",
    net: "+ 2,1 M",
    netEtat: "vert",
    note: "carburant + 12 %",
    noteEtat: "ambre",
  },
  {
    plaque: "LT 207 AB",
    chauffeur: "Nana",
    trajets: "5 trajets",
    net: "+ 0,6 M",
    netEtat: "rouge",
    note: "2 pannes",
    noteEtat: "rouge",
  },
  {
    plaque: "LT 330 AB",
    chauffeur: "Essomba",
    trajets: "8 trajets",
    net: "+ 1,9 M",
    netEtat: "vert",
    note: "0 incident",
    noteEtat: "neutre",
  },
  {
    plaque: "LT 095 AB",
    chauffeur: "Tchinda",
    trajets: "7 trajets",
    net: "+ 1,7 M",
    netEtat: "vert",
    note: "pneus à changer",
    noteEtat: "ambre",
  },
  {
    plaque: "LT 261 AB",
    chauffeur: "Abena",
    trajets: "6 trajets",
    net: "+ 1,2 M",
    netEtat: "vert",
    note: "1 retard > 30 min",
    noteEtat: "ambre",
  },
  {
    plaque: "LT 148 AB",
    chauffeur: "Mballa",
    trajets: "4 trajets",
    net: "+ 0,4 M",
    netEtat: "rouge",
    note: "visite technique",
    noteEtat: "rouge",
  },
];

export function DemoAnalyses() {
  return (
    <Cadre
      ariaLabel="Démo Analyses"
      titre="Analyses"
      sousTitre="Semaine du 29 déc. au 4 janv. · 3 gares"
    >
      <CarteDonnees
        etiquette="Recette par jour"
        droite={
          <span className={styles.valeurCarte}>
            28,4 M <span className={styles.tendanceCarte}>+ 5 %</span>
          </span>
        }
      >
        <Histogramme
          format="jours"
          barres={RECETTE_JOURS}
          ariaLabel="Recette par jour : vendredi et samedi en tête"
        />
        <span className={styles.legende}>
          Vendredi et samedi font 41 % de la semaine. Le creux du mercredi est le plus profond à
          Bafoussam.
        </span>
      </CarteDonnees>
      <ListeGlissable titre="Par ligne · remplissage" mention="7 lignes · glisser" hauteur={168}>
        {LIGNES.map((ligne) => (
          <LigneListe key={ligne.nom} href="#ligne" colonnes="1fr 64px auto">
            <span className={styles.nomLigne}>{ligne.nom}</span>
            <BarreRemplissage valeur={ligne.pourcent} libelle={`Remplissage ${ligne.nom}`} />
            <span className={styles.valeurLigne}>{ligne.valeur}</span>
          </LigneListe>
        ))}
      </ListeGlissable>
      <ListeGlissable titre="Par bus · net" mention="14 bus · glisser" hauteur={168}>
        {BUS.map((bus) => (
          <LigneListe key={bus.plaque} href="#bus" colonnes="1fr auto auto">
            <span className={styles.bus}>
              <span>
                <strong>{bus.plaque}</strong> · {bus.chauffeur}
              </span>
              <span className={styles.petit}>{bus.trajets}</span>
            </span>
            <span className={styles.net} data-etat={bus.netEtat}>
              {bus.net}
            </span>
            <span className={styles.note} data-etat={bus.noteEtat}>
              {bus.note}
            </span>
          </LigneListe>
        ))}
      </ListeGlissable>
    </Cadre>
  );
}

/* ---------- AnalysesBus ---------- */

const NET_SEMAINES: BarreHistogramme[] = [
  { etiquette: "S41", valeur: 88 },
  { etiquette: "S42", valeur: 92 },
  { etiquette: "S43", valeur: 84 },
  { etiquette: "S44", valeur: 90 },
  { etiquette: "S45", valeur: 96 },
  { etiquette: "S46", valeur: 34, accent: "rouge" },
  { etiquette: "S47", valeur: 58, accent: "ambre" },
  { etiquette: "S48", valeur: 30, accent: "rouge" },
];

const TRAJETS: Array<{
  quand: string;
  detail: string;
  detailEtat: "neutre" | "rouge";
  net: string;
  netEtat: "vert" | "rouge";
}> = [
  {
    quand: "Lun 06:00 · Douala → Bafoussam",
    detail: "28 / 30 · 98 000 · à l’heure",
    detailEtat: "neutre",
    net: "+ 61 k",
    netEtat: "vert",
  },
  {
    quand: "Mar 06:00 · Douala → Bafoussam",
    detail: "panne embrayage à Mbouda · 2 h 10 · 30 replacés",
    detailEtat: "rouge",
    net: "− 310 k",
    netEtat: "rouge",
  },
  {
    quand: "Jeu 14:00 · Bafoussam → Douala",
    detail: "19 / 30 · 66 500 · retard 25 min",
    detailEtat: "neutre",
    net: "+ 22 k",
    netEtat: "vert",
  },
  {
    quand: "Ven 06:00 · Douala → Bafoussam",
    detail: "30 / 30 · 105 000 · à l’heure",
    detailEtat: "neutre",
    net: "+ 68 k",
    netEtat: "vert",
  },
  {
    quand: "Sam 09:00 · Douala → Bafoussam",
    detail: "panne batterie au départ · 40 min · 30 gardés",
    detailEtat: "rouge",
    net: "− 45 k",
    netEtat: "rouge",
  },
];

export function DemoAnalysesBus() {
  return (
    <Cadre
      ariaLabel="Démo Analyses d'un bus"
      titre="LT 207 AB · Nana"
      sousTitre="Coaster 30 places · 2019 · 5 trajets cette semaine"
    >
      <div className={styles.grille3}>
        <TuileKpi etiquette="Recette" valeur="3,1 M" sousLigne="5 trajets · 71 %" />
        <TuileKpi
          etiquette="Dépenses"
          valeur="2,5 M"
          etat="rouge"
          sousLigne="carburant 1,6 · pannes 0,7"
        />
        <TuileKpi
          etiquette="Net"
          valeur="+ 0,6 M"
          etat="rouge"
          sousLigne="flotte : + 2,1 M en moyenne"
        />
      </div>
      <CarteDonnees
        etiquette="Net par semaine · 8 semaines"
        droite={<span className={styles.alerteCarte}>− 62 % depuis la panne du 12 nov.</span>}
      >
        <Histogramme
          format="semaines"
          barres={NET_SEMAINES}
          ariaLabel="Net par semaine sur 8 semaines : chute à partir de S46"
        />
      </CarteDonnees>
      <ListeGlissable
        titre="Cette semaine · trajet par trajet"
        mention="5 · 2 pannes"
        hauteur="auto"
      >
        {TRAJETS.map((trajet) => (
          <LigneListe key={trajet.quand} densite="serree" colonnes="1fr auto">
            <span className={styles.bus}>
              <span className={styles.nomLigne}>{trajet.quand}</span>
              <span className={styles.petit} data-etat={trajet.detailEtat}>
                {trajet.detail}
              </span>
            </span>
            <span className={styles.net} data-etat={trajet.netEtat} data-petit="oui">
              {trajet.net}
            </span>
          </LigneListe>
        ))}
      </ListeGlissable>
      <BandeauAssistant forme="bloc">
        Deux pannes en 10 jours sur le même bus, c'est de l'entretien, pas de la malchance. Une
        révision complète coûte ≈ 180 k ; chaque panne t'a coûté plus.{" "}
        <strong>
          Je mettrais LT 207 au garage lundi et je passerais Nana sur LT 330 (8 trajets, 0
          incident).
        </strong>
      </BandeauAssistant>
    </Cadre>
  );
}

/* ---------- ComptableApercu ---------- */

interface VenteExport {
  date: string;
  heure: string;
  ligne: string;
  dep: string;
  siege: string;
  classe: string;
  prix: string;
  mode: "CASH" | "MOMO" | "APP" | "USSD" | "ANNULÉ";
  guichet: string;
}

const VENTES: VenteExport[] = [
  {
    date: "01/12",
    heure: "05:52",
    ligne: "DLA-YDE",
    dep: "06:00",
    siege: "12",
    classe: "CLASS.",
    prix: "5 000",
    mode: "CASH",
    guichet: "GU1 · JM",
  },
  {
    date: "01/12",
    heure: "05:54",
    ligne: "DLA-YDE",
    dep: "06:00",
    siege: "13",
    classe: "CLASS.",
    prix: "5 000",
    mode: "MOMO",
    guichet: "GU1 · JM",
  },
  {
    date: "01/12",
    heure: "05:57",
    ligne: "DLA-BAF",
    dep: "06:30",
    siege: "04",
    classe: "VIP",
    prix: "7 500",
    mode: "CASH",
    guichet: "GU2 · MT",
  },
  {
    date: "01/12",
    heure: "06:01",
    ligne: "DLA-YDE",
    dep: "07:00",
    siege: "01",
    classe: "VIP",
    prix: "7 500",
    mode: "APP",
    guichet: "en ligne",
  },
  {
    date: "01/12",
    heure: "06:03",
    ligne: "DLA-YDE",
    dep: "06:00",
    siege: "14",
    classe: "CLASS.",
    prix: "5 000",
    mode: "CASH",
    guichet: "GU1 · JM",
  },
  {
    date: "01/12",
    heure: "06:08",
    ligne: "COLIS",
    dep: "06:30",
    siege: "—",
    classe: "3 kg",
    prix: "3 000",
    mode: "MOMO",
    guichet: "GU3 · PN",
  },
  {
    date: "01/12",
    heure: "06:12",
    ligne: "DLA-BAF",
    dep: "06:30",
    siege: "17",
    classe: "CLASS.",
    prix: "3 500",
    mode: "CASH",
    guichet: "GU2 · MT",
  },
  {
    date: "01/12",
    heure: "06:15",
    ligne: "DLA-YDE",
    dep: "07:00",
    siege: "02",
    classe: "VIP",
    prix: "7 500",
    mode: "USSD",
    guichet: "en ligne",
  },
  {
    date: "01/12",
    heure: "06:20",
    ligne: "DLA-YDE",
    dep: "07:00",
    siege: "15",
    classe: "CLASS.",
    prix: "5 000",
    mode: "ANNULÉ",
    guichet: "GU1 · JM",
  },
  {
    date: "01/12",
    heure: "06:24",
    ligne: "DLA-BAF",
    dep: "06:30",
    siege: "18",
    classe: "CLASS.",
    prix: "3 500",
    mode: "CASH",
    guichet: "GU2 · MT",
  },
];

const COLONNES_VENTES: ColonneTableau<VenteExport>[] = [
  { cle: "date", titre: "date", fixe: true },
  { cle: "heure", titre: "heure" },
  { cle: "ligne", titre: "ligne" },
  { cle: "dep", titre: "dép." },
  { cle: "siege", titre: "siège" },
  { cle: "classe", titre: "classe" },
  { cle: "prix", titre: "prix", align: "droite" },
  {
    cle: "mode",
    titre: "mode",
    etat: (vente) =>
      vente.mode === "CASH"
        ? "vert"
        : vente.mode === "MOMO"
          ? "ambre"
          : vente.mode === "ANNULÉ"
            ? "rouge"
            : "bleu",
  },
  { cle: "guichet", titre: "guichet" },
];

export function DemoComptableApercu() {
  const [ouverte, setOuverte] = useState(true);
  return (
    <div className={styles.cadreTelephone} role="region" aria-label="Démo aperçu d'un export">
      <header className={styles.entete} data-estompe="oui">
        <span className={styles.titreEcran}>Comptable</span>
        <span className={styles.sousTitreEcran}>Décembre 2026 · clôture le 5 du mois</span>
      </header>
      <main className={styles.principal} data-estompe="oui">
        <CarteDonnees etiquette="Rapprochement MoMo · décembre">
          <span />
        </CarteDonnees>
        <CarteDonnees etiquette="Exports · colonnes fixes">
          <span />
        </CarteDonnees>
      </main>
      {!ouverte ? (
        <button type="button" className={styles.rouvrir} onClick={() => setOuverte(true)}>
          Rouvrir l'aperçu
        </button>
      ) : null}
      <FeuilleModale
        ouverte={ouverte}
        onFermer={() => setOuverte(false)}
        ancrage="parent"
        badge="XLSX"
        titre="Journal des ventes · décembre"
        sousTitre="31 404 lignes · 11 colonnes · 1,2 Mo · généré à l'instant"
        actions={
          <>
            <button type="button" className={styles.bouton} onClick={() => setOuverte(false)}>
              Fermer
            </button>
            <button type="button" className={styles.bouton} data-ton="bleu">
              Télécharger
            </button>
            <button type="button" className={styles.bouton} data-ton="orange">
              Envoyer au cabinet
            </button>
          </>
        }
      >
        <TableauColonnesFixes
          ariaLabel="Journal des ventes, lignes 1 à 10"
          colonnes={COLONNES_VENTES}
          lignes={VENTES}
          cleLigne={(vente) => `${vente.heure}-${vente.siege}-${vente.ligne}`}
          pied={
            <>
              <span>Lignes 1 – 10 sur 31 404 · glisser pour les suivantes</span>
              <span className={styles.total}>total 28 414 000</span>
            </>
          }
        />
        <div className={styles.grille3}>
          <span className={styles.info}>
            <span className={styles.petitGris}>Colonnes fixes</span>
            <span>identiques chaque mois · le cabinet importe sans retoucher</span>
          </span>
          <span className={styles.info}>
            <span className={styles.petitGris}>Un onglet par vue</span>
            <span>ventes · par jour · par guichet · totaux</span>
          </span>
          <span className={styles.info}>
            <span className={styles.petitGris}>Signé</span>
            <span>empreinte AfriMove dans le fichier · infalsifiable</span>
          </span>
        </div>
      </FeuilleModale>
    </div>
  );
}

/* ---------- GuichetColis ---------- */

export function DemoGuichetColis() {
  return (
    <Cadre
      ariaLabel="Démo colis au guichet"
      titre="Enregistrer un colis"
      sousTitre="C-ALP-DLA-270105-0042 · guichet 2"
    >
      <ApercuEtiquetteColis
        trajet="DLA → BAF"
        destinataire="Ngo Thérèse · ···· 18 22"
        reference="C-ALP-DLA-270105-0042"
        poids="2 kg"
        heure="08:15"
        mention="Alpha Voyages · afrimove.cm · pas de code ici"
        statutImprimante="imprimante OK"
      />
    </Cadre>
  );
}

/** Aperçu du billet thermique 58 mm, avec les valeurs de la planche Vente. */
export function DemoBilletThermique() {
  return (
    <Cadre
      ariaLabel="Démo billet thermique"
      titre="Vendre"
      sousTitre="Guichet 2 · billet n° ALP-DLA-270105-0185"
    >
      <ApercuBilletThermique
        compagnie="Alpha Voyages"
        trajet="DLA → YDE"
        depart="Mar 5 janv. · 08:30"
        siege="24"
        voyageur="Tchoumi Paul"
        montant="4 000 F"
        mode="Cash"
        numero="ALP-DLA-270105-0185"
        mention="afrimove.cm"
        statutImprimante="imprimante OK"
      />
    </Cadre>
  );
}

/* ---------- RapportSoir ---------- */

export function DemoRapportSoir() {
  return (
    <Cadre
      ariaLabel="Démo rapport du soir"
      titre="AfriMove · Alpha Voyages"
      sousTitre="compte vérifié · répond en 2 min"
    >
      <BulleWhatsApp
        sens="recu"
        carte
        mention="21:00 · signé Essono (Akwa), Tchinda (Mvan), Fosso (Baf.)"
      >
        <span className={styles.titreBulle}>Rapport du mardi 5 janvier · 3 gares</span>
        <div className={styles.grille3}>
          <TuileKpi
            etiquette="Billets"
            valeur="1 004"
            sousLigne="+6 % vs hier"
            etatTendance="vert"
          />
          <TuileKpi etiquette="Colis" valeur="312" sousLigne="0 litige" />
          <TuileKpi etiquette="Recette" valeur="4,41 M" sousLigne="cash 2,9 · MoMo 1,5" />
        </div>
        <div className={styles.lignesRapport}>
          <span>
            <strong>Akwa</strong> · 491 billets · 3 guichets clôturés · écart{" "}
            <span className={styles.net} data-etat="ambre">
              − 1 000
            </span>{" "}
            (guichet 2, validé par Essono)
          </span>
          <span>
            <strong>Mvan</strong> · 338 billets · écart{" "}
            <span className={styles.net} data-etat="vert">
              0
            </span>{" "}
            · 1 départ fusionné (16:00 + 16:30)
          </span>
          <span>
            <strong>Bafoussam</strong> · 175 billets · écart{" "}
            <span className={styles.net} data-etat="vert">
              0
            </span>{" "}
            · soute pleine à 10:00
          </span>
        </div>
      </BulleWhatsApp>
      <BulleWhatsApp sens="envoye" auteur="M. Kamga">
        Pourquoi le 09:30 Oméga part si vide ?
      </BulleWhatsApp>
      <BulleWhatsApp sens="recu">
        Trois jours de suite à 55 %. Alpha part 08:30 et 10:00 sur la même ligne, 500 F moins cher.
        Deux options : décaler à 11:00 (créneau vide chez tout le monde), ou aligner le prix.
        L'assistant a préparé la simulation.
      </BulleWhatsApp>
    </Cadre>
  );
}

/* ---------- USSD ---------- */

const TEXTE_USSD = `AfriMove
1 Billet
2 Mon billet
3 Colis
4 Suivre bus
5 Proche
0 Aide

Repondre: 1
--------
Douala>Yaounde
1 08:00 Beta VIP 7500
2 08:30 Alpha 4000
3 09:30 Omega 3800
Place: 2
Payer MoMo? 1=oui`;

export function DemoUssd() {
  return (
    <Cadre
      ariaLabel="Démo sans internet"
      titre="Sans internet"
      sousTitre="Le même service sur un téléphone à touches"
    >
      <div className={styles.deuxColonnes}>
        <div className={styles.colonne}>
          <span className={styles.etiquetteAmbre}>USSD · tape *123#</span>
          <EcranUssd texte={TEXTE_USSD} />
          <span className={styles.legende}>
            3 réponses = un billet. Le SMS arrive avec le code à 4 chiffres. Même règles, mêmes
            prix, zéro frais en plus.
          </span>
        </div>
        <div className={styles.colonne}>
          <span className={styles.etiquetteVerte}>WhatsApp · écris « billet »</span>
          <ConversationWhatsApp ariaLabel="Conversation WhatsApp : achat d'un billet">
            <BulleWhatsApp sens="envoye" taille="compacte" auteur="Aïcha">
              Billet Douala Yaoundé demain matin
            </BulleWhatsApp>
            <BulleWhatsApp sens="recu" taille="compacte">
              3 départs demain :
              <br />1 · 08:00 Bêta VIP 7 500
              <br />2 · 08:30 Alpha 4 000
              <br />3 · 09:30 Oméga 3 800
              <br />
              Réponds 1, 2 ou 3.
            </BulleWhatsApp>
            <BulleWhatsApp sens="envoye" taille="compacte" auteur="Aïcha">
              2
            </BulleWhatsApp>
            <BulleWhatsApp sens="recu" taille="compacte">
              Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?
              <br />
              <strong className={styles.ambre}>Oui</strong> · Changer de siège
            </BulleWhatsApp>
            <BulleWhatsApp sens="recu" taille="compacte">
              <span className={styles.vert}>
                ✓ Payé. Billet ALP-DLA-270106-0031, code 5582. Bon voyage, Aïcha.
              </span>
            </BulleWhatsApp>
          </ConversationWhatsApp>
          <span className={styles.legende}>
            Vocal accepté : « je veux aller à Yaoundé demain ». Réponse en français, en anglais ou
            en pidgin.
          </span>
        </div>
      </div>
    </Cadre>
  );
}

/* ---------- Controle (1280 px) ---------- */

interface GareControle {
  gare: string;
  billets: string;
  colis: string;
  cash: string;
  ecart: string;
  ecartEtat: "ambre" | "vert";
  heure: string;
  suite: string;
  superviseur: string;
}

const GARES: GareControle[] = [
  {
    gare: "Douala Akwa",
    billets: "291",
    colis: "98",
    cash: "1 412 500",
    ecart: "− 1 000",
    ecartEtat: "ambre",
    heure: "14:30",
    suite: "Yaoundé · 38/40",
    superviseur: "Essono · en ligne",
  },
  {
    gare: "Yaoundé Mvan",
    billets: "208",
    colis: "61",
    cash: "902 000",
    ecart: "0",
    ecartEtat: "vert",
    heure: "14:00",
    suite: "Douala · 40/40 · plein",
    superviseur: "Tchinda · en ligne",
  },
  {
    gare: "Bafoussam",
    billets: "113",
    colis: "29",
    cash: "431 000",
    ecart: "0",
    ecartEtat: "vert",
    heure: "15:00",
    suite: "Douala · 19/40",
    superviseur: "Fosso · hors ligne 4 min",
  },
];

const COLONNES_GARES: ColonneTableau<GareControle>[] = [
  { cle: "gare", titre: "Gare", gras: true },
  { cle: "billets", titre: "Billets", align: "droite", mono: true },
  { cle: "colis", titre: "Colis", align: "droite", mono: true },
  { cle: "cash", titre: "Cash attendu", align: "droite", mono: true },
  {
    cle: "ecart",
    titre: "Écart",
    align: "droite",
    mono: true,
    gras: true,
    etat: (gare) => gare.ecartEtat,
  },
  {
    cle: "depart",
    titre: "Prochain départ",
    rendu: (gare) => (
      <>
        <span className={styles.heureDepart}>{gare.heure}</span> {gare.suite}
      </>
    ),
  },
  { cle: "superviseur", titre: "Superviseur" },
];

const VENTES_HEURE: BarreHistogramme[] = [
  { etiquette: "05 h", valeur: 70, accent: "ambre" },
  { etiquette: "06 h", valeur: 100, accent: "ambre" },
  { etiquette: "07 h", valeur: 88, accent: "ambre" },
  { etiquette: "08 h", valeur: 62 },
  { etiquette: "09 h", valeur: 48 },
  { etiquette: "10 h", valeur: 40 },
  { etiquette: "11 h", valeur: 44 },
  { etiquette: "12 h", valeur: 52 },
  { etiquette: "13 h", valeur: 58, accent: "ambre" },
  { etiquette: "14 h", valeur: 30, prevue: true },
  { etiquette: "15 h", valeur: 26, prevue: true },
  { etiquette: "16 h", valeur: 18, prevue: true },
];

export function DemoControle() {
  return (
    <div className={styles.cadreLarge} role="region" aria-label="Démo salle de contrôle">
      <header className={styles.entete}>
        <span className={styles.titreEcran}>Salle de contrôle · Alpha Voyages</span>
        <span className={styles.sousTitreEcran}>3 gares · 14 bus · mardi 5 janvier 2027</span>
      </header>
      <main className={styles.controle}>
        <section className={styles.controleGauche} aria-label="Indicateurs et gares">
          <div className={styles.tuilesControle}>
            <TuileKpi
              taille="large"
              etiquette="Recette du jour"
              valeur="2,61 M"
              sousLigne={<span className={styles.vert}>+ 8 % vs mardi dernier</span>}
            />
            <TuileKpi
              taille="large"
              etiquette="Billets"
              valeur="612"
              sousLigne="dont 37 en ligne · 11 en route"
            />
            <TuileKpi
              taille="large"
              etiquette="Colis"
              valeur="188"
              sousLigne="6 en correspondance · 0 litige"
            />
            <TuileKpi
              taille="large"
              etiquette="Remplissage"
              valeur="86 %"
              sousLigne="22 départs · 2 fusionnés"
            />
            <TuileKpi
              taille="large"
              etiquette="Écarts de caisse"
              valeur="− 1 000"
              etat="ambre"
              teinte="ambre"
              sousLigne="1 caisse sur 9 · à valider"
            />
          </div>
          <CarteDonnees
            variante="large"
            etiquette="Gares · maintenant"
            droite="1 clic ouvre la gare"
          >
            <TableauColonnesFixes
              variante="large"
              largeurMin={640}
              ariaLabel="Gares, maintenant"
              colonnes={COLONNES_GARES}
              lignes={GARES}
              cleLigne={(gare) => gare.gare}
            />
          </CarteDonnees>
        </section>
        <aside className={styles.controleDroite} aria-label="À traiter et ventes">
          <ListeGlissable
            variante="large"
            fond="nuit"
            titre="À traiter · 4"
            mention="1 clic"
            hauteur="auto"
          >
            <LigneAlerte
              variante="large"
              etat="ambre"
              heure="14:00"
              href="#superviseur"
              texte="Clôture guichet 2 Akwa · écart − 1 000 · attend le PIN d'Essono"
            />
            <LigneAlerte
              variante="large"
              etat="rouge"
              heure="13:53"
              href="#chauffeur"
              texte="LT 207 AB arrêté 12 min après Edéa · 36 à bord · chauffeur Nana injoignable"
            />
            <LigneAlerte
              variante="large"
              etat="bleu"
              heure="13:40"
              href="#inter"
              texte="6 colis Oméga en correspondance à Bafoussam · scan « reçu » manquant"
            />
            <LigneAlerte
              variante="large"
              etat="vert"
              heure="12:10"
              href="#assistant"
              texte="L'assistant propose de décaler le 10:00 à 09:15 · + 1,5 M / mois"
            />
          </ListeGlissable>
          <CarteDonnees variante="large" etiquette="Ventes par heure" droite="aujourd'hui">
            <Histogramme
              format="heures"
              variante="mobile"
              barres={VENTES_HEURE}
              reperes={["05 h", "09 h", "13 h", "17 h · prévu"]}
              ariaLabel="Ventes par heure aujourd'hui : pic de 06 h à 08 h, prévision l'après-midi"
            />
            <span className={styles.legende}>
              Le pic de 06 h à 08 h fait 42 % de la journée. Prévision de clôture : 4,4 M.
            </span>
          </CarteDonnees>
          <BandeauAssistant forme="bloc" etiquette="Rapport du soir">
            <span>
              Part à 21:00 sur WhatsApp à M. Kamga et aux 3 superviseurs. Toutes les caisses doivent
              être validées avant. Il en reste 1.
            </span>
          </BandeauAssistant>
        </aside>
      </main>
    </div>
  );
}

/** Toutes les démos, l'une sous l'autre (page de banc du kit). */
export function DemoDonnees() {
  return (
    <div className={styles.toutes}>
      <DemoPatron />
      <DemoAnalyses />
      <DemoAnalysesBus />
      <DemoComptableApercu />
      <DemoGuichetColis />
      <DemoBilletThermique />
      <DemoRapportSoir />
      <DemoUssd />
      <DemoControle />
    </div>
  );
}
