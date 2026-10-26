// Au démarrage de l'application : exécute les ordres à cours limité dont le seuil est déjà atteint (et expire ceux qui sont échus).
import { executerOrdres } from '../../domain/revente.ts';
try { executerOrdres(); } catch { /* un monde incohérent ne doit pas empêcher l'application de démarrer */ }
