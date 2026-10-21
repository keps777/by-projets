import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ErreurAgent,
  ROLES_AGENT,
  connecterParPin,
  demanderCodeDirection,
  enrolerAppareil,
  espaceDe,
  lireAppareilEnrole,
  lireMoi,
  memoriserEnrolement,
  memoriserJeton,
  provisionnerVente,
  roleAgent,
  verifierCodeDirection,
  type AppareilEnrole,
  type DefiDirection,
  type JetonAgent,
  type OptionsAgent,
} from "@/agent";
import { urlBaseApi } from "@/agent/mode";
import { ACCUEIL_ESPACE } from "@/coquille/roles";
import { useSession } from "@/coquille/session";
import {
  INDICATIF,
  chiffresNational,
  formaterDelai,
  formaterNational,
  numeroValide,
  versInternational,
} from "@/ecrans/Connexion/telephone";
import styles from "./connexion-agent.module.css";

/** Le serveur n'accepte que des PIN et des codes de 6 chiffres (`auth.dto.ts`). */
export const LONGUEUR_PIN = 6;
export const LONGUEUR_CODE = 6;

/**
 * Rôles qui vendent des billets depuis le téléphone du guichet ou du bus : ils ne s'ouvrent que sur un téléphone
 * enrôlé (le moteur de vente a besoin de l'identité du téléphone et de sa plage de numéros).
 */
export const ROLES_SUR_APPAREIL: readonly string[] = ["guichetier", "convoyeur", "chauffeur"];

type Etape = "role" | "enrolement" | "identifiants" | "code";

type Erreur =
  | { cle: "role" | "telephone" | "pin" | "motDePasse" | "code" | "codeEnrolement" }
  | { cle: "identifiants" | "codeFaux" | "reseau" | "sansEspace" | "inattendue" }
  | { cle: "enrolementInconnu" | "enrolementExpire" }
  | { cle: "bloque" | "tropDemandes"; delai: string };

type Contexte = "connexion" | "code" | "enrolement";

/** Traduit une réponse de l'API (ou son absence) en message pour la personne. */
export function erreurDe(echec: unknown, contexte: Contexte): Erreur {
  if (!(echec instanceof ErreurAgent)) return { cle: "inattendue" };
  const s = echec.statut;
  if (s === 0 || s >= 500) return { cle: "reseau" };
  if (s === 423)
    return { cle: "bloque", delai: formaterDelai((echec.reessayerApresMs ?? 900_000) / 1000) };
  if (s === 429) {
    return { cle: "tropDemandes", delai: formaterDelai((echec.reessayerApresMs ?? 60_000) / 1000) };
  }
  if (contexte === "enrolement") {
    if (s === 410) return { cle: "enrolementExpire" };
    if (s === 404) return { cle: "enrolementInconnu" };
    if (s === 422 || s === 400) return { cle: "codeEnrolement" };
    return { cle: "inattendue" };
  }
  if (contexte === "code") return { cle: "codeFaux" };
  if (s === 400 || s === 401 || s === 403 || s === 422) return { cle: "identifiants" };
  return { cle: "inattendue" };
}

interface Props {
  /** Racine de l'API ; sinon `VITE_API_URL` ou `/api`. */
  urlBase?: string;
  fetch?: OptionsAgent["fetch"];
  /** Horloge (ms) qui date la fin de validité du jeton ; l'heure du système par défaut. */
  maintenant?: () => number;
  /** Renvoie vers l'écran de connexion des voyageurs. */
  onVoyageur?: () => void;
}

/**
 * Connexion des agents en mode HTTP (lot De). Le rôle choisi décide de la méthode, comme côté serveur :
 * - PIN à 6 chiffres pour le guichet, le bus, le contrôle, le relais, le livreur et le vendeur ;
 * - mot de passe puis code à 6 chiffres reçu par SMS pour le superviseur, le patron et le comptable.
 * Un téléphone de guichet est d'abord enrôlé avec un code donné par l'administration : le serveur lui remet un
 * secret, qui permet ensuite de l'effacer à distance (kiosque, AM-172).
 */
