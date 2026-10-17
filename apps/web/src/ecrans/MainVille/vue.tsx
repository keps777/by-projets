import type { voyageur as c } from "@afrimove/contrats";
import {
  Bouton,
  BoutonIcone,
  EcranCorps,
  IconeColis,
  IconeInverser,
  Pastille,
  Puce,
  Selecteur,
} from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  FILTRES,
  departImminent,
  heureDouala,
  libelleQui,
  quartier,
  type FiltreType,
} from "./formats";
import { IconeRepere, IconeVoiture, LogoAfriMove } from "./icones";
import styles from "./mainville.module.css";

export type EtatMainVille = "chargement" | "erreur" | "vide" | "pret";

/** Ce que l'écran dit du trajet du matin une fois « Chaque matin 07:00 » touché. */
export type MessageMatin =
  | { etat: "aucun" }
  | { etat: "enregistre"; texte: string }
  | { etat: "erreur" };

export interface PropsVueMainVille {
  etat: EtatMainVille;
  /** Salutation : le prénom du profil, absent tant qu'il n'est pas chargé. */
  prenom: string | undefined;
  profilEnChargement: boolean;
  recherche: c.ResultatRechercheVille | undefined;
  /** Nom de la ville affichée. */
  ville: string;
  /** Vrai quand la ville vient de la position : le texte « détectée par ta position » s'affiche. */
  villeDetectee: boolean;
  /** Texte des champs (valeur en cours de saisie ou valeur du serveur). */
  texteDepart: string;
  texteArrivee: string;
  onSaisie: (cote: "depart" | "arrivee", texte: string) => void;
  /** Le champ perd le focus ou reçoit Entrée : la saisie devient la recherche. */
  onValider: (cote: "depart" | "arrivee") => void;
  onInverser: () => void;
  quand: c.Quand;
  onQuand: (quand: c.Quand) => void;
  messageMatin: MessageMatin;
  filtre: FiltreType;
  onFiltre: (filtre: FiltreType) => void;
  onChangerVille: () => void;
  onReessayer: () => void;
}

const MOMENTS: readonly { quand: c.Quand; cle: "maintenant" | "dans1h" | "chaqueMatin" }[] = [
  { quand: "maintenant", cle: "maintenant" },
  { quand: "dans_1h", cle: "dans1h" },
  { quand: "chaque_matin", cle: "chaqueMatin" },
];

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function EnTete({
  prenom,
  profilEnChargement,
  heure,
}: {
  prenom: string | undefined;
  profilEnChargement: boolean;
  heure: string | undefined;
}) {
  const { t } = useTranslation("MainVille");
  return (
    <div className={styles.entete}>
      <div className={styles.marque}>
        <LogoAfriMove />
        <span className={styles.textes}>
          <span className={styles.nom}>{t("marque")}</span>
          {profilEnChargement ? (
            <Squelette className={styles.squeletteSalut} />
          ) : (
            <span className={styles.salut}>
              {prenom ? t("salutation", { prenom }) : t("salutationSansNom")}
            </span>
          )}
        </span>
      </div>
      <Pastille statut="direct" libelle={t("direct")} {...(heure ? { detail: heure } : {})} />
    </div>
  );
}

