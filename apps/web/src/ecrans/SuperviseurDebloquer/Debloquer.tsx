import { Bouton, EcranCorps, EcranPied, Entete, IconeCoche, Pastille } from "@afrimove/ui";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import styles from "./superviseur-debloquer.module.css";
import { FeuillePin, type Appareil, type Option } from "./FeuillePin";
import {
  cashCourt,
  codeGuichet,
  dureeHorsLigne,
  fragmentsConstat,
  heureDouala,
  jourRelatif,
} from "./formats";
import { IconeCadenas } from "./icones";

/**
 * Session de caisse que « Synchroniser · mon PIN » ouvre ensuite (SuperviseurValider). Le contrat de l'appareil ne
 * porte pas la session du guichet : c'est celle de la planche en attendant (voir le rapport du ticket).
 */
export const SESSION_A_VALIDER = "session-k-dla-270105-2-1";

function Tuile({
  libelle,
  valeur,
  detail,
  ton,
  premiere = false,
}: {
  libelle: string;
  valeur: string;
  detail: string;
  ton?: "vert" | "rouge";
  premiere?: boolean;
}) {
  return (
    <div className={styles.tuile}>
      <span className={styles.tuileLibelle}>{libelle}</span>
      <span
        className={premiere ? styles.tuileValeurGrande : styles.tuileValeur}
        {...(ton ? { "data-ton": ton } : {})}
      >
        {valeur}
      </span>
      <span className={styles.tuileDetail}>{detail}</span>
    </div>
  );
}

/**
 * L'appareil à débloquer : la règle des 12 h, ce qui attend sur le téléphone, le diagnostic, puis les trois options
 * dans l'ordre. Chaque option se fait avec le PIN du superviseur (feuille `FeuillePin`) ; la planche n'a pas de
 * clavier, il n'apparaît qu'au geste.
 */
