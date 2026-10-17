import { ErreurHttp, colis as api } from "@afrimove/api-client";
import type { colis as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied, IconeChevronDroite } from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import {
  enLettres,
  etatDe,
  formaterDistance,
  formaterMontant,
  formaterNote,
  minusculeInitiale,
  nomCourt,
  repereDe,
} from "./formats";
import { adresseColis, Haut } from "./haut";
import { IconeBoutique } from "./icones";
import styles from "./relais.module.css";

/** Le serveur dit que ce colis n'existe pas ou n'est pas à cette personne. */
function refuse(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && (erreur.statut === 404 || erreur.statut === 403);
}

/**
 * Planche « Relais » (touche 2, suite) : les points relais les plus proches du destinataire, sur une carte et en
 * liste, l'invitation à devenir point relais, et le bouton qui choisit le relais et prévient le destinataire. Les
 * relais viennent de `useRelaisProches`; le choix est enregistré sur le colis par `useChoisirRelais` (le serveur
 * envoie le SMS au destinataire).
 */
export function EcranRelais() {
  const { colisId = "" } = useParams();
  const requete = api.useRelaisProches(colisId, undefined, { enabled: colisId !== "" });

  if (colisId === "" || refuse(requete.error)) {
    return <EtatVide colisId={colisId} cle="introuvable" />;
  }
  if (requete.data === undefined) {
    if (requete.isError) {
      return <EtatErreur colisId={colisId} onReessayer={() => void requete.refetch()} />;
    }
    return <EtatChargement colisId={colisId} />;
  }
  if (requete.data.relais.length === 0) return <EtatVide colisId={colisId} cle="aucun" />;
  return <Choix colisId={colisId} proches={requete.data} />;
}

/** Cause d'un échec du choix, en une phrase : relais plein, colis trop lourd, ou panne. */
function cleEchec(erreur: unknown): "complet" | "tropLourd" | "echec" {
  if (erreur instanceof ErreurHttp) {
    if (erreur.code === "relais_complet") return "complet";
    if (erreur.code === "colis_trop_lourd") return "tropLourd";
  }
  return "echec";
}

function Choix({ colisId, proches }: { colisId: string; proches: contrats.RelaisProches }) {
  const { t } = useTranslation("Relais");
  const navigate = useNavigate();
  const choisir = api.useChoisirRelais();
  const [choisiId, setChoisiId] = useState<string | null>(null);
  const [echec, setEchec] = useState<"complet" | "tropLourd" | "echec" | null>(null);

  const { relais, destinataire, ville, reperes, devenir } = proches;
  // Le relais coché est toujours l'un de ceux qu'on propose : à défaut, le plus proche (le premier de la liste).
  const choisi = relais.find((r) => r.id === choisiId) ?? relais[0];
  if (choisi === undefined) return null;

  const marche = repereDe(reperes, "marche");
  const nombre = relais.length;
  const libelleCarte = marche
    ? t("carte.libelle", {
        count: nombre,
        nombre: enLettres(nombre),
        ville,
        marche: minusculeInitiale(marche.libelle),
      })
    : t("carte.libelleSansMarche", { count: nombre, nombre: enLettres(nombre), ville });

  function valider() {
    if (choisir.isPending || choisi === undefined) return;
    setEchec(null);
    choisir.mutate(
      { colisId, relaisId: choisi.id },
      {
        onSuccess: () => void navigate(adresseColis(colisId)),
        onError: (erreur) => setEchec(cleEchec(erreur)),
      },
    );
  }

  return (
    <>
      <Haut
        colisId={colisId}
        carte={{ reperes, libelle: libelleCarte }}
        titre={{
          etiquette: t("carte.etiquette", { ville }),
          sousTitre: t("carte.sousTitre", { count: nombre }),
        }}
      />

      <EcranCorps className={styles.corps} data-planche="Relais">
        <div role="radiogroup" aria-label={t("liste.libelle")} className={styles.liste}>
          {relais.map((point) => {
            const etat = etatDe(point);
            const detail = [
              point.rang === 1
                ? t("detail.deChez", {
                    distance: formaterDistance(point.distanceM),
                    surnom: destinataire.surnom,
                  })
                : formaterDistance(point.distanceM),
              point.horaires,
              point.jours,
              `${formaterNote(point.note)} ★`,
              point.colisRemis === null
                ? null
                : t("detail.colisRemis", { count: point.colisRemis }),
              point.particularite,
            ].filter((morceau): morceau is string => morceau !== null && morceau !== "");
            return (
              <label key={point.id} className={styles.relais} data-choisi={point.id === choisi.id}>
                <input
                  type="radio"
                  name="relais"
                  className={styles.radio}
                  checked={point.id === choisi.id}
                  onChange={() => {
                    setChoisiId(point.id);
                    setEchec(null);
                  }}
                />
                <span className={styles.rang}>{point.rang}</span>
                <span className={styles.textes}>
                  <span className={styles.nom}>
                    {point.nom}{" "}
                    <span
                      className={styles.etat}
                      data-ton={
                        etat.type === "ouvert"
                          ? "ouvert"
                          : etat.type === "ferme-bientot"
                            ? "bientot"
                            : "ferme"
                      }
                    >
                      {etat.type === "ouvert"
                        ? t("etat.ouvert")
                        : etat.type === "ferme-bientot"
                          ? t("etat.fermeBientot", { heure: etat.heure })
                          : t("etat.ferme")}
                    </span>
                  </span>
                  <span className={styles.detail}>{detail.join(" · ")}</span>
                </span>
                <span className={styles.supplement}>
                  {t("supplement", { montant: formaterMontant(point.supplement) })}
                </span>
              </label>
            );
          })}
        </div>

        <a className={styles.devenir} href={urlPlanche("RelaisDevenir")}>
          <span className={styles.devenirIcone}>
            <IconeBoutique />
          </span>
          <span className={styles.devenirTextes}>
            <span className={styles.devenirTitre}>{devenir.titre}</span>
            <span className={styles.devenirDetail}>{devenir.detail}</span>
          </span>
          <span className={styles.devenirChevron}>
            <IconeChevronDroite taille={16} />
          </span>
        </a>
      </EcranCorps>

      <EcranPied>
        {echec !== null && (
          <p role="alert" className={styles.message}>
            {t(`messages.${echec}`)}
          </p>
        )}
        <button
          type="button"
          className={styles.choisir}
          aria-busy={choisir.isPending}
          onClick={valider}
        >
          <span className={styles.choisirLibelle}>
            {t("choisir.libelle", {
              nom: nomCourt(choisi.nom),
              surnom: destinataire.surnom,
            })}
          </span>
          <span className={styles.choisirPrix}>
            {t("choisir.prix", { montant: formaterMontant(choisi.supplement) })}
          </span>
        </button>
      </EcranPied>
    </>
  );
}
