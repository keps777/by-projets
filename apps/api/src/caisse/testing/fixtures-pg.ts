import { randomUUID } from "node:crypto";
import type { Prisma } from "../../socle/db/generated/client";
import type { PrismaService } from "../../socle/db/prisma.service";

/**
 * Lignes de base des tests d'intégration PostgreSQL (compagnie, gare, guichet, personne, départ,
 * billet…). Les adaptateurs PostgreSQL ont des clés étrangères : un test qui écrit un colis, une
 * session ou une demande d'annulation doit d'abord créer ce à quoi elle se rattache.
 *
 * Les lignes sont créées par Prisma, sans chiffrement : le téléphone d'une personne est un texte
 * quelconque et son index est tiré au hasard.
 */

export interface CompagnieFixture {
  id: string;
  code: string;
}

export interface GareFixture {
  id: string;
  code: string;
  nom: string;
  ville: string;
  compagnieId: string;
}

export interface BilletFixture {
  id: string;
  numero: string;
  sequence: number;
}

/** Partagé par toutes les instances : deux jeux de fixtures sur la même base ne se heurtent pas. */
let compteurGlobal = 0;

export class FixturesPg {
  constructor(readonly prisma: PrismaService) {}

  /** Entier croissant, pour les codes et les numéros uniques. */
  prochain(): number {
    compteurGlobal += 1;
    return compteurGlobal;
  }

  /** Trois lettres majuscules, uniques dans cette instance. */
  code3(): string {
    const n = this.prochain();
    return [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26]
      .map((x) => String.fromCharCode(65 + x))
      .join("");
  }

  async compagnie(
    surcharge: { toleranceEcartCaisse?: number | null } = {},
  ): Promise<CompagnieFixture> {
    const code = this.code3();
    const c = await this.prisma.compagnie.create({
      data: { code, nom: `Agence ${code}`, ...surcharge },
    });
    return { id: c.id, code: c.code };
  }

  async gare(
    compagnieId: string,
    surcharge: { code?: string; nom?: string; ville?: string } = {},
  ): Promise<GareFixture> {
    const code = surcharge.code ?? this.code3();
    const g = await this.prisma.gare.create({
      data: {
        compagnieId,
        code,
        nom: surcharge.nom ?? `Gare ${code}`,
        ville: surcharge.ville ?? "Douala",
      },
    });
    return { id: g.id, code: g.code, nom: g.nom, ville: g.ville, compagnieId };
  }

  async guichet(gareId: string, rang: number): Promise<{ id: string; rang: number }> {
    const g = await this.prisma.guichet.create({ data: { gareId, rang } });
    return { id: g.id, rang };
  }

  async personne(
    surcharge: {
      nom?: string;
      roles?: Prisma.PersonneCreateInput["roles"];
      compagnieId?: string | null;
      gareId?: string | null;
      guichetId?: string | null;
      pinHache?: string | null;
      actif?: boolean;
      creeA?: Date;
    } = {},
  ): Promise<{ id: string; nom: string }> {
    const id = randomUUID();
    const nom = surcharge.nom ?? `Personne ${this.prochain()}`;
    const p = await this.prisma.personne.create({
      data: {
        id,
        nom,
        telephoneChiffre: `chiffre-${id}`,
        telephoneIndex: `index-${id}`,
        roles: surcharge.roles ?? ["guichetier"],
        compagnieId: surcharge.compagnieId ?? null,
        gareId: surcharge.gareId ?? null,
        guichetId: surcharge.guichetId ?? null,
        pinHache: surcharge.pinHache ?? null,
        actif: surcharge.actif ?? true,
        ...(surcharge.creeA ? { creeA: surcharge.creeA } : {}),
      },
    });
    return { id: p.id, nom };
  }

  async ligne(
    compagnieId: string,
    origineGareId: string,
    destinationGareId: string,
  ): Promise<{ id: string }> {
    const l = await this.prisma.ligne.create({
      data: {
        compagnieId,
        code: `L${this.prochain()}`,
        origineGareId,
        destinationGareId,
        tarifClassique: 8000,
        tarifVip: 12000,
        tarifBagage: 500,
      },
    });
    return { id: l.id };
  }

  async bus(compagnieId: string, immatriculation?: string, capacite = 70): Promise<{ id: string }> {
    const b = await this.prisma.bus.create({
      data: {
        compagnieId,
        immatriculation: immatriculation ?? `LT ${this.prochain()} AB`,
        capacite,
        capaciteSoute: 20,
        classe: "classique",
      },
    });
    return { id: b.id };
  }

  async depart(
    ligneId: string,
    surcharge: {
      heureDepart?: Date;
      etat?: "programme" | "en_vente" | "embarquement" | "parti" | "arrive" | "annule" | "retarde";
      quai?: number | null;
      busId?: string | null;
      chauffeurId?: string | null;
      convoyeurId?: string | null;
    } = {},
  ): Promise<{ id: string }> {
    const d = await this.prisma.depart.create({
      data: {
        numero: `DEP-${this.prochain()}-${randomUUID().slice(0, 6)}`,
        ligneId,
        classe: "classique",
        heureDepart: surcharge.heureDepart ?? new Date("2026-11-02T14:00:00.000Z"),
        etat: surcharge.etat ?? "en_vente",
        quai: surcharge.quai ?? null,
        busId: surcharge.busId ?? null,
        chauffeurId: surcharge.chauffeurId ?? null,
        convoyeurId: surcharge.convoyeurId ?? null,
      },
    });
    return { id: d.id };
  }

  /** Un billet vendu au guichet (par défaut en cash, 8 000 F, siège 12, payé). */
  async billet(
    contexte: { compagnieId: string; gareId: string; departId: string },
    surcharge: {
      sequence?: number;
      siege?: number | null;
      prix?: number;
      bagage?: number;
      classe?: "classique" | "vip";
      etat?: "reserve" | "paye" | "embarque" | "voyage" | "annule" | "non_presente" | "reporte";
      canal?: "guichet" | "convoyeur" | "en_ligne" | "vendeur";
      guichetId?: string | null;
      auteurId?: string | null;
      mode?: "cash" | "momo" | "orange_money" | null;
      creeA?: Date;
      passagerChiffre?: string | null;
      reporteDeId?: string | null;
    } = {},
  ): Promise<BilletFixture> {
    const n = this.prochain();
    const sequence = surcharge.sequence ?? n;
    const numero = `ALP-DLA-261102-${String(sequence).padStart(4, "0")}-${n}`;
    const mode = surcharge.mode === undefined ? "cash" : surcharge.mode;
    const b = await this.prisma.billet.create({
      data: {
        numero,
        sequence,
        compagnieId: contexte.compagnieId,
        gareId: contexte.gareId,
        departId: contexte.departId,
        siege: surcharge.siege === undefined ? 10 + n : surcharge.siege,
        classe: surcharge.classe ?? "classique",
        prix: surcharge.prix ?? 8000,
        bagage: surcharge.bagage ?? 0,
        canal: surcharge.canal ?? "guichet",
        guichetId: surcharge.guichetId ?? null,
        auteurId: surcharge.auteurId ?? null,
        codeBillet: String(1000 + n).slice(-4),
        creeA: surcharge.creeA ?? new Date("2026-11-02T08:30:00.000Z"),
        etat: surcharge.etat ?? "paye",
        paiement: mode === null ? undefined : { mode, reference: null },
        passagerChiffre: surcharge.passagerChiffre ?? null,
        reporteDeId: surcharge.reporteDeId ?? null,
      },
    });
    return { id: b.id, numero: b.numero, sequence };
  }
}
