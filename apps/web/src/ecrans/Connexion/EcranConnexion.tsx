import { ErreurHttp, voyageur } from "@afrimove/api-client";
import type { voyageur as contrats } from "@afrimove/contrats";
import { BoutonIcone, IconeCoche, IconeRetour } from "@afrimove/ui";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useHorloge } from "@/coquille/horloge";
import { useModeDemo, useScenario } from "@/coquille/parametres";
import { urlPlanche } from "@/coquille/planches";
import { useSession } from "@/coquille/session";
import { DEMO_CONNEXION, SCENARIO_CONNEXION } from "./demo";
import { DrapeauCameroun, IconeTelephoneSimple, IconeWhatsApp } from "./icones";
import {
  INDICATIF,
  chiffresNational,
  formaterDelai,
  formaterNational,
  numeroValide,
  versInternational,
} from "./telephone";
import { useWebOtp } from "./webotp";
import styles from "./connexion.module.css";

/** Le contrat n'accepte que des codes de 4 chiffres (`SchemaVerificationCode`). */
export const LONGUEUR_CODE = 4;
/** Essais permis sur un même code, puis attente. */
export const ESSAIS_MAX = 5;
/** Attente après 5 essais ratés quand le serveur n'impose pas la sienne (429 + `reessayerApresMs`). */
export const ATTENTE_APRES_ESSAIS_S = 60;

type Canal = contrats.CanalCode;

type Erreur =
  | { genre: "telephone" }
  | { genre: "envoi" }
  | { genre: "codeIncomplet" }
  | { genre: "codeFaux"; restants: number }
  | { genre: "verification" };

/** Un code demandé : à qui, par quel canal, et quand le renvoi sera permis (horloge de l'application, en ms). */
interface Demande {
  id: number;
  telephone: string;
  canal: Canal;
  renvoiA: number;
}

/** Faire se redessiner l'écran chaque seconde (comptes à rebours) ; l'heure vient de l'horloge injectable. */
function useTicSeconde(): void {
  const [, setTic] = useState(0);
  useEffect(() => {
    const minuterie = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(minuterie);
  }, []);
}

/** Refus définitif du code par le serveur (mauvais, expiré) : une erreur 4xx hors limitation de débit et délai. */
function codeRefuse(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurHttp &&
    erreur.statut >= 400 &&
    erreur.statut < 500 &&
    erreur.statut !== 408 &&
    erreur.statut !== 429
  );
}

/**
 * Planche « Connexion » (AM-021, route /connexion) : le numéro de téléphone est le compte. Un code à 4 chiffres arrive
 * par SMS (ou par WhatsApp) et se remplit tout seul quand le navigateur sait lire le SMS ; pas de mot de passe, le
 * compte est créé par le serveur au premier code valide. « Sans internet » mène à l'écran USSD.
 */
