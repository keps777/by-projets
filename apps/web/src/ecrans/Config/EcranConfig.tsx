import { patron } from "@afrimove/api-client";
import { Bouton, EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import styles from "./config.module.css";
import type { Role } from "./formats";
import { EquipeVue, LignesVue, ReglesVue, type CleInterrupteur } from "./sections";
import { FeuilleSignature, type Bascule } from "./signature";

/**
 * Écran Réglages du patron (AM-120, planche Config.dc.html) : lignes et tarifs, équipe, règles, accès aux modules.
 *
 * Les données viennent de `useReglages` (accueil des réglages) et de `useEquipe` (la liste de l'équipe du rôle
 * choisi : l'aperçu de l'accueil n'en montre que trois). Les liens ouvrent les écrans de modification ; les quatre
 * boutons de rôle filtrent la liste sur place. Les deux interrupteurs des règles changent la règle sur place, signés
 * par le PIN du patron.
 */
export function EcranConfig() {
  const { t } = useTranslation("Config");
  const reglages = patron.useReglages();
  const [choisi, setChoisi] = useState<Role | null>(null);
  const [bascule, setBascule] = useState<Bascule | null>(null);

  // Le premier rôle de l'accueil (les guichetiers) est celui de la planche ; la liste suit le rôle affiché.
  const role: Role = choisi ?? reglages.data?.equipe.effectifs[0]?.role ?? "guichetier";
  const liste = patron.useEquipe({ role });

  const donnees = reglages.data;
  const libelles: Record<CleInterrupteur, string> = {
    cadence: t("regles.cadence"),
    fraisService: t("regles.fraisService", {
      montant: donnees?.regles.fraisService.montant ?? 0,
    }),
  };

  return (
    <div className={styles.ecran}>
      <Entete
        titre={t("entete.titre")}
        sousTitre={t("entete.sousTitre")}
        retour={{ libelle: t("entete.retour"), href: urlPlanche("Patron") }}
        droite={
          <a className={styles.modules} href={urlPlanche("Modules")}>
            {t("entete.modules")}
          </a>
        }
      />

      <EcranCorps
        className={styles.corps}
        data-planche="Config"
        data-etat={donnees ? "pret" : reglages.isError ? "erreur" : "chargement"}
        aria-busy={reglages.isPending}
      >
        {reglages.isPending && (
          <div role="status" aria-label={t("etats.chargement")} className={styles.chargement}>
            <span className={`${styles.squeletteBloc} ${styles.squeletteLignes} am-pulse`} />
            <span className={`${styles.squeletteBloc} ${styles.squeletteEquipe} am-pulse`} />
          </div>
        )}

        {reglages.isError && (
          <div className={styles.etat}>
            <div className={styles.bandeauEtat} role="alert">
              <span className={styles.point} />
              <p>{t("etats.erreur")}</p>
            </div>
            <Bouton
              variante="secondaire"
              libelle={t("etats.reessayer")}
              onClick={() => void reglages.refetch()}
            />
          </div>
        )}

        {donnees && (
          <>
            <LignesVue lignes={donnees.lignes} />
            <div className={styles.carte}>
              <EquipeVue equipe={donnees.equipe} role={role} onRole={setChoisi} liste={liste} />
              <ReglesVue
                regles={donnees.regles}
                onBascule={(cle, valeur) => setBascule({ cle, valeur })}
              />
            </div>
          </>
        )}
      </EcranCorps>

      <EcranPied className={styles.piedEcran}>
        <p>{t("pied")}</p>
      </EcranPied>

      {donnees && (
        <FeuilleSignature
          regles={donnees.regles}
          bascule={bascule}
          libelle={bascule ? libelles[bascule.cle] : ""}
          onFermer={() => setBascule(null)}
        />
      )}
    </div>
  );
}

export default EcranConfig;
