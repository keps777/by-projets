import styles from "./depot.module.css";

/** Icônes de la planche Depot que le kit n'a pas : le code QR du viseur et le triangle d'avertissement de la note. */

/** Code QR du viseur, dessin repris tel quel de Depot.dc.html (120 px, 21 modules). */
export function CodeQrViseur() {
  return (
    <svg
      className={styles.qr}
      width="120"
      height="120"
      viewBox="0 0 21 21"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="7" height="7" fill="#F4F0E8" />
      <rect x="2" y="2" width="5" height="5" fill="#050810" />
      <rect x="3" y="3" width="3" height="3" fill="#F4F0E8" />
      <rect x="13" y="1" width="7" height="7" fill="#F4F0E8" />
      <rect x="14" y="2" width="5" height="5" fill="#050810" />
      <rect x="15" y="3" width="3" height="3" fill="#F4F0E8" />
      <rect x="1" y="13" width="7" height="7" fill="#F4F0E8" />
      <rect x="2" y="14" width="5" height="5" fill="#050810" />
      <rect x="3" y="15" width="3" height="3" fill="#F4F0E8" />
      <path
        fill="#F4F0E8"
        d="M9 1h1v1H9zM11 1h1v2h-1zM9 3h2v1H9zM10 5h1v1h-1zM9 7h1v1H9zM11 6h1v2h-1zM1 9h1v1H1zM3 9h2v1H3zM6 9h1v2H6zM8 9h1v1H8zM10 9h2v1h-2zM13 9h1v1h-1zM15 9h1v2h-1zM17 9h2v1h-2zM2 11h2v1H2zM5 11h1v1H5zM8 11h2v1H8zM11 11h1v2h-1zM13 11h2v1h-2zM17 11h1v1h-1zM9 13h1v1H9zM12 13h1v1h-1zM14 13h2v1h-2zM17 13h1v2h-1zM9 15h2v1H9zM13 15h1v1h-1zM15 15h1v2h-1zM18 15h2v1h-2zM9 17h1v1H9zM11 17h2v1h-2zM14 17h1v1h-1zM17 17h1v1h-1zM9 19h3v1H9zM13 19h1v1h-1zM15 19h2v1h-2z"
      />
    </svg>
  );
}

/** Triangle d'avertissement de la note « Rien à encaisser » (18 px, trait rouge 2,2). */
export function IconeAvertissement() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FF5C5C"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
