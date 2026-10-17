import { ErreurHttp, agence } from "@afrimove/api-client";
import { aleaCrypto, genererCodeBillet } from "@afrimove/domain";
import { EcranCorps, EcranPied, Entete, Pastille, PlanSieges } from "@afrimove/ui";
import { useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  calculerComptes,
  constatDepuisPlan,
  constatSuivant,
  convoyeurDuDepart,
  ecritEcart,
  estFeminin,
  tonEcart,
  type BaseComptage,
  type Constat,
  type SiegeConstate,
} from "./calculs";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { heureDouala, montantFcfa } from "./formats";
import styles from "./controleur.module.css";

export type Controle = NonNullable<ReturnType<typeof agence.useControleInopine>["data"]>;

/** Ville où le voyageur dit avoir payé : le contrat ne la porte pas, toutes les lignes partent de Douala (point signalé). */
const VILLE_DE_PAIEMENT = "Douala";

/** Planche « Controleur » (touche 5) : contrôle inopiné à bord, siège par siège. Lit `useControleInopine`. */
export function EcranControleur() {
  const requete = agence.useControleInopine();

  // Une relecture qui échoue ne retire pas le contrôle déjà chargé : le tour des sièges continue.
  if (requete.data) return <ControleABord controle={requete.data} />;
  if (requete.isPending) return <EtatChargement />;
  const erreur = requete.error;
  return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
    <EtatVide />
  ) : (
    <EtatErreur onReessayer={() => void requete.refetch()} />
  );
}

type Retour = { ton: "ok" | "erreur"; texte: string } | null;

