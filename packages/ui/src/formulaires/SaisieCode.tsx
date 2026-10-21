import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import styles from "./saisie-code.module.css";
import { classes, useControlled } from "./utils";

export interface SaisieCodeProps {
  /** 4 ou 6 chiffres. */
  longueur: 4 | 6;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  /** Appelé une fois, quand le code atteint sa longueur (saisie, collage, SMS ou WebOTP). */
  onComplete?: (code: string) => void;
  /** Nom accessible du champ. */
  label?: string;
  erreur?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
  id?: string;
  /** Demande le code à l'API WebOTP quand le navigateur la propose (Chrome Android). */
  webOtp?: boolean;
  className?: string;
}

interface OtpCredentialRequest extends CredentialRequestOptions {
  otp: { transport: string[] };
}

function chiffres(texte: string, longueur: number): string {
  return texte.replace(/\D/g, "").slice(0, longueur);
}

/**
 * Saisie de code à cases. Un seul champ réel (autocomplete="one-time-code",
 * clavier numérique) porte la saisie : le téléphone propose le code reçu par SMS
 * au-dessus du clavier, et le collage fonctionne. Les cases ne font qu'afficher.
 */
export function SaisieCode({
  longueur,
  value,
  defaultValue = "",
  onChange,
  onComplete,
  label = "Code reçu par SMS",
  erreur,
  disabled = false,
  autoFocus = false,
  name,
  id,
  webOtp = true,
  className,
}: SaisieCodeProps) {
  const [code, setCode] = useControlled(value, defaultValue);
  const [focus, setFocus] = useState(false);

  const appliquer = (brut: string) => {
    const suivant = chiffres(brut, longueur);
    if (suivant === code) return;
    setCode(suivant);
    onChange?.(suivant);
    if (suivant.length === longueur) onComplete?.(suivant);
  };
  const dernier = useRef(appliquer);
  dernier.current = appliquer;

  useEffect(() => {
    if (!webOtp || typeof window === "undefined") return;
    if (!("OTPCredential" in window) || !navigator.credentials) return;
    const arret = new AbortController();
    const requete: OtpCredentialRequest = { otp: { transport: ["sms"] }, signal: arret.signal };
    navigator.credentials
      .get(requete)
      .then((credential) => {
        const recu = credential && "code" in credential ? String(credential.code) : "";
        if (recu) dernier.current(recu);
      })
      .catch(() => {
        /* annulé, refusé ou non pris en charge : la saisie manuelle reste possible */
      });
    return () => arret.abort();
  }, [webOtp]);

  // Case en évidence : la dernière remplie, ou la première si rien n'est saisi.
  const active = focus ? Math.max(0, Math.min(code.length - 1, longueur - 1)) : -1;
  const idErreur = erreur && id ? `${id}-erreur` : undefined;

  return (
    <div className={classes(styles.code, className)}>
      <div
        className={styles.cases}
        style={{ gridTemplateColumns: `repeat(${longueur}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: longueur }, (_, i) => {
          const c = code[i];
          return (
            <span
              key={i}
              aria-hidden="true"
              data-testid="case-code"
              className={classes(
                styles.case,
                c === undefined && styles.caseVide,
                i === active && styles.caseActive,
                Boolean(erreur) && styles.caseErreur,
              )}
            >
              {c ?? "_"}
            </span>
          );
        })}
        <input
          id={id}
          name={name}
          className={styles.saisie}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          aria-label={label}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={idErreur}
          disabled={disabled}
          autoFocus={autoFocus}
          value={code}
          onChange={(e: ChangeEvent<HTMLInputElement>) => appliquer(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
      </div>
      {erreur ? (
        <span id={idErreur} className={styles.erreur} role="alert">
          {erreur}
        </span>
      ) : null}
    </div>
  );
}
