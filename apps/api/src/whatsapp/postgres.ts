import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { JournalWhatsApp, type FiltreComptage, type FiltreMessages } from "./journal";
import type {
  EssaiWhatsApp,
  EtatSecours,
  MessageEntrant,
  MessageWhatsApp,
  ResultatEssai,
  StatutWhatsApp,
  TypeWhatsApp,
} from "./types";

/**
 * Adaptateur PostgreSQL (Prisma) du journal de la passerelle WhatsApp (AM-167). Tables :
 * `whatsapp_message`, `whatsapp_essai` et `whatsapp_entrant` (migration « whatsapp »). La file
 * d'envoi (BullMQ + Redis) reste à brancher, voir le README.
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **un message par clé d'idempotence** : `whatsapp_message.cle` est unique, la création est un
 *   `INSERT … ON CONFLICT DO NOTHING` ; de deux demandes simultanées de la même clé, une seule crée,
 *   l'autre reçoit le message existant ;
 * - **des statuts qui ne reculent pas** : `modifier(…, seulementSi)` est un seul
 *   `UPDATE … WHERE id = $1 AND statut = ANY($2)` ; si un accusé de livraison et un réessai se
 *   croisent, un seul des deux change le statut, l'autre reçoit `null` ;
 * - **un seul repli par SMS** : `reserverSecours` est un `UPDATE … WHERE secours = 'aucun'` ; de deux
 *   instances qui voient l'échec en même temps, une seule envoie le SMS ;
 * - **un identifiant WhatsApp n'appartient qu'à un message ou à un message reçu** (index uniques) :
 *   un accusé retrouve toujours le même message, un webhook rejoué est ignoré ;
 * - **chaque message reçu n'est « répondu » qu'une fois** : `marquerReponse` prend le plus ancien
 *   message en attente avec `FOR UPDATE SKIP LOCKED`, deux réponses simultanées n'en prennent jamais
 *   le même ;
 * - **les essais sont en ajout seul** (déclencheurs) et le contenu des messages n'est stocké nulle
 *   part.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai si l'erreur (ou sa cause) porte ce code Prisma (ex. `P2025` : ligne introuvable). */
function porteCode(e: unknown, code: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === code || o["originalCode"] === code) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0) || (e instanceof Error && e.message.includes(code));
}

/* ------------------------------------------------------------------ messages */

type LigneMessage = Prisma.WhatsappMessageGetPayload<object>;
type LigneEssai = Prisma.WhatsappEssaiGetPayload<object>;
type LigneEntrant = Prisma.WhatsappEntrantGetPayload<object>;

function versMessage(l: LigneMessage): MessageWhatsApp {
  return {
    id: l.id,
    type: l.type as TypeWhatsApp,
    cle: l.cle,
    gabarit: l.gabarit,
    reference:
      l.referenceType !== null && l.referenceId !== null
        ? { type: l.referenceType, id: l.referenceId }
        : null,
    compagnieId: l.compagnieId,
    demandeurId: l.demandeurId,
    destinataireChiffre: l.destinataireChiffre,
    destinataireIndex: l.destinataireIndex,
    destinataireMasque: l.destinataireMasque,
    statut: l.statut as StatutWhatsApp,
    tentatives: l.tentatives,
    idFournisseur: l.idFournisseur,
    derniereErreur: l.derniereErreur,
    secours: l.secours as EtatSecours,
    secoursSmsId: l.secoursSmsId,
    secoursChiffre: l.secoursChiffre,
    creeA: l.creeA,
    planifieA: l.planifieA,
    expireA: l.expireA,
    envoyeA: l.envoyeA,
    remisA: l.remisA,
    luA: l.luA,
    delaiEnvoiMs: l.delaiEnvoiMs,
  };
}

function versLigne(m: MessageWhatsApp): Prisma.WhatsappMessageUncheckedCreateInput {
  return {
    id: m.id,
    type: m.type,
    cle: m.cle,
    gabarit: m.gabarit,
    referenceType: m.reference?.type ?? null,
    referenceId: m.reference?.id ?? null,
    compagnieId: m.compagnieId,
    demandeurId: m.demandeurId,
    destinataireChiffre: m.destinataireChiffre,
    destinataireIndex: m.destinataireIndex,
    destinataireMasque: m.destinataireMasque,
    statut: m.statut,
    tentatives: m.tentatives,
    idFournisseur: m.idFournisseur,
    derniereErreur: m.derniereErreur,
    secours: m.secours,
    secoursSmsId: m.secoursSmsId,
    secoursChiffre: m.secoursChiffre,
    creeA: m.creeA,
    planifieA: m.planifieA,
    expireA: m.expireA,
    envoyeA: m.envoyeA,
    remisA: m.remisA,
    luA: m.luA,
    delaiEnvoiMs: m.delaiEnvoiMs,
  };
}

