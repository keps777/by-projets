import { describe, expect, it } from "vitest";
import { ecrans } from "./ecrans";
import { nombre } from "./format";
import type { NomPlanche } from "./planches";
import {
  contient,
  ecrituresNombre,
  htmlPlanche,
  jetonsPlanche,
  textePlanche,
} from "./testing/planches";

/**
 * Quelques valeurs clés par planche, relues à la main sur la maquette : le scénario doit les porter
 * telles quelles, et la planche doit les afficher. Les tests génériques (`ecrans.test.ts`) vérifient
 * l'ensemble ; ceux-ci épinglent les chiffres qui font l'histoire de la matinée du mardi 5 janvier.
 */

/** Lit `a.b[2].c` dans un objet. */
function lire(source: unknown, chemin: string): unknown {
  return chemin
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .reduce<unknown>((courant, cle) => {
      if (courant === null || typeof courant !== "object") {
        throw new Error(`Chemin introuvable : ${chemin} (« ${cle} »)`);
      }
      return (courant as Record<string, unknown>)[cle];
    }, source);
}

type Cle = readonly [planche: NomPlanche, chemin: string, attendu: string | number];

const CLES: readonly Cle[] = [
  // Voyageur
  ["Main", "liste.departs[0].prix", 7500],
  ["Main", "liste.departs[1].prix", 4000],
  ["Main", "liste.departs[2].prix", 3800],
  ["Main", "liste.departs[0].places", "9 places"],
  ["SiegePay", "action.total", 7500],
  ["SiegePay", "plan.libres", "9 places libres"],
  ["Pass", "billet.numero", "BEX-DLA-270105-0142"],
  ["Pass", "billet.siege", 7],
  ["Pass", "codeSansScanner.code", "7341"],
  ["Pass", "billet.depart", "08:00"],
  ["Moi", "fidelite.points", 1250],
  ["Moi", "historique.elements[1].detail", "C-ALP-DLA-270103-0017 · 2 kg · 1 500 F"],
  // Agence
  ["Guichet", "compteurs[0].valeur", 184],
  ["Quai", "embarquement.embarques", 31],
  ["Quai", "dernierScan.detail", "ALP-DLA-270105-0142 · CNI ···· 4471 · VIP · 1 bagage soute"],
  ["Cadence", "dernierBillet.detail", "0231 · siège 18 · Ngono A."],
  ["CadenceBillet", "billet.numero", "ALP-DLA-270105-0232"],
  ["CadenceBillet", "billet.code", "9 0 4 7"],
  ["CadenceQuai", "embarquement.embarques", 21],
  ["CadenceQuai", "sansNom.total", 11],
  // Caisse de Joseph : 695 500 attendus, 694 500 comptés, écart − 1 000
  ["Caisse", "appCompte.cashAttendu.montant", 695_500],
  ["Caisse", "jeCompte.compte.montant", 694_500],
  ["Caisse", "ecart.montant", -1000],
  ["Caisse", "appCompte.lignes[0].montant", 612_000],
  ["Caisse", "appCompte.lignes[1].montant", 71_500],
  ["Caisse", "appCompte.lignes[4].montant", 252_000],
  ["Caisse", "jeCompte.coupures[0].nombre", 48],
  ["SuperviseurValider", "bilan[0].montant", 695_500],
  ["SuperviseurValider", "bilan[1].montant", 694_500],
  ["SuperviseurValider", "bilan[2].montant", -1000],
  ["Superviseur", "guichets[0].billets", 211],
  ["Superviseur", "guichets[1].billets", 184],
  ["Superviseur", "guichets[2].billets", 96],
  ["Superviseur", "apresMidi.departs[0].remplissage", "38/40"],
  ["SuperviseurVoir", "billet.numero", "ALP-DLA-270105-0171"],
  ["SuperviseurVoir", "billet.prix", 4000],
  ["SuperviseurDebloquer", "enAttente[0].valeur", 26],
  ["SuperviseurDebloquer", "enAttente[2].detail", "2001–2026 sans trou"],
  ["Controleur", "compteurs[0].valeur", 35],
  ["Controleur", "compteurs[1].valeur", 36],
  ["Controleur", "compteurs[2].valeur", "+1"],
  // Patron
  ["RapportSoir", "chiffres[0].valeur", 1004],
  ["RapportSoir", "chiffres[1].valeur", 312],
  ["RapportSoir", "chiffres[2].valeur", "4,41 M"],
  ["Patron", "jour.recette", "2,61 M"],
  ["Patron", "jour.chiffres[0].valeur", 612],
  ["Patron", "jour.chiffres[1].valeur", 188],
  ["Controle", "chiffres[0].valeur", "2,61 M"],
  ["Controle", "chiffres[1].valeur", 612],
  ["Controle", "gares.lignes[0].cashAttendu", 1_412_500],
  ["PatronEquipe", "gares.liste[0].caisse", 1_412_000],
  ["PatronGare", "guichets.liste[1].caisse", 694_500],
  ["PatronPersonne", "chiffres[0].valeur", 1204],
  ["Analyses", "recetteParJour.total", "28,4 M"],
  ["Analyses", "lignes.liste[1].recette", "8,1 M"],
  ["AnalysesLigne", "chiffres[1].valeur", 2104],
  ["AnalysesBus", "chiffres[2].valeur", "+ 0,6 M"],
  ["Comptable", "rapprochement.recu.montant", 7_632_000],
  ["Comptable", "rapprochement.ecart.montant", 16_000],
  ["ComptableRapprochement", "total.montant", 16_000],
  ["ComptableCloture", "encaisse.montant", 28_414_000],
  ["ComptableCloture", "encaisse.cash.montant", 20_766_000],
  ["Config", "equipe.titre", "Équipe · 23 personnes"],
  ["ConfigLigne", "arrets.liste[0].detail", "· prorata 2 000 · montée OK"],
  ["ConfigLigne", "arrets.liste[1].detail", "· prorata 2 800 · montée OK"],
  ["ConfigRegles", "caisse.tolerance.valeur", "1 000"],
  ["InterAgences", "reglement.lignes[2].montant", 12_300],
  ["InterAgencesConvention", "parts.total.alpha", 1600],
  ["Financement", "voyageurs.exemple.billetVip", 7500],
  ["FinancementDemande", "demande.montant", 6_000_000],
  // Partenaires
  ["RelaisApp", "resume[2].valeur", 8400],
  ["RelaisDevenir", "chiffres[1].valeur", 8400],
  ["Livreur", "mission.gain.montant", 700],
  ["LivreurDevenir", "badge", "700 F / COURSE"],
  ["Conducteur", "prix.valeur", 4000],
  ["Vendeur", "bilan[1].valeur", 9350],
  ["CovoitConducteur", "resume[0].valeur", 12_000],
];

