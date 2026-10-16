import { useState, type ReactNode } from "react";
import { BadgeTouche, ConceptionProvider } from "./badge-touche";
import { BarreOnglets } from "./barre-onglets";
import { Bouton, BoutonIcone } from "./bouton";
import { CarteAction } from "./carte-action";
import { Ecran, EcranCorps, EcranPied } from "./ecran";
import { Entete } from "./entete";
import { Etiquette } from "./etiquette";
import {
  IconeBillet,
  IconeBus,
  IconeCaisse,
  IconeRetour,
  IconeColis,
  IconeEclair,
  IconeFleche,
  IconeInverser,
  IconeLieu,
  IconeMaison,
  IconePersonne,
  IconeVoiture,
} from "./icones";
import { Pastille, statutsPastille, type StatutPastille } from "./pastille";
import { Puce } from "./puce";
import { Selecteur } from "./selecteur";
import styles from "./demo.module.css";

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={titre}>
      <Etiquette taille="m">{titre}</Etiquette>
      {children}
    </section>
  );
}

const statuts = Object.keys(statutsPastille) as StatutPastille[];

/**
 * Page de démonstration du kit de base : chaque composant dans l'état où il apparaît dans
 * Systeme.dc.html, Main.dc.html, Guichet.dc.html et Patron.dc.html. Destinée à une route
 * de développement de l'application web (par exemple `/dev/kit`).
 */
