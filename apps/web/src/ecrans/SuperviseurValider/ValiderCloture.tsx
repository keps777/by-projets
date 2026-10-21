import { ErreurHttp, agence } from "@afrimove/api-client";
import {
  Bouton,
  Champ,
  ClavierPin,
  EcranCorps,
  EcranPied,
  Entete,
  IconeCoche,
  Pastille,
  verifierEmpreinte,
} from "@afrimove/ui";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { heureDouala, montant, nomSansTitre, prenom } from "./formats";
import {
  blocageEnCours,
  compteBloque,
  deriverCle,
  enregistrerBlocage,
  leverBlocage,
  pinRefuse,
  signer,
  type PreuveSuperviseur,
} from "./pin";
import styles from "./superviseur-valider.module.css";

/** Ce que `useSuperviseurCloture` renvoie : la clôture à valider (@afrimove/contrats n'est pas lu directement ici). */
export type Cloture = NonNullable<ReturnType<typeof agence.useSuperviseurCloture>["data"]>;

type CleMessage = "pinRequis" | "pinSaisi" | "pinIncorrect" | "pinBloque" | "echec" | "dejaTraitee";

interface Message {
  cle: CleMessage;
  essais?: number;
}

type Decision = "valider" | "refuser";

const TON_ECART = { exact: "vert", dans_tolerance: "ambre", hors_tolerance: "rouge" } as const;

function Tuile({ libelle, valeur, ton }: { libelle: string; valeur: string; ton?: string }) {
  return (
    <div className={styles.tuile} {...(ton ? { "data-ton": ton } : {})}>
      <span className={styles.tuileLibelle}>{libelle}</span>
      <span className={styles.tuileValeur}>{valeur}</span>
    </div>
  );
}

function Ligne({
  libelle,
  children,
  ton,
}: {
  libelle: string;
  children: ReactNode;
  ton?: "doux" | "ambre";
}) {
  return (
    <div className={styles.ligne}>
      <span className={styles.ligneLibelle}>{libelle}</span>
      <span className={styles.ligneValeur} {...(ton ? { "data-ton": ton } : {})}>
        {children}
      </span>
    </div>
  );
}

function octetsAleatoires(taille: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(taille));
}

/**
 * La clôture à valider : bilan, détail de la session, commentaire du superviseur, clavier PIN, puis « Refuser ·
 * recompter » ou « Valider · écart signé ».
 *
 * Le PIN (ou l'empreinte) est demandé en premier : il ne sert qu'à signer la décision, au geste (Valider ou Refuser).
 * C'est le serveur qui juge le PIN ; un refus compte un essai, le troisième bloque le clavier 15 minutes (le serveur
 * alerte le patron).
 */
