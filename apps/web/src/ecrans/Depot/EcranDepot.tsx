import { ErreurHttp, agence } from "@afrimove/api-client";
import { MENTION_ETIQUETTE, type DonneesEtiquette } from "@afrimove/impression";
import { EcranCorps, EcranPied, Entete, IconeCoche } from "@afrimove/ui";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { useParametres } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { useImprimeur } from "@/impression";
import {
  calculerComplement,
  codeVille,
  controlerPoids,
  formaterKilos,
  formaterMontant,
  formaterTelephone,
  gareDuNumero,
  heureDouala,
  normaliserCode,
} from "./calculs";
import { EtatFiche } from "./etats";
import { FeuillePoids } from "./FeuillePoids";
import { CodeQrViseur, IconeAvertissement } from "./icones";
import styles from "./depot.module.css";

export type ColisDepot = NonNullable<ReturnType<typeof agence.useColisDepot>["data"]>;

/** Code que la planche montre déjà lu : celui de son scénario de démonstration (C-ALP-DLA-270105-0017). */
export const CODE_DEMO = "C-ALP-DLA-270105-0017";

/** Délai avant de chercher le colis quand on tape (la touche Entrée cherche tout de suite). */
const DELAI_RECHERCHE_MS = 400;

/**
 * Code de départ : celui d'un lien `?code=` (lecteur de QR qui ouvre l'app), sinon, en démonstration sur le scénario de
 * la planche, le code que la maquette montre déjà lu. Sinon rien : l'agent scanne ou tape.
 */
function useCodeInitial(): string {
  const [recherche] = useSearchParams();
  const { demo, scenario } = useParametres();
  const [initial] = useState(
    () => recherche.get("code") ?? (demo && scenario === "Depot" ? CODE_DEMO : ""),
  );
  return initial;
}

/** Suite d'un dépôt accepté qui ne part pas tout de suite vers le quai : complément à payer, étiquette en attente. */
interface Suite {
  complement: number;
  attente: boolean;
}

