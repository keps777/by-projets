#!/usr/bin/env bash
# AM-172 · Sauvegarde de la base PostgreSQL.
#
#   sauvegarder.sh complet     (défaut) pg_dump -Fc chiffré, déposé chez les DEUX fournisseurs
#   sauvegarder.sh physique    pg_basebackup (base + journal nécessaire), chiffré, déposé chez les deux ;
#                              sert à la restauration à un instant précis avec le journal (WAL)
#
# Lancé chaque nuit à 2 h (heure de Douala) par systemd (systemd/afrimove-sauvegarde.timer).
# Codes de sortie : 0 = les deux fournisseurs ont le fichier ; 2 = un seul l'a (sauvegarde partielle,
# alerte envoyée) ; 1 = échec complet.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config
mode="${1:-complet}"
exiger_outils rclone age sha256sum
exiger_fournisseurs
exiger_chiffrement
preparer_pg
dossier_temporaire

stamp="$(horodatage_maintenant)"

case "$mode" in
  complet)
    nom="afrimove-$stamp.dump.age"
    dossier_distant="complet"
    # Le dump est écrit en clair dans un dossier privé (0700) seulement le temps de le contrôler, puis
    # chiffré ; le clair disparaît à la sortie du script (trap de dossier_temporaire).
    pg pg_dump -U "$PG_UTILISATEUR" -d "$PG_BASE" -Fc >"$TMP/base.dump" || die "pg_dump a échoué"
    [ -s "$TMP/base.dump" ] || die "le dump est vide"
    pg pg_restore --list <"$TMP/base.dump" >/dev/null || die "le dump produit n'est pas lisible par pg_restore"
    age "${ARGS_AGE[@]}" -o "$TMP/$nom" "$TMP/base.dump" || die "chiffrement impossible"
    rm -f "$TMP/base.dump"
    ;;
  physique)
    nom="afrimove-$stamp.base.tar.age"
    dossier_distant="physique"
    # pg_basebackup écrit dans le conteneur (-X fetch : le journal nécessaire à la cohérence est inclus),
    # puis l'archive est lue en flux et chiffrée.
    pg sh -c 'rm -rf /tmp/base-sauvegarde && pg_basebackup -U "$1" -D /tmp/base-sauvegarde -Ft -z -X fetch -c fast' sh "$PG_UTILISATEUR" ||
      die "pg_basebackup a échoué"
    pg tar -C /tmp/base-sauvegarde -cf - . | age "${ARGS_AGE[@]}" -o "$TMP/$nom" ||
      die "lecture ou chiffrement de la sauvegarde physique impossible"
    pg rm -rf /tmp/base-sauvegarde || true
    ;;
  *) die "mode inconnu : $mode (complet | physique)" ;;
esac

[ -s "$TMP/$nom" ] || die "le fichier chiffré est vide"
(cd "$TMP" && sha256sum "$nom" >"$nom.sha256")
taille="$(wc -c <"$TMP/$nom" | tr -d ' ')"
log "$nom : $taille octets chiffrés"

deposer_partout "$dossier_distant" "$TMP/$nom" "$TMP/$nom.sha256"

printf '{"mode":"%s","fichier":"%s","octets":%s,"reussis":%s,"horodatage":"%s"}\n' \
  "$mode" "$nom" "$taille" "$DEPOTS_REUSSIS" "$stamp" >"$DOSSIER_TRAVAIL/derniere-$mode.json"

if [ "$DEPOTS_REUSSIS" = 0 ]; then
  die "$mode : aucun fournisseur n'a reçu $nom"
elif [ "$DEPOTS_REUSSIS" = 1 ]; then
  alerter "$mode $nom : sauvegarde PARTIELLE, échec chez ${DEPOTS_ECHOUES[*]}"
  log "sauvegarde partielle : échec chez ${DEPOTS_ECHOUES[*]}"
  exit 2
fi

# Le ménage ne doit jamais faire échouer une sauvegarde réussie.
"$DOSSIER_SCRIPTS/purger.sh" || log "purge en échec (la sauvegarde, elle, est bonne)"
log "sauvegarde $mode terminée"
