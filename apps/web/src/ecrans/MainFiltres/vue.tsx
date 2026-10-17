import type { voyageur as c } from "@afrimove/contrats";
import { Bouton, EcranCorps, LigneCochable, Pastille, Puce, Selecteur } from "@afrimove/ui";
import type { TFunction } from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  compagniesCochees,
  estCochee,
  type ClasseFiltre,
  type CompagnieFiltre,
  type Filtre,
} from "./filtres";
import { IconeChevronHaut, IconeFiltre, IconeRepere, LogoAfriMove } from "./icones";
import styles from "./main-filtres.module.css";

export type EtatMainFiltres = "chargement" | "erreur" | "pret";

export interface PropsVueMainFiltres {
  etat: EtatMainFiltres;
  /** Salutation : le prénom du profil, absent tant qu'il n'est pas chargé. */
  prenom: string | undefined;
  profilEnChargement: boolean;
  /** Heure de la pastille DIRECT (« 07:38 »). */
  heure: string;
  depart: string;
  arrivee: string;
  options: c.OptionsFiltres | undefined;
  filtre: Filtre;
  /** Étoile d'une compagnie : tient compte d'un changement pas encore confirmé par le serveur. */
  estPreferee: (compagnie: CompagnieFiltre) => boolean;
  /** Nombre du bouton « Voir les N départs » ; absent tant qu'il n'est pas connu. */
  nombre: number | undefined;
  /** Vrai quand l'enregistrement d'une étoile a échoué. */
  echecPreferee: boolean;
  onClasse: (classe: ClasseFiltre) => void;
  onToutes: () => void;
  onCompagnie: (id: string) => void;
  onPreferee: (compagnie: CompagnieFiltre, preferee: boolean) => void;
  onAussi: (code: string) => void;
  onEffacer: () => void;
  onReessayer: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function EnTete({
  prenom,
  profilEnChargement,
  heure,
}: Pick<PropsVueMainFiltres, "prenom" | "profilEnChargement" | "heure">) {
  const { t } = useTranslation("MainFiltres");
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
      <Pastille statut="direct" libelle={t("direct")} detail={heure} />
    </div>
  );
}

function PanneauEnChargement() {
  const { t } = useTranslation("MainFiltres");
  return (
    <div
      role="status"
      aria-label={t("etats.chargement")}
      aria-busy="true"
      className={styles.contenu}
    >
      <div className={styles.section}>
        <Squelette className={styles.squeletteEtiquette} />
        <div className={styles.classes}>
          {[0, 1, 2].map((i) => (
            <Squelette key={i} className={styles.squeletteClasse} />
          ))}
        </div>
      </div>
      <div className={styles.listeCompagnies}>
        <Squelette className={styles.squeletteEtiquette} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Squelette key={i} className={styles.squeletteLigne} />
        ))}
      </div>
      <div className={styles.section}>
        <Squelette className={styles.squeletteEtiquette} />
        <div className={styles.aussi}>
          {[0, 1, 2, 3].map((i) => (
            <Squelette key={i} className={styles.squeletteChip} />
          ))}
        </div>
      </div>
      <div className={styles.actions}>
        <Squelette className={styles.squeletteAction} />
        <Squelette className={styles.squeletteAction} />
      </div>
    </div>
  );
}

function PanneauEnErreur({ onReessayer }: Pick<PropsVueMainFiltres, "onReessayer">) {
  const { t } = useTranslation("MainFiltres");
  return (
    <div role="alert" className={styles.etat}>
      <p>{t("etats.erreur")}</p>
      <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
    </div>
  );
}

function Classes({
  options,
  filtre,
  onClasse,
}: Pick<PropsVueMainFiltres, "filtre" | "onClasse"> & { options: c.OptionsFiltres }) {
  const { t } = useTranslation("MainFiltres");
  const titre = useId();
  return (
    <div className={styles.section}>
      <span id={titre} className={styles.etiquette}>
        {t("classe.titre")}
      </span>
      <div role="group" aria-labelledby={titre} className={styles.classes}>
        {options.classes.map((classe) => (
          <button
            key={classe.valeur}
            type="button"
            aria-pressed={filtre.classe === classe.valeur}
            className={styles.classe}
            onClick={() => onClasse(classe.valeur)}
          >
            {classe.libelle}
          </button>
        ))}
      </div>
    </div>
  );
}

