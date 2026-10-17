import { describe, expect, it } from "vitest";
import {
  CLIENT_REGULIER_MIN_BILLETS,
  COMMISSION_CLASSIQUE_DEFAUT,
  COMMISSION_VIP_DEFAUT,
  cleVersement,
  codeVendeur,
  commissionPour,
  debutDeMois,
  debutDeSemaine,
  debutDuJourDouala,
  debutDuMoisSuivant,
  departHabituel,
  estClientRegulier,
  habitudeDe,
  jourDouala,
  jourDuVoyage,
  libelleCommission,
  libelleHabitude,
  libelleProposition,
  masquerTelephone,
  regrouperClients,
  versementDu,
} from "./regles";
import { uneVente } from "./testing/fabrique";

const douala = (jour: string, hhmm: string) => `${jour}T${hhmm}:00.000+01:00`;

describe("commissions", () => {
  it("100 F par billet classique et 150 F par billet VIP par défaut", () => {
    expect(COMMISSION_CLASSIQUE_DEFAUT).toBe(100);
    expect(COMMISSION_VIP_DEFAUT).toBe(150);
    const defaut = { commissionClassique: 100, commissionVip: 150 };
    expect(commissionPour("classique", defaut)).toBe(100);
    expect(commissionPour("vip", defaut)).toBe(150);
  });

  it("l'agence peut fixer ses propres montants, par classe", () => {
    const agrement = { commissionClassique: 250, commissionVip: 400 };
    expect(commissionPour("classique", agrement)).toBe(250);
    expect(commissionPour("vip", agrement)).toBe(400);
  });

  it("écrit la commission comme l'écran de vente", () => {
    expect(libelleCommission(100)).toBe("commission 100 F / billet");
    expect(libelleCommission(150)).toBe("commission 150 F / billet");
  });
});

describe("versement du lundi", () => {
  const lundi = debutDeSemaine(douala("2026-11-02", "09:00"));

  it("le lundi commence à minuit, heure de Douala", () => {
    expect(lundi).toBe(douala("2026-11-02", "00:00"));
    // Dimanche soir appartient à la semaine d'avant, dimanche à 23 h comme samedi.
    expect(debutDeSemaine(douala("2026-11-01", "23:59"))).toBe(douala("2026-10-26", "00:00"));
  });

  it("n'est dû que le lundi, de 8 h 00 à minuit", () => {
    expect(versementDu(douala("2026-11-02", "07:59"), lundi)).toBe(false);
    expect(versementDu(douala("2026-11-02", "08:00"), lundi)).toBe(true);
    expect(versementDu(douala("2026-11-02", "23:59"), lundi)).toBe(true);
    expect(versementDu(douala("2026-11-03", "00:00"), lundi)).toBe(false);
    expect(versementDu(douala("2026-11-06", "09:00"), lundi)).toBe(false);
  });

  it("la clé de versement porte le vendeur et le lundi de la semaine", () => {
    expect(cleVersement("v-1", "261102")).toBe("commissions:v-1:261102");
    expect(cleVersement("v-1", "261102")).not.toBe(cleVersement("v-1", "261109"));
    expect(cleVersement("v-1", "261102")).not.toBe(cleVersement("v-2", "261102"));
  });
});

describe("mois et jours à Douala", () => {
  it("borne le mois à minuit, heure de Douala", () => {
    expect(debutDeMois(douala("2026-11-02", "09:00"))).toBe(douala("2026-11-01", "00:00"));
    expect(debutDuMoisSuivant(douala("2026-11-02", "09:00"))).toBe(douala("2026-12-01", "00:00"));
    expect(debutDuMoisSuivant(douala("2026-12-31", "23:59"))).toBe(douala("2027-01-01", "00:00"));
  });

  it("compte à l'heure de Douala, pas à celle de Greenwich", () => {
    // 00 h 30 à Douala le 1er novembre, c'est encore le 31 octobre à 23 h 30 en temps universel.
    expect(debutDeMois(douala("2026-11-01", "00:30"))).toBe(douala("2026-11-01", "00:00"));
    expect(debutDeMois(douala("2026-10-31", "23:30"))).toBe(douala("2026-10-01", "00:00"));
  });

  it("donne le jour et le début du jour de Douala", () => {
    expect(jourDouala(douala("2026-11-03", "00:10"))).toBe("2026-11-03");
    expect(debutDuJourDouala("2026-11-03")).toBe(douala("2026-11-03", "00:00"));
  });
});

describe("numéro et téléphone du vendeur", () => {
  it("numérote V-0412, sur quatre chiffres au moins", () => {
    expect(codeVendeur(412)).toBe("V-0412");
    expect(codeVendeur(1)).toBe("V-0001");
    expect(codeVendeur(12345)).toBe("V-12345");
  });

  it("masque le téléphone du client : un chiffre, deux, puis des points", () => {
    expect(masquerTelephone("+237670123456")).toBe("6 70 …");
    expect(masquerTelephone("+237691000032")).toBe("6 91 …");
    expect(masquerTelephone("670123456")).toBe("6 70 …");
    expect(masquerTelephone("+237670123456")).not.toContain("123456");
  });
});

