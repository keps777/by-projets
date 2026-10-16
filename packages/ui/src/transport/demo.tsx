import { useState } from "react";
import type { ReactNode } from "react";
import { CarteBillet } from "./carte-billet";
import { CartePersonne } from "./carte-personne";
import { FriseArrets } from "./frise-arrets";
import { FriseColis } from "./frise-colis";
import { GrosCode } from "./gros-code";
import { LigneDepart } from "./ligne-depart";
import { PlanSieges } from "./plan-sieges";
import { VoletsDestination } from "./volets-destination";
import styles from "./demo.module.css";

const SIEGES_PRIS = [1, 2, 5, 9, 10, 14, 15];
const CONTROLE_SANS_BILLET = [7];
const CONTROLE_LIBRES = [23];

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.titre}>{titre}</h2>
      {children}
    </section>
  );
}

/**
 * Page de démo du kit transport : chaque composant avec les valeurs exactes des maquettes
 * Main, SiegePay, Pass, Direct, ColisCode, Controleur et Systeme. Sert de cible au banc.
 */
export function DemoTransport() {
  const [villes, setVilles] = useState({ depart: "DLA", arrivee: "YDE" });
  const scannes = Array.from({ length: 36 }, (_, i) => i + 1).filter(
    (n) => !CONTROLE_SANS_BILLET.includes(n) && !CONTROLE_LIBRES.includes(n),
  );

  return (
    <div className={styles.page}>
      <Section titre="Volets de destination">
        <div className={styles.rangee}>
          <VoletsDestination code={villes.depart} libelle="Douala" />
          <button
            type="button"
            className={styles.bouton}
            aria-label="Inverser le sens"
            onClick={() => setVilles((v) => ({ depart: v.arrivee, arrivee: v.depart }))}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
            </svg>
          </button>
          <VoletsDestination code={villes.arrivee} libelle="Yaoundé" alignement="fin" />
        </div>
      </Section>

      <Section titre="Lignes de départ">
        <div className={styles.liste}>
          <LigneDepart
            heure="08:00"
            compagnie="Bêta Express"
            classe="VIP"
            classePremium
            placesLibres={9}
            remplissage={0.7}
            prix={7500}
            href="#depart"
          />
          <LigneDepart
            heure="08:30"
            compagnie="Alpha Voyages"
            classe="Classique"
            placesLibres={18}
            remplissage={0.74}
            prix={4000}
            href="#depart"
          />
          <LigneDepart
            heure="09:30"
            compagnie="Oméga Transports"
            classe="Classique"
            placesLibres={3}
            remplissage={0.94}
            prix={3800}
            href="#depart"
          />
          <LigneDepart
            variante="covoiturage"
            heure="08:45"
            conducteur={{ nom: "Samuel", verifie: true }}
            detail="Bonapriso · 2 places · Toyota"
            prix={5000}
            href="#covoiturage"
          />
        </div>
      </Section>

      <Section titre="Plan de sièges · choix">
        <PlanSieges
          nombre={16}
          titre="Choisis ta place"
          pris={SIEGES_PRIS}
          selectionInitiale={[7]}
          pied={
            <>
              <span>
                Siège <strong>7</strong> · côté fenêtre · près de la porte
              </span>
              <span>9 places libres</span>
            </>
          }
        />
      </Section>

      <Section titre="Plan de sièges · contrôle">
        <PlanSieges
          mode="controle"
          nombre={36}
          titre="Siège par siège · touche un siège pour vérifier"
          info="36 sièges"
          scannes={scannes}
          sansBillet={CONTROLE_SANS_BILLET}
          onSiege={() => undefined}
        />
      </Section>

      <Section titre="Frise d'arrêts">
        <FriseArrets
          arrets={[
            { nom: "Douala Akwa", detail: "parti", heure: "08:04", etat: "passe" },
            { nom: "Edéa", detail: "arrêt 10 min", heure: "09:12", etat: "passe" },
            { nom: "Pouma", detail: "prochain arrêt", heure: "10:05", etat: "en-cours" },
            { nom: "Boumnyebel", montees: 4, heure: "10:40", etat: "prochain", href: "#arret" },
          ]}
        />
      </Section>

      <Section titre="Frise de suivi colis">
        <FriseColis
          etapeCourante={2}
          details={[
            { detail: "gare Alpha Douala · étiquette imprimée", heure: "07:52" },
            { detail: "bus LT 118 AB · scanné par le convoyeur", heure: "08:10" },
            { detail: "après Bafang · arrivée vers 13:00", heure: "11:20" },
            {
              libelle: "Disponible à Bafoussam",
              detail: "SMS à Maman avec le lieu",
              heure: "~13:00",
            },
            { detail: "photo de la remise envoyée aux deux", heure: "—" },
          ]}
        />
      </Section>

      <Section titre="Personnes vérifiées">
        <CartePersonne
          nom="Samuel E."
          note={4.9}
          trajets={112}
          detail="Toyota Corolla grise · LT 882 CE · clim · 2 places"
          droite="4 000"
        />
        <CartePersonne
          nom="Jean K."
          role="moto-taxi"
          note={4.8}
          detail="Casque passager · LT 203 MT · connaît la gare"
        />
      </Section>

      <Section titre="Gros code">
        <div className={styles.rangee}>
          <GrosCode code="7341" taille={48} libelle="Code du billet" />
          <GrosCode code="482913" taille={40} libelle="Code de retrait" />
        </div>
      </Section>

      <Section titre="Carte billet">
        <CarteBillet
          compagnie="Bêta Express"
          reference="BEX-DLA-270105-0142"
          depart={{ code: "DLA", ville: "Douala Akwa" }}
          arrivee={{ code: "YDE", ville: "Yaoundé Mvan" }}
          duree="3 h 30"
          heure="08:00"
          date="05.01"
          siege="7"
          classe="VIP"
          qr="BEX-DLA-270105-0142"
          code="7341"
          passager="Aïcha Ngo · CNI ··· 4471"
          consigne="Au quai 20 min avant, avec ta pièce."
        />
      </Section>
    </div>
  );
}
