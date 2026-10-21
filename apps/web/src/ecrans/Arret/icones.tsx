/** Icône de la planche Arret, dessinée comme dans la maquette (le kit n'a pas d'horloge). */

/** Horloge de la note « Tu paies maintenant… » : cercle et aiguilles, trait ambre de 2,2. */
export function IconeHorloge() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--am-ambre)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
