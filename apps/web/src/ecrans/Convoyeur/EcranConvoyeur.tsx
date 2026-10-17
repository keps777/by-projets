import { ErreurHttp, agence } from "@afrimove/api-client";
import { Bouton, EcranCorps, EcranPied, Entete, Pastille } from "@afrimove/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { FournisseurConvoyeur } from "./appareil";
import { heureDouala, montant } from "./formats";
import { IconeColisADecharger, IconeIncident, IconeScanner } from "./icones";
import { VenteEnRoute, type EtatConvoyeur } from "./VenteEnRoute";
import styles from "./convoyeur.module.css";

type Affichage = "chargement" | "erreur" | "vide" | "pret";

function enLigne(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Vrai tant que le navigateur se dit connecté : la pastille passe en HORS LIGNE dès qu'il ne l'est plus. */
function useEnLigne(): boolean {
  const [connecte, setConnecte] = useState(enLigne);
  useEffect(() => {
    const maj = () => setConnecte(enLigne());
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    maj();
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);
  return connecte;
}

function Squelette({ className }: { className: string | undefined }) {
  return <span className={`${styles.squelette} ${className} am-pulse`} aria-hidden="true" />;
}

function Tuile({
  etiquette,
  valeur,
  detail,
  ton,
  chargement,
}: {
  etiquette: string;
  valeur?: string;
  detail?: string;
  ton?: "vert";
  chargement: boolean;
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
          <span className={styles.tuileValeur} data-ton={ton}>
            {valeur}
          </span>
          <span className={styles.tuileDetail}>{detail}</span>
        </>
      )}
    </div>
  );
}

/**
 * Planche « Convoyeur » (touche 1 à 2) : l'état du bus et la vente en route, sans réseau.
 *
 * L'état vient de `useConvoyeurEtat` seulement ; les ventes passent par `useVendreEnRoute`. Les liens (quai, chauffeur,
 * contrôle) ne dépendent pas des données : ils restent utilisables en chargement, en erreur et sans départ.
 */
export function EcranConvoyeur() {
  const requete = agence.useConvoyeurEtat({}, { networkMode: "always", refetchOnMount: "always" });
  const etat = requete.data;
  let affichage: Affichage;
  if (etat) affichage = "pret";
  else if (requete.isError) {
    affichage =
      requete.error instanceof ErreurHttp && requete.error.statut === 404 ? "vide" : "erreur";
  } else affichage = "chargement";

  return <Vue affichage={affichage} etat={etat} onReessayer={() => void requete.refetch()} />;
}

export function Vue({
  affichage,
  etat,
  onReessayer,
}: {
  affichage: Affichage;
  etat: EtatConvoyeur | undefined;
  onReessayer?: () => void;
}) {
  const { t } = useTranslation("Convoyeur");
  const { t: tCommun } = useTranslation();
  const enLigne = useEnLigne();
  const pret = affichage === "pret" ? etat : undefined;
  const chargement = affichage === "chargement";
  const horsLigne = !enLigne || pret?.reseau === "hors_ligne";
  const arret = pret?.vente.arretMontee;

  const titre = pret ? t("titre", { nom: pret.convoyeur.nom }) : tCommun("ecrans.Convoyeur.titre");
  const sousTitre = pret
    ? t("sousTitre", {
        bus: pret.bus.immatriculation,
        origine: pret.trajet.origine,
        destination: pret.trajet.destination,
        heure: heureDouala(pret.trajet.partiA),
      })
    : undefined;

  return (
    <>
      <Entete
        titre={titre}
        {...(sousTitre !== undefined ? { sousTitre } : {})}
        retour={{ libelle: t("retour"), href: urlPlanche("Quai") }}
        droite={
          chargement ? (
            <Squelette className={styles.squelettePastille} />
          ) : (
            <Pastille
              statut={horsLigne ? "horsLigne" : "sync"}
              libelle={t(horsLigne ? "reseau.horsLigne" : "reseau.sync")}
            />
          )
        }
      />

      <EcranCorps
        className={styles.corps}
        data-planche="Convoyeur"
        data-etat={affichage}
        aria-busy={chargement}
      >
        <div className={styles.tuiles}>
          <Tuile
            etiquette={t("tuiles.aBord")}
            chargement={chargement}
            {...(pret
              ? {
                  valeur: String(pret.compteurs.scannesABord),
                  detail: t("tuiles.aBordDetail"),
                }
              : {})}
          />
          <Tuile
            etiquette={t("tuiles.libres")}
            ton="vert"
            chargement={chargement}
            {...(pret
              ? {
                  valeur: String(pret.compteurs.sieges.libres),
                  detail: t("tuiles.libresDetail", {
                    n: pret.compteurs.sieges.reservees,
                    arret: pret.compteurs.sieges.arretReservees ?? "",
                  }).trim(),
                }
              : {})}
          />
          <Tuile
            etiquette={t("tuiles.enRoute")}
            chargement={chargement}
            {...(pret
              ? {
                  valeur: String(pret.compteurs.ventesEnRoute.nombre),
                  detail: t("tuiles.enRouteDetail", {
                    montant: montant(pret.compteurs.ventesEnRoute.montant),
                  }),
                }
              : {})}
          />
        </div>

        {pret ? (
          <FournisseurConvoyeur convoyeurId={pret.convoyeur.id}>
            <VenteEnRoute etat={pret} />
          </FournisseurConvoyeur>
        ) : chargement ? (
          <div className={styles.carteSquelette} role="status" aria-label={t("etats.chargement")}>
            <Squelette className={styles.squeletteBloc} />
          </div>
        ) : (
          <div className={styles.etat}>
            <div className={styles.bandeau} role={affichage === "erreur" ? "alert" : "status"}>
              <span className={styles.point} />
              <p>{t(affichage === "erreur" ? "etats.erreur" : "etats.vide")}</p>
            </div>
            {affichage === "erreur" && onReessayer && (
              <Bouton variante="secondaire" libelle={t("etats.reessayer")} onClick={onReessayer} />
            )}
          </div>
        )}

        <div className={styles.actions}>
          <a className={styles.action} href={urlPlanche("Quai")}>
            <IconeScanner />
            {arret ? t("actions.scanner", { arret }) : t("actions.scannerSansArret")}
          </a>
          <button type="button" className={styles.action}>
            <IconeColisADecharger />
            {pret ? t("actions.colis", { n: pret.colisADecharger }) : t("actions.colisSansNombre")}
          </button>
          <a className={styles.action} href={urlPlanche("Chauffeur")}>
            <IconeIncident />
            {t("actions.incident")}
          </a>
        </div>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <span>
          {pret ? t("pied.liste", { n: pret.listeNominative.aBord }) : t("pied.listeSansNombre")}
        </span>
        <a className={styles.montrer} href={urlPlanche("Controleur")}>
          {t("pied.montrer")}
        </a>
      </EcranPied>
    </>
  );
}

export default EcranConvoyeur;
