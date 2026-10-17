import { ErreurHttp, patron } from "@afrimove/api-client";
import {
  Bouton,
  Champ,
  EcranCorps,
  EcranPied,
  Entete,
  Pastille,
  SelecteurDeroulant,
} from "@afrimove/ui";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import {
  brouillonDepuis,
  CHOIX_AU_DELA,
  CHOIX_GRATUITE,
  CHOIX_RETENUE,
  comptesModifies,
  erreursDuBrouillon,
  estEnregistrable,
  nombreChangements,
  reglesModifiees,
  versReglesModifiables,
  type AuDelaTolerance,
  type Brouillon,
  type GratuiteAnnulation,
  type Operateur,
  type Regles,
  type RetenueAnnulation,
} from "./brouillon";
import { FeuillesSignature, type Etape } from "./Feuilles";
import { formaterMontant, lireMontant, normaliserNumero } from "./formats";
import { IconeCadenas } from "./icones";
import styles from "./configregles.module.css";

const CODE_SMS_INCORRECT = "CODE_SMS_INCORRECT";

interface Props {
  regles: Regles;
  /** Nombre de gares de l'agence (badge « 3 GARES ») ; `null` tant qu'on ne le connaît pas. */
  gares: number | null;
}

function Bloc({
  titre,
  actif = false,
  children,
}: {
  titre: string;
  actif?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.bloc} ${actif ? styles.blocActif : ""}`} aria-label={titre}>
      <h2 className={styles.etiquette}>{titre}</h2>
      {children}
    </section>
  );
}

/**
 * Le brouillon des règles : annulation, caisse, comptes MoMo marchands. Tout ce qui est changé ici reste dans l'écran
 * jusqu'à « Enregistrer · mon PIN », qui demande le PIN, envoie les règles (`useEnregistrerRegles`) et, pour chaque
 * compte MoMo retapé, le SMS à l'ancien numéro puis le changement de compte (`useDemanderConfirmationCompteMomo`,
 * `useChangerCompteMomo`), avant de revenir aux réglages. « Annuler » jette le brouillon : rien n'a quitté l'écran.
 */
export function EditeurRegles({ regles, gares }: Props) {
  const { t } = useTranslation("ConfigRegles");
  const navigate = useNavigate();
  const enregistrer = patron.useEnregistrerRegles();
  const demander = patron.useDemanderConfirmationCompteMomo();
  const changer = patron.useChangerCompteMomo();
  const signer = patron.useSignaturePin();

  // Les règles au moment de l'ouverture : on compare le brouillon à elles, même si l'API les recharge entre-temps
  // (une règle déjà enregistrée ne fait pas disparaître le compte MoMo qui attend encore son SMS).
  const [base] = useState(regles);
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonDepuis(regles));
  const [tentative, setTentative] = useState(false);
  const [etape, setEtape] = useState<Etape>({ type: "fermee" });
  const [envoyeA, setEnvoyeA] = useState<Partial<Record<Operateur, string>>>({});
  const [faits, setFaits] = useState<readonly Operateur[]>([]);
  const [codeFaux, setCodeFaux] = useState(false);
  const [echec, setEchec] = useState(false);

  const erreurs = erreursDuBrouillon(brouillon, base);
  const changements = nombreChangements(brouillon, base);
  const accueil = urlPlanche("Config");

  function maj<K extends keyof Brouillon>(cle: K, valeur: Brouillon[K]) {
    setBrouillon((b) => ({ ...b, [cle]: valeur }));
  }

  function enregistrerLesRegles() {
    if (!estEnregistrable(erreurs)) {
      setTentative(true);
      return;
    }
    setTentative(false);
    // Rien n'a changé : il n'y a rien à signer, on revient aux réglages.
    if (changements === 0) {
      void navigate(accueil);
      return;
    }
    setEchec(false);
    setCodeFaux(false);
    setFaits([]);
    setEnvoyeA({});
    setEtape({ type: "pin" });
  }

  /** Après un compte changé : le suivant qui attend son code, ou le retour aux réglages. */
  function suite(fait: Operateur) {
    const deja = [...faits, fait];
    setFaits(deja);
    const prochain = comptesModifies(brouillon, base).find((o) => !deja.includes(o));
    setCodeFaux(false);
    setEchec(false);
    if (prochain === undefined) {
      setEtape({ type: "fermee" });
      void navigate(accueil);
    } else {
      setEtape({ type: "code", operateur: prochain });
    }
  }

  /**
   * Signe et enregistre les règles, puis fait partir le SMS vers l'ancien numéro de chaque compte retapé. `false` :
   * PIN refusé.
   */
  async function signerEtEnregistrer(pin: string): Promise<boolean> {
    const signature = signer(pin);
    const comptes = comptesModifies(brouillon, base);
    try {
      if (reglesModifiees(brouillon, base).length > 0) {
        await enregistrer.mutateAsync({
          regles: versReglesModifiables(brouillon, base),
          signature,
        });
      }
      const envois: Partial<Record<Operateur, string>> = {};
      for (const operateur of comptes) {
        const confirmation = await demander.mutateAsync({
          operateur,
          nouveauNumero: normaliserNumero(brouillon.comptes[operateur])!,
          signature,
        });
        envois[operateur] = confirmation.envoyeA;
      }
      setEnvoyeA(envois);
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) return false;
      setEchec(true);
      throw erreur;
    }
    const premier = comptes[0];
    if (premier === undefined) {
      setEtape({ type: "fermee" });
      void navigate(accueil);
    } else {
      setEtape({ type: "code", operateur: premier });
    }
    return true;
  }

  /** Change le compte avec le code SMS déjà saisi et un PIN neuf. `false` : PIN refusé. */
  async function signerLeCompte(pin: string): Promise<boolean> {
    if (etape.type !== "pinCompte") return false;
    const { operateur, code } = etape;
    try {
      await changer.mutateAsync({
        operateur,
        nouveauNumero: normaliserNumero(brouillon.comptes[operateur])!,
        codeSms: code,
        signature: signer(pin),
      });
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 403) {
        if (erreur.code === CODE_SMS_INCORRECT) {
          // Le code, pas le PIN : on redemande le code, sans compter d'essai de PIN.
          setCodeFaux(true);
          setEtape({ type: "code", operateur });
          return true;
        }
        return false;
      }
      setEchec(true);
      throw erreur;
    }
    suite(operateur);
    return true;
  }

  return (
    <div className={styles.racine} data-planche="ConfigRegles">
      <Entete
        className={styles.entete}
        titre={t("entete.titre")}
        sousTitre={t("entete.sousTitre")}
        retour={{ libelle: t("entete.retour"), href: accueil }}
        droite={
          gares === null ? undefined : (
            <Pastille statut="modifier" ton="bleu" libelle={t("entete.gares", { count: gares })} />
          )
        }
      />

      <EcranCorps className={styles.corps}>
        <Bloc titre={t("annulation.titre")} actif>
          <div className={styles.grille}>
            <SelecteurDeroulant
              variante="config"
              label={t("annulation.gratuite.libelle")}
              value={brouillon.gratuiteJusqua}
              onChange={(e) => maj("gratuiteJusqua", e.target.value as GratuiteAnnulation)}
              options={CHOIX_GRATUITE.map((valeur) => ({
                valeur,
                libelle: t(`annulation.gratuite.choix.${valeur}`),
              }))}
            />
            <SelecteurDeroulant
              variante="config"
              label={t("annulation.retenue.libelle")}
              value={brouillon.retenue}
              onChange={(e) => maj("retenue", e.target.value as RetenueAnnulation)}
              options={CHOIX_RETENUE.map((valeur) => ({
                valeur,
                libelle: t(`annulation.retenue.choix.${valeur}`, {
                  vip: base.annulation.retenueParClassePct.vip,
                  classique: base.annulation.retenueParClassePct.classique,
                }),
              }))}
            />
          </div>
          <p className={styles.note}>{t("annulation.note")}</p>
        </Bloc>

        <Bloc titre={t("caisse.titre")}>
          <div className={styles.grille}>
            <Champ
              variante="config"
              mono
              label={t("caisse.tolerance")}
              inputMode="numeric"
              autoComplete="off"
              value={
                brouillon.toleranceEcart === null ? "" : formaterMontant(brouillon.toleranceEcart)
              }
              {...(tentative && erreurs.tolerance ? { erreur: t("caisse.erreurTolerance") } : {})}
              onChange={(e) => maj("toleranceEcart", lireMontant(e.target.value))}
            />
            <SelecteurDeroulant
              variante="config"
              label={t("caisse.auDela.libelle")}
              value={brouillon.auDela}
              onChange={(e) => maj("auDela", e.target.value as AuDelaTolerance)}
              options={CHOIX_AU_DELA.map((valeur) => ({
                valeur,
                libelle: t(`caisse.auDela.choix.${valeur}`),
              }))}
            />
          </div>
        </Bloc>

        <Bloc titre={t("momo.titre")}>
          <div className={styles.grille}>
            {(["mtn", "orange"] as const).map((operateur) => (
              <Champ
                key={operateur}
                variante="config"
                mono
                label={t(`momo.${operateur}`)}
                autoComplete="off"
                inputMode="tel"
                value={brouillon.comptes[operateur]}
                {...(tentative && erreurs.comptes.includes(operateur)
                  ? { erreur: t("momo.erreurNumero") }
                  : {})}
                onChange={(e) =>
                  setBrouillon((b) => ({
                    ...b,
                    comptes: { ...b.comptes, [operateur]: e.target.value },
                  }))
                }
              />
            ))}
          </div>
          <p className={styles.note}>{t("momo.note")}</p>
        </Bloc>

        <p className={styles.historique}>{t("historique")}</p>
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <div className={styles.actions}>
          <Bouton
            variante="secondaire"
            className={styles.annuler}
            href={accueil}
            libelle={t("actions.annuler")}
          />
          <Bouton
            className={styles.enregistrer}
            libelle={t("actions.enregistrer")}
            sousLibelle={
              gares === null ? t("actions.detail") : t("actions.detailGares", { count: gares })
            }
            icone={<IconeCadenas />}
            onClick={enregistrerLesRegles}
          />
        </div>
      </EcranPied>

      <FeuillesSignature
        etape={etape}
        onFermer={() => setEtape({ type: "fermee" })}
        resume={t("nbChangements", { count: changements })}
        envoyeA={envoyeA}
        onSigner={signerEtEnregistrer}
        onCode={(code) => {
          if (etape.type === "code")
            setEtape({ type: "pinCompte", operateur: etape.operateur, code });
        }}
        onSignerCompte={signerLeCompte}
        codeFaux={codeFaux}
        echec={echec}
      />
    </div>
  );
}
