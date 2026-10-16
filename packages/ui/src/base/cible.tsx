import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type PropsLien = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
type PropsBouton = ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

/** Propriétés d'un élément cliquable : un lien si `href` est donné, sinon un bouton. */
export type PropsCible = PropsLien | PropsBouton;

/**
 * Élément cliquable commun au kit : `<a>` quand `href` est présent, `<button type="button">`
 * sinon. Les composants du kit n'ont ainsi pas à choisir entre navigation et action.
 */
export function Cible(props: PropsCible) {
  if (props.href !== undefined) {
    return <a {...props} />;
  }
  const { href: _href, type = "button", ...reste } = props;
  return <button type={type} {...reste} />;
}
