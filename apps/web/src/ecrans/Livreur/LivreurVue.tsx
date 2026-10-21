import { ErreurHttp, colis as api } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied } from "@afrimove/ui";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { CarteMission } from "./CarteMission";
import { TitreEcran } from "./etats";
import { decouperRegles, formaterMontant, formaterNote, montantCourt, tonPiece } from "./formats";
import styles from "./livreur.module.css";

export interface PropsLivreurVue {
  espace: contrats.EspaceLivreur;
  /** Relit l'espace du livreur (après un décompte écoulé ou une mission expirée). */
  recharger: () => void;
}

interface Message {
  ton: "ok" | "erreur";
  texte: string;
}

/** La mission n'est plus à prendre : expirée (410) ou déjà traitée (409). */
function missionPerdue(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 410 || erreur.statut === 409);
}

/**
 * L'app du livreur : l'en-tête avec le statut Disponible, la mission proposée (30 s pour accepter), les 3 règles, le
 * bilan du jour et de la semaine, les pièces, puis le retrait des gains.
 */
export function LivreurVue({ espace, recharger }: PropsLivreurVue) {
  const { t } = useTranslation("Livreur");
  const navigate = useNavigate();
  const { livreur, bilan, pieces, retrait, regles } = espace;

  const disponibilite = api.useDisponibiliteLivreur();
  const accepter = api.useAccepterMission();
  const passer = api.usePasserMission();
  const retirer = api.useRetirerGainsLivreur();
  const [message, setMessage] = useState<Message | null>(null);
  // Missions qu'on ne montre plus : passées, acceptées, expirées. Le serveur les retire aussi à la relecture.
  const [ecartees, setEcartees] = useState<ReadonlySet<string>>(() => new Set());
  const enCours = useRef(false);

  // Pendant l'écriture on montre déjà le nouveau statut ; si elle échoue, le statut du serveur revient.
  const disponible = disponibilite.isPending
    ? disponibilite.variables.disponible
    : livreur.disponible;

  const flux = api.useMissionsEnDirect({ actif: disponible });
  const dernier = flux.dernier;

  function ecarter(id: string) {
    setEcartees((precedentes) => new Set(precedentes).add(id));
  }

  // Une mission proposée en direct passe devant celle de la lecture ; une expiration l'écarte et relit l'espace.
  useEffect(() => {
    if (dernier?.type !== "expiree") return;
    setEcartees((precedentes) => new Set(precedentes).add(dernier.missionId));
    recharger();
    // `recharger` change à chaque rendu : seul le message du direct compte.
  }, [dernier]);

  const candidate = dernier?.type === "proposee" ? dernier.mission : espace.mission;
  const mission =
    disponible && candidate !== null && !ecartees.has(candidate.id) ? candidate : null;

  function changerDisponibilite() {
    setMessage(null);
    disponibilite.mutate(
      { disponible: !disponible },
      { onError: () => setMessage({ ton: "erreur", texte: t("echecDisponibilite") }) },
    );
  }

  function surFinDecompte() {
    if (mission === null) return;
    ecarter(mission.id);
    setMessage({
      ton: "ok",
      texte: t("mission.expiree", { secondes: mission.delaiAcceptationSecondes }),
    });
    recharger();
  }

  async function passerMission() {
    if (mission === null || enCours.current) return;
    enCours.current = true;
    setMessage(null);
    try {
      await passer.mutateAsync({ missionId: mission.id });
      ecarter(mission.id);
    } catch (erreur) {
      if (missionPerdue(erreur)) {
        ecarter(mission.id);
        setMessage({ ton: "erreur", texte: t("mission.dejaPrise") });
        recharger();
      } else {
        setMessage({ ton: "erreur", texte: t("mission.echecPasser") });
      }
    } finally {
      enCours.current = false;
    }
  }

  async function accepterMission(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (mission === null || enCours.current) return;
    enCours.current = true;
    setMessage(null);
    try {
      await accepter.mutateAsync({ missionId: mission.id });
      ecarter(mission.id);
      void navigate(urlPlanche("Livraison", { colisId: mission.colis.id }));
    } catch (erreur) {
      if (missionPerdue(erreur)) {
        ecarter(mission.id);
        setMessage({ ton: "erreur", texte: t("mission.dejaPrise") });
        recharger();
      } else {
        setMessage({ ton: "erreur", texte: t("mission.echecAccepter") });
      }
    } finally {
      enCours.current = false;
    }
  }

  async function retirerGains() {
    if (enCours.current) return;
    setMessage(null);
    if (retrait.solde < retrait.seuil) {
      setMessage({
        ton: "erreur",
        texte: t("retrait.seuil", {
          seuil: formaterMontant(retrait.seuil),
          manque: formaterMontant(retrait.seuil - retrait.solde),
        }),
      });
      return;
    }
    enCours.current = true;
    try {
      const fait = await retirer.mutateAsync({});
      setMessage({
        ton: "ok",
        texte: t("retrait.fait", { montant: formaterMontant(fait.montant), moyen: fait.moyen }),
      });
    } catch (erreur) {
      const sousSeuil = erreur instanceof ErreurHttp && erreur.code === "seuil_non_atteint";
      setMessage({
        ton: "erreur",
        texte: sousSeuil
          ? t("retrait.seuilServeur", { seuil: formaterMontant(retrait.seuil) })
          : t("retrait.echec"),
      });
    } finally {
      enCours.current = false;
    }
  }

  return (
    <>
      <TitreEcran />

      <header className={styles.entete}>
        <span className={styles.identite}>
          <span className={styles.avatar}>{livreur.initiales}</span>
          <span className={styles.identiteTextes}>
            <span className={styles.nom}>{livreur.nom}</span>
            <span className={styles.detail}>
              {t("identite", {
                numero: livreur.numero,
                ville: livreur.ville,
                note: formaterNote(livreur.note),
              })}
            </span>
          </span>
        </span>
        <span className={styles.droite}>
          <button
            type="button"
            className={styles.disponibilite}
            aria-pressed={disponible}
            onClick={changerDisponibilite}
          >
            <span className={styles.point} />
            {t(disponible ? "disponible" : "indisponible")}
          </button>
          <Link className={styles.inviter} to={urlPlanche("LivreurDevenir")}>
            {t("inviter")}
          </Link>
        </span>
      </header>

      <EcranCorps className={styles.corps} data-planche="Livreur">
        {message !== null && (
          <p className={styles.message} role={message.ton === "erreur" ? "alert" : "status"}>
            {message.texte}
          </p>
        )}

        {mission !== null ? (
          <CarteMission
            mission={mission}
            onPasser={() => void passerMission()}
            onAccepter={(e) => void accepterMission(e)}
            onFin={surFinDecompte}
          />
        ) : (
          <section className={styles.aucune}>
            <h2 className={styles.aucuneTitre}>
              {t(disponible ? "mission.aucune.titre" : "mission.horsLigne.titre")}
            </h2>
            <p className={styles.aucuneDetail}>
              {t(disponible ? "mission.aucune.detail" : "mission.horsLigne.detail")}
            </p>
          </section>
        )}

        <section className={styles.regles}>
          <div className={styles.etiquetteAmbre}>
            <h2 className={styles.etiquetteTitre}>{regles.titre}</h2>
          </div>
          <span className={styles.reglesTexte}>
            {decouperRegles(regles.texte).map((morceau, i) =>
              morceau.numero ? <strong key={i}>{morceau.texte}</strong> : morceau.texte,
            )}
          </span>
        </section>

        <div className={styles.bilan}>
          <div className={styles.tuile}>
            <span className={styles.tuileEtiquette}>{t("bilan.aujourdhui")}</span>
            <span className={styles.tuileValeur}>{bilan.aujourdhui.livraisons}</span>
            <span className={styles.tuileDetail}>
              {t("bilan.livraisons", { count: bilan.aujourdhui.livraisons })}
            </span>
          </div>
          <div className={styles.tuile}>
            <span className={styles.tuileEtiquette}>{t("bilan.gagne")}</span>
            <span className={styles.tuileValeur} data-ton="vert">
              {formaterMontant(bilan.aujourdhui.gain)}
            </span>
            <span className={styles.tuileDetail}>{bilan.versement}</span>
          </div>
          <div className={styles.tuile}>
            <span className={styles.tuileEtiquette}>{t("bilan.semaine")}</span>
            <span className={styles.tuileValeur}>{montantCourt(bilan.semaine.gain)}</span>
            <span className={styles.tuileDetail}>
              {t("bilan.total", { count: bilan.semaine.livraisons })}
            </span>
          </div>
        </div>

        <section className={styles.pieces}>
          <div className={styles.piecesEntete}>
            <h2 className={styles.etiquetteTitre}>{t("pieces.titre")}</h2>
            <span className={styles.piecesEtat} data-ton={pieces.aJour ? "vert" : "ambre"}>
              {t(pieces.aJour ? "pieces.aJour" : "pieces.aVerifier")}
            </span>
          </div>
          <ul className={styles.piecesListe}>
            {pieces.liste.map((piece) => (
              <li key={piece.type} className={styles.piece}>
                <span className={styles.pieceLibelle}>{piece.libelle}</span>
                <span className={styles.pieceValeur} data-ton={tonPiece(piece.valeur)}>
                  {piece.valeur}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <span>{t("retrait.libelle", { seuil: formaterMontant(retrait.seuil) })}</span>
        <button type="button" className={styles.retirer} onClick={() => void retirerGains()}>
          {t("retrait.action")}
        </button>
      </EcranPied>
    </>
  );
}
