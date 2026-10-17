import {
  ErreurReseau,
  creerClientMock,
  implementer,
  patron,
  type Scenario,
  type SourceScenarios,
} from "@afrimove/api-client";
import type { patron as contrats } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { sourceScenariosFixtures } from "@/api/source-scenarios";
import { creerI18n } from "@/i18n";
import { rendreApp } from "@/test/rendre";
import { ComptableVue } from "./comptable-vue";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

const planche = ecrans.Comptable.donnees;

type Synthese = contrats.SyntheseComptable;

function rendre(clientApi?: ReturnType<typeof creerClientMock>) {
  return rendreApp({
    fixtures: true,
    scenario: "Comptable",
    url: "/comptable",
    ...(clientApi ? { clientApi } : {}),
  });
}

async function attendreEcran() {
  return screen.findByText("Journal des ventes");
}

function principal(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

/** Le lien de la zone principale dont le texte commence par celui-ci. */
function lien(texte: string | RegExp): HTMLElement {
  const trouve = within(principal())
    .getAllByRole("link")
    .find((a) =>
      typeof texte === "string"
        ? (a.textContent ?? "").startsWith(texte)
        : texte.test(a.textContent ?? ""),
    );
  if (!trouve) throw new Error(`Pas de lien « ${String(texte)} »`);
  return trouve;
}

function clientAvec(
  modifier: (scenario: Scenario) => Scenario,
): ReturnType<typeof creerClientMock> {
  const base = sourceScenariosFixtures();
  const source: SourceScenarios = {
    ...base,
    charger: async (nom) => modifier(await base.charger(nom)),
  };
  return creerClientMock({ source, scenario: "Comptable", latenceMs: 0 });
}

/** Remplace la réponse de la synthèse du scénario ; `avant` voit les paramètres de chaque demande (le mois). */
function avecSynthese(
  transformer: (reponse: Synthese) => Synthese | Promise<Synthese>,
  avant?: (params: { mois?: string }) => void,
) {
  return clientAvec((scenario) => ({
    ...scenario,
    operations: scenario.operations.map((impl) =>
      impl.operation.nom === patron.OP_COMPTABLE.nom
        ? implementer(patron.OP_COMPTABLE, async (params, ctx) => {
            avant?.(params);
            return transformer(
              (await (impl.repondre as (p: unknown, c: unknown) => unknown)(
                params,
                ctx,
              )) as Synthese,
            );
          })
        : impl,
    ),
  }));
}

describe("Comptable · rendu de la planche (scénario de démo)", () => {
  it("affiche l'en-tête : titre, période, retour vers le Patron et sélecteur de mois", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByRole("heading", { level: 1, name: "Comptable" })).toBeInTheDocument();
    expect(screen.getByText("Décembre 2026 · clôture le 5 du mois")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    const mois = screen.getByRole("combobox", { name: "Mois" });
    expect(
      within(mois)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(planche.mois);
    expect(mois).toHaveValue("2026-12");
  });

  it("affiche le rapprochement MoMo avec les chiffres de la planche, l'écart en ambre", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 2, name: "Rapprochement MoMo · décembre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("99,8 % rapproché")).toBeInTheDocument();
    expect(screen.getByText("Ventes MoMo enregistrées · 1 912")).toBeInTheDocument();
    expect(screen.getByText("7 648 000")).toBeInTheDocument();
    expect(screen.getByText("Reçu sur le compte marchand")).toBeInTheDocument();
    expect(screen.getByText("7 632 000")).toBeInTheDocument();
    expect(screen.getByText("4 transactions sans correspondance")).toBeInTheDocument();
    expect(screen.getByText("16 000")).toBeInTheDocument();
    expect(lien("Voir les 4 lignes")).toHaveTextContent("Voir les 4 lignes · références opérateur");
    expect(lien("Voir les 4 lignes")).toHaveAttribute("href", "/comptable/rapprochement");
  });

  it("liste les cinq exports dans l'ordre de la planche, chacun mène à son aperçu", async () => {
    rendre();
    await attendreEcran();
    expect(
      screen.getByRole("heading", { level: 2, name: "Exports · colonnes fixes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("aperçu · télécharger")).toBeInTheDocument();
    const ids = [
      "journal_ventes",
      "journal_caisse",
      "annulations",
      "ecritures_syscohada",
      "factures_afrimove",
    ];
    const lignes = within(principal())
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/comptable/apercu/"));
    expect(lignes).toHaveLength(5);
    planche.exports.liste.forEach((e, i) => {
      expect(lignes[i], e.nom).toHaveAttribute("href", `/comptable/apercu/${ids[i]}`);
      expect(lignes[i], e.nom).toHaveTextContent(`${e.nom}${e.detail}Aperçu${e.telecharger}`);
    });
  });

  it("montre « ⤓ » en bleu sur les exports à télécharger et « à jour » en vert sur les factures", async () => {
    rendre();
    await attendreEcran();
    const ventes = lien("Journal des ventes");
    expect(within(ventes).getByText("⤓")).toBeInTheDocument();
    expect(within(ventes).queryByText("à jour")).toBeNull();
    const factures = lien("Factures AfriMove");
    expect(within(factures).getByText("à jour")).toBeInTheDocument();
    expect(within(factures).queryByText("⤓")).toBeNull();
    // Le « Aperçu » porte l'icône de l'œil, décorative.
    expect(
      within(ventes).getByText("Aperçu").querySelector("svg[aria-hidden='true']"),
    ).not.toBeNull();
  });

  it("montre l'envoi automatique au cabinet, interrupteur allumé", async () => {
    rendre();
    await attendreEcran();
    expect(screen.getByText("Envoi automatique au cabinet")).toBeInTheDocument();
    expect(
      screen.getByText("cabinet@… · le 2 de chaque mois · 3 derniers envois reçus"),
    ).toBeInTheDocument();
    const bascule = screen.getByRole("switch", { name: "Envoi automatique au cabinet" });
    expect(bascule).toHaveAttribute("aria-checked", "true");
    expect(bascule).toHaveAttribute("aria-readonly", "true");
  });

  it("garde « Clôturer décembre · tout envoyer » en pied, vers l'écran de clôture", async () => {
    rendre();
    await attendreEcran();
    const bouton = screen.getByRole("link", { name: "Clôturer décembre · tout envoyer" });
    expect(bouton).toHaveAttribute("href", "/comptable/cloture");
    expect(principal().contains(bouton)).toBe(false);
  });

  it("le lien Retour revient à l'accueil du patron", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(screen.getByRole("link", { name: "Retour" }));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/aujourdhui"));
  });

  it("le lien « Voir les 4 lignes » ouvre le rapprochement", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(lien("Voir les 4 lignes"));
    await waitFor(() => expect(routeur.state.location.pathname).toBe("/comptable/rapprochement"));
  });

  it("un export ouvre son aperçu", async () => {
    const { routeur } = rendre();
    await attendreEcran();
    await userEvent.click(lien("Journal de caisse"));
    await waitFor(() =>
      expect(routeur.state.location.pathname).toBe("/comptable/apercu/journal_caisse"),
    );
  });
});

describe("Comptable · calculs et variantes de données", () => {
  it("calcule le pourcentage rapproché sur les références opérateur, pas sur le taux envoyé par l'API", async () => {
    const client = avecSynthese((s) => ({
      ...s,
      rapprochement: {
        ...s.rapprochement,
        tauxRapprochePct: 12,
        ventesMomo: { ...s.rapprochement.ventesMomo, nombre: 200 },
        sansCorrespondance: { ...s.rapprochement.sansCorrespondance, transactions: 10 },
      },
    }));
    rendre(client);
    await attendreEcran();
    expect(screen.getByText("95 % rapproché")).toBeInTheDocument();
    expect(screen.queryByText("12 % rapproché")).toBeNull();
  });

  it("sans transaction sans correspondance : 100 %, et plus de lien vers les lignes", async () => {
    const client = avecSynthese((s) => ({
      ...s,
      rapprochement: {
        ...s.rapprochement,
        recuMarchand: s.rapprochement.ventesMomo.montant,
        sansCorrespondance: { transactions: 0, montant: 0 },
      },
    }));
    rendre(client);
    await attendreEcran();
    expect(screen.getByText("100 % rapproché")).toBeInTheDocument();
    expect(screen.getByText("0 transaction sans correspondance")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Voir/ })).toBeNull();
  });

  it("une seule transaction sans correspondance : accords au singulier", async () => {
    const client = avecSynthese((s) => ({
      ...s,
      rapprochement: {
        ...s.rapprochement,
        sansCorrespondance: { transactions: 1, montant: 4000 },
      },
    }));
    rendre(client);
    await attendreEcran();
    expect(screen.getByText("1 transaction sans correspondance")).toBeInTheDocument();
    expect(lien("Voir la ligne")).toHaveTextContent("Voir la ligne · référence opérateur");
  });

  it("envoi automatique désactivé : interrupteur éteint et jour d'envoi non annoncé", async () => {
    const client = avecSynthese((s) => ({ ...s, cabinet: { ...s.cabinet, automatique: false } }));
    rendre(client);
    await attendreEcran();
    expect(screen.getByRole("switch", { name: "Envoi automatique au cabinet" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText("cabinet@… · envoi automatique désactivé")).toBeInTheDocument();
    expect(screen.queryByText(/le 2 de chaque mois/)).toBeNull();
  });

  it("un seul dernier envoi reçu et un envoi le 1er : accords et ordinal", async () => {
    const client = avecSynthese((s) => ({
      ...s,
      cabinet: { ...s.cabinet, jourDEnvoi: 1, derniersEnvoisRecus: 1 },
    }));
    rendre(client);
    await attendreEcran();
    expect(
      screen.getByText("cabinet@… · le 1er de chaque mois · 1 dernier envoi reçu"),
    ).toBeInTheDocument();
  });

  it("un export marqué « à jour » n'affiche pas ⤓, un export disponible l'affiche", async () => {
    const client = avecSynthese((s) => ({
      ...s,
      exports: s.exports.map((e) => ({ ...e, statut: "a_jour" as const })),
    }));
    rendre(client);
    await attendreEcran();
    expect(screen.getAllByText("à jour")).toHaveLength(5);
    expect(screen.queryByText("⤓")).toBeNull();
  });

  it("sans export : le dit sans casser l'écran", async () => {
    const client = avecSynthese((s) => ({ ...s, exports: [] }));
    rendre(client);
    expect(await screen.findByText("Aucun export pour ce mois.")).toBeInTheDocument();
    expect(screen.getByText("Envoi automatique au cabinet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Clôturer décembre · tout envoyer" }),
    ).toBeInTheDocument();
  });
});

