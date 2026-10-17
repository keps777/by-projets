import { randomUUID } from "node:crypto";
import type { FixturesPg } from "../../caisse/testing/fixtures-pg";
import type { PrismaService } from "../../socle/db/prisma.service";

/**
 * Un colis en base (avec sa compagnie et ses deux gares), pour les tests d'intégration qui rattachent
 * une réception, une mission ou un partage à un colis : les clés étrangères l'exigent. Le colis est
 * en mode `relais` ou `moto` selon ce qu'on teste, sans chiffrement (les champs chiffrés sont quelconques).
 */
export async function creerColisPg(
  prisma: PrismaService,
  fx: FixturesPg,
  o: {
    mode?: "gare" | "relais" | "moto";
    etat?: "enregistre" | "charge" | "en_route" | "decharge" | "disponible" | "remis" | "en_relais";
    relaisId?: string | null;
    /** La compagnie du colis et ses gares (sinon une compagnie et deux gares neuves), et le port payé. */
    compagnieId?: string;
    gareOrigineId?: string;
    gareDestinationId?: string;
    port?: number;
  } = {},
): Promise<{ id: string; numero: string }> {
  const compagnieId = o.compagnieId ?? (await fx.compagnie()).id;
  const origine = o.gareOrigineId ? { id: o.gareOrigineId } : await fx.gare(compagnieId);
  const destination = o.gareDestinationId
    ? { id: o.gareDestinationId }
    : await fx.gare(compagnieId);
  const n = fx.prochain();
  const numero = `C-TST-270105-${n}-${randomUUID().slice(0, 4)}`;
  const c = await prisma.colis.create({
    data: {
      numero,
      sequence: n,
      gareOrigineId: origine.id,
      gareDestinationId: destination.id,
      expediteurChiffre: "x",
      expediteurTelephoneIndex: randomUUID(),
      destinataireChiffre: "x",
      destinataireTelephoneIndex: randomUUID(),
      contenu: "Sac",
      poidsKg: 5,
      valeurDeclaree: 10_000,
      mode: o.mode ?? "relais",
      canal: "agence",
      codeRetraitHache: "h",
      codeRetraitSel: "s",
      prixTotal: 3000,
      creeA: new Date("2027-01-05T08:00:00.000Z"),
      etat: o.etat ?? "disponible",
      jour: "270105",
      relaisId: o.relaisId ?? null,
      ...(o.compagnieId ? { compagnieId: o.compagnieId } : {}),
      ...(o.port === undefined ? {} : { port: o.port }),
    },
  });
  return { id: c.id, numero };
}
