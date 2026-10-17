import { colis as api } from "@afrimove/api-client";
import { Bouton, Champ, ChampTelephone, FeuilleModale, IconeCoche } from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./livraison.module.css";

const INDICATIF = "+237";

/** « +237699401822 » -> « 699401822 » ; un numéro d'un autre pays n'est pas proposé. */
export function chiffresNationaux(telephone: string | undefined): string {
  if (telephone === undefined || !telephone.startsWith(INDICATIF)) return "";
  return telephone.slice(INDICATIF.length);
}

/**
 * Feuille « Partager le suivi » : le serveur envoie par SMS un lien qui montre la position du livreur, jamais le code.
 * La planche n'en dessine pas (le contrat demande le numéro du destinataire) ; elle est montée à l'ouverture seulement.
 */
export function FeuillePartage({
  colisId,
  nom,
  telephoneInitial,
  onFermer,
}: {
  colisId: string;
  nom: string;
  telephoneInitial: string;
  onFermer: () => void;
}) {
  const { t } = useTranslation("Livraison");
  const partager = api.usePartagerSuiviLivraison();
  // Tant que la personne n'a rien tapé, le champ montre le numéro du colis (qui peut arriver après l'ouverture).
  const [tape, setSaisie] = useState<string | null>(null);
  const saisie = tape ?? telephoneInitial;
  const [invalide, setInvalide] = useState(false);
  const envoye = partager.data;

  function envoyer() {
    if (partager.isPending) return;
    const chiffres = saisie.replace(/\D/g, "");
    if (!/^\d{9}$/.test(chiffres)) {
      setInvalide(true);
      return;
    }
    setInvalide(false);
    partager.mutate({ colisId, destinataire: `${INDICATIF}${chiffres}` });
  }

  return (
    <FeuilleModale
      ouverte
      onFermer={onFermer}
      titre={t("partager.titre")}
      libelleFermer={t("fermer")}
      ancrage="parent"
      actions={
        envoye !== undefined ? (
          <Bouton libelle={t("fermer")} onClick={onFermer} />
        ) : (
          <Bouton libelle={t("partager.envoyer")} onClick={envoyer} />
        )
      }
    >
      <div className={styles.feuille}>
        {envoye !== undefined ? (
          <p role="status" className={styles.message}>
            <IconeCoche taille={14} trait={2.6} />{" "}
            {t("partager.envoye", { numero: envoye.envoyeA })}
          </p>
        ) : (
          <>
            <ChampTelephone
              label={t("partager.champ", { nom })}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              erreur={invalide ? t("partager.invalide") : undefined}
              valide={/^\d{9}$/.test(saisie.replace(/\D/g, ""))}
            />
            {partager.isError && (
              <p role="alert" className={styles.alerte}>
                {t("partager.echec")}
              </p>
            )}
          </>
        )}
      </div>
    </FeuilleModale>
  );
}

/**
 * Feuille « Changer l'adresse » : la nouvelle adresse est envoyée au serveur, qui prévient le livreur. La planche ne
 * dessine que le bouton.
 */
export function FeuilleAdresse({ colisId, onFermer }: { colisId: string; onFermer: () => void }) {
  const { t } = useTranslation("Livraison");
  const changer = api.useChangerAdresseLivraison();
  const [adresse, setAdresse] = useState("");
  const [vide, setVide] = useState(false);
  const fait = changer.data;

  function valider() {
    if (changer.isPending) return;
    if (adresse.trim() === "") {
      setVide(true);
      return;
    }
    setVide(false);
    changer.mutate({ colisId, adresse: adresse.trim() });
  }

  return (
    <FeuilleModale
      ouverte
      onFermer={onFermer}
      titre={t("adresse.libelle")}
      libelleFermer={t("fermer")}
      ancrage="parent"
      actions={
        fait !== undefined ? (
          <Bouton libelle={t("fermer")} onClick={onFermer} />
        ) : (
          <Bouton libelle={t("adresse.valider")} onClick={valider} />
        )
      }
    >
      <div className={styles.feuille}>
        {fait !== undefined ? (
          <p role="status" className={styles.message}>
            <IconeCoche taille={14} trait={2.6} /> {t("adresse.changee", { adresse: fait.adresse })}
            {fait.livreurPrevenu ? t("adresse.livreurPrevenu") : ""}
          </p>
        ) : (
          <>
            <Champ
              label={t("adresse.champ")}
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              erreur={vide ? t("adresse.vide") : undefined}
              autoComplete="street-address"
            />
            {changer.isError && (
              <p role="alert" className={styles.alerte}>
                {t("adresse.echec")}
              </p>
            )}
          </>
        )}
      </div>
    </FeuilleModale>
  );
}
