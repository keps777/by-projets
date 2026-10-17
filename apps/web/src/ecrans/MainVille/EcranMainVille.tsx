import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoixVille } from "./feuilles";
import {
  inverser,
  lireDepart,
  texteDepart,
  typesDuFiltre,
  type FiltreType,
  type Trajet,
} from "./formats";
import styles from "./mainville.module.css";
import {
  VILLE_PAR_DEFAUT,
  derniereVille,
  fournisseurPosition,
  memoriserVille,
  villeProche,
} from "./position";
import { VueMainVille, type EtatMainVille, type MessageMatin } from "./vue";

/** D'où vient la ville affichée : de la position, de la mémoire, d'un choix du voyageur ou du repli. */
type SourceVille = "position" | "memorisee" | "choisie" | "defaut";

interface VilleAffichee {
  nom: string;
  source: SourceVille;
}

/** Ce que le voyageur a modifié du trajet, pour une ville donnée. */
interface Edition {
  ville: string;
  /** Trajet saisi par le voyageur ; absent tant qu'il n'a rien modifié (le serveur propose alors le sien). */
  trajet: Trajet | null;
  /** Texte en cours de saisie dans chaque champ (absent : le champ montre le trajet courant). */
  saisie: { depart?: string; arrivee?: string };
}

function editionVide(ville: string): Edition {
  return { ville, trajet: null, saisie: {} };
}

function villeDeDepart(): VilleAffichee {
  const memorisee = derniereVille();
  return memorisee
    ? { nom: memorisee, source: "memorisee" }
    : { nom: VILLE_PAR_DEFAUT, source: "defaut" };
}

/**
 * Écran MainVille (AM-032, planche MainVille.dc.html) : l'accueil du voyageur quand « Dans la même ville » est choisi.
 *
 * Données : `useProfil` (salutation) et `useRechercheVille` (ville, itinéraire, offres de covoiturage, moto-taxi et
 * bus de ville). La ville vient de la position ; si la permission est refusée (ou hors des villes desservies), on
 * garde la dernière ville mémorisée. « Chaque matin 07:00 » enregistre le trajet régulier du matin
 * (`useDefinirTrajetRegulier`), que l'app propose ensuite à 06:40 les jours ouvrés.
 */