/** Les champs à modifier : `reference` se range dans deux colonnes, le reste porte le même nom. */
function versModifs(
  modifs: Partial<Omit<MessageWhatsApp, "id">>,
): Prisma.WhatsappMessageUncheckedUpdateInput {
  const { reference, ...reste } = modifs;
  const data: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(reste)) {
    if (valeur !== undefined) data[cle] = valeur;
  }
  if (reference !== undefined) {
    data["referenceType"] = reference?.type ?? null;
    data["referenceId"] = reference?.id ?? null;
  }
  return data as Prisma.WhatsappMessageUncheckedUpdateInput;
}

function versEntrant(l: LigneEntrant): MessageEntrant {
  return {
    id: l.id,
    idFournisseur: l.idFournisseur,
    expediteurIndex: l.expediteurIndex,
    expediteurMasque: l.expediteurMasque,
    typeMessage: l.typeMessage,
    recuA: l.recuA,
    repondueA: l.repondueA,
    delaiReponseMs: l.delaiReponseMs,
  };
}

@Injectable()
export class JournalWhatsAppPrisma extends JournalWhatsApp {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(message: MessageWhatsApp): Promise<{ cree: boolean; message: MessageWhatsApp }> {
    // ON CONFLICT DO NOTHING : le nombre de lignes écrites dit qui a créé le message.
    const { count } = await this.prisma.whatsappMessage.createMany({
      data: [versLigne(message)],
      skipDuplicates: true,
    });
    if (count === 1) return { cree: true, message: { ...message } };
    const existant = await this.trouverParCle(message.cle);
    if (!existant) {
      // Conflit sur l'identifiant et non sur la clé : un bogue de l'appelant, pas une idempotence.
      throw new Error(`WhatsApp ${message.id} : identifiant déjà pris par un autre message`);
    }
    return { cree: false, message: existant };
  }

  async trouver(id: string): Promise<MessageWhatsApp | null> {
    if (!UUID.test(id)) return null;
    const l = await this.prisma.whatsappMessage.findUnique({ where: { id } });
    return l ? versMessage(l) : null;
  }

  async trouverParCle(cle: string): Promise<MessageWhatsApp | null> {
    const l = await this.prisma.whatsappMessage.findUnique({ where: { cle } });
    return l ? versMessage(l) : null;
  }

  async trouverParFournisseur(idFournisseur: string): Promise<MessageWhatsApp | null> {
    const l = await this.prisma.whatsappMessage.findUnique({ where: { idFournisseur } });
    return l ? versMessage(l) : null;
  }

