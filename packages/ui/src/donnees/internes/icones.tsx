import type { ReactNode, SVGProps } from "react";

/** Icônes tracées dans les planches (viewBox 24, trait arrondi). Décoratives : aria-hidden. */
function Icone({ children, ...reste }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...reste}
    >
      {children}
    </svg>
  );
}

export function IconeFlecheBas(props: SVGProps<SVGSVGElement>) {
  return (
    <Icone strokeWidth={3} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Icone>
  );
}

export function IconeChevronDroit(props: SVGProps<SVGSVGElement>) {
  return (
    <Icone {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icone>
  );
}

export function IconeEtincelles(props: SVGProps<SVGSVGElement>) {
  return (
    <Icone strokeWidth={2.4} {...props}>
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Icone>
  );
}

export function IconeFermer(props: SVGProps<SVGSVGElement>) {
  return (
    <Icone {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icone>
  );
}
