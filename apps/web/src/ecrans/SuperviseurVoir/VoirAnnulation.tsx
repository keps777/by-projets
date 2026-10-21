import { ErreurHttp, agence } from "@afrimove/api-client";
import {
  BLOCAGE_PAR_DEFAUT_MS,
  Bouton,
  ClavierPin,
  ESSAIS_MAX_PAR_DEFAUT,
  EcranCorps,
  EcranPied,
  Entete,
  IconeCoche,
  Pastille,
  verifierEmpreinte,
} from "@afrimove/ui";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMaintenant } from "@/coquille/horloge";
import { urlPlanche } from "@/coquille/planches";
import {
  blocageEnCours,
  compteBloque,
  deriverCle,
  enregistrerBlocage,
  leverBlocage,
  pinRefuse,
  signer,
  type PreuveSuperviseur,
} from "@/ecrans/SuperviseurValider/pin";
import {
  heureDouala,
  minutesDepuis,
  montant,
  nomSansTitre,
  prenom,
  sequenceBillet,
  suffixeOrdinal,
} from "./formats";
import styles from "./superviseur-voir.module.css";

/** Ce que `useSuperviseurAnnulation` renvoie : la demande à décider (@afrimove/contrats n'est pas lu directement ici). */
export type Demande = NonNullable<ReturnType<typeof agence.useSuperviseurAnnulation>["data"]>;

/** Le superviseur qui décide : son identité signe la décision, son nom titre le clavier PIN. */
export interface Superviseur {
  id: string;
  nom: string;
}

/**
 * Le contrat ne dit pas la longueur du PIN pour une annulation (le détail de la clôture la porte) : six chiffres
 * comme dans toutes les planches. Essais et blocage sont ceux du kit et du serveur (3 essais, 15 min).
 */
const PIN_LONGUEUR = 6;
const ESSAIS_MAX = ESSAIS_MAX_PAR_DEFAUT;
const BLOCAGE_MINUTES = Math.round(BLOCAGE_PAR_DEFAUT_MS / 60_000);

type CleMessage = "pinRequis" | "pinSaisi" | "pinIncorrect" | "pinBloque" | "echec" | "dejaTraitee";

interface Message {
  cle: CleMessage;
  essais?: number;
}

type DecisionAnnulation = Demande["decisionProposee"];
type Choix = Exclude<DecisionAnnulation, "refuser">;

type TonMarque = "vert" | "ambre" | "bleu";

function Verification({
  ton,
  marque,
  children,
}: {
  ton: TonMarque;
  marque: "coche" | "!" | "i";
  children: ReactNode;
}) {
  return (
    <div className={styles.verification}>
      <span className={styles.marque} data-ton={ton} aria-hidden="true">
        {marque === "coche" ? <IconeCoche taille={10} trait={3.5} /> : marque}
      </span>
      <span>{children}</span>
    </div>
  );
}

function octetsAleatoires(taille: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(taille));
}

/** « 11 min », « 1 h 05 », « 2 jours » : le temps écoulé depuis la demande. */
function useDuree(demandeA: string): string {
  const { t } = useTranslation("SuperviseurVoir");
  const minutes = minutesDepuis(demandeA, useMaintenant());
  if (minutes < 60) return t("duree.minutes", { count: minutes });
  if (minutes < 24 * 60) {
    return t("duree.heures", {
      heures: Math.floor(minutes / 60),
      minutes: String(minutes % 60).padStart(2, "0"),
    });
  }
  return t("duree.jours", { count: Math.floor(minutes / (24 * 60)) });
}

/**
 * La demande d'annulation : billet et montant, ce que l'app a vérifié, le choix (rembourser, reporter à demain, avoir),
 * le clavier PIN, puis « Refuser » ou « Annuler · rembourser ».
 *
 * Le PIN (ou l'empreinte) est demandé en premier : il ne sert qu'à signer la décision, au geste (Annuler ou Refuser).
 * C'est le serveur qui juge le PIN ; un refus compte un essai, le troisième bloque le clavier 15 minutes (le serveur
 * alerte le patron). La mécanique est celle de « SuperviseurValider » (même clé HMAC dérivée du PIN, même blocage).
 */
