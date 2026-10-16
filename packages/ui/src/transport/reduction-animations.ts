import { useEffect, useState } from "react";

const REQUETE = "(prefers-reduced-motion: reduce)";

function lirePreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REQUETE).matches;
}

/** Vrai quand le système demande de réduire les animations. Suit les changements en direct. */
export function useReductionAnimations(): boolean {
  const [reduit, setReduit] = useState(lirePreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const requete = window.matchMedia(REQUETE);
    const maj = () => setReduit(requete.matches);
    maj();
    requete.addEventListener("change", maj);
    return () => requete.removeEventListener("change", maj);
  }, []);

  return reduit;
}
