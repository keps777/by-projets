import { ErreurHttp, agence } from "@afrimove/api-client";
import type { agence as c } from "@afrimove/contrats";
import { EcranCorps, EcranPied, Entete } from "@afrimove/ui";
import { useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { urlPlanche } from "@/coquille/planches";
import { heureDouala, heureLimite, heureSecondes, pourcentage, premierScanDe } from "./calculs";
import { EtatChargement, EtatErreur, EtatVide } from "./etats";
import { FeuilleCode } from "./FeuilleCode";
import { IconeScanOk, IconeScanRefuse, IconeTelephone } from "./icones";
import { useScanContinu } from "./useScanContinu";
import styles from "./quai.module.css";

export type Quai = NonNullable<ReturnType<typeof agence.useQuaiEmbarquement>["data"]>;
type Scan = NonNullable<Quai["dernierScan"]>;
type Absent = Quai["absents"][number];

/** Planche « Quai » (touche 4) : scan à l'embarquement, comptage, soute, absents. Lit le quai par `useQuaiEmbarquement`. */
export function EcranQuai() {
  const requete = agence.useQuaiEmbarquement();

  // Une relecture qui échoue ne retire pas le quai déjà chargé : la liste du départ reste là, le scan continue.
  if (requete.data) return <Embarquement quai={requete.data} />;
  if (requete.isPending) return <EtatChargement />;
  const erreur = requete.error;
  return erreur instanceof ErreurHttp && erreur.statut === 404 ? (
    <EtatVide />
  ) : (
    <EtatErreur onReessayer={() => void requete.refetch()} />
  );
}

interface ScanAffiche {
  scan: Scan;
  /** Heure du premier scan quand le billet est déjà scanné. */
  premierScanA: string | null;
}

function Embarquement({ quai }: { quai: Quai }) {
  const { t } = useTranslation("Quai");
  const navigate = useNavigate();
  const departId = quai.depart.departId;

  const scanner = agence.useScannerAuQuai();
  const saisirCode = agence.useSaisirCodeBillet();
  const liberer = agence.useLibererSiege();
  const envoyerListe = agence.useEnvoyerListeAuChauffeur();

  const [affiche, setAffiche] = useState<ScanAffiche | null>(null);
  const [echecScan, setEchecScan] = useState(false);
  const [feuille, setFeuille] = useState<{ voyageur?: string } | null>(null);
  const [echecCode, setEchecCode] = useState(false);
  const [avis, setAvis] = useState<{ texte: string; alerte: boolean } | null>(null);
  const [echecListe, setEchecListe] = useState(false);

  // Dernière version du quai et billets vus monter ici, lus au moment d'un scan (les scans se suivent sans attendre).
  const quaiCourant = useRef(quai);
  quaiCourant.current = quai;
  const vusIci = useRef(new Map<string, string>());
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const listeEnCours = useRef(false);

  /** Un scan à la fois, dans l'ordre : deux voyageurs qui passent coup sur coup sont tous les deux comptés. */
  function enfiler<T>(travail: () => Promise<T>): Promise<T> {
    const suite = file.current.then(travail, travail);
    file.current = suite.catch(() => undefined);
    return suite;
  }

  async function envoyerScan(envoi: () => Promise<c.ResultatScan>): Promise<boolean> {
    try {
      const resultat = await envoi();
      const scan = resultat.scan;
      if (scan.resultat === "monte") vusIci.current.set(scan.billetId, scan.at);
      setAffiche({
        scan,
        premierScanA:
          scan.resultat === "deja_scanne"
            ? premierScanDe(scan, quaiCourant.current, vusIci.current)
            : null,
      });
      setEchecScan(false);
      return true;
    } catch {
      setEchecScan(true);
      return false;
    }
  }

  function surQr(qr: string) {
    void enfiler(() => envoyerScan(() => scanner.mutateAsync({ departId, qr })));
  }

  async function surCode(code: string) {
    setEchecCode(false);
    const reussi = await enfiler(() =>
      envoyerScan(() => saisirCode.mutateAsync({ departId, codeBillet: code })),
    );
    if (reussi) setFeuille(null);
    else setEchecCode(true);
  }

  const camera = useScanContinu(quai.mode === "scan", surQr);
  const modeScan = camera.etat === "demarrage" || camera.etat === "actif";

  async function libererSiege(absent: Absent) {
    setAvis(null);
    try {
      await liberer.mutateAsync({
        departId,
        billetId: absent.billetId,
        siege: absent.siege,
        motif: absent.retardPrevenu ? "retard" : "absent",
      });
    } catch {
      setAvis({ texte: t("absents.echecLiberer"), alerte: true });
    }
  }

  function appeler(absent: Absent) {
    // Le contrat de l'absent ne porte pas son numéro de téléphone : voir le rapport du ticket.
    setAvis({ texte: t("absents.sansNumero", { nom: absent.voyageur }), alerte: false });
  }

  async function surDepart(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    evenement.preventDefault();
    if (listeEnCours.current) return;
    listeEnCours.current = true;
    setEchecListe(false);
    try {
      await envoyerListe.mutateAsync({
        departId,
        embarques: quai.embarquement.embarques,
        capacite: quai.embarquement.capacite,
      });
    } catch {
      setEchecListe(true);
      return;
    } finally {
      listeEnCours.current = false;
    }
    void navigate(urlPlanche("Chauffeur"));
  }

  const { embarquement, soute, refuses, enRoute, equipage } = quai;
  const heureDepart = heureDouala(quai.depart.heureDepart);
  const restantes = quai.placesAVendre;
  const libelleVendre =
    restantes > 1
      ? t("pied.vendre.plusieurs", { nombre: restantes })
      : restantes === 1
        ? t("pied.vendre.une")
        : t("pied.vendre.aucune");

  return (
    <>
      <Entete
        className={styles.entete}
        titre={t("enTete.titre", {
          quai: quai.quai,
          heure: heureDepart,
          destination: quai.depart.destination,
        })}
        sousTitre={t("enTete.sousTitre", {
          bus: equipage.bus.immatriculation,
          chauffeur: equipage.chauffeur.nom,
          convoyeur: equipage.convoyeur.nom,
        })}
        retour={{ libelle: t("retour"), href: urlPlanche("Guichet") }}
        droite={
          modeScan ? (
            <span className={styles.pastille} role="status">
              <span className={styles.point} aria-hidden="true" />
              {t("mode.scan")}
            </span>
          ) : (
            <button
              type="button"
              className={styles.pastille}
              aria-label={t("mode.saisir")}
              onClick={() => setFeuille({})}
            >
              <span className={`${styles.point} ${styles.pointCode}`} aria-hidden="true" />
              {t("mode.code")}
            </button>
          )
        }
      />

      <EcranCorps className={styles.corps} data-planche="Quai">
        <CarteDernierScan
          affiche={echecScan ? "echec" : (affiche ?? derniereDuQuai(quai, vusIci.current))}
        />

        <section className={styles.embarques} aria-label={t("embarquement.libelle")}>
          <span className={styles.embarquesChiffre}>
            <span className={styles.grand}>
              {embarquement.embarques}
              <span className={styles.grandSur}>/{embarquement.capacite}</span>
            </span>
            <span className={styles.embarquesLibelle}>{t("embarquement.libelle")}</span>
          </span>
          <span className={styles.barreBloc}>
            <span className={styles.barre}>
              <span
                className={styles.remplissage}
                style={{ width: `${pourcentage(embarquement.embarques, embarquement.capacite)}%` }}
              />
            </span>
            <span className={styles.barreLegende}>
              <span>
                {t("embarquement.attendus", {
                  attendus: embarquement.attendus,
                  nonPresentes: embarquement.nonPresentes,
                  heure: heureLimite(quai.depart.heureDepart),
                })}
              </span>
              <span className={styles.depart}>
                {t("embarquement.depart", { heure: heureDepart })}
              </span>
            </span>
          </span>
        </section>

        <div className={styles.tuiles}>
          <div className={styles.tuile}>
            <span className={styles.tuileLibelle}>{t("compteurs.soute")}</span>
            <span className={styles.tuileValeur}>
              {soute.charges}
              <span className={styles.tuileSur}>/{soute.capacite}</span>
            </span>
            <span className={styles.tuileDetail} data-ton={soute.colisACharger > 0 ? "ambre" : ""}>
              {t("compteurs.colisACharger", { count: soute.colisACharger })}
            </span>
          </div>
          <div className={styles.tuile}>
            <span className={styles.tuileLibelle}>{t("compteurs.refuses")}</span>
            <span className={styles.tuileValeur} data-ton={refuses.nombre > 0 ? "rouge" : ""}>
              {refuses.nombre}
            </span>
            <span className={styles.tuileDetail}>
              {refuses.nombre === 0
                ? t("compteurs.motif.aucun")
                : t(`compteurs.motif.${refuses.motif}`, {
                    heure: refuses.premierScanA ? heureDouala(refuses.premierScanA) : "",
                  })}
            </span>
          </div>
          <div className={styles.tuile}>
            <span className={styles.tuileLibelle}>{t("compteurs.enRoute")}</span>
            <span className={styles.tuileValeur}>{enRoute.nombre}</span>
            <span className={styles.tuileDetail}>
              {t("compteurs.montentA", { arret: enRoute.arret })}
            </span>
          </div>
        </div>

        {quai.absents.length > 0 && (
          <section className={styles.liste} aria-label={t("absents.titre")}>
            <div className={styles.listeEntete}>
              <span>{t("absents.titre")}</span>
              <span className={styles.listeAide}>{t("absents.aide")}</span>
            </div>
            {quai.absents.map((absent) => (
              <div key={absent.billetId} className={styles.ligne}>
                <span className={styles.ligneTexte}>
                  <strong>{absent.voyageur}</strong>
                  {t("absents.siege", { numero: absent.siege })}
                  {absent.retardPrevenu ? (
                    <span className={styles.ligneRetard}>{t("absents.retard")}</span>
                  ) : absent.venduA ? (
                    <span className={styles.ligneDetail}>
                      {t("absents.vendu", { heure: heureDouala(absent.venduA) })}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={styles.appel}
                  aria-label={t("absents.appeler", { nom: absent.voyageur })}
                  onClick={() => appeler(absent)}
                >
                  <IconeTelephone />
                </button>
                {absent.actionSuggeree === "liberer" ? (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => void libererSiege(absent)}
                  >
                    {t("absents.liberer")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                      setEchecCode(false);
                      setFeuille({ voyageur: absent.voyageur });
                    }}
                  >
                    {t("absents.code")}
                  </button>
                )}
              </div>
            ))}
            {avis && (
              <p className={styles.avis} role={avis.alerte ? "alert" : "status"}>
                {avis.texte}
              </p>
            )}
          </section>
        )}

        <video
          ref={camera.refVideo}
          className={styles.camera}
          muted
          playsInline
          aria-hidden="true"
        />
      </EcranCorps>

      <EcranPied className={styles.pied}>
        {echecListe && (
          <p role="alert" className={styles.alerte}>
            {t("pied.echec")}
          </p>
        )}
        <a href={urlPlanche("Convoyeur")} className={styles.vendre}>
          {libelleVendre}
        </a>
        <a
          href={urlPlanche("Chauffeur")}
          className={styles.departListe}
          aria-busy={envoyerListe.isPending}
          onClick={(e) => void surDepart(e)}
        >
          {t("pied.depart")}
        </a>
      </EcranPied>

      {feuille && (
        <FeuilleCode
          voyageur={feuille.voyageur}
          enCours={saisirCode.isPending}
          echec={echecCode}
          onCode={(code) => void surCode(code)}
          onFermer={() => setFeuille(null)}
        />
      )}
    </>
  );
}

/** Le dernier scan que connaît le quai, avant tout scan fait sur cet écran. */
function derniereDuQuai(quai: Quai, vusIci: ReadonlyMap<string, string>): ScanAffiche | null {
  const scan = quai.dernierScan;
  if (!scan) return null;
  return {
    scan,
    premierScanA: scan.resultat === "deja_scanne" ? premierScanDe(scan, quai, vusIci) : null,
  };
}

function CarteDernierScan({ affiche }: { affiche: ScanAffiche | "echec" | null }) {
  const { t } = useTranslation("Quai");

  if (affiche === null || affiche === "echec") {
    const echec = affiche === "echec";
    return (
      <div
        className={styles.scan}
        data-ton={echec ? "refus" : "neutre"}
        {...(echec ? { role: "alert" } : {})}
      >
        <div className={styles.scanLigne}>
          <span className={styles.scanTitre}>
            {echec ? t("dernierScan.echec.titre") : t("dernierScan.aucun.titre")}
          </span>
        </div>
        <span className={styles.scanDetail}>
          {echec ? t("dernierScan.echec.detail") : t("dernierScan.aucun.detail")}
        </span>
      </div>
    );
  }

  const { scan, premierScanA } = affiche;
  const ton = scan.resultat === "monte" ? "ok" : scan.resultat === "sans_nom" ? "neutre" : "refus";
  const details = [
    scan.resultat === "introuvable" ? null : scan.numero,
    scan.pieceQuatreDerniers ? t("dernierScan.piece", { piece: scan.pieceQuatreDerniers }) : null,
    scan.voyageur || scan.siege ? t(`dernierScan.classe.${scan.classe}`) : null,
    scan.bagagesSoute > 0 ? t("dernierScan.bagages", { count: scan.bagagesSoute }) : null,
  ].filter((morceau): morceau is string => morceau !== null);

  return (
    <div className={styles.scan} data-ton={ton} {...(ton === "refus" ? { role: "alert" } : {})}>
      <div className={styles.scanLigne}>
        <span className={styles.scanTitre}>
          <span className={styles.scanRond}>
            {ton === "refus" ? <IconeScanRefuse /> : <IconeScanOk />}
          </span>
          {t(`dernierScan.titre.${scan.resultat}`, {
            heure: premierScanA ? heureDouala(premierScanA) : "",
          })}
        </span>
        <span className={styles.scanHeure}>{heureSecondes(scan.at)}</span>
      </div>
      {(scan.voyageur || scan.siege) && (
        <div className={styles.scanLigneBase}>
          <span className={styles.scanNom}>{scan.voyageur}</span>
          {scan.siege !== null && (
            <span className={styles.scanSiege}>
              {t("dernierScan.siege", { numero: scan.siege })}
            </span>
          )}
        </div>
      )}
      {details.length > 0 && <span className={styles.scanDetail}>{details.join(" · ")}</span>}
      {scan.resultat === "sans_nom" && (
        <a href={urlPlanche("CadenceQuai")} className={styles.scanLien}>
          {t("dernierScan.completer")}
        </a>
      )}
    </div>
  );
}
