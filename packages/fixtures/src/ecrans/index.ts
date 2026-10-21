import type { Ecran } from "../ecran";
import type { NomPlanche } from "../planches";
import { Splash } from "./Splash";
import { Connexion } from "./Connexion";
import { Tuto } from "./Tuto";
import { Main } from "./Main";
import { SiegePay } from "./SiegePay";
import { Pass } from "./Pass";
import { Direct } from "./Direct";
import { Reseau } from "./Reseau";
import { Covoit } from "./Covoit";
import { Paiement } from "./Paiement";
import { Course } from "./Course";
import { MainVille } from "./MainVille";
import { CovoitVille } from "./CovoitVille";
import { CovoitConducteur } from "./CovoitConducteur";
import { MainFiltres } from "./MainFiltres";
import { Arret } from "./Arret";
import { Groupe } from "./Groupe";
import { USSD } from "./USSD";
import { Moi } from "./Moi";
import { ColisEnvoi } from "./ColisEnvoi";
import { ColisCode } from "./ColisCode";
import { Relais } from "./Relais";
import { Livraison } from "./Livraison";
import { Proche } from "./Proche";
import { Guichet } from "./Guichet";
import { Vente } from "./Vente";
import { Cadence } from "./Cadence";
import { GuichetColis } from "./GuichetColis";
import { Depot } from "./Depot";
import { Quai } from "./Quai";
import { Convoyeur } from "./Convoyeur";
import { Chauffeur } from "./Chauffeur";
import { Controleur } from "./Controleur";
import { Caisse } from "./Caisse";
import { Superviseur } from "./Superviseur";
import { RapportSoir } from "./RapportSoir";
import { Patron } from "./Patron";
import { Assistant } from "./Assistant";
import { Analyses } from "./Analyses";
import { Comptable } from "./Comptable";
import { Config } from "./Config";
import { Modules } from "./Modules";
import { Financement } from "./Financement";
import { InterAgences } from "./InterAgences";
import { RelaisApp } from "./RelaisApp";
import { Livreur } from "./Livreur";
import { Conducteur } from "./Conducteur";
import { Vendeur } from "./Vendeur";
import { Controle } from "./Controle";
import { Parcours } from "./Parcours";
import { Systeme } from "./Systeme";
import { CadenceBillet } from "./CadenceBillet";
import { CadenceQuai } from "./CadenceQuai";
import { SuperviseurValider } from "./SuperviseurValider";
import { SuperviseurVoir } from "./SuperviseurVoir";
import { SuperviseurEquipe } from "./SuperviseurEquipe";
import { SuperviseurDebloquer } from "./SuperviseurDebloquer";
import { AssistantReponse } from "./AssistantReponse";
import { AnalysesLigne } from "./AnalysesLigne";
import { AnalysesBus } from "./AnalysesBus";
import { ConfigLigne } from "./ConfigLigne";
import { ComptableRapprochement } from "./ComptableRapprochement";
import { ComptableApercu } from "./ComptableApercu";
import { ComptableCloture } from "./ComptableCloture";
import { FinancementDemande } from "./FinancementDemande";
import { InterAgencesConvention } from "./InterAgencesConvention";
import { PatronEquipe } from "./PatronEquipe";
import { PatronGare } from "./PatronGare";
import { PatronPersonne } from "./PatronPersonne";
import { ConfigEquipeListe } from "./ConfigEquipeListe";
import { ConfigPersonne } from "./ConfigPersonne";
import { ConfigRegles } from "./ConfigRegles";
import { RelaisDevenir } from "./RelaisDevenir";
import { RelaisInscription } from "./RelaisInscription";
import { RelaisVerification } from "./RelaisVerification";
import { LivreurDevenir } from "./LivreurDevenir";
import { LivreurVerification } from "./LivreurVerification";

/** Un scénario par planche, indexé par le nom du fichier de la maquette (sans .dc.html). */
export const ecrans = {
  Splash,
  Connexion,
  Tuto,
  Main,
  SiegePay,
  Pass,
  Direct,
  Reseau,
  Covoit,
  Paiement,
  Course,
  MainVille,
  CovoitVille,
  CovoitConducteur,
  MainFiltres,
  Arret,
  Groupe,
  USSD,
  Moi,
  ColisEnvoi,
  ColisCode,
  Relais,
  Livraison,
  Proche,
  Guichet,
  Vente,
  Cadence,
  GuichetColis,
  Depot,
  Quai,
  Convoyeur,
  Chauffeur,
  Controleur,
  Caisse,
  Superviseur,
  RapportSoir,
  Patron,
  Assistant,
  Analyses,
  Comptable,
  Config,
  Modules,
  Financement,
  InterAgences,
  RelaisApp,
  Livreur,
  Conducteur,
  Vendeur,
  Controle,
  Parcours,
  Systeme,
  CadenceBillet,
  CadenceQuai,
  SuperviseurValider,
  SuperviseurVoir,
  SuperviseurEquipe,
  SuperviseurDebloquer,
  AssistantReponse,
  AnalysesLigne,
  AnalysesBus,
  ConfigLigne,
  ComptableRapprochement,
  ComptableApercu,
  ComptableCloture,
  FinancementDemande,
  InterAgencesConvention,
  PatronEquipe,
  PatronGare,
  PatronPersonne,
  ConfigEquipeListe,
  ConfigPersonne,
  ConfigRegles,
  RelaisDevenir,
  RelaisInscription,
  RelaisVerification,
  LivreurDevenir,
  LivreurVerification,
} satisfies Record<NomPlanche, Ecran<unknown>>;
