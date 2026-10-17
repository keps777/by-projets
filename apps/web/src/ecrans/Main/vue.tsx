import type { voyageur as c } from "@afrimove/contrats";
import {
  Bouton,
  BoutonIcone,
  CarteAction,
  EcranCorps,
  IconeChevronBas,
  IconeChevronDroite,
  IconeColis,
  IconeInverser,
  IconePersonne,
  LigneDepart,
  Pastille,
  Puce,
  Selecteur,
  VoletsDestination,
} from "@afrimove/ui";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { moduleDeLUrl, useModules } from "@/coquille/modules";
import { urlPlanche } from "@/coquille/planches";
import { heureDouala, type VilleChoisie } from "./formats";
import {
  IconeCocheColis,
  IconeFiltre,
  IconeGroupe,
  IconeMoto,
  IconeRepere,
  IconeTelephone,
  LogoAfriMove,
} from "./icones";
import { LigneBus } from "./ligne-bus";
import styles from "./main.module.css";

export type EtatMain = "chargement" | "erreur" | "vide" | "pret";
export type OngletListe = "tout" | "bus" | "covoit";

export interface PropsVueMain {
  etat: EtatMain;
  /** Salutation : le prénom du profil, absent tant qu'il n'est pas chargé. */
  prenom: string | undefined;
  profilEnChargement: boolean;
  depart: VilleChoisie;
  arrivee: VilleChoisie;
  /** Étiquette de la puce de date (« Auj. », « Dem. », « mer. 6 »). */
  libelleJour: string;
  /** Vrai quand le jour affiché est aujourd'hui (texte du lien « voir tout »). */
  jourAujourdhui: boolean;
  recherche: c.ResultatRechercheDeparts | undefined;
  onglet: OngletListe;
  onOnglet: (onglet: OngletListe) => void;
  onInverser: () => void;
  onChangerVille: (cote: "depart" | "arrivee") => void;
  onChangerJour: () => void;
  onReessayer: () => void;
}

interface Raccourci {
  cle: string;
  planche: "ColisEnvoi" | "Proche" | "Groupe" | "Course" | "Arret" | "USSD";
  icone: ReactNode;
  ton?: "ambre" | "bleu" | "vert";
}

/** Les trois cartes de la première rangée. */
const SERVICES: readonly Raccourci[] = [
  { cle: "colis", planche: "ColisEnvoi", icone: <IconeColis taille={18} trait={2.2} /> },
  {
    cle: "proche",
    planche: "Proche",
    ton: "bleu",
    icone: <IconePersonne taille={18} trait={2.2} />,
  },
  {
    cle: "groupe",
    planche: "Groupe",
    ton: "vert",
    icone: <IconeGroupe taille={18} trait={2.2} />,
  },
];

