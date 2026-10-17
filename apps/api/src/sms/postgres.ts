import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { JournalSms, type FiltreComptage, type FiltreMessages } from "./journal";
import type { EncodageSms, EssaiSms, MessageSms, ResultatEssai, StatutSms, TypeSms } from "./types";

/**
 * Adaptateur PostgreSQL (Prisma) du journal des SMS (AM-166). Tables : `sms_message` et `sms_essai`
 * (migrations « sms_et_heure_texte » et « sms_garanties »).
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **un message par clé d'idempotence** : `sms_message.cle` est unique, la création est un
 *   `INSERT … ON CONFLICT DO NOTHING` ; de deux demandes simultanées de la même clé, une seule crée,
 *   l'autre reçoit le message existant ;
 * - **des statuts qui ne reculent pas** : `modifier(…, seulementSi)` est un seul
 *   `UPDATE … WHERE id = $1 AND statut = ANY($2)` ; si un accusé de livraison et un réessai se
 *   croisent, un seul des deux change le statut, l'autre reçoit `null` ;
 * - **un identifiant de fournisseur n'appartient qu'à un message** (index unique partiel) ;
 * - **les essais sont en ajout seul** (déclencheurs) et le texte des SMS n'est stocké nulle part.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai si l'erreur (ou sa cause) porte ce code Prisma (ex. `P2025` : ligne introuvable). */
function porteCode(e: unknown, code: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === code) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0);
}

type LigneMessage = Prisma.SmsMessageGetPayload<object>;
type LigneEssai = Prisma.SmsEssaiGetPayload<object>;

function versMessage(l: LigneMessage): MessageSms {
  return {
    id: l.id,
    type: l.type as TypeSms,
    cle: l.cle,
    reference:
      l.referenceType !== null && l.referenceId !== null
        ? { type: l.referenceType, id: l.referenceId }
        : null,
    compagnieId: l.compagnieId,
    demandeurId: l.demandeurId,
    destinataireChiffre: l.destinataireChiffre,
    destinataireIndex: l.destinataireIndex,
    destinataireMasque: l.destinataireMasque,
    expediteur: l.expediteur,
    statut: l.statut as StatutSms,
    encodage: l.encodage as EncodageSms,
    caracteres: l.caracteres,
    segments: l.segments,
    coutFcfa: l.coutFcfa,
    coutEstimeFcfa: l.coutEstimeFcfa,
    tentatives: l.tentatives,
    fournisseur: l.fournisseur,
    idFournisseur: l.idFournisseur,
    derniereErreur: l.derniereErreur,
    creeA: l.creeA,
    planifieA: l.planifieA,
    expireA: l.expireA,
    envoyeA: l.envoyeA,
    livreA: l.livreA,
    delaiEnvoiMs: l.delaiEnvoiMs,
  };
}

function versLigne(m: MessageSms): Prisma.SmsMessageUncheckedCreateInput {
  return {
    id: m.id,
    type: m.type,
    cle: m.cle,
    referenceType: m.reference?.type ?? null,
    referenceId: m.reference?.id ?? null,
    compagnieId: m.compagnieId,
    demandeurId: m.demandeurId,
    destinataireChiffre: m.destinataireChiffre,
    destinataireIndex: m.destinataireIndex,
    destinataireMasque: m.destinataireMasque,
    expediteur: m.expediteur,
    statut: m.statut,
    encodage: m.encodage,
    caracteres: m.caracteres,
    segments: m.segments,
    coutFcfa: m.coutFcfa,
    coutEstimeFcfa: m.coutEstimeFcfa,
    tentatives: m.tentatives,
    fournisseur: m.fournisseur,
    idFournisseur: m.idFournisseur,
    derniereErreur: m.derniereErreur,
    creeA: m.creeA,
    planifieA: m.planifieA,
    expireA: m.expireA,
    envoyeA: m.envoyeA,
    livreA: m.livreA,
    delaiEnvoiMs: m.delaiEnvoiMs,
  };
}