export function Debloquer({ appareil }: { appareil: Appareil }) {
  const { t } = useTranslation("SuperviseurDebloquer");
  const navigate = useNavigate();
  const maintenant = useMaintenant();
  const [option, setOption] = useState<Option | null>(null);

  const { enAttente } = appareil;
  const bloque = appareil.etat === "bloque";
  const trous = enAttente.plage.trous.length;
  const plageDetail = {
    debut: enAttente.plage.debut,
    fin: enAttente.plage.fin,
  };
  const sync = jourRelatif(appareil.derniereSyncA, maintenant);
  const heureSync = heureDouala(appareil.derniereSyncA);
  const quand =
    sync.jour === "date"
      ? t("quand.date", { date: sync.date, heure: heureSync })
      : t(`quand.${sync.jour}`, { heure: heureSync });

  const urlValider = urlPlanche("SuperviseurValider", { sessionId: SESSION_A_VALIDER });

  /** « Synchroniser · mon PIN » : l'option 1 (synchroniser via mon téléphone), avec le PIN. */
  function surPrincipal(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    setOption("synchroniser");
  }

  function apresDeblocage(choisie: Option) {
    setOption(null);
    void navigate(choisie === "synchroniser" ? urlValider : urlPlanche("Superviseur"));
  }

  const titreOption = (code: Option) => t(`queFaire.options.${code}.titre`);

  return (
    <>
      <Entete
        titre={t(`titre.${appareil.etat}`)}
        sousTitre={t("sousTitre", {
          rang: appareil.appareil.guichetRang,
          code: appareil.appareil.code,
          duree: dureeHorsLigne(appareil.horsLigneMinutes),
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }}
        droite={
          appareil.etat === "bloque" ? (
            <Pastille statut="bloque" />
          ) : appareil.etat === "en_ligne" ? (
            <Pastille statut="sync" />
          ) : (
            <Pastille statut="active" libelle={t("badge.debloque")} />
          )
        }
      />

      <EcranCorps className={styles.corps} data-planche="SuperviseurDebloquer" data-etat="pret">
        <div className={styles.regle}>
          <span className={styles.regleTitre}>
            {t("regle.libelle", { limite: appareil.limiteHeures })}
          </span>
          <span className={styles.regleDetail}>
            {t("regle.detail", {
              quand,
              ventes: t("nombre.ventes", { count: enAttente.ventes }),
              colis: t("nombre.colis", { count: enAttente.colis }),
            })}
          </span>
        </div>

        <div className={styles.tuiles}>
          <Tuile
            premiere
            libelle={t("attente.libelle")}
            valeur={String(enAttente.ventes)}
            detail={t("attente.detail", { count: enAttente.ventes, colis: enAttente.colis })}
          />
          <Tuile
            libelle={t("attente.cash.libelle")}
            valeur={cashCourt(enAttente.cash)}
            detail={t("attente.cash.detail")}
          />
          <Tuile
            libelle={t("attente.plage.libelle")}
            valeur={trous === 0 ? t("attente.plage.ok") : String(trous)}
            detail={
              trous === 0
                ? t("attente.plage.sansTrou", plageDetail)
                : t("attente.plage.trous", { ...plageDetail, count: trous })
            }
            ton={trous === 0 ? "vert" : "rouge"}
          />
        </div>

        <div className={styles.pourquoi}>
          <div className={styles.pourquoiTitre}>
            <span>{t("pourquoi.titre")}</span>
          </div>
          {appareil.diagnostics.map((diagnostic) => (
            <div key={diagnostic.constat} className={styles.constat}>
              <span
                className={styles.marque}
                data-ton={diagnostic.niveau === "alerte" ? "rouge" : "vert"}
                aria-hidden="true"
              >
                {diagnostic.niveau === "alerte" ? "!" : <IconeCoche taille={10} trait={3.5} />}
              </span>
              <span>
                {fragmentsConstat(diagnostic.constat).map((fragment) =>
                  fragment.gras ? (
                    <strong key={fragment.texte}>{fragment.texte}</strong>
                  ) : (
                    fragment.texte
                  ),
                )}
              </span>
            </div>
          ))}
        </div>

        {bloque ? (
          <>
            <div className={styles.options}>
              <span className={styles.etiquette}>{t("queFaire.titre")}</span>
              {appareil.options.map((o) => (
                <button
                  key={o.option}
                  type="button"
                  className={styles.option}
                  data-recommande={o.recommande ? "true" : "false"}
                  {...(o.recommande ? { "aria-pressed": true } : {})}
                  onClick={() => setOption(o.option)}
                >
                  <span className={styles.rang}>{o.rang}</span>
                  <span className={styles.optionTextes}>
                    <span className={styles.optionTitre}>{titreOption(o.option)}</span>
                    <span className={styles.optionDetail}>
                      {t(`queFaire.options.${o.option}.detail`, { count: enAttente.ventes })}
                    </span>
                  </span>
                  {o.recommande ? (
                    <span className={styles.recommande}>{t("queFaire.recommande")}</span>
                  ) : (
                    <span />
                  )}
                </button>
              ))}
            </div>
            {appareil.rappelSupport ? (
              <span className={styles.rappel}>
                {t("rappel", { guichet: codeGuichet(appareil.appareil.code) })}
              </span>
            ) : null}
          </>
        ) : null}
      </EcranCorps>

      <EcranPied className={styles.pied} data-seul={bloque ? "false" : "true"}>
        <Bouton
          variante="secondaire"
          className={styles.plusTard}
          href={urlPlanche("Superviseur")}
          libelle={t("actions.plusTard")}
        />
        {bloque ? (
          <Bouton
            variante="assistant"
            className={styles.principal}
            href={urlValider}
            libelle={t("actions.synchroniser.libelle")}
            sousLibelle={t("actions.synchroniser.detail", { rang: appareil.appareil.guichetRang })}
            icone={<IconeCadenas />}
            onClick={surPrincipal}
          />
        ) : null}
      </EcranPied>

      {option ? (
        <FeuillePin
          appareilId={appareil.appareil.id}
          option={option}
          titre={titreOption(option)}
          onFermer={() => setOption(null)}
          onDebloque={apresDeblocage}
        />
      ) : null}
    </>
  );
}