function Compagnies({
  options,
  filtre,
  estPreferee,
  echecPreferee,
  onToutes,
  onCompagnie,
  onPreferee,
}: Pick<
  PropsVueMainFiltres,
  "filtre" | "estPreferee" | "echecPreferee" | "onToutes" | "onCompagnie" | "onPreferee"
> & { options: c.OptionsFiltres }) {
  const { t } = useTranslation("MainFiltres");
  const { compagnies } = options;
  const cochees = compagniesCochees(compagnies, filtre).length;
  const toutes = cochees === compagnies.length;

  return (
    <div className={styles.listeCompagnies}>
      <div className={styles.compagniesEntete}>
        <span className={styles.etiquette}>{t("compagnies.titre")}</span>
        <span className={styles.legende}>{t("compagnies.legende")}</span>
      </div>
      {compagnies.length === 0 ? (
        <p className={styles.aucune} role="status">
          {t("compagnies.aucune")}
        </p>
      ) : (
        <>
          <LigneCochable
            className={styles.ligne}
            aria-label={t("compagnies.toutesAria")}
            checked={toutes}
            indeterminee={!toutes}
            onChange={onToutes}
            libelle={
              <span className={styles.toutes}>
                {t("compagnies.toutes", { count: compagnies.length })}
              </span>
            }
            detail={t("compagnies.departs", { count: options.totalDeparts })}
          />
          {compagnies.map((compagnie) => {
            const preferee = estPreferee(compagnie);
            return (
              <LigneCochable
                key={compagnie.id}
                separateur
                className={styles.ligne}
                aria-label={compagnie.nom}
                checked={estCochee(filtre, compagnie.id)}
                onChange={() => onCompagnie(compagnie.id)}
                libelle={
                  <>
                    {compagnie.nom}
                    {compagnie.etiquette && (
                      <>
                        {" "}
                        <span
                          className={styles.etiquetteCompagnie}
                          data-ton={compagnie.etiquette === "VIP" ? "bleu" : "neutre"}
                        >
                          {compagnie.etiquette}
                        </span>
                      </>
                    )}
                  </>
                }
                detail={t("compagnies.departs", { count: compagnie.departs })}
                action={
                  <button
                    type="button"
                    className={styles.etoile}
                    aria-label={t(
                      preferee ? "compagnies.retirerPreferee" : "compagnies.ajouterPreferee",
                    )}
                    aria-pressed={preferee}
                    onClick={() => onPreferee(compagnie, !preferee)}
                  >
                    {preferee ? "★" : "☆"}
                  </button>
                }
              />
            );
          })}
        </>
      )}
      {echecPreferee && (
        <p className={styles.echec} role="alert">
          {t("compagnies.echecPreferee")}
        </p>
      )}
    </div>
  );
}

function Aussi({
  options,
  filtre,
  onAussi,
}: Pick<PropsVueMainFiltres, "filtre" | "onAussi"> & { options: c.OptionsFiltres }) {
  const { t } = useTranslation("MainFiltres");
  return (
    <div className={styles.section}>
      <span className={styles.etiquette}>{t("aussi.titre")}</span>
      <div className={styles.aussi}>
        {options.aussi.map((option) => {
          const actif = filtre.aussi.includes(option.code);
          return (
            <Puce
              key={option.code}
              taille="m"
              className={styles.chip}
              selectionnee={actif}
              onClick={() => onAussi(option.code)}
            >
              {actif ? t("aussi.actif", { libelle: option.libelle }) : option.libelle}
            </Puce>
          );
        })}
      </div>
    </div>
  );
}

function libelleVoir(nombre: number | undefined, t: TFunction<"MainFiltres">) {
  if (nombre === undefined) return t("actions.voirSansNombre");
  if (nombre === 0) return t("actions.voirAucun");
  return t("actions.voir", { count: nombre });
}

function PanneauPret(props: PropsVueMainFiltres & { options: c.OptionsFiltres }) {
  const { t } = useTranslation("MainFiltres");
  const { options } = props;
  return (
    <div className={styles.contenu}>
      <Classes options={options} filtre={props.filtre} onClasse={props.onClasse} />
      <Compagnies
        options={options}
        filtre={props.filtre}
        estPreferee={props.estPreferee}
        echecPreferee={props.echecPreferee}
        onToutes={props.onToutes}
        onCompagnie={props.onCompagnie}
        onPreferee={props.onPreferee}
      />
      <Aussi options={options} filtre={props.filtre} onAussi={props.onAussi} />
      <div className={styles.actions}>
        <button type="button" className={styles.effacer} onClick={props.onEffacer}>
          {t("actions.effacer")}
        </button>
        <a href={urlPlanche("Main")} className={styles.voir}>
          {libelleVoir(props.nombre, t)}
        </a>
      </div>
      <span className={styles.note}>{t("note")}</span>
    </div>
  );
}

/**
 * Accueil voyageur, filtre déroulé (MainFiltres.dc.html) : l'en-tête et le trajet de l'accueil, puis le panneau
 * Classe · Compagnies · Aussi sous le résumé du filtre. La barre d'onglets est posée par le layout du voyageur.
 */
export function VueMainFiltres(props: PropsVueMainFiltres) {
  const { t } = useTranslation("MainFiltres");
  const navigate = useNavigate();

  return (
    <div className={styles.racine}>
      <EcranCorps className={styles.corps} data-planche="MainFiltres" data-etat={props.etat}>
        <h1 className={styles.titreEcran}>
          {t("ecrans.MainFiltres.titre", { ns: "translation" })}
        </h1>
        <EnTete
          prenom={props.prenom}
          profilEnChargement={props.profilEnChargement}
          heure={props.heure}
        />
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
          <div className={styles.ligneTrajet}>
            <span className={styles.villes}>
              {props.depart} <span className={styles.fleche}>→</span> {props.arrivee}
            </span>
            <span>{t("trajet.aujourdhui")}</span>
          </div>
          <a href={urlPlanche("Main")} className={styles.filtre}>
            <span className={styles.filtreTitre}>
              <IconeFiltre taille={14} trait={2.4} couleur="var(--am-ambre)" />
              {t("filtre.titre")}
            </span>
            <IconeChevronHaut taille={12} trait={2.6} couleur="var(--am-ambre)" />
          </a>
          <div className={styles.panneau}>
            {props.etat === "chargement" && <PanneauEnChargement />}
            {props.etat === "erreur" && <PanneauEnErreur onReessayer={props.onReessayer} />}
            {props.etat === "pret" && props.options && (
              <PanneauPret {...props} options={props.options} />
            )}
          </div>
        </section>
      </EcranCorps>
    </div>
  );
}
