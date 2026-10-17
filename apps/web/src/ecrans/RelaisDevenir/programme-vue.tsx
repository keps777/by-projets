import type { colis } from "@afrimove/contrats";
import { EcranCorps, EcranPied, IconeFleche } from "@afrimove/ui";
import { useTranslation } from "react-i18next";
import { urlPlanche } from "@/coquille/planches";
import { EnteteDevenir } from "./entete";
import { formaterMontant } from "./formats";
import styles from "./relais-devenir.module.css";

/** Un chiffre du bandeau : libellé en capitales mono, valeur en Bricolage, détail. */
function Chiffre({
  libelle,
  valeur,
  detail,
  ton,
}: {
  libelle: string;
  valeur: string;
  detail: string;
  ton?: "vert";
}) {
  return (
    <div className={styles.chiffre}>
      <dt className={styles.chiffreLibelle}>{libelle}</dt>
      <dd className={styles.chiffreValeur} {...(ton ? { "data-ton": ton } : {})}>
        {valeur}
      </dd>
      <dd className={styles.chiffreDetail}>{detail}</dd>
    </div>
  );
}

/** Les trois pastilles numérotées de « Comment ça se passe » : ambre, bleu, vert (dans cet ordre). */
const TONS_ETAPES = ["ambre", "bleu", "vert"] as const;

/**
 * Programme prêt : pastille de gain, promesse, trois chiffres, ce qu'il faut, les trois étapes, la mention sans
 * exclusivité, puis le pied (« Plus tard » vers Moi, « Je m'inscris » vers la fiche).
 */
export function ProgrammeVue({ programme }: { programme: colis.ProgrammeRelais }) {
  const { t } = useTranslation("RelaisDevenir");
  const { exemple } = programme;
  return (
    <>
      <EnteteDevenir
        titre={programme.titre}
        sousTitre={programme.detail}
        badge={t("badge", { montant: formaterMontant(programme.partParColis) })}
      />

      <EcranCorps className={styles.corps} data-planche="RelaisDevenir" data-etat="pret">
        <section className={styles.carte}>
          <p className={styles.accroche}>{programme.accroche}</p>
          <p className={styles.deroule}>{programme.deroule}</p>
        </section>

        <dl className={styles.chiffres}>
          <Chiffre
            libelle={t("chiffres.parColis.libelle")}
            valeur={`${formaterMontant(programme.partParColis)} F`}
            detail={t("chiffres.parColis.detail", {
              repris: formaterMontant(programme.partSiRepris),
            })}
          />
          <Chiffre
            libelle={exemple.nom}
            valeur={formaterMontant(exemple.gain)}
            detail={t("chiffres.exemple.detail", { count: exemple.colis })}
            ton="vert"
          />
          <Chiffre
            libelle={t("chiffres.actifs.libelle")}
            valeur={formaterMontant(programme.relaisActifs)}
            detail={t("chiffres.actifs.detail", { count: programme.villes })}
          />
        </dl>

        {programme.prerequis.length > 0 && (
          <section
            className={`${styles.carte} ${styles.carteListe}`}
            aria-labelledby="devenir-prerequis"
          >
            <h2 id="devenir-prerequis" className={styles.titreBloc}>
              {t("prerequis.titre")}
            </h2>
            <ul className={styles.prerequis}>
              {programme.prerequis.map((p) => (
                <li key={p}>
                  <span aria-hidden="true">✓</span> {p}
                </li>
              ))}
            </ul>
          </section>
        )}

        {programme.etapes.length > 0 && (
          <section
            className={`${styles.carte} ${styles.carteListe}`}
            aria-labelledby="devenir-etapes"
          >
            <h2 id="devenir-etapes" className={styles.titreBloc}>
              {t("etapes.titre")}
            </h2>
            <ol className={styles.etapes}>
              {[...programme.etapes]
                .sort((a, b) => a.rang - b.rang)
                .map((e, i) => (
                  <li key={e.rang} className={styles.etape}>
                    <span
                      className={styles.rang}
                      data-ton={TONS_ETAPES[i % TONS_ETAPES.length]}
                      aria-hidden="true"
                    >
                      {e.rang}
                    </span>
                    <span className={styles.etapeTextes}>
                      <span className={styles.etapeTitre}>{e.titre}</span>
                      <span className={styles.etapeDetail}>{e.detail}</span>
                    </span>
                  </li>
                ))}
            </ol>
          </section>
        )}

        <p className={styles.mention}>{programme.mention}</p>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <a className={styles.plusTard} href={urlPlanche("Moi")}>
          {t("actions.plusTard")}
        </a>
        <a className={styles.inscrire} href={urlPlanche("RelaisInscription")}>
          <span className={styles.inscrireTextes}>
            <span className={styles.inscrireTitre}>{t("actions.inscrire")}</span>
            <span className={styles.inscrireDetail}>{t("actions.inscrireDetail")}</span>
          </span>
          <IconeFleche taille={22} trait={2.6} />
        </a>
      </EcranPied>
    </>
  );
}