describe("valeurs clés de chaque planche", () => {
  it.each(CLES)("%s · %s", (planche, chemin, attendu) => {
    const e = ecrans[planche];
    const valeur = lire(e.donnees, chemin);
    expect(valeur).toBe(attendu);

    const page = textePlanche(htmlPlanche(planche));
    if (typeof attendu === "string") {
      expect(contient(page, attendu), `« ${attendu} » absent de la planche ${planche}`).toBe(true);
    } else {
      const jetons = jetonsPlanche(page);
      expect(
        ecrituresNombre(attendu).some((j) => jetons.has(j)),
        `${nombre(attendu)} absent de la planche ${planche}`,
      ).toBe(true);
    }
  });
});

describe("cohérence des valeurs clés avec le domaine", () => {
  it("la caisse de Joseph retombe sur 695 500 attendus, 694 500 comptés, écart − 1 000", () => {
    const caisse = ecrans.Caisse.donnees;
    expect(caisse.appCompte.cashAttendu.montant).toBe(695_500);
    expect(caisse.jeCompte.compte.montant).toBe(694_500);
    expect(caisse.ecart.montant).toBe(-1000);
    expect(caisse.jeCompte.compte.montant - caisse.appCompte.cashAttendu.montant).toBe(
      caisse.ecart.montant,
    );
  });

  it("la clôture validée porte les mêmes montants que la planche Caisse", () => {
    const session = ecrans.Superviseur.entites.sessions?.[0];
    expect(session?.cloturee).toMatchObject({
      cashAttendu: 695_500,
      cashCompte: 694_500,
      ecart: -1000,
    });
    expect(session?.numero).toBe("K-DLA-270105-2-1");
  });

  it("les caisses des trois guichets d'Akwa font 1 412 000 (planche PatronGare)", () => {
    const somme = ecrans.PatronGare.donnees.guichets.liste.reduce((s, g) => s + g.caisse, 0);
    expect(somme).toBe(1_412_000);
  });

  it("les billets et colis des trois guichets d'Akwa font 318 et 96 (planche PatronGare)", () => {
    const texte = ecrans.PatronGare.donnees.guichets.liste.map((g) => g.detail).join(" | ");
    const billets = [...texte.matchAll(/(\d+) billets/g)].reduce((s, m) => s + Number(m[1]), 0);
    const colis = [...texte.matchAll(/(\d+) colis/g)].reduce((s, m) => s + Number(m[1]), 0);
    expect(billets).toBe(ecrans.PatronGare.donnees.chiffres[1]?.valeur);
    expect(colis).toBe(ecrans.PatronGare.donnees.chiffres[2]?.valeur);
  });

  it("le règlement entre compagnies s'équilibre : + 19 500 − 7 200 = + 12 300", () => {
    const [doit, dois, net] = ecrans.InterAgences.donnees.reglement.lignes;
    expect((doit?.montant ?? 0) + (dois?.montant ?? 0)).toBe(net?.montant);
  });

  it("décembre : cash + MoMo = encaissé, et l'écart MoMo vaut les 4 transactions", () => {
    const c = ecrans.ComptableCloture.donnees.encaisse;
    expect(c.cash.montant + c.momo.montant).toBe(c.montant);
    const r = ecrans.Comptable.donnees.rapprochement;
    expect(r.ventes.montant - r.recu.montant).toBe(r.ecart.montant);
    const lignes = ecrans.ComptableRapprochement.donnees.lignes;
    expect(lignes.reduce((s, l) => s + l.montant, 0)).toBe(r.ecart.montant);
  });

  it("les 10 modules actifs sur 12 sont ceux du monde commun", () => {
    const modules = ecrans.Modules.donnees.modules;
    expect(modules).toHaveLength(12);
    expect(modules.filter((m) => m.actif)).toHaveLength(10);
  });

  it("une course de livreur rapporte 700 F, un colis remis au relais 200 F", () => {
    expect(ecrans.Livreur.donnees.mission.gain.montant).toBe(700);
    expect(ecrans.RelaisDevenir.donnees.badge).toBe("200 F / COLIS");
  });
});