export function EcranConnexion() {
  const { t } = useTranslation("Connexion");
  const navigate = useNavigate();
  const horloge = useHorloge();
  const { ouvrirSession } = useSession();
  const modeDemo = useModeDemo();
  const scenario = useScenario();
  const demoActive = modeDemo && scenario === SCENARIO_CONNEXION;
  const demanderCode = voyageur.useDemanderCode();
  const verifierCode = voyageur.useVerifierCode();
  useTicSeconde();

  const idChamps = useId();
  const idLibelle = `${idChamps}-libelle`;
  const idTitreCode = `${idChamps}-titre-code`;
  const champTelephone = useRef<HTMLInputElement>(null);
  const champCode = useRef<HTMLInputElement>(null);

  const [numero, setNumero] = useState<string>(demoActive ? DEMO_CONNEXION.numero : "");
  const [code, setCode] = useState<string>(demoActive ? DEMO_CONNEXION.code : "");
  const [demande, setDemande] = useState<Demande | null>(null);
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [essais, setEssais] = useState(0);
  const [bloqueJusqua, setBloqueJusqua] = useState<number | null>(null);
  const occupe = useRef(false);
  const numeroDemande = useRef(0);
  const focuserCode = useRef(false);

  const maintenant = horloge.maintenant().getTime();
  const restantRenvoi = demande ? Math.max(0, Math.ceil((demande.renvoiA - maintenant) / 1000)) : 0;
  const attente =
    bloqueJusqua === null ? 0 : Math.max(0, Math.ceil((bloqueJusqua - maintenant) / 1000));
  const bloque = attente > 0;
  const enCours = demanderCode.isPending || verifierCode.isPending;
  const valide = numeroValide(numero);

  /** Demande un code (SMS par défaut). Renvoie vrai si le serveur l'a envoyé. */
  async function demander(
    canal: Canal,
    telephoneNational: string,
    options: { focus: boolean; garderCode?: boolean },
  ) {
    if (occupe.current) return false;
    occupe.current = true;
    setErreur(null);
    try {
      const reponse = await demanderCode.mutateAsync({
        telephone: versInternational(telephoneNational),
        canal,
      });
      numeroDemande.current += 1;
      focuserCode.current = options.focus;
      setDemande({
        id: numeroDemande.current,
        telephone: reponse.telephone,
        canal: reponse.canal,
        renvoiA: horloge.maintenant().getTime() + reponse.renvoiDansSecondes * 1000,
      });
      setEssais(0);
      if (!options.garderCode) setCode("");
      return true;
    } catch {
      setErreur({ genre: "envoi" });
      return false;
    } finally {
      occupe.current = false;
    }
  }

  // Planche de démonstration : le code a déjà été demandé, le serveur de démonstration donne le compte à rebours.
  const demoLancee = useRef(false);
  useEffect(() => {
    if (!demoActive || demoLancee.current) return;
    demoLancee.current = true;
    void demander("sms", DEMO_CONNEXION.numero, { focus: false, garderCode: true });
    // Une seule fois, au montage.
  }, [demoActive]);

  // Après une demande faite par la personne, le curseur passe dans les cases du code.
  useEffect(() => {
    if (demande && focuserCode.current) {
      focuserCode.current = false;
      champCode.current?.focus();
    }
  }, [demande]);

  // Le SMS arrive : le navigateur (WebOTP) donne le code, les cases se remplissent seules.
  useWebOtp(demande?.canal === "sms" && !bloque, demande?.id, LONGUEUR_CODE, setCode);

  function changerNumero(evenement: ChangeEvent<HTMLInputElement>) {
    const suivant = chiffresNational(evenement.target.value);
    setNumero(suivant);
    setErreur(null);
    // Le code demandé était pour un autre numéro : on repart de zéro.
    if (demande && versInternational(suivant) !== demande.telephone) {
      setDemande(null);
      setCode("");
      setEssais(0);
    }
  }

  function changerCode(evenement: ChangeEvent<HTMLInputElement>) {
    setCode(evenement.target.value.replace(/\D/g, "").slice(0, LONGUEUR_CODE));
    setErreur(null);
  }

  function telephoneInvalide() {
    setErreur({ genre: "telephone" });
    champTelephone.current?.focus();
  }

  async function demanderParCanal(canal: Canal) {
    if (!valide) return telephoneInvalide();
    await demander(canal, numero, { focus: true });
  }

  function bloquer(secondes: number) {
    setBloqueJusqua(horloge.maintenant().getTime() + secondes * 1000);
    setEssais(0);
    setCode("");
    setErreur(null);
  }

  async function verifier() {
    if (!demande) return;
    if (code.length !== LONGUEUR_CODE) {
      setErreur({ genre: "codeIncomplet" });
      champCode.current?.focus();
      return;
    }
    if (occupe.current) return;
    occupe.current = true;
    setErreur(null);
    try {
      await verifierCode.mutateAsync({ telephone: demande.telephone, code });
      ouvrirSession("voyageur");
      void navigate(urlPlanche("Tuto"));
    } catch (echec) {
      if (echec instanceof ErreurHttp && echec.statut === 429) {
        bloquer(Math.ceil((echec.reessayerApresMs ?? ATTENTE_APRES_ESSAIS_S * 1000) / 1000));
      } else if (codeRefuse(echec)) {
        const total = essais + 1;
        if (total >= ESSAIS_MAX) {
          bloquer(ATTENTE_APRES_ESSAIS_S);
        } else {
          setEssais(total);
          setCode("");
          setErreur({ genre: "codeFaux", restants: ESSAIS_MAX - total });
          champCode.current?.focus();
        }
      } else {
        setErreur({ genre: "verification" });
      }
    } finally {
      occupe.current = false;
    }
  }

  /** « Continuer » : sans code demandé il envoie le code, sinon il le vérifie. */
  function continuer(evenement?: FormEvent) {
    evenement?.preventDefault();
    if (enCours || bloque) return;
    if (!demande) void demanderParCanal("sms");
    else void verifier();
  }

  const actif = code.length > 0 ? code.length - 1 : 0;
  const canal = demande?.canal === "whatsapp" ? "whatsapp" : "sms";
  const messageTelephone =
    erreur?.genre === "telephone"
      ? t("erreurs.telephone")
      : erreur?.genre === "envoi"
        ? t("erreurs.envoi")
        : null;
  const messageCode = bloque
    ? t("erreurs.tropEssais", { delai: formaterDelai(attente) })
    : erreur?.genre === "codeIncomplet"
      ? t("erreurs.codeIncomplet")
      : erreur?.genre === "codeFaux"
        ? t("erreurs.codeFaux", { count: erreur.restants })
        : erreur?.genre === "verification"
          ? t("erreurs.verification")
          : null;

  return (
    <form className={styles.ecran} data-planche="Connexion" onSubmit={continuer} noValidate>
      <header className={styles.haut}>
        <BoutonIcone
          href={urlPlanche("Splash")}
          aria-label={t("retour")}
          icone={<IconeRetour taille={20} />}
        />
        <span className={styles.espace} />
        <span className={styles.progression} aria-hidden="true">
          <span className={styles.segment} data-fait="true" />
          <span className={styles.segment} data-fait="true" />
          <span className={styles.segment} />
        </span>
      </header>

      <main className={styles.corps}>
        <div className={styles.intro}>
          <span className={styles.etape}>{t("etape")}</span>
          <h1 className={styles.titre}>
            {t("titre.ligne1")}
            <br />
            {t("titre.ligne2")}
          </h1>
          <p className={styles.explication}>{t("explication")}</p>
        </div>

        <div className={styles.telephone}>
          <label htmlFor={`${idChamps}-tel`} className={styles.libelle} id={idLibelle}>
            {t("telephone.libelle")}
          </label>
          <span className={styles.champ} data-erreur={messageTelephone !== null}>
            <span className={styles.indicatif}>
              <DrapeauCameroun />
              {INDICATIF}
            </span>
            <input
              ref={champTelephone}
              id={`${idChamps}-tel`}
              className={styles.numero}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus={!demoActive}
              aria-labelledby={idLibelle}
              aria-invalid={messageTelephone !== null}
              value={formaterNational(numero)}
              onChange={changerNumero}
            />
            {valide && (
              <span className={styles.valide} data-testid="numero-valide">
                <IconeCoche taille={13} trait={3} />
              </span>
            )}
          </span>
          {messageTelephone && (
            <p className={styles.erreur} role="alert">
              {messageTelephone}
            </p>
          )}
        </div>

        <section className={styles.carteCode} aria-labelledby={idTitreCode}>
          <div className={styles.carteTete}>
            <span className={styles.etiquette} id={idTitreCode}>
              {t("code.titre", { canal: t(`code.canaux.${canal}`) })}
            </span>
            {demande && restantRenvoi > 0 && (
              <span className={styles.renvoi}>
                {t("code.renvoi", { delai: formaterDelai(restantRenvoi) })}
              </span>
            )}
            {demande && restantRenvoi === 0 && !bloque && (
              <button
                type="button"
                className={styles.renvoyer}
                disabled={enCours}
                onClick={() => void demanderParCanal(demande.canal)}
              >
                {t("code.renvoyer")}
              </button>
            )}
          </div>
          <div className={styles.cases}>
            <input
              ref={champCode}
              className={styles.saisieCode}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              aria-labelledby={idTitreCode}
              aria-invalid={messageCode !== null}
              disabled={!demande || bloque}
              value={code}
              onChange={changerCode}
            />
            {Array.from({ length: LONGUEUR_CODE }, (_, i) => (
              <span
                key={i}
                className={styles.case}
                aria-hidden="true"
                data-etat={
                  demande && !bloque && i === actif
                    ? "actif"
                    : code[i] !== undefined
                      ? "plein"
                      : "vide"
                }
              >
                {code[i] ?? "_"}
              </span>
            ))}
          </div>
          {messageCode && (
            <p className={styles.erreur} role="alert">
              {messageCode}
            </p>
          )}
          <span className={styles.aide}>{t("code.aide")}</span>
        </section>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.continuer}
            aria-busy={enCours}
            data-chargement={enCours}
          >
            {t("actions.continuer")}
          </button>
          <div className={styles.alternatives}>
            <button
              type="button"
              className={styles.alternative}
              aria-busy={demanderCode.isPending}
              onClick={() => {
                if (!enCours && !bloque) void demanderParCanal("whatsapp");
              }}
            >
              <IconeWhatsApp />
              {t("actions.whatsapp")}
            </button>
            <a href={urlPlanche("USSD")} className={styles.alternative}>
              <IconeTelephoneSimple />
              {t("actions.ussd")}
            </a>
          </div>
        </div>
      </main>

      <p className={styles.mentions}>{t("mentions")}</p>
    </form>
  );
}
