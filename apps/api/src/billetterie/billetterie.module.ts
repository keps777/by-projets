import { Inject, Injectable, Module, forwardRef, type OnModuleInit } from "@nestjs/common";
import { NumerotationModule } from "../numerotation/numerotation.module";
import { NumerotationService } from "../numerotation/numerotation.service";
import { ConversionDevisesPaiements } from "../paiements/adaptateurs";
import { PaiementsModule } from "../paiements/paiements.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AgenceController } from "./agence.controller";
import { AgenceService } from "./agence.service";
import { BalayageBilletterie } from "./balayage";
import { BilletsService } from "./billets.service";
import { CommandesService } from "./commandes.service";
import { DepartsService } from "./departs.service";
import { ExploitationController } from "./exploitation.controller";
import {
  AvisMemoire,
  BilletsMemoire,
  CatalogueMemoire,
  ColisMemoire,
  CommandesMemoire,
  DiffusionMemoire,
  EvenementsTraitesMemoire,
  InventaireMemoire,
  NumerotationEnLigneMemoire,
  PreferencesMemoire,
  ProchesMemoire,
  PromotionsMemoire,
  ScansMemoire,
  SignataireQrEcdsa,
  type StockageBilletterie,
} from "./memoire";
import { Passagers } from "./passagers";
import { OPTIONS_BILLETTERIE, OPTIONS_PAR_DEFAUT, PasserelleTempsReel } from "./passerelle";
import {
  BilletsPrisma,
  CataloguePrisma,
  CommandesPrisma,
  EvenementsTraitesPrisma,
  InventairePrisma,
  NumerotationEnLigneServeur,
  PreferencesPrisma,
  ScansPrisma,
} from "./postgres";
import {
  AvisBillets,
  Billets,
  Catalogue,
  ColisDuDepart,
  Commandes,
  ConversionDevises,
  DiffusionTempsReel,
  EvenementsTraites,
  Inventaire,
  NumerotationEnLigne,
  PreferencesVoyageur,
  ProchesVoyageur,
  Promotions,
  Scans,
  SignataireQr,
} from "./ports";
import type { CleJwk } from "./qr";
import { SiegesService } from "./sieges.service";
import { VoyageurController } from "./voyageur.controller";

/** Variable d'environnement de la clé privée de signature des QR (JWK JSON, brut ou en base64). */
export const VARIABLE_CLE_QR = "BILLETTERIE_QR_CLE_PRIVEE";

/**
 * Le signataire des QR : avec une clé privée fournie (production), les QR survivent aux
 * redémarrages ; sans clé, une paire est fabriquée au démarrage (développement, tests) et le module
 * refuse de démarrer en production.
 */
export function creerSignataire(brut: string | undefined): SignataireQrEcdsa {
  const valeur = brut?.trim();
  if (!valeur) return new SignataireQrEcdsa(null, false);
  let jwk: CleJwk;
  try {
    jwk = JSON.parse(
      valeur.startsWith("{") ? valeur : Buffer.from(valeur, "base64").toString("utf8"),
    );
  } catch {
    throw new Error(`${VARIABLE_CLE_QR} : JWK illisible (JSON, brut ou en base64)`);
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y) {
    throw new Error(`${VARIABLE_CLE_QR} : clé ECDSA P-256 privée attendue (kty, crv, d, x, y)`);
  }
  return new SignataireQrEcdsa(jwk, true);
}

/**
 * Les ports qui ne gardent aucune donnée : `ConversionDevises` (taux indicatifs) et
 * `DiffusionTempsReel` (diffusion dans le processus). Un redémarrage ne leur fait rien perdre, ils ne
 * bloquent donc pas la production. Plusieurs instances de l'API demanderont Redis ou LISTEN/NOTIFY
 * pour la diffusion (README).
 */
const SANS_DONNEES: ReadonlySet<string> = new Set(["ConversionDevises", "DiffusionTempsReel"]);

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de la billetterie est encore en
 * mémoire (billets, sièges et événements reçus seraient perdus au premier redémarrage).
 */
