import { Bouton, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import {
  DEPART_VOYAGEUR_EN_ATTENTE_DU_CONTRAT,
  heureDouala,
  jourSemaine,
  montant,
  montantSigne,
  tonMontant,
  tonTroncon,
} from "./formats";
import { FlecheTroncons } from "./icones";
import styles from "./inter-agences.module.css";
import type { EtatBloc, VueInterAgences } from "./types";

export interface PropsInterAgencesVue {
  etat: EtatBloc;
  /** « Entre compagnies », présent quand `etat` vaut `pret`. */
  vue?: VueInterAgences | undefined;
  onReessayer?: () => void;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

/** Le colis qui change de bus : titre et poids, un rond ambre entre les tronçons, la règle de responsabilité. */
function CarteColis({ vue }: { vue: VueInterAgences }) {
  const { t } = useTranslation("InterAgences");
  const colis = vue.colisEnCorrespondance;
  const titre = t("colis.titre", {
    origine: colis.origine,
    destination: colis.destination,
    numero: colis.numero,
  });
  const nb = colis.troncons.length;
  return (
    <section className={styles.carteColis} aria-label={titre}>
      <div className={styles.colisTete}>
        <h2 className={styles.colisTitre}>{titre}</h2>
        <span className={styles.poids}>{t("colis.poids", { kg: colis.poidsKg })}</span>
      </div>
      {nb === 0 ? (
        <p className={styles.aucun}>{t("colis.aucun")}</p>
      ) : (
        <div className={styles.zoneTroncons}>
          <ol className={styles.troncons}>
            {colis.troncons.map((troncon) => (
              <li key={troncon.rang} className={styles.troncon}>
                <span className={styles.tronconEtiquette} data-ton={tonTroncon(troncon.rang)}>
                  {t("colis.troncon", { rang: troncon.rang, compagnie: troncon.compagnie })}
                </span>
                <span className={styles.tronconTrajet}>
                  {t("colis.trajet", {
                    origine: troncon.origine,
                    destination: troncon.destination,
                  })}
                </span>
                <span className={styles.tronconHoraire}>
                  {t("colis.horaire", {
                    depart: troncon.heureDepart,
                    bus: troncon.bus,
                    arrivee: troncon.heureArrivee,
                  })}
                </span>
                <span className={styles.tronconPart}>
                  {t("colis.part", {
                    montant: montant(troncon.part),
                    compagnie: troncon.compagnie,
                  })}
                </span>
              </li>
            ))}
          </ol>
          {/* Un rond ambre à chaque passage de témoin : au milieu pour deux tronçons, comme la planche. */}
          {colis.troncons.slice(1).map((troncon, i) => (
            <span
              key={troncon.rang}
              className={styles.passage}
              style={{ left: `${((i + 1) / nb) * 100}%` }}
              aria-hidden="true"
              data-passage=""
            >
              <FlecheTroncons />
            </span>
          ))}
        </div>
      )}
      <p className={styles.regle}>{colis.regle}</p>
    </section>
  );
}

/** Règlement de la semaine : ce qu'on nous doit, ce que nous devons, le solde net réglé le lundi par MoMo. */
function CarteReglement({ vue }: { vue: VueInterAgences }) {
  const { t } = useTranslation("InterAgences");
  const r = vue.reglement;
  const jour = t(`jours.${jourSemaine(r.reglementA)}`);
  return (
    <section className={styles.reglement} aria-label={t("reglement.titre")}>
      <div className={styles.reglementTete}>
        <h2 className={styles.reglementTitre}>{t("reglement.titre")}</h2>
        <span className={styles.reglementJour}>{jour}</span>
      </div>
      <ul className={styles.lignes}>
        <li className={styles.ligne}>
          <span>
            {t("reglement.nousDoit", {
              compagnie: r.autreCompagnie,
              count: r.nbColisTransportesPourEux,
            })}
          </span>
          <span className={styles.somme} data-ton="vert">
            {montantSigne(r.nousDoit)}
          </span>
        </li>
        <li className={styles.ligne}>
          <span>
            {t("reglement.nousLeDevons", {
              compagnie: r.autreCompagnie,
              count: r.nbColisEnCorrespondance,
            })}
          </span>
          <span className={styles.somme} data-ton="rouge">
            {montantSigne(-r.nousLeDevons)}
          </span>
        </li>
        <li className={styles.ligne} data-net="">
          <span className={styles.libelleNet}>
            {t("reglement.solde", { jour, heure: heureDouala(r.reglementA) })}
          </span>
          <span className={styles.somme} data-ton={tonMontant(r.soldeNet)} data-net="">
            {montantSigne(r.soldeNet)}
          </span>
        </li>
      </ul>
    </section>
  );
}

/** Le billet unique Alpha + Oméga, avec la correspondance garantie. Il se compose des deux tronçons du colis. */
function CarteVoyageurs({ vue }: { vue: VueInterAgences }) {
  const { t } = useTranslation("InterAgences");
  const { troncons } = vue.colisEnCorrespondance;
  const premier = troncons[0];
  const dernier = troncons.at(-1);
  if (!premier || !dernier || troncons.length < 2) return null;
  const voyageurs = vue.correspondanceVoyageurs;
  return (
    <section className={styles.voyageurs} aria-label={t("voyageurs.titre")}>
      <h2 className={styles.voyageursTitre}>{t("voyageurs.titre")}</h2>
      <p className={styles.voyageursTexte}>
        {t("voyageurs.texte", {
          depart: DEPART_VOYAGEUR_EN_ATTENTE_DU_CONTRAT,
          arrivee: dernier.destination,
          premiere: premier.compagnie,
          correspondance: premier.destination,
          seconde: dernier.compagnie,
          garantie: voyageurs.minutesGaranties,
          attente: voyageurs.attenteDuSecondBusMinutes,
        })}
      </p>
    </section>
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
  const { t } = useTranslation("InterAgences");
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
 * « Entre compagnies » : un colis en deux tronçons (compagnie, départ, bus, part de chacun), la règle du scan de
 * transfert, le règlement de la semaine, le billet voyageur en correspondance, puis « Convention … · voir » et
 * « Ajouter une compagnie » en bas.
 *
 * Les deux liens du pied ne dépendent pas des données (sauf le nom de la compagnie de la convention) : « Ajouter une
 * compagnie » reste utilisable pendant le chargement et en cas d'erreur.
 */
export function InterAgencesVue({ etat, vue, onReessayer }: PropsInterAgencesVue) {
  const { t } = useTranslation("InterAgences");
  const donnees = etat === "pret" ? vue : undefined;
  const chargement = etat === "chargement";
  const conventions = donnees?.conventions ?? [];

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Patron") }}
      />

      <EcranCorps
        className={styles.corps}
        data-planche="InterAgences"
        data-etat={etat}
        aria-busy={chargement}
        {...(chargement ? { "aria-label": t("chargement.libelle") } : {})}
      >
        {etat === "erreur" && (
          <Bandeau role="alert" texte={t("erreur.texte")} onReessayer={onReessayer} />
        )}
        {etat === "vide" && <Bandeau role="status" texte={t("vide.texte")} />}

        {chargement && (
          <div className={styles.squelettes} aria-hidden="true">
            <Squelette className={styles.squeletteColis} />
            <Squelette className={styles.squeletteReglement} />
            <Squelette className={styles.squeletteVoyageurs} />
          </div>
        )}

        {donnees && (
          <>
            <CarteColis vue={donnees} />
            <CarteReglement vue={donnees} />
            <CarteVoyageurs vue={donnees} />
          </>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied} data-seul={conventions.length === 1 ? undefined : ""}>
        {conventions.map((convention) => (
          <Bouton
            key={convention.id}
            variante="secondaire"
            libelle={t("actions.convention", { avec: convention.avec })}
            href={urlPlanche("InterAgencesConvention", { conventionId: convention.id })}
            className={styles.convention}
          />
        ))}
        <a className={styles.ajouter} href={urlPlanche("Reseau")}>
          {t("actions.ajouter")}
        </a>
      </EcranPied>
    </>
  );
}
