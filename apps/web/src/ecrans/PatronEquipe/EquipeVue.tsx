import { Bouton, EcranCorps, EcranPied, Entete, IconeFleche, Pastille } from "@afrimove/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { estFeminin } from "@/ecrans/SuperviseurEquipe/genre";
import {
  ecart,
  heureDouala,
  montant,
  tonAvatar,
  tonEtatPersonne,
  tonGare,
  tonIndicateur,
  villeAffichee,
} from "./formats";
import { FlecheBas } from "./icones";
import styles from "./patron-equipe.module.css";
import type { EtatBloc, Gare, Personne, Repere, VueGares } from "./types";

export interface PropsEquipeVue {
  etat: EtatBloc;
  /** « Mes gares, mes gens », présent quand `etat` vaut `pret`. */
  vue?: VueGares | undefined;
  onReessayer?: () => void;
}

/** Ton de chaque repère : le plus régulier en vert, l'à-voir en ambre, la paie discrète. */
const TON_REPERE: Record<Repere["code"], "vert" | "ambre" | "neutre"> = {
  plus_regulier: "vert",
  a_voir: "ambre",
  paie_du_mois: "neutre",
};

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Carte({
  titre,
  aide,
  avecFleche,
  children,
}: {
  titre: string;
  aide: string;
  avecFleche?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.carte} aria-label={titre}>
      <div className={styles.carteTete}>
        <h2 className={styles.carteTitre}>{titre}</h2>
        <span className={styles.carteAide}>
          {aide}
          {avecFleche && <FlecheBas />}
        </span>
      </div>
      {children}
    </section>
  );
}

/** « Akwa · Mme Essono », « Mvan · Yaoundé · O. Essomba », « Bafoussam · T. Kamga ». */
function LigneGare({ gare, gares }: { gare: Gare; gares: readonly Gare[] }) {
  const { t } = useTranslation("PatronEquipe");
  const ville = villeAffichee(gare, gares);
  const intitule = gare.responsable
    ? ville
      ? t("gares.ligneVille", { nom: gare.nom, ville, responsable: gare.responsable })
      : t("gares.ligne", { nom: gare.nom, responsable: gare.responsable })
    : t("gares.ligneSansResponsable", { nom: gare.nom });
  const synchro = {
    synchronises: gare.synchro.guichetsSynchronises,
    total: gare.synchro.guichets,
  };
  const etat =
    gare.horsLigneDepuisMinutes !== null
      ? t("gares.horsLigne", { minutes: gare.horsLigneDepuisMinutes })
      : gare.ecartTotal === null
        ? t("gares.etatSansEcart", synchro)
        : t("gares.etat", { ...synchro, ecart: ecart(gare.ecartTotal) });
  return (
    <li>
      <a className={styles.ligneGare} href={urlPlanche("PatronGare", { gareId: gare.id })}>
        <span className={styles.colonne}>
          <span className={styles.nom}>{intitule}</span>
          <span className={styles.detail}>
            {t("gares.composition", {
              guichets: t("gares.guichets", { count: gare.nbGuichets }),
              quais: t("gares.quais", { count: gare.nbQuais }),
            })}
          </span>
        </span>
        <span className={`${styles.colonne} ${styles.colonneDroite}`}>
          <span className={styles.caisse}>{montant(gare.caisse)}</span>
          <span className={styles.etatGare} data-ton={tonGare(gare)}>
            {etat}
          </span>
        </span>
      </a>
    </li>
  );
}

