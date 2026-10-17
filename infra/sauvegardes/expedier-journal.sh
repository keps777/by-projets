#!/usr/bin/env bash
# AM-172 · Expédie le journal (WAL) mis de côté par archiver-wal.sh : chiffre chaque segment puis le
# dépose chez les DEUX fournisseurs. Un segment n'est retiré du spool qu'une fois chez les deux ;
# sinon il reste et repart au passage suivant (même nom distant, donc pas de doublon).
# Lancé toutes les 5 minutes par systemd (afrimove-journal.timer) ; RPO visé : moins de 10 minutes.
# Sortie 0 = spool vidé ; 2 = au moins un segment reste en attente (fournisseur en panne).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config
exiger_outils rclone age
exiger_fournisseurs
exiger_chiffrement
dossier_temporaire

# Un seul expéditeur à la fois (flock absent, par ex. macOS : on continue sans verrou).
if command -v flock >/dev/null 2>&1; then
  exec 9>"$DOSSIER_TRAVAIL/expedier-journal.lock"
  flock -n 9 || {
    log "un autre envoi est en cours"
    exit 0
  }
fi

[ -d "$SPOOL_WAL" ] || die "dossier d'attente du journal absent : $SPOOL_WAL"

en_attente=0
envoyes=0
for segment in "$SPOOL_WAL"/*; do
  [ -f "$segment" ] || continue
  nom="$(basename "$segment")"
  case "$nom" in *.partiel) continue ;; esac
  # L'horodatage vient de la date du fichier : stable d'un passage à l'autre, donc un renvoi
  # écrase le même fichier distant au lieu d'en créer un second.
  stamp="$(date -u -r "$segment" +%Y%m%dT%H%M%SZ)"
  chiffre="$TMP/${stamp}_$nom.age"
  age "${ARGS_AGE[@]}" -o "$chiffre" "$segment" || die "chiffrement du segment $nom impossible"
  deposer_partout journal "$chiffre"
  if [ "$DEPOTS_REUSSIS" = 2 ]; then
    rm -f "$segment"
    envoyes=$((envoyes + 1))
  else
    en_attente=$((en_attente + 1))
  fi
  rm -f "$chiffre"
done

log "journal : $envoyes segment(s) expédié(s), $en_attente en attente"
[ "$en_attente" = 0 ] || exit 2