@Injectable()
export class VerificationStockageBilletterie implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly catalogue: Catalogue,
    private readonly billets: Billets,
    private readonly inventaire: Inventaire,
    private readonly commandes: Commandes,
    private readonly scans: Scans,
    private readonly traites: EvenementsTraites,
    private readonly preferences: PreferencesVoyageur,
    private readonly promotions: Promotions,
    private readonly proches: ProchesVoyageur,
    private readonly devises: ConversionDevises,
    private readonly numerotation: NumerotationEnLigne,
    private readonly colis: ColisDuDepart,
    private readonly signataire: SignataireQr,
    private readonly diffusion: DiffusionTempsReel,
    private readonly avis: AvisBillets,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["Catalogue", this.catalogue],
      ["Billets", this.billets],
      ["Inventaire", this.inventaire],
      ["Commandes", this.commandes],
      ["Scans", this.scans],
      ["EvenementsTraites", this.traites],
      ["PreferencesVoyageur", this.preferences],
      ["Promotions", this.promotions],
      ["ProchesVoyageur", this.proches],
      ["ConversionDevises", this.devises],
      ["NumerotationEnLigne", this.numerotation],
      ["ColisDuDepart", this.colis],
      ["SignataireQr", this.signataire],
      ["DiffusionTempsReel", this.diffusion],
      ["AvisBillets", this.avis],
    ];
    const volatils = ports
      .filter(([nom]) => !SANS_DONNEES.has(nom))
      .filter(([, port]) => (port as Partial<StockageBilletterie>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `BilletterieModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          `PostgreSQL (tables décrites dans apps/api/src/billetterie/README.md) et fournir ` +
          `${VARIABLE_CLE_QR} avant de démarrer en production.`,
      );
    }
  }
}

/**
 * Billetterie (AM-162) : départs, sièges, billets nominatifs à QR signé, scan au quai.
 *
 * À importer dans `AppModule` (périmètre du socle). Chaque port ci-dessous est remplaçable :
 * l'intégration branche les adaptateurs PostgreSQL (Catalogue, Billets, Inventaire, Commandes,
 * Scans, EvenementsTraites, PreferencesVoyageur) et ceux des autres tickets (Promotions, Proches,
 * ConversionDevises, NumerotationEnLigne : AM-161, ColisDuDepart : AM-163, AvisBillets : SMS et
 * paiements). Les paiements appellent `CommandesService.confirmerPaiement`.
 */
@Module({
  // Les paiements importent la billetterie (ils lisent ses commandes) et la billetterie leur emprunte le
  // taux de change : le cycle de modules est voulu, sans cycle entre fournisseurs (forwardRef des deux côtés).
  imports: [NumerotationModule, forwardRef(() => PaiementsModule)],
  controllers: [VoyageurController, AgenceController, ExploitationController],
  providers: [
    Passagers,
    SiegesService,
    BilletsService,
    CommandesService,
    DepartsService,
    AgenceService,
    PasserelleTempsReel,
    BalayageBilletterie,
    VerificationStockageBilletterie,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: OPTIONS_BILLETTERIE, useValue: OPTIONS_PAR_DEFAUT },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: Catalogue,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new CataloguePrisma(prisma) : new CatalogueMemoire(),
    },
    {
      provide: Billets,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new BilletsPrisma(prisma) : new BilletsMemoire(),
    },
    {
      provide: Inventaire,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new InventairePrisma(prisma) : new InventaireMemoire(),
    },
    {
      provide: Commandes,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new CommandesPrisma(prisma) : new CommandesMemoire(),
    },
    {
      provide: Scans,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ScansPrisma(prisma) : new ScansMemoire(),
    },
    {
      provide: EvenementsTraites,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new EvenementsTraitesPrisma(prisma)
          : new EvenementsTraitesMemoire(),
    },
    {
      provide: PreferencesVoyageur,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PreferencesPrisma(prisma) : new PreferencesMemoire(),
    },
    { provide: Promotions, useClass: PromotionsMemoire },
    { provide: ProchesVoyageur, useClass: ProchesMemoire },
    // Taux de l'agrégateur de paiement (AM-165). `ConversionMemoire` (taux indicatifs) reste exportée pour les tests.
    { provide: ConversionDevises, useExisting: ConversionDevisesPaiements },
    // Les numéros 4001–9999 viennent du registre de la numérotation (AM-161) sur PostgreSQL.
    {
      provide: NumerotationEnLigne,
      inject: [CONFIG, NumerotationService],
      useFactory: (config: AppConfig, numerotation: NumerotationService) =>
        stockageSurPostgres(config)
          ? new NumerotationEnLigneServeur(numerotation)
          : new NumerotationEnLigneMemoire(),
    },
    { provide: ColisDuDepart, useClass: ColisMemoire },
    { provide: AvisBillets, useClass: AvisMemoire },
    { provide: DiffusionTempsReel, useClass: DiffusionMemoire },
    {
      provide: SignataireQr,
      useFactory: () => creerSignataire(process.env[VARIABLE_CLE_QR]),
    },
  ],
  exports: [
    SiegesService,
    BilletsService,
    CommandesService,
    DepartsService,
    AgenceService,
    Catalogue,
    Billets,
    Inventaire,
    Commandes,
    Scans,
    EvenementsTraites,
    PreferencesVoyageur,
    Promotions,
    ProchesVoyageur,
    ConversionDevises,
    NumerotationEnLigne,
    ColisDuDepart,
    AvisBillets,
    DiffusionTempsReel,
    SignataireQr,
  ],
})
export class BilletterieModule {}