function LignePersonne({ personne }: { personne: Personne }) {
  const { t } = useTranslation("PatronEquipe");
  const contexte = estFeminin(personne.nom) ? { context: "f" } : {};
  const role = t(`roles.${personne.role}`, contexte);
  return (
    <li>
      <a
        className={styles.lignePersonne}
        href={urlPlanche("PatronPersonne", { personneId: personne.id })}
      >
        <span className={styles.avatar} data-ton={tonAvatar(personne)} aria-hidden="true">
          {personne.initiales}
        </span>
        <span className={styles.colonne}>
          <span className={styles.nom}>
            {/* Le séparateur n'est pas un texte à traduire : la planche écrit « Joseph M. · guichetier · Akwa guichet 2 ». */}
            {personne.nom} ·{" "}
            <span className={styles.role}>
              {personne.lieu
                ? t("gens.lieu", { role, lieu: personne.lieu })
                : t("gens.lieuSansPrecision", { role })}
            </span>
          </span>
          <span className={styles.indicateur} data-ton={tonIndicateur(personne)}>
            {personne.indicateur}
          </span>
        </span>
        <span className={styles.etatPersonne} data-ton={tonEtatPersonne(personne.etat)}>
          {t(`etats.${personne.etat}`, contexte)}
        </span>
      </a>
    </li>
  );
}

function CarteGares({ etat, vue }: { etat: EtatBloc; vue: VueGares | undefined }) {
  const { t } = useTranslation("PatronEquipe");
  return (
    <Carte titre={t("gares.titre")} aide={t("gares.aide")}>
      <ul className={styles.liste}>
        {etat === "chargement" &&
          [1, 2, 3].map((i) => (
            <li key={i} aria-hidden="true">
              <span className={styles.squeletteLigne}>
                <Squelette className={styles.squeletteTrait} />
              </span>
            </li>
          ))}
        {vue?.gares.map((gare) => (
          <LigneGare key={gare.id} gare={gare} gares={vue.gares} />
        ))}
      </ul>
    </Carte>
  );
}

