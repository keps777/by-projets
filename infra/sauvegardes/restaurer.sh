#!/usr/bin/env bash
# AM-172 · Restauration complète sur un serveur vide, chronométrée.
#
#   restaurer.sh --identite cle-age.txt [--fournisseur A|B] [--fichier NOM] [--base NOM]
#                [--jetable] [--ecraser] [--rapport rapport.json]
#
# Prend la sauvegarde complète la plus récente (chez A, sinon chez B si A est en panne ou son fichier
# corrompu), vérifie l'empreinte, déchiffre avec la clé privée age, restaure dans une base vide, la
# contrôle et écrit un rapport JSON avec la durée. Objectif : moins de OBJECTIF_RESTAURATION_SECONDES
# (7 200 s = 2 h). Le chrono part au lancement du script : le temps de préparer le serveur et d'y poser
# Docker s'ajoute et se note à la main (voir README, « Test de restauration »).
#
#   --base NOM    base cible (défaut : PG_BASE). Créée si absente ; si elle existe, elle doit être vide.
#   --ecraser     supprime et recrée la base cible si elle contient déjà des tables (jamais par défaut).
#   --jetable     supprime la base cible après le contrôle : pour le test mensuel sur le serveur de prod.
#   VERIF_TABLES  tables qui doivent exister et être lisibles, séparées par des virgules.
#
# Codes de sortie : 0 = restaurée dans l'objectif ; 3 = restaurée mais trop lente ; 1 = échec.
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
charger_config

identite="${IDENTITE_AGE:-}" choix_fournisseur="" fichier_voulu="" base="" jetable=0 ecraser=0 rapport=""
while [ $# -gt 0 ]; do
  case "$1" in
    --identite) identite="${2:?}"; shift 2 ;;
    --fournisseur) choix_fournisseur="${2:?}"; shift 2 ;;
    --fichier) fichier_voulu="${2:?}"; shift 2 ;;
    --base) base="${2:?}"; shift 2 ;;
    --jetable) jetable=1; shift ;;
    --ecraser) ecraser=1; shift ;;
    --rapport) rapport="${2:?}"; shift 2 ;;
    *) die "option inconnue : $1" ;;
  esac
done
base="${base:-$PG_BASE}"
[ -n "$identite" ] || die "--identite manque (clé privée age, gardée hors de ce serveur en temps normal)"
[ -f "$identite" ] || die "clé privée introuvable : $identite"
[[ "$base" =~ ^[a-z_][a-z0-9_]*$ ]] || die "nom de base invalide : $base"
exiger_outils rclone age sha256sum
exiger_fournisseurs
preparer_pg
dossier_temporaire

debut="$(date -u +%s)"
log "restauration démarrée (base cible : $base)"

case "$choix_fournisseur" in
  '') candidats=("${FOURNISSEURS[@]}") ;;
  A | a) candidats=("$FOURNISSEUR_A") ;;
  B | b) candidats=("$FOURNISSEUR_B") ;;
  *) die "--fournisseur doit valoir A ou B" ;;
esac

# 1. Télécharger et vérifier, chez le premier fournisseur qui a une copie saine.
fournisseur_retenu="" nom=""
for four in "${candidats[@]}"; do
  candidat="$fichier_voulu"
  if [ -z "$candidat" ]; then
    candidat="$(rclone lsf --files-only "$four/complet" 2>/dev/null | grep -E '\.dump\.age$' | sort | tail -n1 || true)"
  fi
  if [ -z "$candidat" ]; then
    log "$four : aucune sauvegarde complète trouvée"
    continue
  fi
  rm -f "$TMP/$candidat" "$TMP/$candidat.sha256"
  if rclone copyto "$four/complet/$candidat" "$TMP/$candidat" &&
    rclone copyto "$four/complet/$candidat.sha256" "$TMP/$candidat.sha256" &&
    (cd "$TMP" && sha256sum --check --status "$candidat.sha256"); then
    fournisseur_retenu="$four"
    nom="$candidat"
    break
  fi
  log "$four : $candidat absent ou corrompu (empreinte), essai suivant"
