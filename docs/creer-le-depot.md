# Créer le dépôt AssureMe depuis cette branche

La branche `devOnassureMe` est un historique **orphelin** (aucun fichier ni commit de Luther Life).
```bash
git clone --branch devOnassureMe --single-branch https://github.com/keps777/by-projets.git assureme
cd assureme
git remote remove origin
git remote add origin <url-du-nouveau-depot>
git branch -M main
git push -u origin main
```
Puis : `npm install && npm run check`. Déploiement : projet Vercel (build `npm run build`, sortie `dist`, `vercel.json` fourni). Variables d'environnement : aucune pour l'instant (backend simulé).