function Effectifs({ etat, vue }: { etat: EtatBloc; vue: VueGares | undefined }) {
  const { t } = useTranslation("PatronEquipe");
  if (etat === "chargement") {
    return (
      <ul className={styles.effectifs} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <li key={i}>
            <Squelette className={styles.squeletteEffectif} />
          </li>
        ))}
      </ul>
    );
  }
  if (!vue || vue.effectifs.length === 0) return null;
  return (
    <ul className={styles.effectifs}>
      {vue.effectifs.map((effectif) => (
        <li key={effectif.role} className={styles.effectif}>
          <span className={styles.effectifLibelle}>{t(`effectifs.${effectif.role}.libelle`)}</span>
          <span className={styles.effectifNombre}>{effectif.nombre}</span>
          <span className={styles.effectifDetail}>
            {t(`effectifs.${effectif.role}.detail`, { count: effectif.enService })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CarteGens({ etat, vue }: { etat: EtatBloc; vue: VueGares | undefined }) {
  const { t } = useTranslation("PatronEquipe");
  const titre = vue ? t("gens.titre", { count: vue.nbPersonnes }) : t("gens.titreSansEffectif");
  return (
    <Carte titre={titre} aide={t("gens.aide")} avecFleche>
      <div className={styles.zone}>
        <div
          className={styles.defilement}
          tabIndex={0}
          role="region"
          aria-label={t("gens.liste", { titre })}
        >
          <ul className={styles.liste}>
            {etat === "chargement" &&
              [1, 2, 3, 4, 5].map((i) => (
                <li key={i} aria-hidden="true">
                  <span className={styles.squeletteLigne} data-haute="">
                    <Squelette className={styles.squeletteTrait} />
                  </span>
                </li>
              ))}
            {vue?.personnes.map((personne) => (
              <LignePersonne key={personne.id} personne={personne} />
            ))}
          </ul>
        </div>
        <span className={styles.degrade} aria-hidden="true" />
      </div>
    </Carte>
  );
}

function Reperes({ etat, vue }: { etat: EtatBloc; vue: VueGares | undefined }) {
  if (etat === "chargement") {
    return (
      <ul className={styles.reperes} aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <li key={i}>
            <Squelette className={styles.squeletteRepere} />
          </li>
        ))}
      </ul>
    );
  }
  if (!vue || vue.reperes.length === 0) return null;
  return (
    <ul className={styles.reperes}>
      {vue.reperes.map((repere) => (
        <li key={repere.code} className={styles.repere} data-ton={TON_REPERE[repere.code]}>
          <span className={styles.repereLibelle}>{repere.libelle}</span>
          <span className={styles.repereValeur}>{repere.valeur}</span>
        </li>
      ))}
    </ul>
  );
}

function Bandeau({
  role,
  texte,
  onReessayer,
}: {
  role: "alert" | "status";
  texte: string;
  onReessayer?: (() => void) | undefined;
}) {
  const { t } = useTranslation("PatronEquipe");
  return (
    <div className={styles.etat}>
      <div className={styles.bandeau} role={role}>
        <span className={styles.point} />
        <p>{texte}</p>
      </div>
      {onReessayer && (
        <Bouton variante="secondaire" libelle={t("erreur.reessayer")} onClick={onReessayer} />
      )}
    </div>
  );
}

/**
 * « Mes gares, mes gens » : les trois gares du jour (caisse, synchronisation, écart), les effectifs par rôle, la liste
 * glissable des personnes avec leur état, trois repères et, en bas, « + personne · + gare » et « Payer les 23 salaires ».
 * Chaque gare ouvre la gare, chaque personne ouvre sa fiche. Pas de barre d'onglets sur cette planche.
 *
 * Les actions du pied ne dépendent pas des données (sauf le libellé de la paie) : elles restent utilisables pendant le
 * chargement et en cas d'erreur.
 */
export function EquipeVue({ etat, vue, onReessayer }: PropsEquipeVue) {
  const { t } = useTranslation("PatronEquipe");
  const donnees = etat === "pret" ? vue : undefined;
  const chargement = etat === "chargement";
  const hrefReglages = urlPlanche("Config");

  return (
    <>
      <Entete
        titre={t("titre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Patron") }}
        sousTitre={
          donnees ? (
            t("sousTitre", {
              gares: t("nbGares", { count: donnees.gares.length }),
              personnes: t("nbPersonnes", { count: donnees.nbPersonnes }),
              bus: t("nbBus", { count: donnees.nbBus }),
              heure: heureDouala(donnees.instant),
            })
          ) : chargement ? (
            <Squelette className={styles.squeletteSousTitre} />
          ) : undefined
        }
        droite={
          donnees ? (
            <Pastille statut="active" libelle={t("badge", { count: donnees.enService })} />
          ) : chargement ? (
            <Squelette className={styles.squelettePastille} />
          ) : undefined
        }
      />

      <EcranCorps
        className={styles.corps}
        data-planche="PatronEquipe"
        data-etat={etat}
        aria-busy={chargement}
        {...(chargement ? { "aria-label": t("chargement.libelle") } : {})}
      >
        {etat === "erreur" && (
          <Bandeau role="alert" texte={t("erreur.texte")} onReessayer={onReessayer} />
        )}
        {etat === "vide" && <Bandeau role="status" texte={t("vide.texte")} />}

        {(chargement || donnees) && (
          <>
            <CarteGares etat={etat} vue={donnees} />
            <Effectifs etat={etat} vue={donnees} />
            <CarteGens etat={etat} vue={donnees} />
            <Reperes etat={etat} vue={donnees} />
          </>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied} {...(chargement || donnees ? {} : { "data-seul": "" })}>
        <Bouton
          variante="secondaire"
          libelle={t("actions.ajouter")}
          href={hrefReglages}
          className={styles.ajouter}
        />
        {donnees ? (
          <Bouton
            variante="assistant"
            libelle={t("paie.payer", { count: donnees.paie.nbSalaires })}
            sousLibelle={t("paie.detail", { jour: donnees.paie.jourDuMois })}
            href={urlPlanche("Financement")}
            icone={<IconeFleche taille={22} />}
            className={styles.payer}
          />
        ) : chargement ? (
          <Squelette className={styles.squeletteBouton} />
        ) : null}
      </EcranPied>
    </>
  );
}