function ControleABord({ controle }: { controle: Controle }) {
  const { t } = useTranslation("Controleur");
  const navigate = useNavigate();
  const appareil = agence.useAppareilAgence();
  const verifier = agence.useVerifierSiege();
  const regulariser = agence.useRegulariserVoyageur();
  const signaler = agence.useSignalerConvoyeur();
  const clore = agence.useCloreControle();

  /** Constats touchés ici et pas encore confirmés par le serveur : le siège change de couleur au toucher. */
  const [touches, setTouches] = useState<Readonly<Record<number, Constat>>>({});
  const [retour, setRetour] = useState<Retour>(null);
  const [signales, setSignales] = useState<readonly number[]>([]);
  const [echecCloture, setEchecCloture] = useState(false);

  /** Têtes et sièges occupés à l'ouverture : les têtes comptées se déduisent ensuite des sièges touchés. */
  const base = useRef<BaseComptage>({
    tetes: controle.comptes.tetes,
    occupes: controle.sieges.filter((siege) => siege.constat !== "libre").length,
  });

  const file = useRef<Promise<unknown>>(Promise.resolve());
  const geste = useRef(false);
  const cloture = useRef(false);

  /** Un envoi à la fois, dans l'ordre : le serveur reçoit les sièges comme le contrôleur les a touchés. */
  function enfiler<T>(travail: () => Promise<T>): Promise<T> {
    const suite = file.current.then(travail, travail);
    file.current = suite.catch(() => undefined);
    return suite;
  }

  const sieges: SiegeConstate[] = controle.sieges.map((siege) => ({
    numero: siege.numero,
    constat: touches[siege.numero] ?? siege.constat,
  }));

  const comptes = calculerComptes(base.current, controle.comptes.liste, sieges);
  const comptesCourants = useRef(comptes);
  comptesCourants.current = comptes;

  const scannes = sieges.filter((s) => s.constat === "scanne").map((s) => s.numero);
  const sansBillet = sieges.filter((s) => s.constat === "sans_billet").map((s) => s.numero);

  /** La fiche est celle du voyageur que le serveur donne à traiter, tant que son siège est « sans billet ». */
  const fiche =
    controle.sansBillet && sansBillet.includes(controle.sansBillet.siege)
      ? controle.sansBillet
      : null;

  function retirerTouche(numero: number, constat: Constat) {
    setTouches((courant) => {
      if (courant[numero] !== constat) return courant;
      const { [numero]: _retire, ...reste } = courant;
      return reste;
    });
  }

  function toucherSiege(numero: number, avant: Constat) {
    const apres = constatSuivant(avant);
    setRetour(null);
    setTouches((courant) => ({ ...courant, [numero]: apres }));
    void enfiler(async () => {
      try {
        await verifier.mutateAsync({
          controleId: controle.controleId,
          departId: controle.departId,
          siege: numero,
          constat: apres,
        });
      } catch {
        setRetour({ ton: "erreur", texte: t("siege.echec", { numero }) });
      } finally {
        retirerTouche(numero, apres);
      }
    });
  }

  /** « Régulariser · billet 4 000 » : un billet est vendu sur place, au prix que le voyageur dit avoir payé. */
  async function regulariserVoyageur() {
    if (!fiche || geste.current) return;
    geste.current = true;
    setRetour(null);
    try {
      const resultat = await enfiler(() =>
        regulariser.mutateAsync({
          controleId: controle.controleId,
          billetId: appareil.nouvelId(),
          departId: controle.departId,
          siege: fiche.siege,
          prix: fiche.montantDeclare,
          paiement: { mode: "cash", recu: fiche.montantDeclare, rendu: 0, reference: null },
          codeBillet: genererCodeBillet(aleaCrypto()),
          passager: { nom: null, pieceQuatreDerniers: null },
        }),
      );
      // La liste compte le billet vendu dès maintenant, même si la relecture du contrôle n'est pas encore affichée.
      comptesCourants.current = calculerComptes(
        base.current,
        resultat.controle.comptes.liste,
        sieges,
      );
      retirerTouche(fiche.siege, "sans_billet");
      setRetour({
        ton: "ok",
        texte: t("fiche.regularise", { numero: resultat.billet.numero, siege: fiche.siege }),
      });
    } catch {
      setRetour({ ton: "erreur", texte: t("fiche.echecRegularisation") });
    } finally {
      geste.current = false;
    }
  }

  /** « Signaler le convoyeur » : la vente en route n'est pas enregistrée, le patron en est informé. */
  async function signalerConvoyeur() {
    if (!fiche || geste.current) return;
    geste.current = true;
    setRetour(null);
    try {
      await enfiler(() =>
        signaler.mutateAsync({
          controleId: controle.controleId,
          departId: controle.departId,
          convoyeurId: convoyeurDuDepart(controle.departId),
          siege: fiche.siege,
          montantDeclare: fiche.montantDeclare,
          note: null,
        }),
      );
      setSignales((courant) => [...courant, fiche.siege]);
      setRetour({ ton: "ok", texte: t("fiche.signale", { siege: fiche.siege }) });
    } catch {
      setRetour({ ton: "erreur", texte: t("fiche.echecSignalement") });
    } finally {
      geste.current = false;
    }
  }

  /** « Clore le contrôle » : une fois tous les sièges envoyés, le constat part au patron, puis le rapport du soir. */
  async function cloreControle(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (cloture.current) return;
    cloture.current = true;
    setEchecCloture(false);
    try {
      await file.current;
      const { liste, tetes, ecart } = comptesCourants.current;
      await clore.mutateAsync({
        controleId: controle.controleId,
        departId: controle.departId,
        liste,
        tetes,
        ecart,
      });
    } catch {
      setEchecCloture(true);
      return;
    } finally {
      cloture.current = false;
    }
    void navigate(urlPlanche("RapportSoir"));
  }

  const signale = fiche !== null && signales.includes(fiche.siege);
  const fonction = estFeminin(controle.controleur.nom) ? "feminin" : "masculin";
  const ton = tonEcart(comptes.ecart);

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre", {
          nom: controle.controleur.nom,
          fonction: t(`fonction.${fonction}`),
          bus: controle.bus.immatriculation,
          lieu: controle.lieu,
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }}
        droite={<Pastille statut="inopine" libelle={t("badge")} />}
      />

      <EcranCorps className={styles.corps} data-planche="Controleur">
        <div className={styles.tuiles}>
          <div className={styles.tuile}>
            <span className={styles.tuileLibelle}>{t("compteurs.liste.libelle")}</span>
            <span className={styles.tuileValeur}>{comptes.liste}</span>
            <span className={styles.tuileDetail}>{t("compteurs.liste.detail")}</span>
          </div>
          <div className={styles.tuile}>
            <span className={styles.tuileLibelle}>{t("compteurs.comptes.libelle")}</span>
            <span className={styles.tuileValeur}>{comptes.tetes}</span>
            <span className={styles.tuileDetail}>{t("compteurs.comptes.detail")}</span>
          </div>
          <div className={styles.tuile} data-ton={ton}>
            <span className={styles.tuileLibelle}>{t("compteurs.ecart.libelle")}</span>
            <span className={styles.tuileValeur}>{ecritEcart(comptes.ecart)}</span>
            <span className={styles.tuileDetail}>
              {t(
                ton === "alerte"
                  ? "compteurs.ecart.sansBillet"
                  : ton === "manque"
                    ? "compteurs.ecart.sansVoyageur"
                    : "compteurs.ecart.aucun",
              )}
            </span>
          </div>
        </div>

        <PlanSieges
          mode="controle"
          className={styles.plan}
          nombre={sieges.length}
          titre={t("sieges.titre")}
          info={t("sieges.total", { nombre: sieges.length })}
          scannes={scannes}
          sansBillet={sansBillet}
          onSiege={(numero, etat) => toucherSiege(numero, constatDepuisPlan(etat))}
        />

        {fiche && (
          <section className={styles.fiche} aria-label={t("fiche.titre", { numero: fiche.siege })}>
            <div className={styles.ficheTete}>
              <h2 className={styles.ficheTitre}>{t("fiche.titre", { numero: fiche.siege })}</h2>
              <span className={styles.ficheLieu}>
                {t("fiche.lieuHeure", { lieu: fiche.lieu, heure: heureDouala(fiche.at) })}
              </span>
            </div>
            <p className={styles.ficheTexte}>
              {[
                fiche.montantDeclare > 0
                  ? t("fiche.declare", {
                      montant: montantFcfa(fiche.montantDeclare),
                      ville: VILLE_DE_PAIEMENT,
                    })
                  : null,
                fiche.venteEnRouteTrouvee ? t("fiche.venteTrouvee") : t("fiche.aucuneVente"),
              ]
                .filter((phrase): phrase is string => phrase !== null)
                .join(" ")}
            </p>
            <div className={styles.ficheActions} data-seul={signale}>
              <button
                type="button"
                className={`${styles.bouton} ${styles.regulariser}`}
                onClick={() => void regulariserVoyageur()}
              >
                {t("fiche.regulariser", { montant: montantFcfa(fiche.montantDeclare) })}
              </button>
              {!signale && (
                <button
                  type="button"
                  className={`${styles.bouton} ${styles.signaler}`}
                  onClick={() => void signalerConvoyeur()}
                >
                  {t("fiche.signaler")}
                </button>
              )}
            </div>
          </section>
        )}

        {retour && (
          <p
            className={styles.retour}
            data-ton={retour.ton}
            role={retour.ton === "erreur" ? "alert" : "status"}
          >
            {retour.texte}
          </p>
        )}
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {echecCloture && (
          <p role="alert" className={styles.alerte}>
            {t("cloture.echec")}
          </p>
        )}
        <a
          href={urlPlanche("RapportSoir")}
          className={styles.cloture}
          aria-busy={clore.isPending}
          onClick={(e) => void cloreControle(e)}
        >
          {t("cloture.libelle")}
        </a>
      </EcranPied>
    </>
  );
}
