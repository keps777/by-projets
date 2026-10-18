import { agence } from "@afrimove/api-client";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BilletAImprimer, ImpressionBillet } from "./impression";
import { rendreVente } from "./rendre-vente";

/** Attend que le contexte de vente soit affiché (le titre est déjà là pendant le chargement). */
async function attendreVente() {
  await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-0185");
}

const nom = () => screen.getByRole("textbox", { name: "Nom du voyageur" });
const telephone = () => screen.getByRole("textbox", { name: "Téléphone" });
const piece = () => screen.getByRole("textbox", { name: "Pièce (4 derniers)" });
const recu = () => screen.getByRole("textbox", { name: "Reçu :" });
const encaisser = () => screen.getByRole("link", { name: /^Encaisser et imprimer/ });
const annuler = () => screen.getByRole("link", { name: "Annuler avec le PIN du superviseur" });
const sms = () => screen.getByRole("button", { name: "SMS au voyageur : oui" });

interface VenteRecue {
  numeroPlage: number;
  donnees: {
    departId: string;
    siege: number | null;
    classe: string;
    prix: number;
    bagage: number;
    passager: { nom: string; telephone: string | null; pieceQuatreDerniers: string | null };
    paiement: { mode: string; recu: number; rendu: number; reference: string | null };
    codeBillet: string;
    sms: boolean;
  };
}

function impressionEspion(): ImpressionBillet & { imprimerBillet: ReturnType<typeof vi.fn> } {
  return { imprimerBillet: vi.fn(() => Promise.resolve()) };
}

