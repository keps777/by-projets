export * from "./base/index";
export * from "./formulaires/index";
// Le sélecteur déroulant des formulaires porte un autre nom que le sélecteur à segments de la base.
export {
  Selecteur as SelecteurDeroulant,
  type OptionSelecteur as OptionSelecteurDeroulant,
  type SelecteurProps as SelecteurDeroulantProps,
} from "./formulaires/Selecteur";
export * from "./transport/index";
export * from "./donnees/index";