export function EcranConnexionAgent({
  urlBase,
  fetch: fetchImpose,
  maintenant,
  onVoyageur,
}: Props) {
  const { t } = useTranslation("ConnexionAgent");
  const navigate = useNavigate();
  const { ouvrirSession } = useSession();
  const idChamps = useId();
  const options: OptionsAgent = {
    urlBase: urlBase ?? urlBaseApi(),
    ...(fetchImpose ? { fetch: fetchImpose } : {}),
  };
  const horloge = maintenant ?? Date.now;

  const [appareil, setAppareil] = useState<AppareilEnrole | null>(() => lireAppareilEnrole());
  const [etape, setEtape] = useState<Etape>("role");
  const [role, setRole] = useState("");
  const [numero, setNumero] = useState("");
  const [pin, setPin] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [codeEnrolement, setCodeEnrolement] = useState("");
  const [defi, setDefi] = useState<DefiDirection | null>(null);
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const methode = roleAgent(role)?.methode ?? "pin";

  function aller(suivante: Etape) {
    setErreur(null);
    setEtape(suivante);
  }

  function messageErreur(e: Erreur): string {
    switch (e.cle) {
      case "bloque":
      case "tropDemandes":
        return t(`erreurs.${e.cle}`, { delai: e.delai });
      default:
        return t(`erreurs.${e.cle}`);
    }
  }

  function nomAppareil(a: AppareilEnrole): string {
    return a.libelle || [a.agence, a.gare].filter(Boolean).join(" ") || a.appareilId;
  }

  async function protege(action: () => Promise<void>, contexte: Contexte) {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    try {
      await action();
    } catch (echec) {
      setErreur(erreurDe(echec, contexte));
    } finally {
      setOccupe(false);
    }
  }

  /** Jeton obtenu : on lit qui est connecté, on prépare le téléphone, on ouvre l'espace. */
  async function terminer(jeton: JetonAgent) {
    const moi = await lireMoi(options, jeton.accessToken);
    const espace = espaceDe(moi.role) ?? espaceDe(jeton.role);
    if (espace === null) {
      setErreur({ cle: "sansEspace" });
      return;
    }
    memoriserJeton(jeton.accessToken, jeton.expiresIn, horloge());
    if (ROLES_SUR_APPAREIL.includes(moi.role)) provisionnerVente(lireAppareilEnrole(), moi);
    ouvrirSession(espace);
    void navigate(ACCUEIL_ESPACE[espace], { replace: true });
  }

  function choisirRole(evenement: FormEvent) {
    evenement.preventDefault();
    if (!role) return setErreur({ cle: "role" });
    if (ROLES_SUR_APPAREIL.includes(role) && !appareil) {
      setNotice(t("enrolement.necessaire"));
      return aller("enrolement");
    }
    setNotice(null);
    aller("identifiants");
  }

  function enroler(evenement: FormEvent) {
    evenement.preventDefault();
    const saisi = codeEnrolement.trim();
    if (saisi.length < 4) return setErreur({ cle: "codeEnrolement" });
    void protege(async () => {
      const reponse = await enrolerAppareil(options, saisi);
      const enregistre = memoriserEnrolement(reponse);
      setAppareil(enregistre);
      setCodeEnrolement("");
      setNotice(t("enrolement.fait", { nom: nomAppareil(enregistre) }));
      aller("role");
    }, "enrolement");
  }

  function identifier(evenement: FormEvent) {
    evenement.preventDefault();
    if (!numeroValide(numero)) return setErreur({ cle: "telephone" });
    const telephone = versInternational(numero);
    if (methode === "pin") {
      if (!new RegExp(`^\\d{${LONGUEUR_PIN}}$`).test(pin)) return setErreur({ cle: "pin" });
      void protege(async () => {
        await terminer(await connecterParPin(options, { telephone, pin, role }));
      }, "connexion");
      return;
    }
    if (motDePasse.length === 0) return setErreur({ cle: "motDePasse" });
    void protege(async () => {
      setDefi(await demanderCodeDirection(options, { telephone, motDePasse, role }));
      setMotDePasse("");
      setCode("");
      aller("code");
    }, "connexion");
  }

  function verifier(evenement: FormEvent) {
    evenement.preventDefault();
    if (!defi) return aller("identifiants");
    if (!new RegExp(`^\\d{${LONGUEUR_CODE}}$`).test(code)) return setErreur({ cle: "code" });
    void protege(async () => {
      await terminer(await verifierCodeDirection(options, { defiId: defi.defiId, code }));
    }, "code");
  }

  function retour() {
    if (etape === "code") aller("identifiants");
    else if (etape === "identifiants" || etape === "enrolement") aller("role");
    else onVoyageur?.();
  }

  const saisieNumero = (
    <div className={styles.groupe}>
      <label htmlFor={`${idChamps}-tel`} className={styles.libelle}>
        {t("telephone.libelle")}
      </label>
      <span className={styles.champ} data-erreur={erreur?.cle === "telephone"}>
        <span className={styles.indicatif}>{INDICATIF}</span>
        <input
          id={`${idChamps}-tel`}
          className={styles.saisie}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-invalid={erreur?.cle === "telephone"}
          value={formaterNational(numero)}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setNumero(chiffresNational(e.target.value));
            setErreur(null);
          }}
        />
      </span>
    </div>
  );

  return (
    <main className={styles.ecran} data-planche="ConnexionAgent">
      {(etape !== "role" || onVoyageur) && (
        <button type="button" className={styles.retour} onClick={retour}>
          {etape === "role" ? t("actions.voyageur") : t("retour")}
        </button>
      )}
      <h1 className={styles.titre}>
        {etape === "enrolement" ? t("enrolement.titre") : t("titre")}
      </h1>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {etape === "role" && (
        <form className={styles.formulaire} onSubmit={choisirRole} noValidate>
          <p className={styles.explication}>{t("explication")}</p>
          <fieldset className={styles.groupe}>
            <legend className={styles.libelle}>{t("role.libelle")}</legend>
            <div className={styles.roles}>
              {ROLES_AGENT.map((r) => (
                <label key={r.role} className={styles.role}>
                  <input
                    className={styles.pastille}
                    type="radio"
                    name={`${idChamps}-role`}
                    value={r.role}
                    checked={role === r.role}
                    onChange={() => {
                      setRole(r.role);
                      setErreur(null);
                    }}
                  />
                  {t(`role.${r.role}`)}
                </label>
              ))}
            </div>
          </fieldset>
          {appareil && (
            <p className={styles.aide}>{t("enrolement.deja", { nom: nomAppareil(appareil) })}</p>
          )}
          {erreur && (
            <p className={styles.erreur} role="alert">
              {messageErreur(erreur)}
            </p>
          )}
          <button type="submit" className={styles.continuer}>
            {t("actions.continuer")}
          </button>
          <button type="button" className={styles.secondaire} onClick={() => aller("enrolement")}>
            {t("enrolement.lien")}
          </button>
        </form>
      )}

      {etape === "enrolement" && (
        <form className={styles.formulaire} onSubmit={enroler} noValidate>
          <p className={styles.explication}>{t("enrolement.explication")}</p>
          <div className={styles.groupe}>
            <label htmlFor={`${idChamps}-enrolement`} className={styles.libelle}>
              {t("enrolement.libelle")}
            </label>
            <span className={styles.champ} data-erreur={erreur?.cle === "codeEnrolement"}>
              <input
                id={`${idChamps}-enrolement`}
                className={styles.saisie}
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={erreur?.cle === "codeEnrolement"}
                value={codeEnrolement}
                onChange={(e) => {
                  setCodeEnrolement(e.target.value.toUpperCase());
                  setErreur(null);
                }}
              />
            </span>
          </div>
          {erreur && (
            <p className={styles.erreur} role="alert">
              {messageErreur(erreur)}
            </p>
          )}
          <button
            type="submit"
            className={styles.continuer}
            data-chargement={occupe}
            aria-busy={occupe}
          >
            {t("enrolement.action")}
          </button>
        </form>
      )}

      {etape === "identifiants" && (
        <form className={styles.formulaire} onSubmit={identifier} noValidate>
          <p className={styles.explication}>{t(`role.${role}`)}</p>
          {saisieNumero}
          {methode === "pin" ? (
            <div className={styles.groupe}>
              <label htmlFor={`${idChamps}-pin`} className={styles.libelle}>
                {t("pin.libelle")}
              </label>
              <span className={styles.champ} data-erreur={erreur?.cle === "pin"}>
                <input
                  id={`${idChamps}-pin`}
                  className={styles.saisie}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={LONGUEUR_PIN}
                  aria-invalid={erreur?.cle === "pin"}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, "").slice(0, LONGUEUR_PIN));
                    setErreur(null);
                  }}
                />
              </span>
              <p className={styles.aide}>{t("pin.aide")}</p>
            </div>
          ) : (
            <div className={styles.groupe}>
              <label htmlFor={`${idChamps}-mdp`} className={styles.libelle}>
                {t("motDePasse.libelle")}
              </label>
              <span className={styles.champ} data-erreur={erreur?.cle === "motDePasse"}>
                <input
                  id={`${idChamps}-mdp`}
                  className={styles.saisie}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={erreur?.cle === "motDePasse"}
                  value={motDePasse}
                  onChange={(e) => {
                    setMotDePasse(e.target.value);
                    setErreur(null);
                  }}
                />
              </span>
              <p className={styles.aide}>{t("motDePasse.aide")}</p>
            </div>
          )}
          {erreur && (
            <p className={styles.erreur} role="alert">
              {messageErreur(erreur)}
            </p>
          )}
          <button
            type="submit"
            className={styles.continuer}
            data-chargement={occupe}
            aria-busy={occupe}
          >
            {methode === "pin" ? t("actions.connexion") : t("actions.continuer")}
          </button>
        </form>
      )}

      {etape === "code" && (
        <form className={styles.formulaire} onSubmit={verifier} noValidate>
          <div className={styles.groupe}>
            <label htmlFor={`${idChamps}-code`} className={styles.libelle}>
              {t("code.libelle")}
            </label>
            <span className={styles.champ} data-erreur={erreur?.cle === "code"}>
              <input
                id={`${idChamps}-code`}
                className={styles.saisie}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={LONGUEUR_CODE}
                aria-invalid={erreur?.cle === "code"}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, LONGUEUR_CODE));
                  setErreur(null);
                }}
              />
            </span>
            <p className={styles.aide}>
              {t("code.aide", { minutes: Math.max(1, Math.ceil((defi?.expireDans ?? 300) / 60)) })}
            </p>
          </div>
          {erreur && (
            <p className={styles.erreur} role="alert">
              {messageErreur(erreur)}
            </p>
          )}
          <button
            type="submit"
            className={styles.continuer}
            data-chargement={occupe}
            aria-busy={occupe}
          >
            {t("actions.verifier")}
          </button>
        </form>
      )}
    </main>
  );
}
