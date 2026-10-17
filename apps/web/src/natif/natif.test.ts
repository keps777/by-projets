import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brancherNatif, estNatif, type PontNatif } from "./natif";

type EcouteurLien = (url: string) => void;
type EcouteurRetour = (peutReculer: boolean) => void;

/** Pont de test : mémorise les écouteurs que `brancherNatif` pose et laisse les déclencher à la main. */
function fauxPont(lancement: string | null = null) {
  const etat: { lien?: EcouteurLien; retour?: EcouteurRetour } = {};
  const retirer = vi.fn(async () => undefined);
  const pont = {
    lienDeLancement: vi.fn(async () => lancement),
    surLienOuvert: vi.fn(async (e: EcouteurLien) => {
      etat.lien = e;
      return { remove: retirer };
    }),
    surRetour: vi.fn(async (e: EcouteurRetour) => {
      etat.retour = e;
      return { remove: retirer };
    }),
    quitter: vi.fn(async () => undefined),
    masquerEcranDeLancement: vi.fn(async () => undefined),
  } satisfies PontNatif;
  return { pont, etat, retirer };
}

const HOTES = ["afrimove.exemple.org"];

beforeEach(() => {
  window.history.replaceState(null, "", "/bienvenue");
  // Les deux images d'attente de l'écran de lancement passent tout de suite.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((rappel) => {
    rappel(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("estNatif", () => {
  it("est faux dans un navigateur (pas de window.Capacitor, ou pas natif)", () => {
    expect(estNatif(window)).toBe(false);
    const fausse = { Capacitor: { isNativePlatform: () => false } } as unknown as Window;
    expect(estNatif(fausse)).toBe(false);
  });

  it("est vrai quand Capacitor dit que la plateforme est native, faux s'il plante", () => {
    const native = { Capacitor: { isNativePlatform: () => true } } as unknown as Window;
    expect(estNatif(native)).toBe(true);
    const cassee = {
      Capacitor: {
        isNativePlatform: () => {
          throw new Error("bridge absent");
        },
      },
    } as unknown as Window;
    expect(estNatif(cassee)).toBe(false);
  });
});

describe("brancherNatif", () => {
  it("ne fait rien, et ne charge aucun greffon, dans un navigateur", async () => {
    const { pont } = fauxPont();
    const charger = vi.fn(async () => pont);
    await expect(brancherNatif({ pont: charger })).resolves.toBeNull();
    expect(charger).not.toHaveBeenCalled();
  });

  it("masque l'écran de lancement une fois l'application affichée", async () => {
    const { pont } = fauxPont();
    await brancherNatif({ natif: true, hotes: HOTES, pont: async () => pont });
    expect(pont.masquerEcranDeLancement).toHaveBeenCalledTimes(1);
  });

  it("suit le lien qui a lancé l'application, une seule fois même si l'événement le répète", async () => {
    const { pont, etat } = fauxPont("https://afrimove.exemple.org/depart/12");
    await brancherNatif({ natif: true, hotes: HOTES, pont: async () => pont });
    expect(window.location.pathname).toBe("/depart/12");

    const longueur = window.history.length;
    etat.lien?.("https://afrimove.exemple.org/depart/12"); // répétition de l'ouverture à froid
    expect(window.history.length).toBe(longueur);

    etat.lien?.("com.afrimove.app://colis"); // lien suivant, bien réel
    expect(window.location.pathname).toBe("/colis");
  });

  it("suit un lien reçu pendant que l'application tourne, et ignore un hôte inconnu", async () => {
    const { pont, etat } = fauxPont();
    await brancherNatif({ natif: true, hotes: HOTES, pont: async () => pont });

    etat.lien?.("https://afrimove.exemple.org/depart/7?place=2");
    expect(window.location.pathname + window.location.search).toBe("/depart/7?place=2");

    etat.lien?.("https://pirate.net/depart/99");
    expect(window.location.pathname).toBe("/depart/7");
  });

  it("bouton retour : quitte sur un accueil, recule ailleurs", async () => {
    const { pont, etat } = fauxPont();
    const reculer = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    await brancherNatif({ natif: true, hotes: HOTES, pont: async () => pont });

    window.history.replaceState(null, "", "/voyager");
    etat.retour?.(true);
    expect(pont.quitter).toHaveBeenCalledTimes(1);
    expect(reculer).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/depart/12");
    etat.retour?.(true);
    expect(reculer).toHaveBeenCalledTimes(1);
    expect(pont.quitter).toHaveBeenCalledTimes(1);

    etat.retour?.(false);
    expect(pont.quitter).toHaveBeenCalledTimes(2);
  });

  it("la fonction renvoyée retire les écouteurs", async () => {
    const { pont, retirer } = fauxPont();
    const defaire = await brancherNatif({ natif: true, hotes: HOTES, pont: async () => pont });
    expect(defaire).toBeTypeOf("function");
    defaire?.();
    expect(retirer).toHaveBeenCalledTimes(2);
  });

  it("si les greffons ne se chargent pas, l'application continue sans eux", async () => {
    const resultat = await brancherNatif({
      natif: true,
      pont: async () => {
        throw new Error("greffon absent");
      },
    });
    expect(resultat).toBeNull();
  });

  it("un lien de lancement illisible n'empêche ni le retour ni l'écran de lancement", async () => {
    const { pont, etat } = fauxPont();
    pont.lienDeLancement.mockRejectedValueOnce(new Error("illisible"));
    await brancherNatif({ natif: true, hotes: HOTES, pont: async () => pont });
    expect(etat.retour).toBeTypeOf("function");
    expect(etat.lien).toBeTypeOf("function");
    expect(pont.masquerEcranDeLancement).toHaveBeenCalledTimes(1);
  });
});
