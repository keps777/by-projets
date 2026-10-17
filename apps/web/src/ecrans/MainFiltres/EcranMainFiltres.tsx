import { voyageur } from "@afrimove/api-client";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useMaintenant } from "@/coquille/horloge";
import {
  FILTRE_VIDE,
  TRAJET_FILTRE,
  basculerAussi,
  basculerCompagnie,
  departsDesCompagnies,
  ecrireMemoire,
  filtreDepuisOptions,
  filtreInitial,
  lireMemoire,
  memeFiltre,
  restreintLesBus,
  toutesLesCompagnies,
  versFiltresDeparts,
  type Filtre,
} from "./filtres";
import { VueMainFiltres, type EtatMainFiltres } from "./vue";

const DEPART = TRAJET_FILTRE.depart.code;
const ARRIVEE = TRAJET_FILTRE.arrivee.code;

/** Heure de Douala (UTC+1) d'un instant, `07:38` : sert à la pastille DIRECT. */
function heureDeDouala(instant: Date): string {
  return new Date(instant.getTime() + 3_600_000).toISOString().slice(11, 16);
}

/**
 * Écran MainFiltres (AM-031, planche MainFiltres.dc.html) : le filtre déroulant de l'accueil, classe, compagnies
 * (une, plusieurs ou toutes, avec l'étoile « préférée ») et options « Aussi ».
 *
 * Données : `useOptionsFiltres` (classes, compagnies et leur nombre de départs, options), `useEnregistrerFiltres`
 * (le filtre est mémorisé pour le trajet), `useDefinirPreferee` (l'étoile) et `useProfil` (salutation). Le filtre
 * est aussi gardé sur l'appareil, par trajet (`filtres.ts`) : au retour, c'est lui qui s'affiche.
 *
 * Le nombre du bouton « Voir les N départs » se recalcule à chaque changement : somme des départs des compagnies
 * cochées, ou, quand la classe ou une option restreint les bus, résultat de la recherche du serveur.
 */
export function EcranMainFiltres() {
  const horloge = useMaintenant();

  const profil = voyageur.useProfil();
  const requete = voyageur.useOptionsFiltres({ depart: DEPART, arrivee: ARRIVEE });
  const options = requete.data;
  const enregistrer = voyageur.useEnregistrerFiltres();
  const definir = voyageur.useDefinirPreferee();

  const [filtre, setFiltre] = useState<Filtre | undefined>(undefined);
  /** Le filtre de l'appareil diffère de celui du serveur : on le renvoie au serveur une fois. */
  const [aRenvoyer, setARenvoyer] = useState(false);
  /** Étoiles changées et pas encore relues dans les options : l'étoile suit le toucher sans attendre. */
  const [preferees, setPreferees] = useState<Readonly<Record<string, boolean>>>({});
  const [echecPreferee, setEchecPreferee] = useState(false);

  // Premier affichage des options : le filtre de l'appareil, sinon celui du serveur.
  if (options && !filtre) {
    const initial = filtreInitial(options, lireMemoire(DEPART, ARRIVEE));
    setFiltre(initial.filtre);
    setARenvoyer(initial.deLAppareil && !memeFiltre(initial.filtre, filtreDepuisOptions(options)));
  }

  useEffect(() => {
    if (!aRenvoyer || !options || !filtre) return;
    setARenvoyer(false);
    enregistrer.mutate({
      depart: DEPART,
      arrivee: ARRIVEE,
      filtres: versFiltresDeparts(filtre, options.compagnies),
    });
    // `enregistrer` change à chaque rendu : seul le besoin de renvoyer compte.
  }, [aRenvoyer]);

  const compagnies = options?.compagnies ?? [];
  const courant = filtre ?? FILTRE_VIDE;
  const restreint = restreintLesBus(courant);
  const recherche = voyageur.useRechercheDeparts(
    { depart: DEPART, arrivee: ARRIVEE, filtres: versFiltresDeparts(courant, compagnies) },
    { enabled: Boolean(options && filtre) && restreint, placeholderData: keepPreviousData },
  );

  let nombre: number | undefined;
  if (options && filtre) {
    nombre = restreint
      ? recherche.data?.departs.length
      : departsDesCompagnies(options.compagnies, filtre);
  }

  let etat: EtatMainFiltres;
  if (options && filtre) etat = "pret";
  else if (requete.isError) etat = "erreur";
  else etat = "chargement";

  /** Applique un changement : affiché, gardé sur l'appareil et enregistré pour le trajet. */
  function modifier(suivant: Filtre) {
    if (!options || suivant === filtre) return;
    setFiltre(suivant);
    ecrireMemoire(DEPART, ARRIVEE, suivant);
    enregistrer.mutate({
      depart: DEPART,
      arrivee: ARRIVEE,
      filtres: versFiltresDeparts(suivant, options.compagnies),
    });
  }

  function retirerChangement(id: string) {
    setPreferees(({ [id]: _, ...reste }) => reste);
  }

  return (
    <VueMainFiltres
      etat={etat}
      prenom={profil.data?.prenom}
      profilEnChargement={profil.isPending}
      heure={heureDeDouala(horloge)}
      depart={TRAJET_FILTRE.depart.nom}
      arrivee={TRAJET_FILTRE.arrivee.nom}
      options={options}
      filtre={courant}
      estPreferee={(compagnie) => preferees[compagnie.id] ?? compagnie.preferee}
      nombre={nombre}
      echecPreferee={echecPreferee}
      onClasse={(classe) => modifier({ ...courant, classe })}
      onToutes={() => modifier(toutesLesCompagnies(courant))}
      onCompagnie={(id) => modifier(basculerCompagnie(courant, compagnies, id))}
      onPreferee={(compagnie, preferee) => {
        setEchecPreferee(false);
        setPreferees((actuelles) => ({ ...actuelles, [compagnie.id]: preferee }));
        definir.mutate(
          { compagnieId: compagnie.id, preferee },
          {
            onSuccess: () => retirerChangement(compagnie.id),
            onError: () => {
              retirerChangement(compagnie.id);
              setEchecPreferee(true);
            },
          },
        );
      }}
      onAussi={(code) => modifier(basculerAussi(courant, code))}
      onEffacer={() => modifier(FILTRE_VIDE)}
      onReessayer={() => void requete.refetch()}
    />
  );
}

export default EcranMainFiltres;
