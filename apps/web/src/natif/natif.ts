import { cheminInterne, hotesDeLiens, naviguerVers } from "./liens";
import { actionRetour, RACINES } from "./retour";

/**
 * Pont avec la coquille Capacitor (AM-184). Le code est celui du navigateur : tout ce qui suit est sans effet hors de
 * l'application emballée, et les greffons natifs ne sont même pas chargés (imports dynamiques).
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** Vrai dans l'application Android / iOS emballée ; faux dans un navigateur. Capacitor pose `window.Capacitor` avant la page. */
export function estNatif(fenetre: Window = window): boolean {
  const capacitor = (fenetre as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Ce que ce module utilise des greffons @capacitor/app et @capacitor/splash-screen (remplaçable dans les tests). */
export interface PontNatif {
  lienDeLancement(): Promise<string | null>;
  surLienOuvert(ecouteur: (url: string) => void): Promise<{ remove(): Promise<void> }>;
  surRetour(ecouteur: (peutReculer: boolean) => void): Promise<{ remove(): Promise<void> }>;
  quitter(): Promise<void>;
  masquerEcranDeLancement(): Promise<void>;
}

async function pontCapacitor(): Promise<PontNatif> {
  const [{ App }, { SplashScreen }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/splash-screen"),
  ]);
  return {
    lienDeLancement: async () => (await App.getLaunchUrl())?.url ?? null,
    surLienOuvert: (ecouteur) => App.addListener("appUrlOpen", ({ url }) => ecouteur(url)),
    surRetour: (ecouteur) => App.addListener("backButton", ({ canGoBack }) => ecouteur(canGoBack)),
    quitter: () => App.exitApp(),
    masquerEcranDeLancement: () => SplashScreen.hide(),
  };
}

export interface OptionsNatif {
  fenetre?: Window;
  /** Hôtes des liens web ; par défaut `VITE_LIENS_HOTES` (figé au build). */
  hotes?: readonly string[];
  racines?: readonly string[];
  /** Force le mode natif (tests) ; par défaut `estNatif(fenetre)`. */
  natif?: boolean;
  pont?: () => Promise<PontNatif>;
}

/**
 * À appeler une fois, après le premier rendu : masque l'écran de lancement, suit les liens entrants (ouverture à froid
 * comprise) et règle le bouton retour. Renvoie la fonction qui défait tout, ou `null` hors de l'application emballée.
 */
export async function brancherNatif(options: OptionsNatif = {}): Promise<(() => void) | null> {
  const fenetre = options.fenetre ?? window;
  if (!(options.natif ?? estNatif(fenetre))) return null;

  const hotes =
    options.hotes ??
    hotesDeLiens((import.meta.env as Record<string, string | undefined>).VITE_LIENS_HOTES);
  const racines = options.racines ?? RACINES;

  let pont: PontNatif;
  try {
    pont = await (options.pont ?? pontCapacitor)();
  } catch {
    // Greffon absent : l'application reste utilisable, sans liens ni retour personnalisé.
    return null;
  }

  // Deux images plus tard le premier rendu de React est à l'écran : l'écran de lancement peut partir. Programmé en
  // premier : même si un écouteur échoue, il ne reste pas collé (le filet de capacitor.config.ts le retire à 3 s).
  fenetre.requestAnimationFrame(() => {
    fenetre.requestAnimationFrame(() => {
      void pont.masquerEcranDeLancement().catch(() => undefined);
    });
  });

  const suivre = (url: string) => {
    const chemin = cheminInterne(url, hotes);
    if (chemin) naviguerVers(chemin, fenetre);
  };

  const ecouteurs = [
    await pont.surRetour((peutReculer) => {
      if (actionRetour(peutReculer, fenetre.location.pathname, racines) === "reculer") {
        fenetre.history.back();
      } else {
        void pont.quitter();
      }
    }),
  ];

  // Lien qui a lancé l'application (démarrage à froid) : suivi une fois ; si Capacitor le redonne ensuite par
  // l'événement appUrlOpen, cette répétition est ignorée.
  let dejaSuivi: string | null = null;
  try {
    const lancement = await pont.lienDeLancement();
    if (lancement) {
      dejaSuivi = lancement;
      suivre(lancement);
    }
  } catch {
    // Pas de lien de lancement lisible : on démarre sur l'accueil.
  }

  ecouteurs.push(
    await pont.surLienOuvert((url) => {
      if (url === dejaSuivi) {
        dejaSuivi = null;
        return;
      }
      suivre(url);
    }),
  );

  return () => {
    for (const ecouteur of ecouteurs) void ecouteur.remove();
  };
}
