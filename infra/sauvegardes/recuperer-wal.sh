#!/usr/bin/env bash
# AM-172 · restore_command de PostgreSQL pour la restauration à un instant précis :
#   restore_command = '/chemin/recuperer-wal.sh "%f" "%p"'
# Va chercher le segment %f chez le fournisseur A (puis B), le déchiffre avec l'identité age
# (IDENTITE_AGE) et l'écrit en %p. Sortie non nulle si le segment n'existe nulle part : c'est le signal
# normal de fin de rejeu pour PostgreSQL.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config
nom="${1:?nom du segment (%f)}"
destination="${2:?chemin de destination (%p)}"
: "${IDENTITE_AGE:?IDENTITE_AGE : chemin de la clé privée age}"
exiger_outils rclone age
exiger_fournisseurs
umask 077

for four in "${FOURNISSEURS[@]}"; do
  distant="$(rclone lsf --files-only "$four/journal" 2>/dev/null | grep -F "_$nom.age" | sort | tail -n1 || true)"
  [ -n "$distant" ] || continue
  tmp="$(mktemp)"
  if rclone cat "$four/journal/$distant" >"$tmp" && age -d -i "$IDENTITE_AGE" -o "$destination" "$tmp"; then
    rm -f "$tmp"
    exit 0
  fi
  rm -f "$tmp"
done
exit 1
