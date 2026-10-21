#!/usr/bin/env bash
# AM-172 · Rétention : sauvegardes complètes 30 jours, sauvegardes physiques et journal (WAL) 7 jours,
# chez chacun des deux fournisseurs. Appelé à la fin de chaque sauvegarde réussie, ou à la main.
#
# Garde-fou : les GARDER_AU_MOINS (3) sauvegardes complètes ou physiques les plus récentes ne sont
# jamais supprimées, même vieilles. Si les sauvegardes s'arrêtent, la purge ne doit pas vider le
# stock pendant que personne ne regarde.
# Un fournisseur qui ne répond pas n'est pas purgé et fait sortir le script en erreur (code 1).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config
exiger_outils rclone date
exiger_fournisseurs

maintenant="$(maintenant_epoch)"
statut=0

# purger_categorie FOURNISSEUR DOSSIER JOURS A_GARDER
purger_categorie() {
  local four="$1" dossier="$2" jours="$3" garder="$4"
  local liste fichier stamp limite recents=" " supprimes=0
  local -a stamps=()
  local code=0
  liste="$(rclone lsf --files-only "$four/$dossier" 2>/dev/null)" || code=$?
  if [ "$code" = 3 ]; then return 0; fi # code 3 de rclone = dossier introuvable : jamais créé, rien à purger
  if [ "$code" != 0 ]; then
    log "$four : impossible de lister $dossier (code $code), rien n'est supprimé"
    return 1
  fi
  [ -n "$liste" ] || return 0

  limite="$(horodatage_de_epoch $((maintenant - jours * 86400)))"
  while IFS= read -r fichier; do
    stamp="$(extraire_horodatage "$fichier")"
    [ -z "$stamp" ] || stamps+=("$stamp")
  done <<<"$liste"
  [ "${#stamps[@]}" -gt 0 ] || return 0

  # Les plus récents horodatages (uniques) sont protégés.
  if [ "$garder" -gt 0 ]; then
    recents=" $(printf '%s\n' "${stamps[@]}" | sort -ru | head -n "$garder" | tr '\n' ' ')"
  fi

  while IFS= read -r fichier; do
    stamp="$(extraire_horodatage "$fichier")"
    [ -n "$stamp" ] || continue
    [[ "$stamp" < "$limite" ]] || continue
    case "$recents" in *" $stamp "*) continue ;; esac
    rclone deletefile "$four/$dossier/$fichier" || {
      log "$four : suppression de $dossier/$fichier échouée"
      return 1
    }
    supprimes=$((supprimes + 1))
  done <<<"$liste"
  log "$four : $dossier, $supprimes fichier(s) supprimé(s) (limite $jours jours)"
}

for four in "${FOURNISSEURS[@]}"; do
  purger_categorie "$four" complet "$RETENTION_COMPLET_JOURS" "$GARDER_AU_MOINS" || statut=1
  purger_categorie "$four" physique "$RETENTION_PHYSIQUE_JOURS" "$GARDER_AU_MOINS" || statut=1
  purger_categorie "$four" journal "$RETENTION_JOURNAL_JOURS" 0 || statut=1
done
exit "$statut"
