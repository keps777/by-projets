import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import styles from "./clavier-pin.module.css";
import { classes } from "./utils";
import { useEmpreinteDisponible } from "./webauthn";

export const ESSAIS_MAX_PAR_DEFAUT = 3;
export const BLOCAGE_PAR_DEFAUT_MS = 15 * 60 * 1000;

export interface InfoBlocage {
  /** Instant de réouverture, en millisecondes depuis 1970 (à garder côté appelant pour survivre à un rechargement). */
  jusqua: number;
  essais: number;
}

export interface ClavierPinProps {
  /** Nombre de chiffres du PIN (6 dans les planches). */
  longueur?: number;
  titre?: ReactNode;
  sousTitre?: ReactNode;
  /** Texte sous le clavier. */
  note?: ReactNode;
  /**
   * Reçoit le PIN complet, une seule fois, dès que le dernier chiffre est saisi.
   * Renvoyer `false` (ou une promesse qui donne `false`) compte un essai raté ;
   * renvoyer autre chose, ou ne rien renvoyer, accepte la saisie. Une exception
   * est une erreur technique : elle ne compte pas comme un essai.
   */
  onComplet: (pin: string) => boolean | void | Promise<boolean | void>;
  essaisMax?: number;
  dureeBlocageMs?: number;
  /** Appelé quand le dernier essai est raté. Le blocage est aussi tenu par le composant jusqu'à `jusqua`. */
  onBlocage?: (info: InfoBlocage) => void;
  onDeblocage?: () => void;
  /** Appelé à chaque essai raté non bloquant, avec le nombre d'essais restants. */
  onEchec?: (essaisRestants: number) => void;
  /** Blocage déjà en cours (par exemple relu par l'appelant après un rechargement). */
  bloqueJusqua?: number | null;
  /** Demande l'empreinte ; la touche n'apparaît que si ce callback est fourni et que le navigateur la propose. */
  onEmpreinte?: () => void;
  /** « auto » : détecte WebAuthn. `true` / `false` forcent l'affichage de la touche empreinte. */
  empreinte?: "auto" | boolean;
  className?: string;
  "aria-label"?: string;
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const secondes = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secondes).padStart(2, "0")}`;
}

const CHIFFRES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function IconeEmpreinte() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 11a4 4 0 0 1 4 4v3M8 15a4 4 0 0 1 8-4M5 12a7 7 0 0 1 14 0v5M12 7a5 5 0 0 1 5 5" />
    </svg>
  );
}

function IconeEffacer() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6" />
    </svg>
  );
}

/**
 * Clavier PIN 3 x 4 avec empreinte, effacer et points de progression.
 *
 * Le PIN n'est jamais gardé en clair : les chiffres vont dans un tampon mémoire
 * (hors état React, hors DOM, hors stockage du navigateur) qui est remis à zéro
 * dès que le PIN est remis à l'appelant. L'affichage ne connaît que le nombre de
 * chiffres saisis. Après `essaisMax` essais ratés, le clavier se bloque pendant
 * `dureeBlocageMs` (15 min) et `onBlocage` prévient l'appelant.
 */
export function ClavierPin({
  longueur = 6,
  titre,
  sousTitre,
  note,
  onComplet,
  essaisMax = ESSAIS_MAX_PAR_DEFAUT,
  dureeBlocageMs = BLOCAGE_PAR_DEFAUT_MS,
  onBlocage,
  onDeblocage,
  onEchec,
  bloqueJusqua = null,
  onEmpreinte,
  empreinte = "auto",
  className,
  "aria-label": ariaLabel = "Clavier PIN",
}: ClavierPinProps) {
  const tampon = useRef<Uint8Array>(new Uint8Array(longueur));
  const compte = useRef(0);
  const occupe = useRef(false);
  const echecs = useRef(0);
  const rappels = useRef({ onComplet, onBlocage, onDeblocage, onEchec });
  rappels.current = { onComplet, onBlocage, onDeblocage, onEchec };

  const [saisis, setSaisis] = useState(0);
  const [verification, setVerification] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bloqueA, setBloqueA] = useState<number | null>(() =>
    bloqueJusqua !== null && bloqueJusqua > Date.now() ? bloqueJusqua : null,
  );
  const [reste, setReste] = useState(0);

  const detectee = useEmpreinteDisponible();
  const afficheEmpreinte = Boolean(onEmpreinte) && (empreinte === "auto" ? detectee : empreinte);
  const bloque = bloqueA !== null;

  useEffect(() => {
    if (bloqueJusqua !== null && bloqueJusqua > Date.now()) setBloqueA(bloqueJusqua);
  }, [bloqueJusqua]);

  useEffect(() => {
    if (bloqueA === null) return;
    const battre = () => {
      const restant = bloqueA - Date.now();
      if (restant <= 0) {
        setBloqueA(null);
        setReste(0);
        setMessage(null);
        echecs.current = 0;
        rappels.current.onDeblocage?.();
      } else {
        setReste(restant);
      }
    };
    battre();
    const minuteur = setInterval(battre, 1000);
    return () => clearInterval(minuteur);
  }, [bloqueA]);

  // Remise à zéro du tampon au démontage.
  useEffect(() => {
    const courant = tampon.current;
    return () => {
      courant.fill(0);
    };
  }, []);

  const vider = () => {
    tampon.current.fill(0);
    compte.current = 0;
  };

  const valider = async () => {
    const pin = Array.from(tampon.current.subarray(0, longueur)).join("");
    vider();
    occupe.current = true;
    setVerification(true);
    let accepte = true;
    let technique = false;
    try {
      const resultat = await rappels.current.onComplet(pin);
      accepte = resultat !== false;
    } catch {
      accepte = false;
      technique = true;
    }
    occupe.current = false;
    setVerification(false);
    setSaisis(0);
    if (accepte) {
      echecs.current = 0;
      setMessage(null);
      return;
    }
    if (technique) {
      setMessage("Vérification impossible. Réessayez.");
      return;
    }
    echecs.current += 1;
    if (echecs.current >= essaisMax) {
      const jusqua = Date.now() + dureeBlocageMs;
      setMessage(null);
      setBloqueA(jusqua);
      rappels.current.onBlocage?.({ jusqua, essais: echecs.current });
      return;
    }
    const restants = essaisMax - echecs.current;
    setMessage(`PIN incorrect. ${restants} ${restants > 1 ? "essais restants" : "essai restant"}.`);
    rappels.current.onEchec?.(restants);
  };

  const ajouter = (chiffre: number) => {
    if (bloque || occupe.current || compte.current >= longueur) return;
    if (tampon.current.length < longueur) tampon.current = new Uint8Array(longueur);
    tampon.current[compte.current] = chiffre;
    compte.current += 1;
    setSaisis(compte.current);
    if (compte.current === longueur) void valider();
  };

  const effacer = () => {
    if (bloque || occupe.current || compte.current === 0) return;
    compte.current -= 1;
    tampon.current[compte.current] = 0;
    setSaisis(compte.current);
  };

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      ajouter(Number(e.key));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      effacer();
    }
  };

  const minutesBlocage = Math.round(dureeBlocageMs / 60000);
  const inactif = bloque || verification;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={classes(styles.panneau, className)}
      onKeyDown={auClavier}
    >
      {titre || sousTitre ? (
        <div className={styles.entete}>
          <span className={styles.titre}>{titre}</span>
          <span className={styles.sousTitre}>{sousTitre}</span>
        </div>
      ) : null}
      <div
        className={styles.points}
        role="img"
        aria-label={`${saisis} chiffres saisis sur ${longueur}`}
      >
        {Array.from({ length: longueur }, (_, i) => (
          <span key={i} className={classes(styles.point, i < saisis && styles.pointPlein)} />
        ))}
      </div>
      <div className={styles.pave}>
        {CHIFFRES.map((c) => (
          <button
            key={c}
            type="button"
            className={styles.touche}
            disabled={inactif}
            onClick={() => ajouter(c)}
          >
            {c}
          </button>
        ))}
        {afficheEmpreinte ? (
          <button
            type="button"
            className={classes(styles.touche, styles.toucheAction)}
            aria-label="Utiliser mon empreinte"
            disabled={inactif}
            onClick={() => onEmpreinte?.()}
          >
            <IconeEmpreinte />
          </button>
        ) : (
          <span className={styles.vide} aria-hidden="true" />
        )}
        <button
          type="button"
          className={styles.touche}
          disabled={inactif}
          onClick={() => ajouter(0)}
        >
          0
        </button>
        <button
          type="button"
          className={classes(styles.touche, styles.toucheAction)}
          aria-label="Effacer"
          disabled={inactif}
          onClick={effacer}
        >
          <IconeEffacer />
        </button>
      </div>
      {bloque ? (
        <>
          <p className={styles.message} role="alert">
            Trop d'essais. Clavier bloqué pendant {minutesBlocage} min.
          </p>
          <span className={styles.note}>
            Réouverture dans <time>{mmss(reste)}</time>
          </span>
        </>
      ) : message ? (
        <p className={styles.message} role="alert">
          {message}
        </p>
      ) : null}
      {note ? <span className={styles.note}>{note}</span> : null}
    </div>
  );
}
