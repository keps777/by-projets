import styles from "./kiosque.module.css";
import { textesEfface } from "./textes";

/**
 * Écran de verrouillage d'un appareil effacé à distance. Aucun bouton : l'appareil ne repart que remis en
 * service par un superviseur (`leverVerrouEffacement`).
 */
export function EcranAppareilEfface({ incomplet }: { incomplet: boolean }) {
  const textes = textesEfface();
  return (
    <main className={styles.ecran} data-testid="appareil-efface">
      <h1 className={styles.titre}>{textes.titre}</h1>
      <p className={styles.texte}>{textes.corps}</p>
      <p className={styles.texte}>{textes.consigne}</p>
      {incomplet && (
        <p className={styles.alerte} role="alert">
          {textes.incomplet}
        </p>
      )}
    </main>
  );
}
