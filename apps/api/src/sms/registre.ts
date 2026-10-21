import type { ConfigSms, SpecFournisseur } from "./config";
import type { FournisseurSms } from "./fournisseur";
import { FournisseurHttp, type TransportHttp } from "./fournisseur-http";
import { FournisseurSimule } from "./fournisseur-simule";

/** Le fournisseur principal et, si la configuration en donne un, le fournisseur de secours. */
export class RegistreFournisseurs {
  constructor(
    readonly principal: FournisseurSms,
    readonly secours: FournisseurSms | null = null,
  ) {
    if (secours && secours.nom === principal.nom) {
      throw new Error("Le fournisseur de secours doit avoir un autre nom que le principal");
    }
  }

  /** Ordre d'essai : le principal d'abord. */
  ordre(): FournisseurSms[] {
    return this.secours ? [this.principal, this.secours] : [this.principal];
  }

  parNom(nom: string): FournisseurSms | null {
    return this.ordre().find((f) => f.nom === nom) ?? null;
  }
}

function construire(
  spec: SpecFournisseur,
  config: ConfigSms,
  transport: TransportHttp,
): FournisseurSms {
  if (spec.type === "simule") {
    return new FournisseurSimule({
      nom: spec.nom,
      journaliserContenu: config.journaliserContenuSimule,
    });
  }
  return new FournisseurHttp(
    {
      nom: spec.nom,
      urlApi: spec.urlApi,
      cleApi: spec.cleApi,
      secretWebhook: spec.secretWebhook,
      delaiMs: config.delaiFournisseurMs,
    },
    transport,
  );
}

export function construireRegistre(
  config: ConfigSms,
  transport: TransportHttp,
): RegistreFournisseurs {
  const { principal, secours } = config.fournisseurs;
  return new RegistreFournisseurs(
    construire(principal, config, transport),
    secours ? construire(secours, config, transport) : null,
  );
}