export function DemoKit() {
  const [filtre, setFiltre] = useState("tout");
  const [trajet, setTrajet] = useState("entre");
  const [role, setRole] = useState("passager");
  const [onglet, setOnglet] = useState("voyager");

  return (
    <div className={styles.page}>
      <Section titre="Boutons">
        <div className={styles.colonne}>
          <Bouton
            libelle="Action principale"
            sousLibelle="toujours en bas, sous le pouce"
            prix="7 500 F"
          />
          <Bouton
            variante="assistant"
            libelle="Demander à l'assistant"
            sousLibelle="révision lundi · qui remplace ?"
            icone={<IconeFleche taille={22} />}
          />
          <div className={styles.ligne}>
            <Bouton
              variante="secondaire"
              ton="ambre"
              libelle="Mode cadence · file de 40"
              icone={<IconeEclair taille={16} />}
            />
            <Bouton variante="secondaire" libelle="Appeler le superviseur" />
          </div>
          <div className={styles.ligne}>
            <BoutonIcone aria-label="Retour aux départs" icone={<IconeRetour taille={20} />} />
            <BoutonIcone
              variante="orange"
              aria-label="Inverser le sens"
              icone={<IconeInverser taille={20} />}
            />
          </div>
        </div>
      </Section>

      <Section titre="Pastilles d'état">
        <div className={styles.ligne}>
          {statuts.map((statut) => (
            <Pastille key={statut} statut={statut} />
          ))}
          <Pastille statut="direct" detail="07:38" />
          <Pastille statut="cadence" detail="05:14" />
        </div>
        <div className={styles.ligne}>
          <ConceptionProvider actif>
            <BadgeTouche n={2} />
            <BadgeTouche n={2} sur={3} />
          </ConceptionProvider>
        </div>
      </Section>

      <Section titre="Puces et sélecteurs">
        <div className={styles.ligne}>
          {(
            [
              ["tout", "Tout", "neutre"],
              ["bus", "Bus", "neutre"],
              ["covoit", "Covoit", "vert"],
            ] as const
          ).map(([cle, libelle, ton]) => (
            <Puce key={cle} ton={ton} selectionnee={filtre === cle} onClick={() => setFiltre(cle)}>
              {libelle}
            </Puce>
          ))}
        </div>
        <Selecteur
          aria-label="Type de trajet"
          options={[
            { valeur: "entre", libelle: "Entre villes" },
            { valeur: "ville", libelle: "Dans la même ville", icone: <IconeLieu taille={13} /> },
          ]}
          valeur={trajet}
          onChange={setTrajet}
        />
        <Selecteur
          aria-label="Type de trajet en covoiturage"
          ton="vert"
          taille="l"
          mention
          options={[
            { valeur: "entre", libelle: "Entre villes" },
            { valeur: "ville", libelle: "En ville · Douala" },
          ]}
          valeur={trajet}
          onChange={setTrajet}
        />
        <Selecteur
          aria-label="Rôle dans le covoiturage"
          ton="neutre"
          taille="l"
          options={[
            {
              valeur: "passager",
              libelle: "Je suis passager",
              icone: <IconePersonne taille={16} />,
            },
            { valeur: "conducteur", libelle: "Je conduis", icone: <IconeVoiture taille={16} /> },
          ]}
          valeur={role}
          onChange={setRole}
        />
      </Section>

      <Section titre="Cartes d'action">
        <CarteAction
          variante="principale"
          href="#vendre"
          titre="Vendre un billet"
          description="départ · siège · nom · encaisser · imprimer : 3 touches"
          icone={<IconeBillet taille={30} />}
        />
        <div className={styles.grille2}>
          <CarteAction
            href="#colis"
            titre="Enregistrer un colis"
            description="photo, étiquette, SMS"
            icone={<IconeColis taille={22} />}
          />
          <CarteAction
            href="#quai"
            ton="bleu"
            titre="Quai · embarquer"
            description="08:30 Yaoundé · 31/40 scannés"
            icone={<IconeBus taille={22} />}
          />
          <CarteAction
            href="#caisse"
            ton="rouge"
            titre="Ma caisse"
            description="fermer, compter, écart"
            icone={<IconeCaisse taille={22} />}
          />
          <CarteAction
            href="#depot"
            ton="vert"
            titre="Dépôt prépayé"
            description="scanner le code du client"
            icone={<IconeMaison taille={22} />}
          />
        </div>
        <div className={styles.grille3}>
          <CarteAction
            variante="compacte"
            href="#colis"
            titre="Envoyer un colis"
            icone={<IconeColis taille={18} />}
          />
          <CarteAction
            variante="compacte"
            href="#proche"
            ton="bleu"
            titre="Payer pour un proche"
            icone={<IconePersonne taille={18} />}
          />
          <CarteAction
            variante="compacte"
            href="#groupe"
            ton="vert"
            titre="Groupe · bus entier"
            icone={<IconePersonne taille={18} />}
          />
        </div>
      </Section>

      <Section titre="Écran complet">
        <Ecran format="planche">
          <Entete
            retour={{ libelle: "Retour aux départs", href: "#departs" }}
            titre="Bêta Express · VIP"
            sousTitre="Douala Akwa → Yaoundé Mvan · 08:00 · 3 h 30"
            droite={
              <ConceptionProvider actif>
                <BadgeTouche n={2} />
              </ConceptionProvider>
            }
          />
          <EcranCorps>
            <Etiquette>Départs · places réelles</Etiquette>
            <Pastille statut="direct" detail="07:38" />
          </EcranCorps>
          <EcranPied>
            <ConceptionProvider actif>
              <Bouton
                libelle="Payer et recevoir le billet"
                touche={3}
                sousLibelle="confirmation MoMo sur ton téléphone"
                prix="7 500 F"
              />
            </ConceptionProvider>
          </EcranPied>
          <BarreOnglets
            aria-label="Navigation"
            actif={onglet}
            onSelect={setOnglet}
            onglets={[
              { cle: "voyager", libelle: "Voyager", icone: <IconeBus taille={22} trait={2} /> },
              { cle: "colis", libelle: "Colis", icone: <IconeColis taille={22} /> },
              { cle: "covoit", libelle: "Covoit", icone: <IconeVoiture taille={22} /> },
              { cle: "moi", libelle: "Moi", icone: <IconePersonne taille={22} /> },
            ]}
          />
        </Ecran>
      </Section>
    </div>
  );
}