done
[ -n "$nom" ] || die "aucune copie saine de la sauvegarde complète (ni chez A ni chez B)"
octets="$(wc -c <"$TMP/$nom" | tr -d ' ')"
log "copie saine : $fournisseur_retenu/complet/$nom ($octets octets)"

# 2. Déchiffrer et contrôler l'archive.
age -d -i "$identite" -o "$TMP/base.dump" "$TMP/$nom" || die "déchiffrement impossible (mauvaise clé ?)"
rm -f "$TMP/$nom"
pg pg_restore --list <"$TMP/base.dump" >/dev/null || die "l'archive déchiffrée n'est pas lisible par pg_restore"

# 3. Préparer la base cible : absente (créée) ou vide. Jamais d'écrasement silencieux.
existe="$(pg psql -U "$PG_UTILISATEUR" -d postgres -tAq -c "select 1 from pg_database where datname = '$base'")"
if [ "$existe" = 1 ]; then
  nb="$(pg psql -U "$PG_UTILISATEUR" -d "$base" -tAq -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")"
  if [ "$nb" != 0 ]; then
    [ "$ecraser" = 1 ] || die "la base $base n'est pas vide ($nb tables) : refus d'écraser (--ecraser pour forcer)"
    log "la base $base est supprimée puis recréée (--ecraser)"
    pg dropdb -U "$PG_UTILISATEUR" "$base"
    existe=0
  fi
fi
if [ "$existe" != 1 ]; then pg createdb -U "$PG_UTILISATEUR" "$base"; fi

# 4. Restaurer. --exit-on-error : une restauration qui ignore des erreurs n'est pas une restauration.
pg pg_restore -U "$PG_UTILISATEUR" -d "$base" --no-owner --exit-on-error <"$TMP/base.dump" || die "pg_restore a échoué"
rm -f "$TMP/base.dump"

# 5. Contrôler le résultat.
tables="$(pg psql -U "$PG_UTILISATEUR" -d "$base" -tAq -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")"
[ "$tables" -gt 0 ] || die "la base restaurée ne contient aucune table"
verifiees=0
IFS=',' read -r -a attendues <<<"${VERIF_TABLES:-}"
for t in ${attendues[@]+"${attendues[@]}"}; do
  [ -n "$t" ] || continue
  [[ "$t" =~ ^[a-z_][a-z0-9_]*$ ]] || die "VERIF_TABLES : nom de table invalide : $t"
  lignes="$(pg psql -U "$PG_UTILISATEUR" -d "$base" -tAq -c "select count(*) from \"$t\"")" ||
    die "la table attendue $t est illisible après restauration"
  log "table $t : $lignes ligne(s)"
  verifiees=$((verifiees + 1))
done

fin="$(date -u +%s)"
duree=$((fin - debut))
respecte=false
[ "$duree" -lt "$OBJECTIF_RESTAURATION_SECONDES" ] && respecte=true

if [ "$jetable" = 1 ]; then
  pg dropdb -U "$PG_UTILISATEUR" "$base"
  log "base $base supprimée (--jetable)"
fi

resume="$(printf '{"debut":"%s","fin":"%s","duree_secondes":%s,"objectif_secondes":%s,"respecte":%s,"fournisseur":"%s","fichier":"%s","octets":%s,"base":"%s","tables":%s,"tables_verifiees":%s}' \
  "$(date -u -d "@$debut" +%Y-%m-%dT%H:%M:%SZ)" "$(date -u -d "@$fin" +%Y-%m-%dT%H:%M:%SZ)" \
  "$duree" "$OBJECTIF_RESTAURATION_SECONDES" "$respecte" "$fournisseur_retenu" "$nom" "$octets" "$base" "$tables" "$verifiees")"
printf '%s\n' "$resume"
if [ -n "$rapport" ]; then printf '%s\n' "$resume" >"$rapport"; fi

if [ "$respecte" = true ]; then
  log "restauration réussie en ${duree} s (objectif : moins de ${OBJECTIF_RESTAURATION_SECONDES} s)"
else
  log "restauration réussie mais TROP LENTE : ${duree} s (objectif : moins de ${OBJECTIF_RESTAURATION_SECONDES} s)"
  alerter "restauration trop lente : ${duree} s"
  exit 3
fi
