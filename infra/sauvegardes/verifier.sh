#!/usr/bin/env bash
# AM-172 · Sonde de fraîcheur : chaque fournisseur doit avoir une sauvegarde complète de moins de
# FRAICHEUR_COMPLET_HEURES (26 h par défaut : une nuit manquée est détectée le lendemain matin), avec
# son empreinte .sha256. Avec VERIFIER_JOURNAL=1, le segment de journal le plus récent doit aussi avoir
# moins de FRAICHEUR_JOURNAL_MINUTES. Lancé chaque matin par systemd (afrimove-verification.timer).
# Sortie 0 = tout est à jour chez les deux ; 1 = au moins un problème (alerte envoyée).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config
exiger_outils rclone date
exiger_fournisseurs

maintenant="$(maintenant_epoch)"
problemes=()

# plus_recent FOURNISSEUR DOSSIER : nom du fichier de données le plus récent (hors .sha256)
plus_recent() {
  rclone lsf --files-only "$1/$2" 2>/dev/null | grep -v '\.sha256$' | sort | tail -n1 || true
}

# controler FOURNISSEUR DOSSIER LIMITE_EN_SECONDES LIBELLE EXIGE_EMPREINTE
controler() {
  local four="$1" dossier="$2" limite="$3" libelle="$4" empreinte="$5" nom stamp age
  nom="$(plus_recent "$four" "$dossier")"
  if [ -z "$nom" ]; then
    problemes+=("$four : aucune sauvegarde $libelle")
    return
  fi
  stamp="$(extraire_horodatage "$nom")"
  if [ -z "$stamp" ]; then
    problemes+=("$four : nom illisible dans $dossier ($nom)")
    return
  fi
  age=$((maintenant - $(epoch_de_horodatage "$stamp")))
  if [ "$age" -gt "$limite" ]; then
    problemes+=("$four : dernière sauvegarde $libelle trop ancienne ($nom, $((age / 3600)) h)")
    return
  fi
  if [ "$empreinte" = 1 ] && ! rclone lsf --files-only "$four/$dossier" | grep -qxF "$nom.sha256"; then
    problemes+=("$four : empreinte .sha256 absente pour $nom")
    return
  fi
  log "$four : $libelle à jour ($nom)"
}

for four in "${FOURNISSEURS[@]}"; do
  controler "$four" complet $((FRAICHEUR_COMPLET_HEURES * 3600)) "complète" 1
  if [ "${VERIFIER_JOURNAL:-0}" = 1 ]; then
    controler "$four" journal $((FRAICHEUR_JOURNAL_MINUTES * 60)) "du journal" 0
  fi
done

if [ "${#problemes[@]}" -gt 0 ]; then
  for p in "${problemes[@]}"; do log "PROBLÈME : $p"; done
  alerter "vérification en échec : ${problemes[*]}"
  exit 1
fi
log "tout est à jour chez les deux fournisseurs"