/** Planche « Depot » (touche 4 du guichet) : accepter un colis payé dans l'app. Lit par `useColisDepot`, écrit par `useAccepterDepotColis`. */
export function EcranDepot() {
  const { t } = useTranslation("Depot");
  const navigate = useNavigate();
  const imprimeur = useImprimeur();
  const codeInitial = useCodeInitial();

  const [saisie, setSaisie] = useState(codeInitial);
  const [code, setCode] = useState(normaliserCode(codeInitial));
  const champ = useRef<HTMLInputElement>(null);

  // Le code se cherche quand la frappe s'arrête.
  useEffect(() => {
    const voulu = normaliserCode(saisie);
    if (voulu === code) return;
    const minuterie = setTimeout(() => setCode(voulu), DELAI_RECHERCHE_MS);
    return () => clearTimeout(minuterie);
  }, [saisie, code]);

  const requete = agence.useColisDepot(code, {
    retry: (essais, erreur) =>
      !(erreur instanceof ErreurHttp && erreur.statut === 404) && essais < 1,
  });
  const colis = requete.data;
  const compagnie = agence.useGuichetAccueil().data?.agence.compagnie;
  const deposer = agence.useAccepterDepotColis();
  const journal = agence.useImprimer();

  // Poids et photo appartiennent au colis scanné : changer de code les remet à zéro.
  const [poidsSaisi, setPoidsSaisi] = useState<{ colisId: string; kg: number } | null>(null);
  const [photo, setPhoto] = useState<{ colisId: string; ref: string } | null>(null);
  const [feuille, setFeuille] = useState(false);
  const [photoManque, setPhotoManque] = useState(false);
  const [echec, setEchec] = useState(false);
  const [suite, setSuite] = useState<Suite | null>(null);
  const [enCours, setEnCours] = useState(false);
  const boutonPhoto = useRef<HTMLButtonElement>(null);
  const fichierPhoto = useRef<HTMLInputElement>(null);
  const depotFait = useRef<{ colisId: string; complement: number } | null>(null);

  const poidsKg =
    colis && poidsSaisi?.colisId === colis.colisId
      ? poidsSaisi.kg
      : (colis?.verifications.poidsReleveKg ?? null);
  const photoRef = colis && photo?.colisId === colis.colisId ? photo.ref : null;
  const controle =
    colis && poidsKg !== null
      ? controlerPoids(poidsKg, colis.declare.poidsKg, colis.verifications.seuilDepassementKg)
      : null;
  const tarif = colis && {
    payeDansApp: colis.payeDansApp,
    assure: colis.declare.assure,
    valeurDeclaree: colis.declare.valeurDeclaree,
    poidsDeclareKg: colis.declare.poidsKg,
  };
  const complement =
    tarif && controle?.complementRequis
      ? calculerComplement({ ...tarif, ecartKg: controle.ecartKg })
      : 0;

  function chercherTout(evenement: FormEvent) {
    evenement.preventDefault();
    setCode(normaliserCode(saisie));
  }

  function surPhoto(evenement: ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    evenement.target.value = "";
    if (!colis || !fichier) return;
    // Le téléversement de la photo est hors de ce périmètre : on garde la référence du fichier pris au dépôt.
    setPhoto({ colisId: colis.colisId, ref: `${colis.numero}/${fichier.name || "photo-depot"}` });
    setPhotoManque(false);
  }

  function donneesEtiquette(c: ColisDepot): DonneesEtiquette {
    return {
      trajet: `${gareDuNumero(c.numero)} → ${codeVille(c.depart.destination)}`,
      destinataire: `${c.destinataire.nom} · ${c.destinataire.destination}`,
      reference: c.numero,
      poids: `${formaterKilos(poidsKg ?? c.declare.poidsKg)} kg`,
      heure: heureDouala(c.depart.heureDepart),
      mention: compagnie ? `${compagnie} · ${MENTION_ETIQUETTE}` : MENTION_ETIQUETTE,
    };
  }

  /** Enregistre le dépôt, imprime l'étiquette, puis va au quai (sauf complément à signaler ou étiquette en attente). */
  async function accepter(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (enCours) return;
    if (suite) {
      void navigate(urlPlanche("Quai"));
      return;
    }
    if (!colis) {
      champ.current?.focus();
      return;
    }
    if (poidsKg === null) {
      setFeuille(true);
      return;
    }
    if (!photoRef) {
      setPhotoManque(true);
      boutonPhoto.current?.focus();
      return;
    }
    setEchec(false);
    setEnCours(true);
    try {
      // Un nouvel essai après un échec d'impression ne réenregistre pas le dépôt.
      if (depotFait.current?.colisId !== colis.colisId) {
        const resultat = await deposer.mutateAsync({
          colisId: colis.colisId,
          poidsReleveKg: poidsKg,
          photoRef,
          complement,
        });
        depotFait.current = { colisId: colis.colisId, complement: resultat.complementDemande };
      }
      const impression = await imprimeur.imprimerEtiquette(donneesEtiquette(colis));
      await journal
        .mutateAsync({
          document: "etiquette_colis",
          documentId: colis.colisId,
          copies: 1,
          reimpression: false,
        })
        .catch(() => undefined);
      const demande = depotFait.current?.complement ?? 0;
      const attente = impression.statut !== "imprime";
      if (demande > 0 || attente) setSuite({ complement: demande, attente });
      else void navigate(urlPlanche("Quai"));
    } catch {
      setEchec(true);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <Entete
        className={styles.entete}
        titre={t("titre")}
        sousTitre={t("sousTitre")}
        retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
      />

      <EcranCorps className={styles.corps} data-planche="Depot">
        <div className={styles.cadre}>
          <CodeQrViseur />
          <span className={styles.laser} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.hautGauche}`} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.hautDroite}`} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.basGauche}`} aria-hidden="true" />
          <span className={`${styles.coin} ${styles.basDroite}`} aria-hidden="true" />
        </div>

        <form className={styles.saisie} onSubmit={chercherTout}>
          <span className={styles.saisieLibelle}>{t("code.ou")}</span>
          <input
            ref={champ}
            type="text"
            className={styles.champ}
            aria-label={t("code.libelle")}
            aria-invalid={
              requete.isError && requete.error instanceof ErreurHttp && requete.error.statut === 404
            }
            value={saisie}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setSaisie(e.target.value)}
          />
        </form>

        {colis ? (
          <section className={styles.fiche}>
            <div className={styles.ficheTete}>
              <span className={styles.trouve}>
                <IconeCoche taille={16} trait={2.8} />
                {t("trouve", { montant: formaterMontant(colis.payeDansApp) })}
              </span>
              <span className={styles.heure}>{heureDouala(colis.trouveA)}</span>
            </div>
            <div className={styles.grille}>
              <span>
                <span className={styles.petit}>{t("fiche.de")}</span>
                <br />
                <strong>{colis.expediteur.nom}</strong> ·{" "}
                {formaterTelephone(colis.expediteur.telephone)}
              </span>
              <span>
                <span className={styles.petit}>{t("fiche.pour")}</span>
                <br />
                <strong>{colis.destinataire.nom}</strong> · {colis.destinataire.destination}
              </span>
              <span>
                <span className={styles.petit}>{t("fiche.declare")}</span>
                <br />
                {t("fiche.declareTexte", {
                  contenu: colis.declare.contenu,
                  poids: formaterKilos(colis.declare.poidsKg),
                  valeur: formaterMontant(colis.declare.valeurDeclaree),
                  assurance: t(colis.declare.assure ? "fiche.assure" : "fiche.nonAssure"),
                })}
              </span>
              <span>
                <span className={styles.petit}>{t("fiche.depart")}</span>
                <br />
                {t("fiche.departTexte", {
                  heure: heureDouala(colis.depart.heureDepart),
                  destination: colis.depart.destination,
                  pct: colis.depart.soutePct,
                })}
              </span>
            </div>
          </section>
        ) : (
          <EtatFiche
            code={code}
            chargement={requete.isPending && code !== ""}
            erreur={requete.error}
            onReessayer={() => void requete.refetch()}
          />
        )}

        {colis && (
          <div className={styles.verifications}>
            <button type="button" className={styles.verification} onClick={() => setFeuille(true)}>
              <span>{t("poids.titre")}</span>
              {controle ? (
                <span
                  className={styles.detail}
                  data-ton={controle.complementRequis ? "ambre" : "vert"}
                >
                  {controle.complementRequis
                    ? t("poids.complement", {
                        poids: formaterKilos(poidsKg ?? 0),
                        montant: formaterMontant(complement),
                      })
                    : t("poids.conforme", { poids: formaterKilos(poidsKg ?? 0) })}
                </span>
              ) : (
                <span className={styles.detail} data-ton="ambre">
                  {t("poids.arelever")}
                </span>
              )}
            </button>
            <button
              ref={boutonPhoto}
              type="button"
              className={styles.verification}
              data-manque={photoManque}
              onClick={() => fichierPhoto.current?.click()}
            >
              <span>{t("photo.titre")}</span>
              <span className={styles.detail} data-ton={photoRef ? "vert" : "ambre"}>
                {photoRef ? t("photo.prise") : t("photo.aprendre")}
              </span>
            </button>
            <input
              ref={fichierPhoto}
              type="file"
              accept="image/*"
              capture="environment"
              className={styles.fichierPhoto}
              tabIndex={-1}
              aria-hidden="true"
              onChange={surPhoto}
            />
          </div>
        )}

        <p className={styles.note}>
          <IconeAvertissement />
          {t("note", { seuil: formaterKilos(colis?.verifications.seuilDepassementKg ?? 1) })}
        </p>

        {photoManque && (
          <p role="alert" className={styles.avis}>
            {t("photo.manque")}
          </p>
        )}
        {suite && (
          <div role="status" className={styles.avis} data-ton="ambre">
            {suite.complement > 0 && (
              <p>{t("accepter.complement", { montant: formaterMontant(suite.complement) })}</p>
            )}
            {suite.attente && <p>{t("accepter.attente")}</p>}
          </div>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {echec && (
          <p role="alert" className={styles.avis}>
            {t("accepter.echec")}
          </p>
        )}
        <a
          href={urlPlanche("Quai")}
          className={styles.accepter}
          aria-busy={enCours}
          onClick={(e) => void accepter(e)}
        >
          {suite ? t("accepter.continuer") : t("accepter.libelle")}
        </a>
      </EcranPied>

      {feuille && colis && tarif && (
        <FeuillePoids
          ouverte
          poidsInitial={poidsKg}
          poidsDeclareKg={colis.declare.poidsKg}
          seuilKg={colis.verifications.seuilDepassementKg}
          tarif={tarif}
          onFermer={() => setFeuille(false)}
          onValider={(kg) => {
            setPoidsSaisi({ colisId: colis.colisId, kg });
            setFeuille(false);
          }}
        />
      )}
    </>
  );
}