/** Les trois raccourcis de la seconde rangée. */
const AUTRES: readonly Raccourci[] = [
  { cle: "course", planche: "Course", icone: <IconeMoto taille={16} trait={2.2} /> },
  { cle: "arret", planche: "Arret", icone: <IconeRepere taille={16} trait={2.2} /> },
  { cle: "ussd", planche: "USSD", icone: <IconeTelephone taille={16} trait={2.2} /> },
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
  const { t } = useTranslation("Main");
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

function Trajet({
  depart,
  arrivee,
  libelleJour,
  recherche,
  onInverser,
  onChangerVille,
  onChangerJour,
}: Pick<
  PropsVueMain,
  | "depart"
  | "arrivee"
  | "libelleJour"
  | "recherche"
  | "onInverser"
  | "onChangerVille"
  | "onChangerJour"
>) {
  const { t } = useTranslation("Main");
  const navigate = useNavigate();
  const position = recherche?.position;
  const filtres = recherche?.filtres;

  return (
    <section className={styles.trajet}>
      <Selecteur
        aria-label={t("mode.aria")}
        valeur="entre"
        onChange={(valeur) => {
          if (valeur === "ville") void navigate(urlPlanche("MainVille"));
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
      <div className={styles.etiquettes}>
        <span>{t("trajet.depart")}</span>
        <span>{t("trajet.arrivee")}</span>
      </div>
      <div className={styles.volets}>
        <button
          type="button"
          className={styles.ville}
          data-cote="depart"
          aria-label={t("trajet.changerDepart", { ville: depart.nom })}
          onClick={() => onChangerVille("depart")}
        >
          <VoletsDestination code={depart.code} libelle={depart.nom} />
        </button>
        <BoutonIcone
          variante="orange"
          aria-label={t("trajet.inverser")}
          onClick={onInverser}
          icone={<IconeInverser taille={20} trait={2.4} />}
        />
        <button
          type="button"
          className={styles.ville}
          data-cote="arrivee"
          aria-label={t("trajet.changerArrivee", { ville: arrivee.nom })}
          onClick={() => onChangerVille("arrivee")}
        >
          <VoletsDestination code={arrivee.code} libelle={arrivee.nom} alignement="fin" />
        </button>
      </div>
      <div className={styles.position}>
        <span className={styles.positionTexte}>
          {position && (
            <>
              <IconeRepere taille={12} trait={2.4} couleur="var(--am-vert)" />
              {t("trajet.position", {
                ville: position.ville,
                gareDepart: position.gareDepart,
                gareArrivee: position.gareArrivee,
              })}
            </>
          )}
        </span>
        <Puce taille="m" aria-haspopup="dialog" onClick={onChangerJour}>
          {libelleJour} ▾
        </Puce>
      </div>
      <a href={urlPlanche("MainFiltres")} className={styles.filtre}>
        <span className={styles.filtreResume}>
          <IconeFiltre taille={14} trait={2.4} couleur="var(--am-ambre)" />
          {filtres
            ? t("filtre.resume", {
                classe: t(`filtre.${filtres.classe}`),
                compagnies: t("filtre.compagnies", { count: filtres.compagnies }),
              })
            : null}
        </span>
        <span className={styles.filtrePreferees}>
          {filtres && filtres.preferees > 0
            ? t("filtre.preferees", { count: filtres.preferees })
            : null}
          <IconeChevronBas taille={12} trait={2.6} />
        </span>
      </a>
    </section>
  );
}

function CorpsListe({
  etat,
  recherche,
  onglet,
  covoitActif,
  onReessayer,
}: Pick<PropsVueMain, "etat" | "recherche" | "onglet" | "onReessayer"> & {
  covoitActif: boolean;
}) {
  const { t } = useTranslation("Main");

  if (etat === "chargement") {
    return (
      <div role="status" aria-label={t("liste.chargement")} aria-busy="true">
        {[0, 1, 2].map((i) => (
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
  const bus = onglet === "covoit" ? [] : (recherche?.departs ?? []);
  const covoits = onglet === "bus" || !covoitActif ? [] : (recherche?.covoits ?? []);
  if (etat === "vide" || bus.length + covoits.length === 0) {
    return (
      <div className={styles.etatListe} role="status">
        <p>{t("liste.vide")}</p>
      </div>
    );
  }
  return (
    <>
      {bus.map((depart) => (
        <LigneBus key={depart.id} depart={depart} />
      ))}
      {covoits.map((covoit) => (
        <LigneDepart
          key={covoit.id}
          variante="covoiturage"
          heure={heureDouala(covoit.heureDepart)}
          conducteur={{ nom: covoit.conducteur, verifie: covoit.verifie }}
          avatar={false}
          detail={t("liste.covoitDetail", {
            lieu: covoit.lieuDepart,
            count: covoit.placesLibres,
            vehicule: covoit.vehicule,
          })}
          prix={covoit.prixParPlace}
          href={urlPlanche("Covoit")}
          className={styles.ligneDepart}
        />
      ))}
    </>
  );
}

function Departs(
  props: Pick<
    PropsVueMain,
    "etat" | "recherche" | "onglet" | "onOnglet" | "onReessayer" | "jourAujourdhui"
  > & { covoitActif: boolean },
) {
  const { t } = useTranslation("Main");
  const { recherche, onglet, onOnglet, covoitActif, jourAujourdhui } = props;
  const totaux = recherche?.totaux;

  let resume: string | undefined;
  if (totaux) {
    const bus = t("liste.bus", { count: totaux.bus });
    const sujet =
      covoitActif && totaux.covoiturages > 0
        ? t("liste.et", { bus, covoit: t("liste.covoiturages", { count: totaux.covoiturages }) })
        : bus;
    resume = t(jourAujourdhui ? "liste.reseauAujourdhui" : "liste.reseauAutreJour", {
      resume: sujet,
    });
  }

  return (
    <section className={styles.departs}>
      <div className={styles.departsEntete}>
        <span className={styles.departsTitre}>{t("liste.titre")}</span>
        {covoitActif && (
          <span className={styles.onglets}>
            <Puce selectionnee={onglet === "tout"} onClick={() => onOnglet("tout")}>
              {t("liste.onglets.tout")}
            </Puce>
            <Puce selectionnee={onglet === "bus"} onClick={() => onOnglet("bus")}>
              {t("liste.onglets.bus")}
            </Puce>
            <Puce ton="vert" selectionnee={onglet === "covoit"} onClick={() => onOnglet("covoit")}>
              {t("liste.onglets.covoit")}
            </Puce>
          </span>
        )}
      </div>
      {/* La liste prend la hauteur restante de l'écran (comme la planche) et défile quand elle déborde. */}
      <div className={styles.lignes}>
        <CorpsListe {...props} />
        {resume && (
          <a href={urlPlanche("Reseau")} className={styles.reseau}>
            {resume}
            <IconeChevronDroite taille={14} trait={2.4} />
          </a>
        )}
      </div>
    </section>
  );
}

function Raccourcis({
  cartes,
  autres,
}: {
  cartes: readonly Raccourci[];
  autres: readonly Raccourci[];
}) {
  const { t } = useTranslation("Main");
  return (
    <>
      {cartes.length > 0 && (
        <div
          className={styles.grille}
          style={{ ["--colonnes" as string]: cartes.length } as CSSProperties}
        >
          {cartes.map((carte) => (
            <CarteAction
              key={carte.cle}
              variante="compacte"
              className={styles.service}
              href={urlPlanche(carte.planche)}
              titre={t(`raccourcis.${carte.cle}`)}
              icone={carte.icone}
              {...(carte.ton ? { ton: carte.ton } : {})}
            />
          ))}
        </div>
      )}
      {autres.length > 0 && (
        <div
          className={styles.grille}
          style={{ ["--colonnes" as string]: autres.length } as CSSProperties}
        >
          {autres.map((carte) => (
            <a key={carte.cle} href={urlPlanche(carte.planche)} className={styles.raccourci}>
              {carte.icone}
              {t(`raccourcis.${carte.cle}`)}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Accueil voyageur : en-tête AfriMove + pastille DIRECT, trajet (volets de destination, position, jour, filtre),
 * départs en direct, raccourcis et notification du colis. La barre d'onglets est posée par le layout du voyageur.
 *
 * Un module masqué (colis, covoit, ussd...) retire sa carte, ses lignes et son onglet : les rangées se referment
 * sur les cartes restantes, rien n'est grisé.
 */
export function VueMain(props: PropsVueMain) {
  const { t } = useTranslation("Main");
  const { moduleActif } = useModules();
  const { recherche } = props;

  const actif = (planche: Raccourci["planche"]) => {
    const module = moduleDeLUrl(urlPlanche(planche));
    return module === null || moduleActif(module);
  };
  const covoitActif = moduleActif("covoit");
  const colisActif = moduleActif("colis");
  const notification = colisActif ? recherche?.notificationColis : undefined;

  return (
    <EcranCorps
      className={styles.corps}
      data-planche="Main"
      data-etat={props.etat}
      aria-busy={props.etat === "chargement"}
    >
      <h1 className={styles.titreEcran}>{t("ecrans.Main.titre", { ns: "translation" })}</h1>
      <EnTete
        prenom={props.prenom}
        profilEnChargement={props.profilEnChargement}
        heure={recherche ? heureDouala(recherche.maintenant) : undefined}
      />
      <Trajet {...props} />
      <Departs {...props} covoitActif={covoitActif} />
      <Raccourcis
        cartes={SERVICES.filter((r) => actif(r.planche))}
        autres={AUTRES.filter((r) => actif(r.planche))}
      />
      {notification && (
        <a
          href={urlPlanche("ColisCode", { colisId: notification.colisId })}
          className={styles.notification}
        >
          <span className={styles.notificationIcone}>
            <IconeCocheColis taille={18} trait={2.4} />
          </span>
          <span className={styles.notificationTextes}>
            <span className={styles.notificationTitre}>{notification.titre}</span>
            <span className={styles.notificationDetail}>{notification.detail}</span>
          </span>
        </a>
      )}
    </EcranCorps>
  );
}
