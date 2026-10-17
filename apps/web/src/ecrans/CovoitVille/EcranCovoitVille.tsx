import { voyageur } from "@afrimove/api-client";
import type { voyageur as c } from "@afrimove/contrats";
import { EcranCorps, IconeLieu, IconePersonne, Interrupteur, Selecteur } from "@afrimove/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useParametres } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { ChoixVille } from "@/ecrans/MainVille/feuilles";
import { lireDepart, texteDepart, type Trajet } from "@/ecrans/MainVille/formats";
import {
  VILLE_PAR_DEFAUT,
  derniereVille,
  fournisseurPosition,
  memoriserVille,
  villeProche,
} from "@/ecrans/MainVille/position";
import { CONDUCTRICES_DEMO } from "./demo";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  TYPES_PROPOSES,
  formaterMontant,
  initiales,
  mentionOffre,
  titreOffre,
  tonDuRang,
  type TextesOffre,
} from "./formats";
import { IconeBouclier, IconeVolant } from "./icones";
import styles from "./covoit-ville.module.css";

/** D'où vient la ville affichée : de la position, de la mémoire, d'un choix du voyageur ou du repli. */
type SourceVille = "position" | "memorisee" | "choisie" | "defaut";

interface VilleAffichee {
  nom: string;
  source: SourceVille;
}

function villeDeDepart(): VilleAffichee {
  const memorisee = derniereVille();
  return memorisee
    ? { nom: memorisee, source: "memorisee" }
    : { nom: VILLE_PAR_DEFAUT, source: "defaut" };
}

/** Ce que le voyageur a modifié du trajet : le trajet saisi et le texte en cours de saisie dans chaque champ. */
interface Edition {
  /** Absent tant que le voyageur n'a rien modifié : le serveur propose alors son trajet. */
  trajet: Trajet | null;
  saisie: { depart?: string; arrivee?: string };
}

const EDITION_VIDE: Edition = { trajet: null, saisie: {} };

/** Ligne d'une offre : pastille à initiales, qui et quand, détail, prix. Touchée, elle mène au paiement. */
function LigneOffre({
  offre,
  rang,
  textes,
}: {
  offre: c.OffreVille;
  rang: number;
  textes: TextesOffre;
}) {
  const ton = tonDuRang(rang);
  const mention = mentionOffre(offre, textes);
  return (
    <a href={urlPlanche("Paiement", { commandeId: offre.id })} className={styles.ligne}>
      <span className={styles.avatar} data-ton={ton}>
        {initiales(offre.qui)}
      </span>
      <span className={styles.identite}>
        <span className={styles.nom}>
          {titreOffre(offre, textes)}
          {mention && (
            <>
              {" "}
              <span className={styles.mention} data-ton={ton}>
                {mention}
              </span>
            </>
          )}
        </span>
        <span className={styles.detail}>{offre.detail}</span>
      </span>
      <span className={styles.prix}>{formaterMontant(offre.prix)}</span>
    </a>
  );
}

/**
 * Planche « Covoiturage en ville » (AM-051, côté passager) : la ville détectée, le départ (ma position) et
 * l'arrivée, les voitures et motos qui partent maintenant dans cette direction, le trajet du matin et les mentions
 * de confiance. Les offres et le trajet du matin viennent de `useRechercheVille` ; l'interrupteur du trajet du
 * matin passe par `useDefinirTrajetRegulier`. Toucher une offre ouvre le paiement.
 */