function Trajet(props: PropsVueMainVille) {
  const { t } = useTranslation("MainVille");
  const navigate = useNavigate();
  const { ville, villeDetectee, quand, messageMatin } = props;

  return (
    <section className={styles.trajet}>
      <Selecteur
        aria-label={t("mode.aria")}
        ton="vert"
        valeur="ville"
        onChange={(valeur) => {
          if (valeur === "entre") void navigate(urlPlanche("Main"));
        }}
        options={[
          { valeur: "entre", libelle: t("mode.entreVilles") },
          {
            valeur: "ville",
            libelle: t("mode.memeVille"),
            icone: <IconeRepere taille={13} trait={2.4} />,
          },
        ]}
      />
      <div className={styles.villeLigne}>
        <span className={styles.villeNom}>
          <span className={`${styles.villePoint} am-pulse`} aria-hidden="true" />
          {ville}
          {villeDetectee && <span className={styles.villeDetection}>{t("ville.detectee")}</span>}
        </span>
        <button
          type="button"
          className={styles.changer}
          aria-haspopup="dialog"
          onClick={props.onChangerVille}
        >
          {t("ville.changer")}
        </button>
      </div>
      <div className={styles.itineraire}>
        <div className={styles.champs}>
          <label className={styles.etiquetteChamp}>
            <span className={styles.etiquetteTexte}>{t("champs.depart")}</span>
            <input
              type="text"
              className={styles.champ}
              data-champ="depart"
              value={props.texteDepart}
              onChange={(e) => props.onSaisie("depart", e.target.value)}
              onBlur={() => props.onValider("depart")}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.onValider("depart");
              }}
            />
          </label>
          <label className={styles.etiquetteChamp}>
            <span className={styles.etiquetteTexte}>{t("champs.arrivee")}</span>
            <input
              type="text"
              className={styles.champ}
              data-champ="arrivee"
              value={props.texteArrivee}
              onChange={(e) => props.onSaisie("arrivee", e.target.value)}
              onBlur={() => props.onValider("arrivee")}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.onValider("arrivee");
              }}
            />
          </label>
        </div>
        <BoutonIcone
          variante="orange"
          className={styles.inverser}
          aria-label={t("champs.inverser")}
          onClick={props.onInverser}
          icone={<IconeInverser taille={20} trait={2.4} />}
        />
      </div>
      <div className={styles.quand} role="group" aria-label={t("quand.aria")}>
        {MOMENTS.map((m) => (
          <Puce
            key={m.quand}
            taille="s"
            className={styles.moment}
            selectionnee={quand === m.quand}
            onClick={() => props.onQuand(m.quand)}
          >
            {t(`quand.${m.cle}`)}
          </Puce>
        ))}
      </div>
      {messageMatin.etat === "enregistre" && (
        <p className={styles.messageMatin} role="status">
          {messageMatin.texte}
        </p>
      )}
      {messageMatin.etat === "erreur" && (
        <p className={styles.messageMatin} role="alert">
          {t("quand.erreur")}
        </p>
      )}
    </section>
  );
}

function LigneOffre({ offre }: { offre: c.OffreVille }) {
  const { t } = useTranslation("MainVille");
  return (
    <a
      href={urlPlanche("Paiement", { commandeId: offre.id })}
      className={styles.ligne}
      data-type={offre.type}
    >
      <span className={styles["moment-heure"]}>
        {departImminent(offre)
          ? t("liste.delai", { count: offre.departDansMinutes })
          : heureDouala(offre.departA)}
      </span>
      <span className={styles.ligneTextes}>
        <span className={styles.ligneTitre}>
          {t(`liste.types.${offre.type}`)}{" "}
          <span className={styles.ligneQui}>{libelleQui(offre, t("liste.verifiee"))}</span>
        </span>
        <span className={styles.ligneDetail}>{offre.detail}</span>
      </span>
      <span className={styles.prix}>{offre.prix}</span>
    </a>
  );
}