  async modifier(
    id: string,
    modifs: Partial<Omit<MessageWhatsApp, "id">>,
    seulementSi?: readonly StatutWhatsApp[],
  ): Promise<MessageWhatsApp | null> {
    if (!UUID.test(id)) return null;
    try {
      // Un seul UPDATE … WHERE id = $1 AND statut IN (…) : la condition et l'écriture sont atomiques.
      const l = await this.prisma.whatsappMessage.update({
        where: { id, ...(seulementSi ? { statut: { in: [...seulementSi] } } : {}) },
        data: versModifs(modifs),
      });
      return versMessage(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async reserverSecours(id: string): Promise<MessageWhatsApp | null> {
    if (!UUID.test(id)) return null;
    try {
      // UPDATE … WHERE secours = 'aucun' : une seule des instances obtient le repli.
      const l = await this.prisma.whatsappMessage.update({
        where: { id, secours: "aucun" },
        data: { secours: "en_cours" },
      });
      return versMessage(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async effacerSecoursAvant(avant: Date): Promise<number> {
    const { count } = await this.prisma.whatsappMessage.updateMany({
      where: { secoursChiffre: { not: null }, creeA: { lt: avant } },
      data: { secoursChiffre: null },
    });
    return count;
  }

  async lister(filtre: FiltreMessages): Promise<MessageWhatsApp[]> {
    const where: Prisma.WhatsappMessageWhereInput = {};
    if (filtre.compagnieId !== undefined) where.compagnieId = filtre.compagnieId;
    if (filtre.type) where.type = filtre.type;
    if (filtre.statut) where.statut = filtre.statut;
    if (filtre.demandeurId) {
      if (!UUID.test(filtre.demandeurId)) return [];
      where.demandeurId = filtre.demandeurId;
    }
    if (filtre.compagnieId && !UUID.test(filtre.compagnieId)) return [];
    if (filtre.reference) {
      where.referenceType = filtre.reference.type;
      where.referenceId = filtre.reference.id;
    }
    if (filtre.du || filtre.au) {
      where.creeA = {
        ...(filtre.du ? { gte: filtre.du } : {}),
        ...(filtre.au ? { lt: filtre.au } : {}),
      };
    }
    const lignes = await this.prisma.whatsappMessage.findMany({
      where,
      orderBy: [{ creeA: "desc" }, { id: "asc" }],
      ...(filtre.limite !== undefined ? { take: filtre.limite } : {}),
    });
    return lignes.map(versMessage);
  }

  async compter(filtre: FiltreComptage): Promise<number> {
    if (filtre.demandeurId && !UUID.test(filtre.demandeurId)) return 0;
    return this.prisma.whatsappMessage.count({
      where: {
        creeA: { gte: filtre.depuis },
        ...(filtre.demandeurId ? { demandeurId: filtre.demandeurId } : {}),
        ...(filtre.destinataireIndex ? { destinataireIndex: filtre.destinataireIndex } : {}),
        ...(filtre.types ? { type: { in: [...filtre.types] } } : {}),
      },
    });
  }

  async ajouterEssai(essai: EssaiWhatsApp): Promise<void> {
    await this.prisma.whatsappEssai.create({
      data: {
        messageId: essai.messageId,
        numero: essai.numero,
        fournisseur: essai.fournisseur,
        at: essai.at,
        dureeMs: essai.dureeMs,
        resultat: essai.resultat,
        code: essai.code,
      },
    });
  }

  async essais(messageId: string): Promise<EssaiWhatsApp[]> {
    if (!UUID.test(messageId)) return [];
    const lignes = await this.prisma.whatsappEssai.findMany({
      where: { messageId },
      orderBy: { id: "asc" },
    });
    return lignes.map(
      (l: LigneEssai): EssaiWhatsApp => ({
        messageId: l.messageId,
        numero: l.numero,
        fournisseur: l.fournisseur,
        at: l.at,
        dureeMs: l.dureeMs,
        resultat: l.resultat as ResultatEssai,
        code: l.code,
      }),
    );
  }

  /* ------------------------------------------------------------------------- messages reçus */

  async enregistrerEntrant(entrant: MessageEntrant): Promise<boolean> {
    // ON CONFLICT DO NOTHING : un webhook rejoué (même identifiant WhatsApp) n'écrit rien.
    const { count } = await this.prisma.whatsappEntrant.createMany({
      data: [
        {
          id: entrant.id,
          idFournisseur: entrant.idFournisseur,
          expediteurIndex: entrant.expediteurIndex,
          expediteurMasque: entrant.expediteurMasque,
          typeMessage: entrant.typeMessage,
          recuA: entrant.recuA,
          repondueA: entrant.repondueA,
          delaiReponseMs: entrant.delaiReponseMs,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async dernierEntrant(expediteurIndex: string): Promise<MessageEntrant | null> {
    const l = await this.prisma.whatsappEntrant.findFirst({
      where: { expediteurIndex },
      orderBy: [{ recuA: "desc" }, { id: "desc" }],
    });
    return l ? versEntrant(l) : null;
  }

  async marquerReponse(
    expediteurIndex: string,
    at: Date,
    fenetreMs: number,
  ): Promise<MessageEntrant | null> {
    // Une seule instruction : le plus ancien message en attente, reçu depuis moins de `fenetreMs`,
    // est verrouillé (les autres réponses simultanées passent au suivant) puis marqué.
    const lignes = await this.prisma.$queryRaw<LigneEntrant[]>`
      UPDATE "whatsapp_entrant" e
         SET "repondueA" = ${at}::timestamptz,
             "delaiReponseMs" = (EXTRACT(EPOCH FROM (${at}::timestamptz - e."recuA")) * 1000)::int
       WHERE e."id" = (
               SELECT s."id" FROM "whatsapp_entrant" s
                WHERE s."expediteurIndex" = ${expediteurIndex}
                  AND s."repondueA" IS NULL
                  AND s."recuA" <= ${at}::timestamptz
                  AND s."recuA" >= ${at}::timestamptz - (${fenetreMs}::double precision * interval '1 millisecond')
                ORDER BY s."recuA" ASC, s."id" ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED)
      RETURNING e.*`;
    const l = lignes[0];
    return l ? versEntrant(l) : null;
  }

  async delaisReponse(depuis: Date): Promise<number[]> {
    const lignes = await this.prisma.whatsappEntrant.findMany({
      where: { recuA: { gte: depuis }, delaiReponseMs: { not: null } },
      select: { delaiReponseMs: true },
      orderBy: [{ recuA: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => l.delaiReponseMs as number);
  }
}
