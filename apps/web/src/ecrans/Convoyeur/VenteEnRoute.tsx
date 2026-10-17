import { agence } from "@afrimove/api-client";
import { useConception } from "@afrimove/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMaintenant } from "@/coquille/horloge";
import {
  AGENCE_CONVOYEUR,
  GARE_CONVOYEUR,
  memoriserEtat,
  nouveauCodeBillet,
  useGps,
} from "./appareil";
import { dateAammjj, lireVoyageur, montant } from "./formats";
import styles from "./convoyeur.module.css";

export type EtatConvoyeur = NonNullable<ReturnType<typeof agence.useConvoyeurEtat>["data"]>;

type Mode = "cash" | "momo";
type Retour = { type: "ok"; numeros: string[] } | { type: "erreur" } | null;

/**
 * La carte « Vente en route · touche 1 » : stepper de places, voyageur facultatif, CASH et MOMO.
 *
 * Chaque tap crée sur l'appareil un événement `route.billet_vendu` par place (UUID, heure, numéro de la plage
 * convoyeur 3xxx, position GPS) et rend la main tout de suite : hors ligne l'envoi attend le réseau (AM-160), la vente
 * suivante n'attend pas la précédente.
 */
export function VenteEnRoute({ etat }: { etat: EtatConvoyeur }) {
  const { t } = useTranslation("Convoyeur");
  const conception = useConception();
  const maintenant = useMaintenant();
  const appareil = agence.useAppareilAgence();
  const vendre = agence.useVendreEnRoute();
  const position = useGps();

  const { vente, compteurs } = etat;
  const [places, setPlaces] = useState(vente.places);
  const [saisie, setSaisie] = useState(
    vente.saisie.nom === "" && vente.saisie.telephone === null
      ? ""
      : [vente.saisie.nom, vente.saisie.telephone]
          .filter((x) => x !== null && x !== "")
          .join(" · "),
  );
  const [retour, setRetour] = useState<Retour>(null);

  // Ventes lancées dont le serveur n'a pas encore répondu (hors ligne) : leurs places et leurs sièges sont pris.
  const enAttente = useRef(0);
  const siegeSuivant = useRef(0);
  const verrou = useRef(false);

  const libres = Math.max(0, compteurs.sieges.libres - enAttente.current);
  const maxPlaces = Math.max(1, libres);
  const premierSiege = Math.max(vente.siege, siegeSuivant.current);
  const dernierSiege = premierSiege + places - 1;
  const total = vente.prix * places;

  const plage = `${AGENCE_CONVOYEUR}-${GARE_CONVOYEUR}-${dateAammjj(maintenant)}-${String(appareil.plage.debut).charAt(0)}xxx`;

  async function encaisser(mode: Mode) {
    if (verrou.current) return;
    verrou.current = true;
    try {
      setRetour(null);
      if (places > libres) {
        setRetour({ type: "erreur" });
        return;
      }
      const gps = await position();
      const passager = lireVoyageur(saisie);
      const nombre = places;
      const depart = premierSiege;
      enAttente.current += nombre;
      siegeSuivant.current = depart + nombre;
      // Les événements sont créés ici, dans l'ordre : un numéro de la plage par billet, sans trou.
      const envois = Array.from({ length: nombre }, (_, i) =>
        vendre.mutateAsync({
          billetId: appareil.nouvelId(),
          departId: etat.departId,
          arretMontee: vente.arretMontee,
          arretDescente: vente.destination,
          siege: depart + i,
          prix: vente.prix,
          passager,
          paiement: { mode, recu: vente.prix, rendu: 0, reference: null },
          codeBillet: nouveauCodeBillet(),
          gps,
        }),
      );
      memoriserEtat(etat.convoyeur.id, appareil.exporterEtat());
      setPlaces(1);
      setSaisie("");
      void Promise.allSettled(envois).then((resultats) => {
        enAttente.current -= nombre;
        const numeros = resultats.flatMap((r) =>
          r.status === "fulfilled" ? [r.value.billet.numero] : [],
        );
        if (numeros.length === nombre) {
          setRetour({ type: "ok", numeros });
          return;
        }
        // Une place refusée : le serveur reste la référence pour le prochain siège.
        if (enAttente.current === 0) siegeSuivant.current = 0;
        setRetour({ type: "erreur" });
      });
    } finally {
      verrou.current = false;
    }
  }

  return (
    <section className={styles.carte} aria-label={t("vente.titre")} data-vente>
      <div className={styles.carteTete}>
        <span>{conception ? t("vente.titreTouche", { n: 1 }) : t("vente.titre")}</span>
        <span className={styles.carteTrajet}>
          {t("vente.trajet", { montee: vente.arretMontee, destination: vente.destination })}
        </span>
      </div>

      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.rond}
          aria-label={t("vente.moins")}
          onClick={() => setPlaces((n) => Math.max(1, n - 1))}
        >
          −
        </button>
        <span className={styles.centre}>
          <output className={styles.nombre} aria-live="polite">
            {places} <span className={styles.unite}>{t("vente.place", { count: places })}</span>
          </output>
          <span className={styles.legende}>
            {t("vente.siege", { count: places, siege: premierSiege, dernier: dernierSiege })}
          </span>
        </span>
        <button
          type="button"
          className={styles.rond}
          aria-label={t("vente.plus")}
          onClick={() => setPlaces((n) => Math.min(maxPlaces, n + 1))}
        >
          +
        </button>
      </div>

      <label htmlFor="voyageur" className={styles.champ}>
        <span className={styles.champLibelle}>{t("vente.voyageur")}</span>
        <input
          id="voyageur"
          type="text"
          className={styles.saisie}
          value={saisie}
          autoComplete="off"
          onChange={(e) => setSaisie(e.target.value)}
        />
      </label>

      <div className={styles.paiements}>
        <button
          type="button"
          className={`${styles.paiement} ${styles.cash}`}
          onClick={() => void encaisser("cash")}
        >
          <span className={styles.paiementTitre}>
            {t("vente.cash", { montant: montant(total) })}
          </span>
          <span className={styles.paiementDetail}>
            {conception ? t("vente.cashDetailTouche", { n: 2 }) : t("vente.cashDetail")}
          </span>
        </button>
        <button
          type="button"
          className={`${styles.paiement} ${styles.momo}`}
          onClick={() => void encaisser("momo")}
        >
          <span className={styles.paiementTitre}>{t("vente.momo")}</span>
          <span className={styles.paiementDetail}>{t("vente.momoDetail")}</span>
        </button>
      </div>

      <span className={styles.note}>{t("vente.note", { plage })}</span>

      {retour?.type === "ok" && (
        <p role="status" className={styles.retour} data-ton="ok">
          {t("vente.confirmation", {
            count: retour.numeros.length,
            numeros: retour.numeros.join(", "),
          })}
        </p>
      )}
      {retour?.type === "erreur" && (
        <p role="alert" className={styles.retour} data-ton="erreur">
          {t("vente.erreur")}
        </p>
      )}
    </section>
  );
}
