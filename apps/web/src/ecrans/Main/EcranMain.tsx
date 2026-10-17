import { voyageur } from "@afrimove/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMaintenant } from "@/coquille/horloge";
import { ChoixJour, ChoixVille } from "./feuilles";
import { TRAJET_PAR_DEFAUT, ajouterJours, jourCourt, type VilleChoisie } from "./formats";
import styles from "./main.module.css";
import { VueMain, type EtatMain, type OngletListe } from "./vue";

/** Les places se rafraîchissent aussi par la recherche (totaux, nouveaux départs) toutes les 30 secondes. */
const RAFRAICHISSEMENT_MS = 30_000;

/** Jour calendaire de Douala (UTC+1) d'un instant : sert tant que le serveur n'a pas dit quel jour on est. */
function jourDeDouala(instant: Date): string {
  return new Date(instant.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/**
 * Écran Main (AM-030, planche Main.dc.html) : l'accueil du voyageur, ses départs en direct, tout à 1 touche.
 *
 * Données : `useProfil` (salutation) et `useRechercheDeparts` (départs, covoiturages, totaux, position,
 * notification du colis). Les places de chaque ligne de bus suivent le plan de sièges en temps réel (voir
 * `ligne-bus.tsx`). Le trajet (départ, arrivée) et le jour sont l'état de l'écran ; le filtre est celui du serveur.
 */
export function EcranMain() {
  const { i18n, t } = useTranslation("Main");
  const horloge = useMaintenant();

  const [trajet, setTrajet] = useState(TRAJET_PAR_DEFAUT);
  const [jourChoisi, setJourChoisi] = useState<string | undefined>(undefined);
  const [onglet, setOnglet] = useState<OngletListe>("tout");
  const [feuille, setFeuille] = useState<"depart" | "arrivee" | "jour" | null>(null);
  const [aujourdhuiServeur, setAujourdhuiServeur] = useState<string | undefined>(undefined);

  const profil = voyageur.useProfil();
  const requete = voyageur.useRechercheDeparts(
    {
      depart: trajet.depart.code,
      arrivee: trajet.arrivee.code,
      ...(jourChoisi ? { jour: jourChoisi } : {}),
    },
    { refetchInterval: RAFRAICHISSEMENT_MS },
  );
  const recherche = requete.data;

  // Sans jour choisi, la recherche porte sur aujourd'hui : le serveur nous dit quel jour c'est.
  if (recherche && !jourChoisi && recherche.jour !== aujourdhuiServeur) {
    setAujourdhuiServeur(recherche.jour);
  }
  const aujourdhui = aujourdhuiServeur ?? jourDeDouala(horloge);
  const jour = jourChoisi ?? aujourdhui;

  let etat: EtatMain;
  if (recherche) {
    etat = recherche.departs.length + recherche.covoits.length === 0 ? "vide" : "pret";
  } else if (requete.isError) etat = "erreur";
  else etat = "chargement";

  const libelleJour =
    jour === aujourdhui
      ? t("jour.aujourdhui")
      : jour === ajouterJours(aujourdhui, 1)
        ? t("jour.demain")
        : jourCourt(jour, i18n.language);

  function choisirVille(cote: "depart" | "arrivee", ville: VilleChoisie) {
    setTrajet((actuel) => {
      const autre = cote === "depart" ? "arrivee" : "depart";
      // Choisir la ville de l'autre côté revient à inverser le sens : on n'affiche jamais « DLA ⇄ DLA ».
      if (ville.code === actuel[autre].code) {
        return { depart: actuel.arrivee, arrivee: actuel.depart };
      }
      return { ...actuel, [cote]: ville };
    });
    setFeuille(null);
  }

  return (
    <div className={styles.racine}>
      <VueMain
        etat={etat}
        prenom={profil.data?.prenom}
        profilEnChargement={profil.isPending}
        depart={trajet.depart}
        arrivee={trajet.arrivee}
        libelleJour={libelleJour}
        jourAujourdhui={jour === aujourdhui}
        recherche={recherche}
        onglet={onglet}
        onOnglet={setOnglet}
        onInverser={() =>
          setTrajet(({ depart, arrivee }) => ({ depart: arrivee, arrivee: depart }))
        }
        onChangerVille={setFeuille}
        onChangerJour={() => setFeuille("jour")}
        onReessayer={() => void requete.refetch()}
      />
      <ChoixVille
        ouverte={feuille === "depart" || feuille === "arrivee"}
        onFermer={() => setFeuille(null)}
        cote={feuille === "arrivee" ? "arrivee" : "depart"}
        actuelle={feuille === "arrivee" ? trajet.arrivee : trajet.depart}
        onChoisir={(ville) => choisirVille(feuille === "arrivee" ? "arrivee" : "depart", ville)}
      />
      <ChoixJour
        ouverte={feuille === "jour"}
        onFermer={() => setFeuille(null)}
        jour={jour}
        aujourdhui={aujourdhui}
        langue={i18n.language}
        onChoisir={(j) => {
          setJourChoisi(j === aujourdhui ? undefined : j);
          setFeuille(null);
        }}
      />
    </div>
  );
}

export default EcranMain;