function CorpsOffres({
  etat,
  recherche,
  onReessayer,
}: Pick<PropsVueMainVille, "etat" | "recherche" | "onReessayer">) {
  const { t } = useTranslation("MainVille");

  if (etat === "chargement") {
    return (
      <div role="status" aria-label={t("liste.chargement")} aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.ligneSquelette}>
            <Squelette className={styles.squeletteHeure} />
            <span className={styles.squeletteTextes}>
              <Squelette className={styles.squeletteTitre} />
              <Squelette className={styles.squeletteDetail} />
            </span>
            <Squelette className={styles.squelettePrix} />
          </div>
        ))}
      </div>
    );
  }
  if (etat === "erreur") {
    return (
      <div className={styles.etatListe} role="alert">
        <p>{t("liste.erreur")}</p>
        <Bouton variante="secondaire" libelle={t("liste.reessayer")} onClick={onReessayer} />
      </div>
    );
  }
  const offres = recherche?.offres ?? [];
  if (etat === "vide" || offres.length === 0) {
    return (
      <div className={styles.etatListe} role="status">
        <p>{t("liste.vide")}</p>
      </div>
    );
  }
  return (
    <>
      {offres.map((offre) => (
        <LigneOffre key={offre.id} offre={offre} />
      ))}
    </>
  );
}

function Offres(props: PropsVueMainVille) {
  const { t } = useTranslation("MainVille");
  const { recherche, filtre, onFiltre } = props;
  const itineraire = recherche?.itineraire;

  return (
    <section className={styles.offres}>
      <div className={styles.offresEntete}>
        <span className={styles.offresTitre}>
          {itineraire ? (
            t("liste.resume", {
              depart: quartier(itineraire.depart),
              arrivee: quartier(itineraire.arrivee),
              km: itineraire.distanceKm,
            })
          ) : (
            <Squelette className={styles.squeletteResume} />
          )}
        </span>
        <span className={styles.filtres} role="group" aria-label={t("liste.filtres.aria")}>
          {FILTRES.map((f) => (
            <Puce
              key={f}
              ton={f === "covoit" ? "vert" : "neutre"}
              selectionnee={filtre === f}
              onClick={() => onFiltre(f)}
            >
              {t(`liste.filtres.${f}`)}
            </Puce>
          ))}
        </span>
      </div>
      <CorpsOffres etat={props.etat} recherche={recherche} onReessayer={props.onReessayer} />
    </section>
  );
}

function Cartes() {
  const { t } = useTranslation("MainVille");
  return (
    <div className={styles.cartes}>
      <a href={urlPlanche("ColisEnvoi")} className={styles.carte}>
        <span className={styles.carteIcone}>
          <IconeColis taille={18} trait={2.2} />
        </span>
        <span className={styles.carteTextes}>
          <span className={styles.carteTitre}>{t("raccourcis.colis.titre")}</span>
          <span className={styles.carteDetail}>{t("raccourcis.colis.detail")}</span>
        </span>
      </a>
      <a href={urlPlanche("CovoitConducteur")} className={styles.carte}>
        <span className={styles.carteIcone} data-ton="vert">
          <IconeVoiture taille={18} trait={2.2} />
        </span>
        <span className={styles.carteTextes}>
          <span className={styles.carteTitre}>{t("raccourcis.conduis.titre")}</span>
          <span className={styles.carteDetail}>{t("raccourcis.conduis.detail")}</span>
        </span>
      </a>
    </div>
  );
}

/**
 * Accueil voyageur « dans la même ville » : en-tête AfriMove + pastille DIRECT, trajet (mode, ville détectée,
 * départ, arrivée, moments), offres mélangées (covoiturage, moto-taxi, bus de ville) et cartes « Colis en ville »
 * et « Je conduis ». La barre d'onglets est posée par le layout du voyageur.
 */
export function VueMainVille(props: PropsVueMainVille) {
  const { t } = useTranslation("MainVille");
  const { recherche } = props;

  return (
    <EcranCorps
      className={styles.corps}
      data-planche="MainVille"
      data-etat={props.etat}
      aria-busy={props.etat === "chargement"}
    >
      <h1 className={styles.titreEcran}>{t("ecrans.MainVille.titre", { ns: "translation" })}</h1>
      <EnTete
        prenom={props.prenom}
        profilEnChargement={props.profilEnChargement}
        heure={recherche ? heureDouala(recherche.maintenant) : undefined}
      />
      <Trajet {...props} />
      <Offres {...props} />
      <Cartes />
    </EcranCorps>
  );
}