describe("Comptable · sélecteur de mois", () => {
  it("un mois sans données affiche l'erreur, garde le sélecteur et permet de revenir à décembre", async () => {
    rendre();
    await attendreEcran();
    const mois = screen.getByRole("combobox", { name: "Mois" });
    await userEvent.selectOptions(mois, "Novembre");
    expect(await screen.findByRole("alert")).toHaveTextContent("Le comptable ne s'est pas chargé.");
    expect(screen.getByRole("combobox", { name: "Mois" })).toHaveValue("2026-11");
    expect(screen.queryByText("Journal des ventes")).toBeNull();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Mois" }), "Décembre");
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("demande la synthèse du mois choisi", async () => {
    const demandes: Array<string | undefined> = [];
    const client = avecSynthese(
      (s) => s,
      (params) => demandes.push(params.mois),
    );
    rendre(client);
    await attendreEcran();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Mois" }), "Octobre");
    await waitFor(() => expect(demandes).toContain("2026-10"));
    expect(demandes[0]).toBeUndefined();
  });
});

describe("Comptable · états chargement, erreur, vide", () => {
  it("chargement : des repères gris à la place des chiffres, la mise en page tient, le retour reste utilisable", async () => {
    const client = avecSynthese(() => new Promise<Synthese>(() => {}));
    rendre(client);
    const corps = await waitFor(() => {
      const main = principal();
      expect(main).toHaveAttribute("data-etat", "chargement");
      return main;
    });
    expect(corps).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Comptable" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", "/aujourdhui");
    expect(screen.getByText("Exports · colonnes fixes")).toBeInTheDocument();
    expect(screen.queryByText("Journal des ventes")).toBeNull();
    expect(corps.querySelectorAll("[aria-hidden='true'].am-pulse").length).toBeGreaterThan(5);
    expect(screen.queryByRole("combobox", { name: "Mois" })).toBeNull();
  });

  it("erreur : le dit, propose Réessayer et recharge l'écran", async () => {
    let appels = 0;
    const client = avecSynthese((s) => {
      appels += 1;
      if (appels === 1) throw new ErreurReseau("coupure");
      return s;
    });
    rendre(client);
    expect(await screen.findByRole("alert")).toHaveTextContent("Le comptable ne s'est pas chargé.");
    expect(principal()).toHaveAttribute("data-etat", "erreur");
    expect(screen.queryByRole("link", { name: /Clôturer/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await attendreEcran()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("vide : un message d'état, sans bouton Réessayer ni pied", () => {
    render(
      <I18nextProvider i18n={creerI18n("fr")}>
        <ComptableVue etat="vide" moisDisponibles={[]} mois="" onMois={() => {}} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Aucune information pour le moment.");
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Clôturer/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Retour" })).toBeInTheDocument();
  });
});

describe("Comptable · textes", () => {
  it("les clés anglaises et pidgin sont celles du français (les textes vides se replient sur le français)", () => {
    const cles = (o: Record<string, unknown>, prefixe = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? cles(v as Record<string, unknown>, `${prefixe}${k}.`)
          : [`${prefixe}${k}`],
      );
    expect(cles(en).sort()).toEqual(cles(fr).sort());
    expect(cles(pcm).sort()).toEqual(cles(fr).sort());
  });
});