describe("habitude d'un client", () => {
  // Les vendredis 9, 16 et 23 octobre 2026.
  const vendredis = [
    douala("2026-10-09", "08:30"),
    douala("2026-10-16", "08:30"),
    douala("2026-10-23", "08:30"),
  ];

  it("trois vendredis de suite font « chaque vendredi à 08:30 »", () => {
    const h = habitudeDe(vendredis);
    expect(h).toEqual({ jour: 5, heure: "08:30" });
    expect(libelleHabitude(h!)).toBe("chaque vendredi");
    expect(libelleProposition(h!)).toBe("vendredi 08:30");
  });

  it("n'invente pas d'habitude avec moins de trois voyages", () => {
    expect(habitudeDe([])).toBeNull();
    expect(habitudeDe(vendredis.slice(0, 2))).toBeNull();
  });

  it("n'en voit pas quand les jours changent tout le temps", () => {
    expect(
      habitudeDe([
        douala("2026-10-12", "08:30"),
        douala("2026-10-14", "08:30"),
        douala("2026-10-16", "08:30"),
      ]),
    ).toBeNull();
  });

  it("garde l'habitude à deux tiers de voyages le même jour, pas en dessous", () => {
    // 2 vendredis sur 3 : exactement les deux tiers.
    expect(habitudeDe([...vendredis.slice(0, 2), douala("2026-10-17", "08:30")])).toMatchObject({
      jour: 5,
    });
    // 3 vendredis sur 5 : 60 %, trop peu.
    expect(
      habitudeDe([...vendredis, douala("2026-10-12", "08:30"), douala("2026-10-14", "08:30")]),
    ).toBeNull();
    // 3 sur 4 : 75 %.
    expect(habitudeDe([...vendredis, douala("2026-10-12", "08:30")])).toMatchObject({ jour: 5 });
  });

  it("prend l'heure de départ la plus fréquente ce jour-là, et la plus récente à égalité", () => {
    expect(
      habitudeDe([
        douala("2026-10-09", "06:00"),
        douala("2026-10-16", "08:30"),
        douala("2026-10-23", "08:30"),
      ]),
    ).toEqual({ jour: 5, heure: "08:30" });
    expect(
      habitudeDe([
        douala("2026-10-09", "06:00"),
        douala("2026-10-16", "08:30"),
        douala("2026-10-23", "09:15"),
      ]),
    ).toEqual({ jour: 5, heure: "09:15" });
  });

  it("le jour de la semaine suit l'heure de Douala, pas celle de Greenwich", () => {
    // Vendredi 00 h 30 à Douala = jeudi 23 h 30 en temps universel.
    const h = habitudeDe([
      douala("2026-10-09", "00:30"),
      douala("2026-10-16", "00:30"),
      douala("2026-10-23", "00:30"),
    ]);
    expect(h).toEqual({ jour: 5, heure: "00:30" });
  });
});

describe("départ à proposer en une touche", () => {
  const maintenant = douala("2026-11-02", "09:00");
  const habitude = { jour: 5, heure: "08:30" };
  const depart = (jour: string, hhmm: string) => ({ heureDepart: douala(jour, hhmm) });

  it("retient le vendredi 08:30 de la semaine", () => {
    expect(
      departHabituel(
        habitude,
        [depart("2026-11-03", "08:30"), depart("2026-11-06", "08:30")],
        maintenant,
      ),
    ).toEqual(depart("2026-11-06", "08:30"));
  });

  it("ignore l'autre heure, le passé et ce qui dépasse la semaine à venir", () => {
    expect(departHabituel(habitude, [depart("2026-11-06", "09:30")], maintenant)).toBeNull();
    expect(departHabituel(habitude, [depart("2026-10-30", "08:30")], maintenant)).toBeNull();
    expect(departHabituel(habitude, [depart("2026-11-13", "08:30")], maintenant)).toBeNull();
    expect(departHabituel(habitude, [], maintenant)).toBeNull();
  });

  it("la date du dernier voyage est le jour de départ, à minuit", () => {
    expect(jourDuVoyage(douala("2025-12-28", "14:00"))).toBe(douala("2025-12-28", "00:00"));
  });
});

describe("clients d'un vendeur", () => {
  it("regroupe les ventes terminées par numéro de téléphone, les plus récents d'abord", () => {
    const clients = regrouperClients([
      uneVente({
        voisin: { nom: "Mme Ebogo", telephone: "+237670000001" },
        voisinIndex: "a",
        creeA: douala("2026-10-01", "10:00"),
      }),
      uneVente({
        voisin: { nom: "Pasteur Nkou", telephone: "+237670000002" },
        voisinIndex: "b",
        creeA: douala("2026-10-20", "10:00"),
      }),
      uneVente({
        voisin: { nom: "Ebogo Marie", telephone: "+237670000001" },
        voisinIndex: "a",
        creeA: douala("2026-10-10", "10:00"),
      }),
    ]);
    expect(clients.map((c) => c.telephone)).toEqual(["+237670000002", "+237670000001"]);
    const ebogo = clients[1]!;
    expect(ebogo.ventes).toHaveLength(2);
    // Le nom est celui de la dernière vente.
    expect(ebogo.nom).toBe("Ebogo Marie");
  });

  it("ne compte ni les ventes refusées, ni celles qui attendent leur règlement", () => {
    const clients = regrouperClients([
      uneVente({ etat: "en_attente", voisinIndex: "a" }),
      uneVente({ etat: "refusee", voisinIndex: "b" }),
      uneVente({ etat: "expiree", voisinIndex: "c" }),
      uneVente({ etat: "a_rembourser", voisinIndex: "d" }),
      uneVente({ etat: "terminee", voisinIndex: "e" }),
    ]);
    expect(clients).toHaveLength(1);
  });

  it("un client est régulier à partir de trois billets", () => {
    expect(CLIENT_REGULIER_MIN_BILLETS).toBe(3);
    // Même numéro : un seul client, quel que soit le nombre de billets.
    const [deux] = regrouperClients([uneVente(), uneVente()]);
    const [trois] = regrouperClients([uneVente(), uneVente(), uneVente()]);
    expect(deux?.ventes).toHaveLength(2);
    expect(estClientRegulier(deux!)).toBe(false);
    expect(trois?.ventes).toHaveLength(3);
    expect(estClientRegulier(trois!)).toBe(true);
  });
});