export function EcranCovoitVille() {
  const { t } = useTranslation("CovoitVille");
  const navigate = useNavigate();
  const { demo, scenario } = useParametres();
  const conductricesConnues = demo && scenario === "CovoitVille" ? CONDUCTRICES_DEMO : [];
  const idDepart = useId();
  const idArrivee = useId();
  const idTitreMatin = useId();

  const [ville, setVille] = useState<VilleAffichee>(villeDeDepart);
  const [feuilleVille, setFeuilleVille] = useState(false);
  const [{ trajet, saisie }, setEdition] = useState<Edition>(EDITION_VIDE);
  /** Valeur de l'interrupteur du matin tant que le serveur n'a pas confirmé (affichage immédiat). */
  const [souhaitMatin, setSouhaitMatin] = useState<boolean | null>(null);
  const [erreurMatin, setErreurMatin] = useState(false);

  const requete = voyageur.useRechercheVille(
    {
      ville: ville.nom,
      ...(trajet ? { depart: trajet.depart, arrivee: trajet.arrivee } : {}),
      quand: "maintenant",
      types: [...TYPES_PROPOSES],
    },
    { placeholderData: keepPreviousData },
  );
  const definirMatin = voyageur.useDefinirTrajetRegulier();
  const recherche = requete.data;

  /** Une autre ville : le trajet repart de celui que le serveur propose. */
  function changerVille(suivante: VilleAffichee) {
    setVille(suivante);
    setEdition(EDITION_VIDE);
  }

  // La ville vient de la position, relevée une fois à l'ouverture. Un choix du voyageur a toujours le dernier mot.
  useEffect(() => {
    let annule = false;
    void fournisseurPosition()
      .position()
      .then((position) => {
        const detectee = position ? villeProche(position) : null;
        if (annule || !detectee) return;
        memoriserVille(detectee);
        setVille((actuelle) => {
          if (actuelle.source === "choisie") return actuelle;
          if (actuelle.nom !== detectee) setEdition(EDITION_VIDE);
          return { nom: detectee, source: "position" };
        });
      });
    return () => {
      annule = true;
    };
  }, []);

  const maPosition = t("itineraire.maPosition");
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
      setEdition({ trajet, saisie: reste });
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
    setEdition({ trajet: change ? suivant : trajet, saisie: reste });
  }

  function basculerMatin(actif: boolean) {
    if (definirMatin.isPending) return;
    setErreurMatin(false);
    setSouhaitMatin(actif);
    definirMatin.mutate(
      { actif },
      {
        onSuccess: async () => {
          await requete.refetch();
          setSouhaitMatin(null);
        },
        onError: () => {
          setSouhaitMatin(null);
          setErreurMatin(true);
        },
      },
    );
  }

  const villeDetectee =
    (ville.source === "position" || ville.source === "defaut") &&
    (recherche?.ville.detectee ?? false);
  const feminines = new Set(conductricesConnues);
  const textesDe = (offre: c.OffreVille): TextesOffre => ({
    verifie: t(feminines.has(offre.qui) ? "offre.verifiee" : "offre.verifie"),
    regulier: t("offre.regulier"),
    dans: (count) => t("offre.dans", { count }),
    minutes: (count) => t("offre.minutes", { count }),
    motoTaxi: t("offre.motoTaxi"),
  });

  const offres = recherche?.offres ?? [];
  let liste;
  if (recherche === undefined) {
    liste = requete.isError ? (
      <EtatErreur onReessayer={() => void requete.refetch()} />
    ) : (
      <EtatChargement />
    );
  } else if (offres.length === 0) {
    liste = <EtatVide />;
  } else {
    liste = offres.map((offre, rang) => (
      <LigneOffre key={offre.id} offre={offre} rang={rang} textes={textesDe(offre)} />
    ));
  }

  const matin = recherche?.trajetDuMatin;
  const km = itineraire?.distanceKm ?? 0;

  return (
    <div className={styles.racine}>
      <header className={styles.entete}>
        <h1 className={styles.titreEcran}>
          {t("ecrans.CovoitVille.titre", { ns: "translation" })}
        </h1>
        <div className={styles.titreLigne}>
          <span className={styles.titre}>{t("titre")}</span>
          <button
            type="button"
            className={styles.ville}
            aria-haspopup="dialog"
            onClick={() => setFeuilleVille(true)}
          >
            <span className={styles.repere}>
              <IconeLieu taille={12} trait={2.4} />
            </span>
            {t(villeDetectee ? "ville.detectee" : "ville.choisie", { ville: ville.nom })}
          </button>
        </div>
        <Selecteur
          ton="vert"
          taille="l"
          className={styles.mode}
          aria-label={t("mode.aria")}
          valeur="ville"
          mention={t("mode.glisse")}
          onChange={(valeur) => {
            if (valeur === "entre") void navigate(urlPlanche("Covoit"));
          }}
          options={[
            { valeur: "entre", libelle: t("mode.entreVilles") },
            { valeur: "ville", libelle: t("mode.enVille", { ville: ville.nom }) },
          ]}
        />
        <Selecteur
          ton="neutre"
          taille="l"
          className={styles.role}
          aria-label={t("role.aria")}
          valeur="passager"
          onChange={(valeur) => {
            if (valeur === "conducteur") void navigate(urlPlanche("CovoitConducteur"));
          }}
          options={[
            {
              valeur: "passager",
              libelle: t("role.passager"),
              icone: (
                <span className={styles.iconePassager}>
                  <IconePersonne taille={16} trait={2.2} />
                </span>
              ),
            },
            {
              valeur: "conducteur",
              libelle: t("role.conducteur"),
              icone: <IconeVolant taille={16} trait={2.2} />,
            },
          ]}
        />
      </header>

      <EcranCorps className={styles.corps} data-planche="CovoitVille" aria-busy={requete.isPending}>
        <section className={styles.itineraire}>
          <div className={styles.champ}>
            <label htmlFor={idDepart} className={styles.etiquette}>
              {t("itineraire.depart")}
            </label>
            <span className={styles.valeur}>
              <span className={`${styles.point} am-pulse`} aria-hidden="true" />
              <input
                id={idDepart}
                type="text"
                className={styles.saisie}
                value={saisie.depart ?? (courant ? texteDepart(courant, maPosition) : "")}
                onChange={(e) =>
                  setEdition({ trajet, saisie: { ...saisie, depart: e.target.value } })
                }
                onBlur={() => valider("depart")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") valider("depart");
                }}
              />
            </span>
          </div>
          <div className={styles.champ}>
            <label htmlFor={idArrivee} className={styles.etiquette}>
              {t("itineraire.arrivee")}
            </label>
            <span className={styles.valeur}>
              <input
                id={idArrivee}
                type="text"
                className={styles.saisie}
                value={saisie.arrivee ?? courant?.arrivee ?? ""}
                onChange={(e) =>
                  setEdition({ trajet, saisie: { ...saisie, arrivee: e.target.value } })
                }
                onBlur={() => valider("arrivee")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") valider("arrivee");
                }}
              />
              {itineraire && (
                <span className={styles.distance}>
                  {km > 0 ? t("itineraire.detail", { km }) : t("itineraire.maintenant")}
                </span>
              )}
            </span>
          </div>
        </section>

        <section className={styles.offres} aria-label={t("maintenant.titreSeul")}>
          <div className={styles.offresEntete}>
            <span>
              {recherche
                ? t("maintenant.titre", { count: offres.length })
                : t("maintenant.titreSeul")}
            </span>
            <span className={styles.sens}>{t("maintenant.sens")}</span>
          </div>
          {liste}
        </section>

        {matin && (
          <section className={styles.matin}>
            <div className={styles.matinLigne}>
              <span id={idTitreMatin} className={styles.matinTitre}>
                {matin.libelle}
              </span>
              <Interrupteur
                aria-labelledby={idTitreMatin}
                checked={souhaitMatin ?? matin.actif}
                onChange={basculerMatin}
              />
            </div>
            <span className={styles.matinExplication}>{matin.explication}</span>
            {erreurMatin && (
              <span className={styles.alerte} role="alert">
                {t("matin.erreur")}
              </span>
            )}
          </section>
        )}

        <p className={styles.securite}>
          <span className={styles.bouclier}>
            <IconeBouclier taille={18} trait={2.2} />
          </span>
          {t("securite")}
        </p>
      </EcranCorps>

      <ChoixVille
        ouverte={feuilleVille}
        onFermer={() => setFeuilleVille(false)}
        actuelle={ville.nom}
        onChoisir={(nom) => {
          memoriserVille(nom);
          changerVille({ nom, source: "choisie" });
          setFeuilleVille(false);
        }}
      />
    </div>
  );
}