export function EcranMainVille() {
  const { t } = useTranslation("MainVille");

  const [ville, setVille] = useState<VilleAffichee>(villeDeDepart);
  const [feuilleVille, setFeuilleVille] = useState(false);
  const [brouillon, setBrouillon] = useState<Edition>(editionVide(ville.nom));
  // Le trajet est propre à une ville : changer de ville repart du trajet que le serveur propose.
  const { trajet, saisie } = brouillon.ville === ville.nom ? brouillon : editionVide(ville.nom);
  const modifier = (changement: Partial<Pick<Edition, "trajet" | "saisie">>) =>
    setBrouillon({ ville: ville.nom, trajet, saisie, ...changement });
  const [quand, setQuand] = useState<c.Quand>("maintenant");
  const [filtre, setFiltre] = useState<FiltreType>("tout");
  /** Dernier résultat reçu : il reste affiché pendant qu'une nouvelle recherche (filtre, moment) charge. */
  const [conservee, setConservee] = useState<c.ResultatRechercheVille | undefined>(undefined);

  const profil = voyageur.useProfil();
  const types = typesDuFiltre(filtre);
  const requete = voyageur.useRechercheVille({
    ville: ville.nom,
    ...(trajet ? { depart: trajet.depart, arrivee: trajet.arrivee } : {}),
    quand,
    ...(types ? { types } : {}),
  });
  const definirMatin = voyageur.useDefinirTrajetRegulier();

  if (requete.data && requete.data !== conservee) setConservee(requete.data);
  const recherche = requete.data ?? (conservee?.ville.nom === ville.nom ? conservee : undefined);

  // La ville vient de la position, relevée une fois à l'ouverture. Un choix du voyageur a toujours le dernier mot.
  useEffect(() => {
    let annule = false;
    void fournisseurPosition()
      .position()
      .then((position) => {
        const detectee = position ? villeProche(position) : null;
        if (annule || !detectee) return;
        memoriserVille(detectee);
        setVille((actuelle) =>
          actuelle.source === "choisie" ? actuelle : { nom: detectee, source: "position" },
        );
      });
    return () => {
      annule = true;
    };
  }, []);

  let etat: EtatMainVille;
  if (recherche) etat = recherche.offres.length === 0 ? "vide" : "pret";
  else if (requete.isError) etat = "erreur";
  else etat = "chargement";

  const maPosition = t("champs.maPosition");
  const itineraire = recherche?.itineraire;
  /** Le trajet affiché : celui du voyageur, sinon celui que le serveur propose. */
  const courant: Trajet | null =
    trajet ??
    (itineraire
      ? {
          depart: itineraire.depart,
          arrivee: itineraire.arrivee,
          departSurMaPosition: itineraire.departSurMaPosition,
        }
      : null);

  function valider(cote: "depart" | "arrivee") {
    const texte = saisie[cote];
    if (texte === undefined) return;
    const { [cote]: _, ...reste } = saisie;
    if (!courant) {
      modifier({ saisie: reste });
      return;
    }
    const suivant: Trajet =
      cote === "depart"
        ? { ...courant, ...lireDepart(texte, maPosition) }
        : { ...courant, arrivee: texte.trim() };
    // Un champ vidé ne lance pas de recherche : on garde le lieu précédent.
    const change =
      suivant.depart !== "" &&
      suivant.arrivee !== "" &&
      (suivant.depart !== courant.depart ||
        suivant.arrivee !== courant.arrivee ||
        suivant.departSurMaPosition !== courant.departSurMaPosition);
    modifier({ saisie: reste, ...(change ? { trajet: suivant } : {}) });
  }

  function choisirVille(nom: string) {
    memoriserVille(nom);
    setVille({ nom, source: "choisie" });
    setFeuilleVille(false);
  }

  function choisirQuand(suivant: c.Quand) {
    if (suivant === quand) return;
    const precedent = quand;
    setQuand(suivant);
    if (suivant === "chaque_matin") {
      definirMatin.mutate({ actif: true }, { onError: () => setQuand(precedent) });
    } else {
      definirMatin.reset();
    }
  }

  let messageMatin: MessageMatin = { etat: "aucun" };
  if (quand === "chaque_matin" && definirMatin.isSuccess) {
    messageMatin = { etat: "enregistre", texte: definirMatin.data.explication };
  } else if (definirMatin.isError) {
    messageMatin = { etat: "erreur" };
  }

  const villeDetectee =
    (ville.source === "position" || ville.source === "defaut") &&
    (recherche?.ville.detectee ?? false);

  return (
    <div className={styles.racine}>
      <VueMainVille
        etat={etat}
        prenom={profil.data?.prenom}
        profilEnChargement={profil.isPending}
        recherche={recherche}
        ville={ville.nom}
        villeDetectee={villeDetectee}
        texteDepart={saisie.depart ?? (courant ? texteDepart(courant, maPosition) : "")}
        texteArrivee={saisie.arrivee ?? courant?.arrivee ?? ""}
        onSaisie={(cote, texte) => modifier({ saisie: { ...saisie, [cote]: texte } })}
        onValider={valider}
        onInverser={() => {
          if (!courant) return;
          modifier({ trajet: inverser(courant), saisie: {} });
        }}
        quand={quand}
        onQuand={choisirQuand}
        messageMatin={messageMatin}
        filtre={filtre}
        onFiltre={setFiltre}
        onChangerVille={() => setFeuilleVille(true)}
        onReessayer={() => void requete.refetch()}
      />
      <ChoixVille
        ouverte={feuilleVille}
        onFermer={() => setFeuilleVille(false)}
        actuelle={ville.nom}
        onChoisir={choisirVille}
      />
    </div>
  );
}

export default EcranMainVille;
