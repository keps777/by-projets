import { useState } from "react";
import type { ReactNode } from "react";
import { CaseACocher, LigneCochable } from "./CaseACocher";
import { Champ } from "./Champ";
import { ChampRecherche } from "./ChampRecherche";
import { ChampTelephone } from "./ChampTelephone";
import { ClavierPin } from "./ClavierPin";
import { CompteurCoupures } from "./CompteurCoupures";
import type { ComptageCoupures } from "./CompteurCoupures";
import { Interrupteur, LigneInterrupteur } from "./Interrupteur";
import { SaisieCode } from "./SaisieCode";
import { Selecteur } from "./Selecteur";
import { Stepper } from "./Stepper";
import styles from "./demo.module.css";

function Planche({
  titre,
  reference,
  children,
}: {
  titre: string;
  reference: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.planche} aria-label={titre}>
      <h2 className={styles.titre}>{titre}</h2>
      <span className={styles.reference}>{reference}</span>
      {children}
    </section>
  );
}

const COMPTAGE_CAISSE: ComptageCoupures = {
  quantites: { 10000: 48, 5000: 36, 2000: 14, 1000: 5, 500: 3 },
  pieces: 0,
  totalManuel: null,
};

/**
 * Page de démo du banc de fidélité : les blocs de saisie des planches Vente, Connexion,
 * SuperviseurValider, Caisse et ConfigPersonne, plus les composants qui n'y figurent qu'à côté
 * (filtres, stepper). Les valeurs sont celles des planches.
 * Le clavier PIN refuse tout PIN, pour montrer les 3 essais puis le blocage de 15 min.
 */
export function DemoFormulaires() {
  const [droits, setDroits] = useState({
    vendre: true,
    annuler: false,
    cadence: true,
    caisses: false,
  });
  const [dernierPin, setDernierPin] = useState("aucun PIN envoyé");

  return (
    <main className={styles.page}>
      <Planche titre="Vendre" reference="Vente.dc.html">
        <div className={styles.ligne2}>
          <Champ label="Nom du voyageur" defaultValue="Tchoumi Paul" />
          <Champ label="Téléphone" type="tel" mono defaultValue="6 77 30 11 45" />
        </div>
        <div className={styles.ligne3}>
          <Champ label="Pièce (4 derniers)" mono defaultValue="8820" />
        </div>
      </Planche>

      <Planche titre="Connexion par numéro" reference="Connexion.dc.html">
        <ChampTelephone label="Numéro de téléphone" defaultValue="6 91 22 10 08" valide />
        <div className={styles.panneauCode}>
          <span className={styles.etiquetteCode}>Étape 2 · code reçu par SMS</span>
          <SaisieCode longueur={4} defaultValue="482" />
        </div>
      </Planche>

      <Planche titre="Valider la clôture" reference="SuperviseurValider.dc.html">
        <Champ
          label="Commentaire du superviseur (visible par le patron)"
          defaultValue="Recompté avec Joseph, écart confirmé, retenu sur sa prime"
        />
        <ClavierPin
          longueur={6}
          titre="Mon PIN · Mme Essono"
          sousTitre="6 chiffres · jamais partagé"
          note="3 essais, puis blocage 15 min et alerte au patron. Le PIN valide, horodaté et signé, part dans le rapport de 21 h."
          onComplet={() => {
            setDernierPin("PIN reçu par l'appelant, puis effacé du clavier");
            return false;
          }}
          onEmpreinte={() => setDernierPin("empreinte demandée")}
        />
        <span className={styles.reference}>{dernierPin}</span>
      </Planche>

      <Planche titre="Fermer ma caisse" reference="Caisse.dc.html">
        <div className={styles.panneauCompte}>
          <span className={styles.etiquetteCompte}>Ce que je compte · touche les billets</span>
          <CompteurCoupures defaultValue={COMPTAGE_CAISSE} />
        </div>
      </Planche>

      <Planche titre="Fiche d'une personne" reference="ConfigPersonne.dc.html">
        <div className={styles.carteConfig}>
          <Champ
            variante="config"
            className={styles.pleine}
            label="Nom"
            defaultValue="Joseph Mbappé"
          />
          <Champ
            variante="config"
            label="Téléphone · reçoit le PIN"
            mono
            defaultValue="6 77 12 34 23"
          />
          <Selecteur
            variante="config"
            label="Opérateur"
            defaultValue="mtn"
            options={[
              { valeur: "mtn", libelle: "MTN" },
              { valeur: "orange", libelle: "Orange" },
            ]}
          />
          <Selecteur
            variante="config"
            label="Rôle"
            defaultValue="guichetier"
            options={[
              { valeur: "guichetier", libelle: "Guichetier" },
              { valeur: "superviseur", libelle: "Superviseur" },
              { valeur: "convoyeur", libelle: "Convoyeur" },
              { valeur: "chauffeur", libelle: "Chauffeur" },
              { valeur: "relais", libelle: "Agent relais" },
              { valeur: "comptable", libelle: "Comptable" },
            ]}
          />
          <Selecteur
            variante="config"
            label="Gare"
            defaultValue="akwa"
            options={[
              { valeur: "akwa", libelle: "Akwa · Douala" },
              { valeur: "mvan", libelle: "Mvan · Yaoundé" },
              { valeur: "bafoussam", libelle: "Bafoussam" },
            ]}
          />
          <Selecteur
            variante="config"
            label="Guichet"
            defaultValue="2"
            options={[
              { valeur: "2", libelle: "Guichet 2" },
              { valeur: "1", libelle: "Guichet 1" },
              { valeur: "3", libelle: "Guichet 3" },
              { valeur: "nuit", libelle: "Nuit" },
            ]}
          />
          <Champ variante="config" label="Salaire · payé le 30" mono defaultValue="95 000" />
        </div>
        <div className={styles.droits}>
          <div className={styles.droitsEntete}>Ce qu’il peut faire</div>
          <LigneInterrupteur
            libelle="Vendre billets et colis · cash et MoMo"
            checked={droits.vendre}
            onChange={(v) => setDroits({ ...droits, vendre: v })}
          />
          <LigneInterrupteur
            separateur
            libelle="Annuler un billet sans PIN du superviseur"
            checked={droits.annuler}
            onChange={(v) => setDroits({ ...droits, annuler: v })}
          />
          <LigneInterrupteur
            separateur
            libelle="Mode cadence (vente sans nom)"
            checked={droits.cadence}
            onChange={(v) => setDroits({ ...droits, cadence: v })}
          />
          <LigneInterrupteur
            separateur
            libelle="Voir la caisse des autres guichets"
            checked={droits.caisses}
            onChange={(v) => setDroits({ ...droits, caisses: v })}
          />
        </div>
      </Planche>

      <Planche titre="Autres saisies" reference="Groupe.dc.html · MainFiltres.dc.html">
        <div className={styles.carte}>
          <Stepper
            label="Nombre de voyageurs"
            labelMoins="Moins de voyageurs"
            labelPlus="Plus de voyageurs"
            defaultValue={6}
            min={1}
            max={12}
            legende="voyageurs · 6 places côte à côte"
          />
        </div>
        <LigneCochable libelle="Toutes · 5 compagnies" detail="14 départs" defaultChecked />
        <LigneCochable separateur libelle="Alpha Voyages" detail="5 départs" defaultChecked />
        <CaseACocher label="Départs de nuit" />
        <Interrupteur aria-label="Exemple d'interrupteur seul" defaultChecked />
        <ChampRecherche placeholder="Rechercher" />
      </Planche>
    </main>
  );
}
