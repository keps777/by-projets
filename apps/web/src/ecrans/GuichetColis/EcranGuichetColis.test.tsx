import { agence } from "@afrimove/api-client";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { EtiquetteAImprimer, PiloteEtiquette } from "./impression";
import { rendreColis } from "./rendre-guichet-colis";

/** Attend que le formulaire soit affiché (l'en-tête est déjà là pendant le chargement). */
async function attendreFormulaire() {
  await screen.findByLabelText("Contenu déclaré");
}

const champ = (nom: string) => screen.getByRole("textbox", { name: nom });
const encaisser = () => screen.getByRole("link", { name: /^Encaisser · imprimer l'étiquette/ });
/** Une suite isolée de six chiffres : la forme d'un code de retrait (le numéro de colis, lui, est séparé par des tirets). */
const CODE_DE_RETRAIT = /(?<![-\d])\d{6}(?![-\d])/;
const apercu = () => screen.getByRole("region", { name: /^Aperçu de l'étiquette colis/ });

function pilote(): PiloteEtiquette & { imprimer: ReturnType<typeof vi.fn> } {
  return { imprimer: vi.fn<(e: EtiquetteAImprimer) => Promise<void>>(() => Promise.resolve()) };
}

describe("GuichetColis · rendu de la planche", () => {
  it("affiche le formulaire, les départs, l'étiquette et le paiement du scénario de démo", async () => {
    rendreColis();
    await attendreFormulaire();

    expect(
      screen.getByRole("heading", { level: 1, name: "Enregistrer un colis" }),
    ).toBeInTheDocument();
    expect(screen.getByText("C-DLA-270105-0042 · guichet 2")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^Photo prise ✓\s*reprendre$/ })).toBeInTheDocument();
    expect(champ("Expéditeur · tél.")).toHaveValue("Ngo Aïcha · 6 91 22 10 08");
    expect(champ("Destinataire · tél.")).toHaveValue("Ngo Thérèse · 6 99 40 18 22");
    expect(champ("Contenu déclaré")).toHaveValue("Médicaments, vêtements");
    expect(champ("Poids")).toHaveValue("2 kg");
    expect(champ("Valeur")).toHaveValue("25 000");

    const premier = screen.getByRole("button", { name: /^08:15/ });
    expect(premier).toHaveTextContent("Bafoussam · soute 60 %");
    expect(premier).toHaveAttribute("aria-pressed", "true");
    const second = screen.getByRole("button", { name: /^10:00/ });
    expect(second).toHaveTextContent("Bafoussam · 20 %");
    expect(second).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("link", { name: "Autre ville via une autre compagnie" }),
    ).toBeInTheDocument();

    const etiquette = within(apercu());
    expect(etiquette.getByText("Aperçu de l'étiquette · 58 × 40 mm")).toBeInTheDocument();
    expect(etiquette.getByText("imprimante OK")).toBeInTheDocument();
    expect(etiquette.getByText("DLA → BAF")).toBeInTheDocument();
    expect(etiquette.getByText("Ngo Thérèse · ···· 18 22")).toBeInTheDocument();
    expect(etiquette.getByText("C-DLA-270105-0042 · 2 kg · 08:15")).toBeInTheDocument();
    expect(
      etiquette.getByText("Alpha Voyages · afrimove.cm · pas de code ici"),
    ).toBeInTheDocument();
    expect(etiquette.getByRole("img", { name: "Code-barres du colis" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cash · 2 000" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "MoMo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Assurance ✓ 500" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(encaisser()).toHaveTextContent("code de retrait envoyé au destinataire seul");
    expect(encaisser()).toHaveTextContent(/2 000$/);
  });

  it("n'affiche le badge « TOUCHE 2 » et « touche 3 · » que si le flag conception est actif", async () => {
    rendreColis();
    await attendreFormulaire();
    expect(screen.queryByText("TOUCHE 2")).not.toBeInTheDocument();
    expect(screen.queryByText(/touche 3/)).not.toBeInTheDocument();
  });

  it("affiche le badge « TOUCHE 2 » et « touche 3 · » avec le flag conception", async () => {
    rendreColis({ conception: true });
    await attendreFormulaire();
    expect(screen.getByText("TOUCHE 2")).toBeInTheDocument();
    expect(encaisser()).toHaveTextContent("touche 3 · code de retrait envoyé au destinataire seul");
  });

  it("n'a aucun bouton grisé, nomme le retour et ne montre jamais de code de retrait sur l'étiquette", async () => {
    rendreColis();
    await attendreFormulaire();
    for (const bouton of screen.getAllByRole("button")) expect(bouton).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    // Aucune suite de six chiffres (le code de retrait) sur l'étiquette ni nulle part dans l'écran.
    expect(apercu().textContent).not.toMatch(CODE_DE_RETRAIT);
    expect(document.body.textContent).not.toMatch(CODE_DE_RETRAIT);
  });

  it("nomme l'état de l'imprimante quand elle ne répond pas", async () => {
    rendreColis({ imprimante: "papier_vide" });
    await attendreFormulaire();
    expect(within(apercu()).getByText("plus de papier")).toBeInTheDocument();
  });
});

describe("GuichetColis · saisie", () => {
  it("met l'étiquette à jour : destinataire masqué, poids et départ choisi", async () => {
    rendreColis();
    await attendreFormulaire();

    fireEvent.change(champ("Destinataire · tél."), {
      target: { value: "Njoya Paul · 6 77 30 11 45" },
    });
    fireEvent.change(champ("Poids"), { target: { value: "3,5" } });
    await userEvent.click(screen.getByRole("button", { name: /^10:00/ }));

    const etiquette = within(apercu());
    expect(etiquette.getByText("Njoya Paul · ···· 11 45")).toBeInTheDocument();
    expect(etiquette.getByText("C-DLA-270105-0042 · 3,5 kg · 10:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^10:00/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^08:15/ })).toHaveAttribute("aria-pressed", "false");
    // Le départ choisi porte « soute », l'autre non.
    expect(screen.getByRole("button", { name: /^10:00/ })).toHaveTextContent(
      "Bafoussam · soute 20 %",
    );
    expect(screen.getByRole("button", { name: /^08:15/ })).toHaveTextContent("Bafoussam · 60 %");
  });

  it("choisit le mode d'encaissement : le montant suit le mode choisi", async () => {
    rendreColis();
    await attendreFormulaire();
    await userEvent.click(screen.getByRole("button", { name: "MoMo" }));
    expect(screen.getByRole("button", { name: "MoMo · 2 000" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cash" })).toHaveAttribute("aria-pressed", "false");
  });

  it("recalcule le total quand on retire l'assurance, ou que la valeur change", async () => {
    rendreColis();
    await attendreFormulaire();

    await userEvent.click(screen.getByRole("button", { name: "Assurance ✓ 500" }));
    expect(screen.getByRole("button", { name: "Assurance 500" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Cash · 1 500" })).toBeInTheDocument();
    expect(encaisser()).toHaveTextContent(/1 500$/);

    await userEvent.click(screen.getByRole("button", { name: "Assurance 500" }));
    // 2 % de 100 000 F : 2 000 F de prime (règle du domaine).
    fireEvent.change(champ("Valeur"), { target: { value: "100000" } });
    expect(screen.getByRole("button", { name: "Assurance ✓ 2 000" })).toBeInTheDocument();
    expect(encaisser()).toHaveTextContent(/3 500$/);
  });

  it("reprend la photo : le bouton ouvre le sélecteur et la photo prise reste cochée", async () => {
    rendreColis();
    await attendreFormulaire();
    const entree = document.querySelector<HTMLInputElement>("input[type=file]")!;
    const ouvrir = vi.spyOn(entree, "click");
    await userEvent.click(screen.getByRole("button", { name: /^Photo prise ✓/ }));
    expect(ouvrir).toHaveBeenCalled();
    await userEvent.upload(entree, new File(["x"], "colis.jpg", { type: "image/jpeg" }));
    expect(screen.getByRole("button", { name: /^Photo prise ✓/ })).toBeInTheDocument();
  });
});

describe("GuichetColis · navigation et encaissement", () => {
  it("« Retour au guichet » mène au Guichet (/guichet/accueil)", async () => {
    const { routeur } = rendreColis();
    await attendreFormulaire();
    const retour = screen.getByRole("link", { name: "Retour au guichet" });
    expect(retour).toHaveAttribute("href", "/guichet/accueil");
    await userEvent.click(retour);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
  });

  it("« Autre ville via une autre compagnie » mène à InterAgences (/inter-agences)", async () => {
    const { routeur } = rendreColis();
    await attendreFormulaire();
    const lien = screen.getByRole("link", { name: "Autre ville via une autre compagnie" });
    expect(lien).toHaveAttribute("href", "/inter-agences");
    await userEvent.click(lien);
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/inter-agences"));
  });

  it("« Encaisser » enregistre le colis, imprime l'étiquette sans code, puis mène au Guichet", async () => {
    const imprimante = pilote();
    const { routeur, client, envoyes } = rendreColis({ pilote: imprimante });
    await attendreFormulaire();
    expect(encaisser()).toHaveAttribute("href", "/guichet/accueil");

    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));

    const [colis, impression] = envoyes;
    expect(colis?.type).toBe("colis.enregistre");
    expect(colis?.donnees).toMatchObject({
      expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Médicaments, vêtements",
      poidsKg: 2,
      valeurDeclaree: 25_000,
      assure: true,
      paiement: { mode: "cash", montant: 2000 },
    });
    expect(impression?.type).toBe("impression.demandee");
    expect(impression?.donnees).toMatchObject({
      document: "etiquette_colis",
      documentId: colis?.donnees.colisId,
      copies: 1,
      reimpression: false,
    });
    // Le code de retrait ne figure ni dans l'événement ni sur l'étiquette envoyée à l'imprimante :
    // il part par SMS au destinataire seul, depuis le serveur.
    expect(JSON.stringify(envoyes)).not.toMatch(/code/i);
    expect(imprimante.imprimer).toHaveBeenCalledOnce();
    const etiquette = imprimante.imprimer.mock.calls[0]?.[0] as EtiquetteAImprimer;
    expect(JSON.stringify(etiquette)).not.toMatch(/code/i);
    expect(JSON.stringify(etiquette)).not.toMatch(CODE_DE_RETRAIT);
    expect(etiquette).toMatchObject({
      largeurMm: 58,
      hauteurMm: 40,
      trajet: { origine: "DLA", destination: "BAF" },
      destinataire: "Ngo Thérèse · ···· 18 22",
      heureDepart: "08:15",
      compagnie: "Alpha Voyages",
    });

    const formulaire = await client.executer(agence.OP_COLIS_FORMULAIRE, {});
    expect(formulaire.prochainNumero.sequence).toBeGreaterThan(42);
    expect(formulaire.brouillon).toBeNull();
  });

  it("envoie le mode, le montant et l'assurance choisis", async () => {
    const { routeur, envoyes } = rendreColis();
    await attendreFormulaire();
    await userEvent.click(screen.getByRole("button", { name: "MoMo" }));
    await userEvent.click(screen.getByRole("button", { name: "Assurance ✓ 500" }));
    await userEvent.click(encaisser());
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    expect(envoyes[0]?.donnees).toMatchObject({
      assure: false,
      paiement: { mode: "momo", montant: 1500 },
    });
  });

  it("refuse un colis incomplet : champs en rouge, rien n'est envoyé", async () => {
    const { routeur, envoyes } = rendreColis({ sansBrouillon: true });
    await attendreFormulaire();
    expect(screen.getByRole("button", { name: "Prendre la photo" })).toBeInTheDocument();
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent("Complétez la photo");
    expect(champ("Expéditeur · tél.")).toHaveAttribute("aria-invalid", "true");
    expect(champ("Destinataire · tél.")).toHaveAttribute("aria-invalid", "true");
    expect(envoyes).toHaveLength(0);
    expect(routeur.state.location.pathname).toBe("/guichet/colis");
  });

  it("rejette un numéro de téléphone incomplet", async () => {
    const { envoyes } = rendreColis();
    await attendreFormulaire();
    fireEvent.change(champ("Destinataire · tél."), { target: { value: "Ngo Thérèse · 6 99 40" } });
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(champ("Destinataire · tél.")).toHaveAttribute("aria-invalid", "true");
    expect(envoyes).toHaveLength(0);
  });

  it("reste sur l'écran avec une alerte si l'enregistrement échoue", async () => {
    const imprimante = pilote();
    const { routeur } = rendreColis({ panne: "enregistrement", pilote: imprimante });
    await attendreFormulaire();
    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent("Le colis n'a pas été enregistré");
    expect(routeur.state.location.pathname).toBe("/guichet/colis");
    expect(imprimante.imprimer).not.toHaveBeenCalled();
  });

  it("si l'imprimante échoue, le colis reste enregistré et le nouvel essai ne le double pas", async () => {
    const imprimante = pilote();
    imprimante.imprimer.mockRejectedValueOnce(new Error("papier coincé"));
    const { routeur, envoyes } = rendreColis({ pilote: imprimante });
    await attendreFormulaire();

    await userEvent.click(encaisser());
    expect(await screen.findByRole("alert")).toHaveTextContent("l'étiquette n'est pas sortie");
    expect(routeur.state.location.pathname).toBe("/guichet/colis");
    expect(envoyes.map((e) => e.type)).toEqual(["colis.enregistre"]);

    await userEvent.click(screen.getByRole("link", { name: /^Colis enregistré · imprimer/ }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/guichet/accueil"));
    expect(envoyes.map((e) => e.type)).toEqual(["colis.enregistre", "impression.demandee"]);
    expect(imprimante.imprimer).toHaveBeenCalledTimes(2);
  });
});

describe("GuichetColis · états chargement, vide et erreur", () => {
  it("montre un chargement dans le style nuit, avec l'en-tête et le retour", async () => {
    rendreColis({ latenceMs: 200 });
    expect(await screen.findByRole("status", { name: "Chargement du colis" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    await attendreFormulaire();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("montre l'état vide quand aucun départ n'est à charger, l'autre ville restant possible", async () => {
    rendreColis({ sansDepart: true });
    expect(await screen.findByText("Aucun départ à charger")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Autre ville/ })).toHaveAttribute(
      "href",
      "/inter-agences",
    );
  });

  it("montre l'erreur avec un bouton pour réessayer", async () => {
    rendreColis({ panne: "erreur" });
    expect(await screen.findByText("Impossible de charger le colis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Retour au guichet" })).toBeInTheDocument();
  });
});
