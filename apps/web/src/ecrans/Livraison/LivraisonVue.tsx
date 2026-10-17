import type { colis as contrats } from "@afrimove/contrats";
import { EcranCorps, EcranPied, IconeChevronDroite, IconeCoche, Pastille } from "@afrimove/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { CarteLivraison } from "./CarteLivraison";
import { TitreEcran, Retour } from "./etats";
import { FeuilleAdresse, FeuillePartage } from "./feuilles";
import {
  avancee,
  formaterMontant,
  formaterNote,
  formaterPoids,
  grouperCode,
  heureDouala,
  prenom,
  referenceCourte,
  type PositionAffichee,
} from "./formats";
import { IconeMessage, IconeMoto, IconeTelephone } from "./icones";
import styles from "./livraison.module.css";

export interface PropsLivraisonVue {
  livraison: contrats.LivraisonColis;
  position: PositionAffichee;
  /** « Maman » : le surnom du destinataire, `null` si on ne le connaît pas. */
  nomDestinataire: string | null;
  /** Les neuf chiffres du numéro du destinataire, vide si on ne le connaît pas. */
  telephoneDestinataire: string;
}

type Feuille = "partage" | "adresse" | null;

/**
 * L'écran : la carte avec l'heure d'arrivée, le livreur, la règle de remise, les deux actions, l'invitation à devenir
 * livreur, puis le récapitulatif du prix.
 */
export function LivraisonVue({
  livraison,
  position,
  nomDestinataire,
  telephoneDestinataire,
}: PropsLivraisonVue) {
  const { t } = useTranslation("Livraison");
  const [feuille, setFeuille] = useState<Feuille>(null);
  const [appel, setAppel] = useState(false);
  // Minutes restantes à l'ouverture : la place du livreur sur la carte est celle de la planche à ce moment-là.
  const minutesDepart = useRef(position.minutes);

  const { livreur, remise, prix, carte, arrivee, devenir } = livraison;
  const nom = nomDestinataire ?? t("destinataire");
  const prenomLivreur = prenom(livreur.nom);
  const reputation = t("livreur.reputation", {
    count: livreur.livraisons,
    note: formaterNote(livreur.note),
  });
  const poids = formaterPoids(arrivee.poidsKg);

  return (
    <div className={styles.racine}>
      <TitreEcran />

      <div className={styles.carte}>
        <CarteLivraison
          avancee={avancee(position.minutes, minutesDepart.current)}
          depart={t("carte.depart", {
            lieu: carte.depart.libelle,
            heure: heureDouala(carte.depart.retireLe),
          })}
          livreur={t("carte.livreur", { prenom: prenomLivreur, minutes: position.minutes })}
          arrivee={carte.arrivee}
          libelle={t("carte.libelle", { count: position.minutes, nom })}
        />
        <Retour colisId={livraison.colisId} />
        <Pastille className={styles.statut} statut="direct" libelle={t("statut")} />
        <div className={styles.heure}>
          <span className={styles.heureGauche}>
            <span className={styles.heureEtiquette}>{arrivee.libelle}</span>
            <span className={styles.heureValeur}>{heureDouala(position.arriveeEstimee)}</span>
          </span>
          <span className={styles.heureDroite}>
            {t("arrivee.colis", { reference: referenceCourte(livraison.numero) })}
            <br />
            {t(arrivee.assure ? "arrivee.poids" : "arrivee.poidsNonAssure", { poids })}
          </span>
        </div>
      </div>

      <EcranCorps className={styles.corps} data-planche="Livraison">
        <div className={styles.livreurCarte}>
          <span className={styles.avatar} aria-hidden="true">
            {livreur.initiales}
          </span>
          <span className={styles.livreurTextes}>
            <span className={styles.livreurNom}>
              {t("livreur.titre", { nom: livreur.nom })}{" "}
              <span className={styles.livreurReputation}>
                {livreur.verifie ? `${t("livreur.verifie")} · ` : ""}
                {reputation}
              </span>
            </span>
            <span className={styles.livreurEngin}>
              {t("livreur.engin", { moto: livreur.moto, gilet: livreur.gilet })}
            </span>
          </span>
          <button
            type="button"
            className={styles.appeler}
            aria-label={t("livreur.appeler", { prenom: prenomLivreur })}
            onClick={() => setAppel(true)}
          >
            <IconeTelephone />
          </button>
        </div>

        <div className={styles.remise}>
          <div className={styles.remiseEntete}>
            <span>{t("remise.libelle")}</span>
            <span>
              {t(remise.destinataireALeCode ? "remise.aLeCode" : "remise.pasLeCode", { nom })}
            </span>
          </div>
          <p className={styles.remiseTexte}>
            {t("remise.debut", { prenom: prenomLivreur })}
            <strong className={styles.code}>{grouperCode(remise.code)}</strong>
            {t("remise.fin", {
              nom,
              minutes: remise.attenteAbsenceMinutes,
              relais: remise.relaisDeRepli,
            })}
          </p>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => setFeuille("partage")}>
            <IconeMessage />
            {nomDestinataire === null
              ? t("partager.titre")
              : t("partager.libelle", { nom: nomDestinataire })}
          </button>
          <button type="button" className={styles.action} onClick={() => setFeuille("adresse")}>
            {t("adresse.libelle")}
          </button>
        </div>

        {appel && (
          <p role="status" className={styles.message}>
            {t("livreur.appelIndisponible", { prenom: prenomLivreur })}
          </p>
        )}

        <a className={styles.devenir} href={urlPlanche("LivreurDevenir")}>
          <span className={styles.devenirIcone}>
            <IconeMoto />
          </span>
          <span className={styles.devenirTextes}>
            <span className={styles.devenirTitre}>{devenir.titre}</span>
            <span className={styles.devenirDetail}>{devenir.detail}</span>
          </span>
          <span className={styles.devenirChevron}>
            <IconeChevronDroite taille={18} />
          </span>
        </a>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <span>
          {t("pied.livraison", {
            prix: formaterMontant(prix.livraison),
            etat: t(prix.payee ? "pied.payee" : "pied.aPayer"),
            part: formaterMontant(prix.partLivreur),
            prenom: prenomLivreur,
          })}
        </span>
        {arrivee.assure ? (
          <span className={styles.assure}>
            <IconeCoche taille={14} trait={2.6} />
            {t("pied.assure")}
          </span>
        ) : (
          <span className={styles.nonAssure}>{t("pied.nonAssure")}</span>
        )}
      </EcranPied>

      {feuille === "partage" && (
        <FeuillePartage
          colisId={livraison.colisId}
          nom={nom}
          telephoneInitial={telephoneDestinataire}
          onFermer={() => setFeuille(null)}
        />
      )}
      {feuille === "adresse" && (
        <FeuilleAdresse colisId={livraison.colisId} onFermer={() => setFeuille(null)} />
      )}
    </div>
  );
}