/** Les champs à modifier : `reference` se range dans deux colonnes, le reste porte le même nom. */
function versModifs(
  modifs: Partial<Omit<MessageSms, "id">>,
): Prisma.SmsMessageUncheckedUpdateInput {
  const { reference, ...reste } = modifs;
  const data: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(reste)) {
    if (valeur !== undefined) data[cle] = valeur;
  }
  if (reference !== undefined) {
    data["referenceType"] = reference?.type ?? null;
    data["referenceId"] = reference?.id ?? null;
  }
  return data as Prisma.SmsMessageUncheckedUpdateInput;
}

@Injectable()
export class JournalSmsPrisma extends JournalSms {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(message: MessageSms): Promise<{ cree: boolean; message: MessageSms }> {
    // ON CONFLICT DO NOTHING : le nombre de lignes écrites dit qui a créé le message.
    const { count } = await this.prisma.smsMessage.createMany({
      data: [versLigne(message)],
      skipDuplicates: true,
    });
    if (count === 1) return { cree: true, message: { ...message } };
    const existant = await this.trouverParCle(message.cle);
    if (!existant) {
      // Conflit sur l'identifiant et non sur la clé : un bogue de l'appelant, pas une idempotence.
      throw new Error(`SMS ${message.id} : identifiant déjà pris par un autre message`);
    }
    return { cree: false, message: existant };
  }

  async trouver(id: string): Promise<MessageSms | null> {
    if (!UUID.test(id)) return null;
    const l = await this.prisma.smsMessage.findUnique({ where: { id } });
    return l ? versMessage(l) : null;
  }

  async trouverParCle(cle: string): Promise<MessageSms | null> {
    const l = await this.prisma.smsMessage.findUnique({ where: { cle } });
    return l ? versMessage(l) : null;
  }

  async trouverParFournisseur(
    fournisseur: string,
    idFournisseur: string,
  ): Promise<MessageSms | null> {
    const l = await this.prisma.smsMessage.findFirst({ where: { fournisseur, idFournisseur } });
    return l ? versMessage(l) : null;
  }

  async modifier(
    id: string,
    modifs: Partial<Omit<MessageSms, "id">>,
    seulementSi?: readonly StatutSms[],
  ): Promise<MessageSms | null> {
    if (!UUID.test(id)) return null;
    try {
      // Un seul UPDATE … WHERE id = $1 AND statut IN (…) : la condition et l'écriture sont atomiques.
      const l = await this.prisma.smsMessage.update({
        where: { id, ...(seulementSi ? { statut: { in: [...seulementSi] } } : {}) },
        data: versModifs(modifs),
      });
      return versMessage(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async lister(filtre: FiltreMessages): Promise<MessageSms[]> {
    const where: Prisma.SmsMessageWhereInput = {};
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
    const lignes = await this.prisma.smsMessage.findMany({
      where,
      orderBy: [{ creeA: "desc" }, { id: "asc" }],
      ...(filtre.limite !== undefined ? { take: filtre.limite } : {}),
    });
    return lignes.map(versMessage);
  }

  async compter(filtre: FiltreComptage): Promise<number> {
    if (filtre.demandeurId && !UUID.test(filtre.demandeurId)) return 0;
    return this.prisma.smsMessage.count({
      where: {
        creeA: { gte: filtre.depuis },
        ...(filtre.demandeurId ? { demandeurId: filtre.demandeurId } : {}),
        ...(filtre.destinataireIndex ? { destinataireIndex: filtre.destinataireIndex } : {}),
        ...(filtre.types ? { type: { in: [...filtre.types] } } : {}),
      },
    });
  }

  async ajouterEssai(essai: EssaiSms): Promise<void> {
    await this.prisma.smsEssai.create({
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

  async essais(messageId: string): Promise<EssaiSms[]> {
    if (!UUID.test(messageId)) return [];
    const lignes = await this.prisma.smsEssai.findMany({
      where: { messageId },
      orderBy: { id: "asc" },
    });
    return lignes.map(
      (l: LigneEssai): EssaiSms => ({
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
}