export function VoirAnnulation({
  demande,
  superviseur,
}: {
  demande: Demande;
  superviseur: Superviseur;
}) {
  const { t } = useTranslation("SuperviseurVoir");
  const navigate = useNavigate();
  const decider = agence.useDeciderAnnulation();
  const duree = useDuree(demande.demandeA);

  const { billet, verifications: v } = demande;
  const superviseurId = superviseur.id;
  const agent = prenom(demande.demandeur.nom);
  const sequence = sequenceBillet(billet.sequence);

  /** Remboursé ou crédité : le prix moins la retenue des règles de l'agence. */
  const net = Math.max(0, billet.prix - v.retenue);
  const choix = demande.decisionsPossibles.filter((d): d is Choix => d !== "refuser");
  const [choisi, setChoisi] = useState<Choix>(() =>
    demande.decisionProposee !== "refuser" ? demande.decisionProposee : (choix[0] ?? "rembourser"),
  );
  const [message, setMessage] = useState<Message | null>(null);
  const [bloqueJusqua, setBloqueJusqua] = useState<number | null>(() =>
    blocageEnCours(superviseurId),
  );
  const [envoi, setEnvoi] = useState(false);
  const preuve = useRef<PreuveSuperviseur | null>(null);
  const essaisFaux = useRef(0);
  const enCours = useRef(false);

  /** Sixième chiffre : le PIN sert à dériver la clé de signature, puis il est oublié. */
  async function surPinComplet(saisie: string) {
    preuve.current = { methode: "pin", cle: await deriverCle(saisie, superviseurId) };
    setMessage({ cle: "pinSaisi" });
  }

  /** Empreinte : la vérification de l'appareil tient lieu de PIN (refus ou annulation : rien ne change). */
  async function surEmpreinte() {
    const identifiant = await verifierEmpreinte({
      challenge: octetsAleatoires(32),
      userVerification: "required",
      timeout: 60_000,
    });
    if (!identifiant || !("rawId" in identifiant)) return;
    const brut = (identifiant as PublicKeyCredential).rawId;
    preuve.current = {
      methode: "empreinte",
      cle: await deriverCle(new Uint8Array(brut.slice(0)), superviseurId),
    };
    setMessage({ cle: "pinSaisi" });
  }

  function bloquer() {
    const jusqua = Date.now() + BLOCAGE_MINUTES * 60_000;
    enregistrerBlocage(superviseurId, jusqua);
    setBloqueJusqua(jusqua);
    setMessage(null);
  }

  function apresEchec(erreur: unknown) {
    if (pinRefuse(erreur) || compteBloque(erreur)) {
      preuve.current = null;
      essaisFaux.current += compteBloque(erreur) ? ESSAIS_MAX : 1;
      if (essaisFaux.current >= ESSAIS_MAX) bloquer();
      else setMessage({ cle: "pinIncorrect", essais: ESSAIS_MAX - essaisFaux.current });
    } else if (erreur instanceof ErreurHttp && erreur.statut === 409) {
      setMessage({ cle: "dejaTraitee" });
    } else {
      setMessage({ cle: "echec" });
    }
  }

  /** Signe puis envoie la décision ; la navigation n'a lieu qu'une fois l'écriture acceptée. */
  async function decide(decision: DecisionAnnulation) {
    if (enCours.current) return;
    if (bloqueJusqua !== null && bloqueJusqua > Date.now()) {
      setMessage({ cle: "pinBloque" });
      return;
    }
    const cle = preuve.current;
    if (!cle) {
      setMessage({ cle: "pinRequis" });
      return;
    }
    enCours.current = true;
    setEnvoi(true);
    try {
      /** Montant remboursé ou crédité ; 0 pour un report ou un refus (contrat de l'événement). */
      const montantDecide = decision === "rembourser" || decision === "avoir" ? net : 0;
      const donnees = {
        demandeId: demande.demandeId,
        billetId: billet.billetId,
        decision,
        montant: montantDecide,
      };
      const signature = await signer(cle.cle, {
        ...donnees,
        superviseurId,
        methode: cle.methode,
      });
      await decider.mutateAsync({
        ...donnees,
        validePar: { superviseurId, methode: cle.methode, signature },
      });
      preuve.current = null;
      void navigate(urlPlanche("Superviseur"));
    } catch (erreur) {
      apresEchec(erreur);
    } finally {
      enCours.current = false;
      setEnvoi(false);
    }
  }

  function surClic(decision: DecisionAnnulation) {
    return (evenement: MouseEvent<HTMLAnchorElement>) => {
      if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
      evenement.preventDefault();
      void decide(decision);
    };
  }

  const nomSuperviseur = superviseur.nom;
  const aRendre =
    v.aRendreCash > 0
      ? t("verifications.client.aRendre", { montant: montant(v.aRendreCash) })
      : null;
  const frequenceAlerte =
    v.annulationsAgentAujourdhui >= 2 || v.annulationsAgent10Jours > v.moyenneGuichets;
  const reporte = choisi === "reporter";

  const note = message ? (
    <span
      className={styles.retourPin}
      data-ton={message.cle === "pinSaisi" ? "vert" : "rouge"}
      role={message.cle === "pinSaisi" ? "status" : "alert"}
    >
      {t(`message.${message.cle}`, { count: message.essais })}
    </span>
  ) : (
    t(reporte ? "pin.regle.report" : "pin.regle.annulation", { sequence })
  );

  const libelleAnnuler = t(`actions.annuler.${choisi}`, { montant: montant(net) });

  return (
    <div className={styles.page}>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre", {
          rang: demande.guichetRang,
          agent: demande.demandeur.nom,
          heure: heureDouala(demande.demandeA),
          duree,
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }}
        droite={<Pastille statut="brouillon" ton="ambre" libelle={t("badge")} />}
      />

      <EcranCorps className={styles.corps} data-planche="SuperviseurVoir" data-etat="pret">
        <div className={styles.billet}>
          <div className={styles.billetTete}>
            <span className={styles.numero}>{billet.numero}</span>
            <span className={styles.prix}>{montant(billet.prix)}</span>
          </div>
          <div className={styles.faits}>
            <span>
              <span className={styles.faitLibelle}>{t("billet.depart")}</span>
              <strong className={styles.fort}>
                {heureDouala(billet.depart.heureDepart)} {billet.depart.destination}
              </strong>{" "}
              · {t("billet.siege", { siege: billet.depart.siege })}
            </span>
            <span>
              <span className={styles.faitLibelle}>{t("billet.voyageur")}</span>
              <strong className={styles.fort}>{billet.voyageur.nom}</strong>
              {billet.voyageur.pieceQuatreDerniers !== null &&
                ` · ${t("billet.piece", { quatreDerniers: billet.voyageur.pieceQuatreDerniers })}`}
            </span>
            <span>
              <span className={styles.faitLibelle}>{t("billet.vendu")}</span>
              {t("billet.venteDetail", {
                heure: heureDouala(billet.vendu.at),
                rang: billet.vendu.guichetRang,
                mode: t(`billet.mode.${billet.vendu.mode}`),
                agent: billet.vendu.agent.nom,
              })}
            </span>
            <span>
              <span className={styles.faitLibelle}>{t("billet.motif")}</span>
              {t("billet.motifValeur", { motif: billet.motif })}
            </span>
          </div>
        </div>

        <div
          className={styles.verifications}
          role="group"
          aria-label={t("verifications.titre")}
          tabIndex={0}
        >
          <div className={styles.verificationsTitre}>
            <span>{t("verifications.titre")}</span>
          </div>
          <Verification
            ton={!v.scanne && v.siegeLiberable ? "vert" : "ambre"}
            marque={!v.scanne && v.siegeLiberable ? "coche" : "!"}
          >
            <Trans
              t={t}
              i18nKey={v.scanne ? "verifications.scanne.oui" : "verifications.scanne.non"}
              components={{ b: <strong /> }}
            />{" "}
            ·{" "}
            {t(v.siegeLiberable ? "verifications.siege.libre" : "verifications.siege.bloque", {
              siege: billet.depart.siege,
            })}
          </Verification>
          <Verification
            ton={v.remboursementIntegral ? "vert" : "ambre"}
            marque={v.remboursementIntegral ? "coche" : "!"}
          >
            <Trans
              t={t}
              i18nKey={
                v.remboursementIntegral
                  ? "verifications.delai.integral"
                  : "verifications.delai.retenue"
              }
              values={{ retenue: montant(v.retenue) }}
              components={{ b: <strong /> }}
            />
          </Verification>
          <Verification
            ton={frequenceAlerte ? "ambre" : "vert"}
            marque={frequenceAlerte ? "!" : "coche"}
          >
            <Trans
              t={t}
              i18nKey="verifications.frequence"
              values={{
                rang: v.annulationsAgentAujourdhui,
                suffixe: suffixeOrdinal(v.annulationsAgentAujourdhui),
                agent,
                dixJours: v.annulationsAgent10Jours,
                moyenne: v.moyenneGuichets,
              }}
              components={{
                b: <strong className={styles.alerte} data-alerte={frequenceAlerte} />,
                sup: <sup />,
              }}
            />
          </Verification>
          <Verification ton="bleu" marque="i">
            {[
              t(v.clientPresent ? "verifications.client.present" : "verifications.client.absent"),
              t(v.pieceVue ? "verifications.client.pieceVue" : "verifications.client.pieceNonVue"),
              aRendre,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Verification>
        </div>

        <div className={styles.choix}>
          {choix.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.choisir}
              aria-pressed={choisi === c}
              onClick={() => setChoisi(c)}
            >
              {t(`choix.${c}`, { montant: montant(net) })}
            </button>
          ))}
        </div>

        <ClavierPin
          longueur={PIN_LONGUEUR}
          titre={t("pin.titre", { nom: nomSuperviseur })}
          sousTitre={t("pin.aide", { agent })}
          note={note}
          essaisMax={ESSAIS_MAX}
          dureeBlocageMs={BLOCAGE_MINUTES * 60_000}
          bloqueJusqua={bloqueJusqua}
          onDeblocage={() => {
            leverBlocage(superviseurId);
            essaisFaux.current = 0;
            setBloqueJusqua(null);
          }}
          onComplet={surPinComplet}
          empreinte="auto"
          onEmpreinte={() => void surEmpreinte()}
        />
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <Bouton
          variante="secondaire"
          className={styles.refuser}
          href={urlPlanche("Superviseur")}
          libelle={t("actions.refuser")}
          aria-busy={envoi}
          onClick={surClic("refuser")}
        />
        <Bouton
          className={styles.annuler}
          href={urlPlanche("Superviseur")}
          libelle={libelleAnnuler}
          sousLibelle={t("actions.annuler.detail", {
            siege: billet.depart.siege,
            nom: nomSansTitre(nomSuperviseur),
          })}
          icone={<IconeCoche taille={22} trait={2.8} />}
          aria-busy={envoi}
          onClick={surClic(choisi)}
        />
      </EcranPied>
    </div>
  );
}