export function ValiderCloture({ cloture }: { cloture: Cloture }) {
  const { t } = useTranslation("SuperviseurValider");
  const navigate = useNavigate();
  const valider = agence.useValiderCloture();
  const refuser = agence.useRefuserCloture();

  const { bilan, pin, controles, resume, sessionId } = cloture;
  const superviseurId = pin.superviseur.id;

  const [commentaire, setCommentaire] = useState(cloture.commentaire ?? "");
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
    const jusqua = Date.now() + pin.blocageMinutes * 60_000;
    enregistrerBlocage(superviseurId, jusqua);
    setBloqueJusqua(jusqua);
    setMessage(null);
  }

  function apresEchec(erreur: unknown) {
    if (pinRefuse(erreur) || compteBloque(erreur)) {
      preuve.current = null;
      essaisFaux.current += compteBloque(erreur) ? pin.essaisMax : 1;
      if (essaisFaux.current >= pin.essaisMax) bloquer();
      else setMessage({ cle: "pinIncorrect", essais: pin.essaisMax - essaisFaux.current });
    } else if (erreur instanceof ErreurHttp && erreur.statut === 409) {
      setMessage({ cle: "dejaTraitee" });
    } else {
      setMessage({ cle: "echec" });
    }
  }

  /** Signe puis envoie la décision ; la navigation n'a lieu qu'une fois l'écriture acceptée. */
  async function decider(decision: Decision) {
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
      const note = commentaire.trim() === "" ? null : commentaire.trim();
      const signature = await signer(cle.cle, {
        decision,
        sessionId,
        ecart: bilan.ecart,
        commentaire: note,
        superviseurId,
        methode: cle.methode,
      });
      const validePar = { superviseurId, methode: cle.methode, signature };
      if (decision === "valider") {
        await valider.mutateAsync({ sessionId, ecart: bilan.ecart, commentaire: note, validePar });
      } else {
        await refuser.mutateAsync({ sessionId, motif: note, validePar });
      }
      preuve.current = null;
      void navigate(urlPlanche(decision === "valider" ? "RapportSoir" : "Caisse"));
    } catch (erreur) {
      apresEchec(erreur);
    } finally {
      enCours.current = false;
      setEnvoi(false);
    }
  }

  function surClic(decision: Decision) {
    return (evenement: MouseEvent<HTMLAnchorElement>) => {
      if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
      evenement.preventDefault();
      void decider(decision);
    };
  }

  const tolerance = controles.tolerance;
  const historique = controles.historiqueAgent;
  const nomSuperviseur = pin.superviseur.nom;
  const montantEcart = montant(bilan.ecart, true);

  const note = message ? (
    <span
      className={styles.retourPin}
      data-ton={message.cle === "pinSaisi" ? "vert" : "rouge"}
      role={message.cle === "pinSaisi" ? "status" : "alert"}
    >
      {t(`message.${message.cle}`, { count: message.essais })}
    </span>
  ) : (
    t("pin.regle", { essais: pin.essaisMax, minutes: pin.blocageMinutes })
  );

  return (
    <>
      <Entete
        titre={t("titre")}
        sousTitre={t("sousTitre", {
          rang: cloture.guichetRang,
          agent: cloture.agent.nom,
          numero: cloture.numero,
          heure: heureDouala(cloture.clotureeA),
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Superviseur") }}
        droite={<Pastille statut="brouillon" ton="ambre" libelle={t("badge")} />}
      />

      <EcranCorps className={styles.corps} data-planche="SuperviseurValider" data-etat="pret">
        <div className={styles.bilan} role="group" aria-label={t("bilan.libelle")}>
          <Tuile libelle={t("bilan.attendu")} valeur={montant(bilan.attendu)} />
          <Tuile libelle={t("bilan.compte")} valeur={montant(bilan.compte)} />
          <Tuile libelle={t("bilan.ecart")} valeur={montantEcart} ton={TON_ECART[bilan.statut]} />
        </div>

        <div className={styles.detail}>
          <div className={styles.ligne}>
            <span className={styles.ligneLibelle}>
              {[
                t("session.billets", { count: resume.billetsCash }),
                t("session.colis", { count: resume.colis }),
                t("session.annulations", { count: resume.annulationsValidees }),
              ].join(" · ")}
            </span>
            <span className={styles.ligneValeur} data-ton="doux">
              {t("session.periode", {
                debut: heureDouala(cloture.periode.debut),
                fin: heureDouala(cloture.periode.fin),
              })}
            </span>
          </div>
          <Ligne libelle={t("controles.tolerance.libelle")}>
            {montant(tolerance.montant)} ·{" "}
            <span className={styles.ton} data-ton={tolerance.dansLaLimite ? "vert" : "rouge"}>
              {t(tolerance.dansLaLimite ? "controles.tolerance.dans" : "controles.tolerance.hors")}
            </span>
          </Ligne>
          <Ligne
            libelle={t("controles.historique.libelle", {
              count: historique.jours,
              agent: prenom(cloture.agent.nom),
            })}
            {...(historique.ecartsNegatifs > 0 ? { ton: "ambre" as const } : {})}
          >
            {t("controles.historique.valeur", {
              count: historique.ecartsNegatifs,
              total: montant(historique.total),
            })}
          </Ligne>
          <Ligne
            libelle={t("controles.cadence")}
            {...(controles.cadenceSansNom > 0 ? { ton: "ambre" as const } : {})}
          >
            {controles.cadenceSansNom}
          </Ligne>
        </div>

        <Champ
          id="motif"
          type="text"
          className={styles.commentaire}
          label={t("commentaire.libelle")}
          value={commentaire}
          autoComplete="off"
          onChange={(evenement) => setCommentaire(evenement.target.value)}
        />

        <ClavierPin
          longueur={pin.longueur}
          titre={t("pin.titre", { nom: nomSuperviseur })}
          sousTitre={t("pin.aide", { longueur: pin.longueur })}
          note={note}
          essaisMax={pin.essaisMax}
          dureeBlocageMs={pin.blocageMinutes * 60_000}
          bloqueJusqua={bloqueJusqua}
          onDeblocage={() => {
            leverBlocage(superviseurId);
            essaisFaux.current = 0;
            setBloqueJusqua(null);
          }}
          onComplet={surPinComplet}
          empreinte={pin.empreinteDisponible ? "auto" : false}
          onEmpreinte={() => void surEmpreinte()}
        />
      </EcranCorps>

      <EcranPied className={styles.pied}>
        <Bouton
          variante="secondaire"
          className={styles.refuser}
          href={urlPlanche("Caisse")}
          libelle={t("actions.refuser")}
          aria-busy={envoi}
          onClick={surClic("refuser")}
        />
        <Bouton
          variante="assistant"
          className={styles.valider}
          href={urlPlanche("RapportSoir")}
          libelle={t("actions.valider.libelle", { ecart: montant(bilan.ecart) })}
          sousLibelle={t("actions.valider.detail", { nom: nomSansTitre(nomSuperviseur) })}
          icone={<IconeCoche taille={22} trait={2.8} />}
          aria-busy={envoi}
          onClick={surClic("valider")}
        />
      </EcranPied>
    </>
  );
}
