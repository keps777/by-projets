import { afterEach, describe, expect, it } from "vitest";
import { CIBLE_MIN, choisirCible, cibleDeSecours, zoneTactile } from "./cible-tactile";

const rect = (left: number, top: number, largeur: number, hauteur: number) => ({
  left,
  top,
  right: left + largeur,
  bottom: top + hauteur,
});

describe("zoneTactile", () => {
  it("complète une cible de 32 px de haut à 44 px, à parts égales de chaque côté", () => {
    expect(zoneTactile(rect(10, 100, 100, 32))).toEqual({
      left: 10,
      top: 94,
      right: 110,
      bottom: 138,
    });
  });

  it("n'agrandit pas une cible déjà assez grande", () => {
    const grande = rect(0, 0, 120, 56);
    expect(zoneTactile(grande)).toEqual(grande);
  });

  it("agrandit chaque dimension séparément", () => {
    const zone = zoneTactile(rect(0, 0, 24, 60));
    expect(zone.right - zone.left).toBe(CIBLE_MIN);
    expect(zone.bottom - zone.top).toBe(60);
  });
});

describe("choisirCible", () => {
  const puce = { element: "puce", rect: rect(100, 100, 52, 32) };
  const voisine = { element: "voisine", rect: rect(100, 138, 52, 32) }; // juste en dessous, 6 px d'écart

  it("renvoie la cible dont la zone de 44 px contient l'appui (au-dessus de la puce de 32 px)", () => {
    expect(choisirCible([puce], 120, 96)).toBe("puce");
    expect(choisirCible([puce], 120, 137)).toBe("puce");
  });

  it("ignore un appui hors de la zone de 44 px", () => {
    expect(choisirCible([puce], 120, 80)).toBeNull();
    expect(choisirCible([puce], 120, 150)).toBeNull();
  });

  it("choisit la plus proche quand deux zones se recouvrent", () => {
    expect(choisirCible([puce, voisine], 120, 134)).toBe("puce");
    expect(choisirCible([puce, voisine], 120, 136)).toBe("voisine");
  });

  it("ne reprend pas une cible déjà assez grande : elle reçoit l'appui elle-même", () => {
    const bouton = { element: "bouton", rect: rect(0, 0, 200, 56) };
    expect(choisirCible([bouton], 100, 60)).toBeNull();
  });
});

describe("cibleDeSecours", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function monter(): { racine: HTMLElement; puce: HTMLElement; vide: HTMLElement } {
    document.body.innerHTML = `
      <main id="racine">
        <button id="puce">Tout</button>
        <button id="grand">Valider</button>
        <label for="champ">Nom</label><input id="champ" />
        <div id="vide"></div>
      </main>`;
    const racine = document.getElementById("racine") as HTMLElement;
    const place = (id: string, r: ReturnType<typeof rect>) => {
      const el = document.getElementById(id) as HTMLElement;
      el.getBoundingClientRect = () =>
        ({
          ...r,
          x: r.left,
          y: r.top,
          width: r.right - r.left,
          height: r.bottom - r.top,
        }) as DOMRect;
    };
    place("puce", rect(100, 100, 52, 32));
    place("grand", rect(100, 300, 200, 56));
    return {
      racine,
      puce: document.getElementById("puce") as HTMLElement,
      vide: document.getElementById("vide") as HTMLElement,
    };
  }

  it("renvoie l'appui à la puce voisine", () => {
    const { racine, puce, vide } = monter();
    expect(cibleDeSecours(racine, vide, 120, 97)).toBe(puce);
  });

  it("ne fait rien quand l'appui est loin de toute cible", () => {
    const { racine, vide } = monter();
    expect(cibleDeSecours(racine, vide, 120, 200)).toBeNull();
  });

  it("ne détourne pas un appui qui touche déjà un contrôle", () => {
    const { racine, puce } = monter();
    expect(cibleDeSecours(racine, puce, 120, 97)).toBeNull();
    const champ = document.getElementById("champ") as HTMLElement;
    expect(cibleDeSecours(racine, champ, 120, 97)).toBeNull();
  });

  it("n'active pas une cible cachée derrière une fenêtre modale (le voile reçoit l'appui)", () => {
    const { racine, vide } = monter();
    const original = document.elementFromPoint;
    document.elementFromPoint = () => vide; // au centre de la puce, on voit le voile, pas la puce
    try {
      expect(cibleDeSecours(racine, vide, 120, 97)).toBeNull();
    } finally {
      document.elementFromPoint = original;
    }
  });

  it("ignore une cible désactivée", () => {
    const { racine, puce, vide } = monter();
    puce.setAttribute("disabled", "");
    expect(cibleDeSecours(racine, vide, 120, 97)).toBeNull();
  });
});
