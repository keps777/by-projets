import { useRef } from "react";
import type { FormEvent } from "react";
import styles from "./compteur.module.css";
import { classes, useControlled } from "./utils";

export interface ChampRechercheProps {
  value?: string;
  defaultValue?: string;
  onChange?: (valeur: string) => void;
  /** Appelé à la touche Entrée ou au bouton « Rechercher » du clavier mobile. */
  onRecherche?: (valeur: string) => void;
  /** Nom accessible du champ. */
  label?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

/** Champ de recherche : loupe, saisie, bouton d'effacement, région « search ». */
export function ChampRecherche({
  value,
  defaultValue = "",
  onChange,
  onRecherche,
  label = "Rechercher",
  placeholder,
  name,
  id,
  autoFocus,
  className,
}: ChampRechercheProps) {
  const [texte, setTexte] = useControlled(value, defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  const changer = (suivant: string) => {
    setTexte(suivant);
    onChange?.(suivant);
  };
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onRecherche?.(texte);
  };

  return (
    <form role="search" className={classes(styles.recherche, className)} onSubmit={envoyer}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        ref={ref}
        id={id}
        name={name}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        className={styles.rechercheSaisie}
        aria-label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={texte}
        onChange={(e) => changer(e.target.value)}
      />
      {texte !== "" ? (
        <button
          type="button"
          className={styles.effacer}
          aria-label="Effacer la recherche"
          onClick={() => {
            changer("");
            ref.current?.focus();
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </form>
  );
}