describe("Vente · rendu de la planche", () => {
  it("affiche l'en-tête, les départs, le plan, le voyageur, le paiement et le pied du scénario de démo", async () => {
    rendreVente();
    await attendreVente();

    expect(screen.getByRole("heading", { level: 1, name: "Vendre" })).toBeInTheDocument();

    const departs: Array<[string, string]> = [
      ["08:30", "Yaoundé · 9 pl."],
      ["09:00", "Bafoussam · 28"],
      ["09:30", "Yaoundé · 40"],
    ];
    for (const [heure, destination] of departs) {
      const bouton = screen.getByRole("button", { name: `${heure} ${destination}` });
      expect(bouton).toHaveAttribute("aria-pressed", heure === "08:30" ? "true" : "false");
    }
    expect(screen.getByRole("button", { name: "+ 11" })).toBeInTheDocument();

    expect(
      screen.getByText("attribué automatiquement · touche un siège pour changer", {
        exact: false,
      }),
    ).toHaveTextContent("Siège 24 attribué automatiquement · touche un siège pour changer");
    expect(screen.getByText("9 libres")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siège 24 choisi" })).toHaveTextContent("24");
    expect(screen.getAllByRole("button", { name: /^Siège \d+ libre$/ })).toHaveLength(9);
    expect(screen.getAllByRole("img", { name: /^Siège \d+ pris$/ })).toHaveLength(34);

    expect(nom()).toHaveValue("Tchoumi Paul");
    expect(telephone()).toHaveValue("6 77 30 11 45");
    expect(piece()).toHaveValue("8820");
    expect(screen.getByRole("button", { name: "Client connu ↓" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ bagage 1 000" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    expect(screen.getByRole("button", { name: "Cash rendu : 1 000" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "MoMo push au client" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Orange Money référence" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(recu()).toHaveValue("5 000");
    expect(screen.getByText(/· billet 4 000/)).toBeInTheDocument();
    expect(sms()).toHaveTextContent("oui");

    expect(encaisser()).toHaveTextContent("Encaisser et imprimer");
    expect(encaisser()).toHaveTextContent("billet + SMS en 2 s");
    expect(encaisser()).toHaveTextContent("4 000");
  });

  it("n'affiche le badge « TOUCHE 2 » et « touche 3 · » que si le flag conception est actif", async () => {
    rendreVente();
    await attendreVente();
    expect(screen.queryByText("TOUCHE 2")).not.toBeInTheDocument();
    expect(encaisser()).not.toHaveTextContent("touche 3");
  });

  it("affiche le badge « TOUCHE 2 » et « touche 3 · » avec le flag conception", async () => {
    rendreVente({ conception: true });
    await attendreVente();
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(encaisser()).toHaveTextContent("touche 3 · billet + SMS en 2 s");
  });

  it("n'a aucun bouton grisé, nomme les liens ronds", async () => {
    rendreVente();
    await attendreVente();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    expect(annuler()).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/bientôt/i);
  });
});

describe("Vente · saisie", () => {
  it("choisir un siège libre sur le plan remplace le siège attribué", async () => {
    rendreVente();
    await attendreVente();
    await userEvent.click(screen.getByRole("button", { name: "Siège 9 libre" }));
    expect(screen.getByRole("button", { name: "Siège 9 choisi" })).toHaveTextContent("9");
    expect(screen.getByRole("button", { name: "Siège 24 libre" })).toBeInTheDocument();
    expect(screen.getByText(/choisi · touche un siège pour changer/)).toHaveTextContent(
      "Siège 9 choisi · touche un siège pour changer",
    );
  });

  it("le bagage ajoute son tarif au total et au récapitulatif", async () => {
    rendreVente();
    await attendreVente();
    await userEvent.click(screen.getByRole("button", { name: "+ bagage 1 000" }));
    expect(screen.getByRole("button", { name: "+ bagage 1 000" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(encaisser()).toHaveTextContent("5 000");
    expect(screen.getByRole("button", { name: "Cash rendu : 0" })).toBeInTheDocument();
    expect(screen.getByText(/bagage 1 000/, { selector: "span" })).toBeInTheDocument();
  });

  it("le rendu suit le montant reçu", async () => {
    rendreVente();
    await attendreVente();
    await userEvent.clear(recu());
    await userEvent.type(recu(), "10000");
    expect(recu()).toHaveValue("10 000");
    expect(screen.getByRole("button", { name: "Cash rendu : 6 000" })).toBeInTheDocument();
  });

  it("MoMo et Orange Money remplacent le reçu : MoMo montre le montant, Orange Money demande la référence", async () => {
    rendreVente();
    await attendreVente();
    await userEvent.click(screen.getByRole("button", { name: "MoMo push au client" }));
    expect(screen.queryByRole("textbox", { name: "Reçu :" })).not.toBeInTheDocument();
    expect(screen.getByText(/À encaisser :/)).toHaveTextContent(
      "À encaisser : 4 000 · billet 4 000",
    );

    await userEvent.click(screen.getByRole("button", { name: "Orange Money référence" }));
    expect(screen.getByRole("textbox", { name: "Référence :" })).toHaveValue("");
  });

  it("le SMS se coupe et se remet", async () => {
    rendreVente();
    await attendreVente();
    await userEvent.click(sms());
    expect(screen.getByRole("button", { name: "SMS au voyageur : non" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(encaisser()).toHaveTextContent("billet en 2 s");
    await userEvent.click(screen.getByRole("button", { name: "SMS au voyageur : non" }));
    expect(sms()).toHaveTextContent("oui");
  });
});

describe("Vente · encaisser", () => {
  it("vend le billet, l'imprime et mène au Guichet ; le siège et le numéro viennent du mock", async () => {
    const impression = impressionEspion();
    const { routeur, client, recus } = rendreVente({ impression });
    await attendreVente();

    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

    expect(recus).toHaveLength(1);
    const vente = recus[0] as VenteRecue;
    expect(vente.numeroPlage).toBe(1001);
    expect(vente.donnees).toMatchObject({
      siege: 24,
      classe: "classique",
      prix: 4000,
      bagage: 0,
      passager: { nom: "Tchoumi Paul", telephone: "+237677301145", pieceQuatreDerniers: "8820" },
      paiement: { mode: "cash", recu: 5000, rendu: 1000, reference: null },
      sms: true,
    });
    expect(vente.donnees.codeBillet).toMatch(/^\d{4}$/);

    expect(impression.imprimerBillet).toHaveBeenCalledTimes(1);
    const billet = impression.imprimerBillet.mock.calls[0]![0] as BilletAImprimer;
    expect(billet.numero).toBe("ALP-DLA-270105-1001");
    expect(billet.siege).toBe(24);
    expect(billet.prix).toBe(4000);

    const contexte = await client.executer(agence.OP_VENTE_CONTEXTE, {});
    expect(contexte.siege.libres).toBe(8);
    expect(contexte.siege.plan.cases.find((c) => c.numero === 24)?.etat).toBe("pris");
  });

  it("une vente complète, de la saisie à l'impression, tient en moins de 45 secondes", async () => {
    const impression = impressionEspion();
    const { routeur, recus } = rendreVente({ impression });
    await attendreVente();

    const debut = performance.now();
    await userEvent.clear(nom());
    await userEvent.type(nom(), "Ngo Marie");
    await userEvent.clear(telephone());
    await userEvent.type(telephone(), "699001122");
    await userEvent.clear(piece());
    await userEvent.type(piece(), "4471");
    await userEvent.click(screen.getByRole("button", { name: "Siège 9 libre" }));
    await userEvent.click(screen.getByRole("button", { name: "MoMo push au client" }));
    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    const duree = performance.now() - debut;

    expect(duree).toBeLessThan(45_000);
    const vente = recus[0] as VenteRecue;
    expect(vente.donnees.passager).toEqual({
      nom: "Ngo Marie",
      telephone: "+237699001122",
      pieceQuatreDerniers: "4471",
    });
    expect(vente.donnees.siege).toBe(9);
    expect(vente.donnees.paiement).toEqual({
      mode: "momo",
      recu: 0,
      rendu: 0,
      reference: null,
    });
  });

  it("envoie le bagage, le SMS coupé et la référence Orange Money", async () => {
    const { routeur, recus } = rendreVente();
    await attendreVente();
    await userEvent.click(screen.getByRole("button", { name: "+ bagage 1 000" }));
    await userEvent.click(sms());
    await userEvent.click(screen.getByRole("button", { name: "Orange Money référence" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Référence :" }), "OM-88421");
    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    const vente = recus[0] as VenteRecue;
    expect(vente.donnees).toMatchObject({
      bagage: 1000,
      prix: 4000,
      sms: false,
      paiement: { mode: "orange_money", reference: "OM-88421" },
    });
  });

  it("refuse un nom vide, un numéro invalide ou une pièce incomplète, sans rien vendre", async () => {
    const { routeur, recus } = rendreVente();
    await attendreVente();
    await userEvent.clear(nom());
    await userEvent.clear(telephone());
    await userEvent.type(telephone(), "12345");
    await userEvent.clear(piece());
    await userEvent.type(piece(), "88");
    await userEvent.click(encaisser());

    expect(await screen.findByText("Indiquez le nom du voyageur.")).toBeInTheDocument();
    expect(screen.getByText("Numéro invalide : 9 chiffres, en 6.")).toBeInTheDocument();
    expect(screen.getByText("Quatre chiffres.")).toBeInTheDocument();
    expect(recus).toHaveLength(0);
    expect(routeur.state.location.pathname).toBe("/guichet/vendre");
  });

  it("refuse un cash inférieur au prix et une référence Orange Money vide", async () => {
    const { recus } = rendreVente();
    await attendreVente();
    await userEvent.clear(recu());
    await userEvent.type(recu(), "3000");
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le montant reçu est inférieur au prix.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Orange Money référence" }));
    await userEvent.click(encaisser());
    expect(await screen.findByText("Saisissez la référence Orange Money.")).toBeInTheDocument();
    expect(recus).toHaveLength(0);
  });

  it("un autre départ n'a pas son plan ni son tarif chargés : rien n'est vendu", async () => {
    const { recus } = rendreVente();
    await attendreVente();
    await userEvent.click(screen.getByRole("button", { name: "09:00 Bafoussam · 28" }));
    expect(screen.getByText("Le plan de ce départ n'est pas encore chargé.")).toBeInTheDocument();
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le plan et le tarif de ce départ ne sont pas encore chargés.",
    );
    expect(recus).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "08:30 Yaoundé · 9 pl." }));
    expect(screen.getByRole("button", { name: "Siège 24 choisi" })).toBeInTheDocument();
  });

  it("reste sur la vente avec une alerte si l'envoi échoue", async () => {
    const { routeur } = rendreVente({ panne: "vente" });
    await attendreVente();
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La vente n'a pas été enregistrée. Réessayez.",
    );
    expect(routeur.state.location.pathname).toBe("/guichet/vendre");
  });

  it("siège déjà pris : alerte, le plan se recharge et un nouvel essai passe", async () => {
    const { routeur, recus } = rendreVente({ panne: "siege_pris" });
    await attendreVente();
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce siège vient d'être pris. Choisissez-en un autre.",
    );
    expect(routeur.state.location.pathname).toBe("/guichet/vendre");

    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    expect(recus).toHaveLength(2);
  });

  // Non-régression de l'anomalie A9 (recette AM-181) : l'écran annonçait « billet n° …-0014 » (le prochain numéro du
  // serveur) mais le billet partait avec le compteur de l'appareil (1001 pour un téléphone neuf) → 409 NUMERO_EN_DOUBLE.
  describe("numéro du billet : celui que le serveur annonce (téléphone neuf sur un guichet qui a déjà vendu)", () => {
    it("annonce le numéro du serveur et envoie le billet avec ce numéro, pas avec le début de la plage", async () => {
      const impression = impressionEspion();
      const { routeur, recus } = rendreVente({ impression, sequencesServeur: [1014] });
      await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-1014");

      await userEvent.click(encaisser());
      await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

      expect(recus).toHaveLength(1);
      expect((recus[0] as VenteRecue).numeroPlage).toBe(1014);
      const billet = impression.imprimerBillet.mock.calls[0]![0] as BilletAImprimer;
      expect(billet.numero).toBe("ALP-DLA-270105-1014");
    });

    it("un second billet prend la suite, sans retourner au début de la plage", async () => {
      const impression = impressionEspion();
      const { routeur, recus } = rendreVente({ impression, sequencesServeur: [1014, 1015] });
      await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-1014");
      await userEvent.click(encaisser());
      await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

      await routeur.navigate("/guichet/vendre");
      await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-1015");
      // Un siège libre du plan rechargé (le premier billet a pris le 24), et le voyageur suivant.
      await userEvent.click(screen.getAllByRole("button", { name: /^Siège \d+ libre$/ })[0]!);
      await userEvent.type(nom(), "Ngo Marie");
      await userEvent.click(encaisser());
      await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
      expect(recus.map((r) => (r as VenteRecue).numeroPlage)).toEqual([1014, 1015]);
    });

    it("si un autre téléphone du guichet a vendu entre-temps (409 NUMERO_EN_DOUBLE), relit le numéro et réessaie une fois", async () => {
      const { routeur, recus } = rendreVente({
        panne: "numero_en_double",
        sequencesServeur: [1014, 1020],
      });
      await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-1014");

      await userEvent.click(encaisser());
      await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

      expect(recus.map((r) => (r as VenteRecue).numeroPlage)).toEqual([1014, 1020]);
    });

    it("un numéro déjà pris que le serveur ne sait pas lever (deuxième refus) se termine par l'alerte habituelle", async () => {
      // Le serveur annonce toujours 1014 mais refuse deux fois : une seule relance, puis l'alerte.
      const { routeur, recus } = rendreVente({ panne: "vente", sequencesServeur: [1014] });
      await screen.findByText("Guichet 2 · billet n° ALP-DLA-270105-1014");
      await userEvent.click(encaisser());
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "La vente n'a pas été enregistrée.",
      );
      expect(routeur.state.location.pathname).toBe("/guichet/vendre");
      expect(recus).toHaveLength(1);
    });
  });

  it("si l'impression échoue, le billet est déjà vendu : on réimprime sans le revendre", async () => {
    const imprimerBillet = vi
      .fn<ImpressionBillet["imprimerBillet"]>()
      .mockRejectedValueOnce(new Error("Papier vide"))
      .mockResolvedValue(undefined);
    const { routeur, recus } = rendreVente({ impression: { imprimerBillet } });
    await attendreVente();

    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le billet ALP-DLA-270105-1001 est vendu, mais l'impression a échoué.",
    );
    expect(routeur.state.location.pathname).toBe("/guichet/vendre");

    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    expect(recus).toHaveLength(1);
    expect(imprimerBillet).toHaveBeenCalledTimes(2);
  });
});

describe("Vente · navigation", () => {
  it("« Retour au guichet » mène au Guichet (/guichet/accueil)", async () => {
    const { routeur } = rendreVente();
    await attendreVente();
    const retour = screen.getByRole("link", { name: "Retour au guichet" });
    expect(retour).toHaveAttribute("href", "/guichet/accueil");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
  });

  it("« Annuler avec le PIN du superviseur » mène au Superviseur (/gare) sans rien vendre", async () => {
    const { routeur, recus } = rendreVente();
    await attendreVente();
    expect(annuler()).toHaveAttribute("href", "/gare");
    await userEvent.click(annuler());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/gare"));
    expect(recus).toHaveLength(0);
  });

  it("« Encaisser et imprimer » pointe vers le Guichet (/guichet/accueil)", async () => {
    rendreVente();
    await attendreVente();
    expect(encaisser()).toHaveAttribute("href", "/guichet/accueil");
  });
});

describe("Vente · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête et le retour", async () => {
    rendreVente({ latenceMs: 200 });
    expect(
      await screen.findByRole("status", { name: "Chargement de la vente" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    await attendreVente();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("montre l'état vide quand il n'y a pas de départ (404)", async () => {
    rendreVente({ panne: "vide" });
    expect(await screen.findByText("Aucun départ ouvert à la vente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreVente({ panne: "erreur" });
    const alerte = await screen.findByRole("alert");
    expect(within(alerte).getByText("Impossible de charger la vente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });
});
