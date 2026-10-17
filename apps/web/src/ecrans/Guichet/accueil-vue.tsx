import type { agence } from "@afrimove/api-client";
import {
  Bouton,
  CarteAction,
  EcranCorps,
  IconeBillet,
  IconeBus,
  IconeColis,
  IconeEclair,
  Pastille,
} from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import type { EtatPastille } from "./etat-synchro";
import { ecartCaisse, heureDouala, montantCourt } from "./formats";
import { IconeCaisseAvecPoints, IconeScan, LogoAgence } from "./icones";
import styles from "./guichet.module.css";

/** Ce que `useGuichetAccueil` renvoie (@afrimove/contrats n'est pas une dépendance de l'application). */
export type GuichetAccueil = NonNullable<ReturnType<typeof agence.useGuichetAccueil>["data"]>;

export type EtatAccueil = "chargement" | "erreur" | "vide" | "pret";

export interface PropsAccueilVue {
  etat: EtatAccueil;
  /** Les données de l'API ; présentes quand `etat` vaut `pret`. */
  accueil?: GuichetAccueil | undefined;
  pastille: EtatPastille;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** Variante locale de `TuileKpi` (kit) : la planche a une valeur de 26 px, une sous-ligne de 11 px et un rayon de 14 px. */
function TuileCompteur({
  etiquette,
  valeur,
  detail,
  tonDetail,
  petite = false,
  chargement = false,
}: {
  etiquette: string;
  valeur?: string;
  detail?: string;
  tonDetail?: "vert" | "ambre";
  petite?: boolean;
  chargement?: boolean;
}) {
  return (
    <div className={styles.tuile}>
      <span className={styles.tuileEtiquette}>{etiquette}</span>
      {chargement ? (
        <>
          <Squelette className={styles.squeletteChiffre} />
          <Squelette className={styles.squeletteLigne} />
        </>
      ) : (
        <>
          <span
            className={
              petite ? `${styles.tuileValeur} ${styles.tuileValeurPetite}` : styles.tuileValeur
            }
          >
            {valeur}
          </span>
          <span className={styles.tuileDetail} data-ton={tonDetail}>
            {detail}
          </span>
        </>
      )}
    </div>
  );
}

function Compteurs({ etat, accueil }: { etat: EtatAccueil; accueil: GuichetAccueil | undefined }) {
  const { t } = useTranslation("Guichet");
  const c = etat === "pret" ? accueil?.compteurs : undefined;
  const chargement = etat === "chargement";
  return (
    <div className={styles.compteurs}>
      <TuileCompteur
        etiquette={t("compteurs.billets")}
        chargement={chargement}
        {...(c ? { valeur: String(c.billets), detail: t("compteurs.billetsDetail") } : {})}
      />
      <TuileCompteur
        etiquette={t("compteurs.colis")}
        chargement={chargement}
        {...(c
          ? { valeur: String(c.colis), detail: t("compteurs.colisDetail", { n: c.colisACharger }) }
          : {})}
      />
      <TuileCompteur
        etiquette={t("compteurs.caisse")}
        petite
        chargement={chargement}
        {...(c
          ? {
              valeur: montantCourt(c.enCaisse),
              detail: t("compteurs.caisseDetail", { valeur: ecartCaisse(c.ecart) }),
              tonDetail: c.ecart === 0 ? ("vert" as const) : ("ambre" as const),
            }
          : {})}
      />
    </div>
  );
}

function Etat({ etat, onReessayer }: { etat: "vide" | "erreur"; onReessayer?: () => void }) {
  const { t } = useTranslation("Guichet");
  return (
    <div className={styles.etat}>
      <div className={styles.bandeau} role={etat === "erreur" ? "alert" : "status"}>
        <span className={styles.point} />
        <p>{t(etat === "erreur" ? "etats.erreur" : "etats.vide")}</p>
      </div>
      {etat === "erreur" && onReessayer && (
        <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
      )}
    </div>
  );
}

function ProchainDepart({ accueil }: { accueil: GuichetAccueil }) {
  const { t } = useTranslation("Guichet");
  const d = accueil.prochainDepart;
  const o = accueil.prochaineOuverture;
  const phrases = [
    t("prochain.depart", {
      minutes: d.dansMinutes,
      heure: heureDouala(d.heureDepart),
      destination: d.destination,
      count: d.placesLibres,
    }),
    o
      ? t("prochain.ouverture", { heure: heureDouala(o.heureDepart), destination: o.destination })
      : "",
  ];
  return (
    <div className={styles.bandeau}>
      <span className={styles.point} />
      <p>{phrases.filter(Boolean).join(" ")}</p>
    </div>
  );
}

/**
 * Accueil du guichet : en-tête agence + pastille de synchronisation, trois compteurs, les actions à une touche,
 * le prochain départ. La barre d'onglets est posée par le layout de l'espace guichet.
 *
 * Les actions (vendre, colis, dépôt, caisse, quai, cadence, superviseur) ne dépendent pas des données : elles restent
 * utilisables pendant le chargement et en cas d'erreur, seuls les compteurs et les mentions chiffrées manquent.
 */
export function AccueilVue({ etat, accueil, pastille, onReessayer }: PropsAccueilVue) {
  const { t } = useTranslation("Guichet");
  const donnees = etat === "pret" ? accueil : undefined;
  const quai = donnees?.quai;
  const file = donnees?.cadence.fileAttente;

  return (
    <>
      <header className={styles.entete}>
        {/* La planche n'a pas de titre de page : le titre de l'écran (clé commune de la coquille, attendue par ses tests
            de routes) est lu par les lecteurs d'écran, sans changer un pixel. */}
        <h1 className={styles.titreEcran}>{t("ecrans.Guichet.titre", { ns: "translation" })}</h1>
        <span className={styles.marque}>
          {etat === "chargement" ? (
            <Squelette className={styles.squeletteLogo} />
          ) : (
            <span className={styles.logo}>
              <LogoAgence />
            </span>
          )}
          <span className={styles.textes}>
            {donnees ? (
              <>
                <span className={styles.titre}>
                  {t("agence.titre", {
                    compagnie: donnees.agence.compagnie,
                    gare: donnees.agence.gare,
                  })}
                </span>
                <span className={styles.sousTitre}>
                  {t("agence.sousTitre", {
                    rang: donnees.guichet.rang,
                    agent: donnees.guichet.agent.nom,
                    heure: heureDouala(donnees.guichet.caisseOuverteA),
                  })}
                </span>
              </>
            ) : etat === "chargement" ? (
              <>
                <Squelette className={styles.squeletteLigne} />
                <Squelette className={styles.squeletteLigne} />
              </>
            ) : null}
          </span>
        </span>
        {etat === "chargement" ? (
          <Squelette className={styles.squelettePastille} />
        ) : (
          <Pastille
            statut={pastille === "sync" ? "sync" : "horsLigne"}
            libelle={t(pastille === "sync" ? "synchro.sync" : "synchro.horsLigne")}
          />
        )}
      </header>

      <EcranCorps data-planche="Guichet" data-etat={etat} aria-busy={etat === "chargement"}>
        <Compteurs etat={etat} accueil={donnees} />

        {(etat === "vide" || etat === "erreur") && (
          <Etat etat={etat} {...(onReessayer ? { onReessayer } : {})} />
        )}

        <CarteAction
          variante="principale"
          className={styles.vente}
          href={urlPlanche("Vente")}
          titre={t("actions.vendre.titre")}
          description={t("actions.vendre.detail")}
          icone={<IconeBillet taille={30} trait={2.2} />}
        />

        <div className={styles.actions}>
          <CarteAction
            className={styles.action}
            href={urlPlanche("GuichetColis")}
            titre={t("actions.colis.titre")}
            description={t("actions.colis.detail")}
            icone={<IconeColis taille={22} trait={2.2} />}
          />
          <CarteAction
            className={styles.action}
            href={urlPlanche("Depot")}
            ton="vert"
            titre={t("actions.depot.titre")}
            description={t("actions.depot.detail")}
            icone={<IconeScan />}
          />
          <CarteAction
            className={styles.action}
            href={urlPlanche("Quai")}
            ton="bleu"
            titre={t("actions.quai.titre")}
            {...(quai
              ? {
                  description: t("actions.quai.detail", {
                    heure: heureDouala(quai.heureDepart),
                    destination: quai.destination,
                    scannes: quai.scannes,
                    capacite: quai.capacite,
                  }),
                }
              : {})}
            icone={<IconeBus taille={22} trait={2.2} />}
          />
          <CarteAction
            className={styles.action}
            href={urlPlanche("Caisse")}
            ton="rouge"
            titre={t("actions.caisse.titre")}
            description={t("actions.caisse.detail")}
            icone={<IconeCaisseAvecPoints />}
          />
        </div>

        <div className={styles.rangee}>
          <Bouton
            variante="secondaire"
            ton="ambre"
            className={styles.cadence}
            href={urlPlanche("Cadence")}
            libelle={
              file === undefined ? t("actions.cadenceSansFile") : t("actions.cadence", { n: file })
            }
            icone={<IconeEclair taille={16} trait={2.4} />}
          />
          <Bouton
            variante="secondaire"
            className={styles.superviseur}
            href={urlPlanche("Superviseur")}
            libelle={t("actions.superviseur")}
          />
        </div>

        {donnees && <ProchainDepart accueil={donnees} />}
      </EcranCorps>
    </>
  );
}
