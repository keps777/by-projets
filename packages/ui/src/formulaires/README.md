# Kit UI · formulaires (AM-006)

Composants React 19 + CSS modules, couleurs et polices par les variables `--am-*` de `@afrimove/design` (l'application importe `@afrimove/design/tokens.css` et `fonts.css`). Valeurs relevées dans Vente, Connexion, SuperviseurValider, Caisse et ConfigPersonne.

| Composant                           | Rôle                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Champ`                             | Libellé + valeur. `variante="config"` pour les réglages (fond nuit, étiquette en capitales), `mono` pour les chiffres |
| `ChampTelephone`                    | Numéro avec pastille +237 et coche verte (Connexion)                                                                  |
| `Selecteur`                         | `<select>` natif habillé nuit ; `options={[{ valeur, libelle }]}`                                                     |
| `CaseACocher`, `LigneCochable`      | Case 20 px accent ambre ; ligne de liste avec détail et `action` (étoile) hors zone cochable                          |
| `Interrupteur`, `LigneInterrupteur` | Rôle `switch`, piste 40 x 24 ; la ligne bascule aussi en touchant le libellé                                          |
| `Stepper`                           | − / + bornés par `min`, `max`, `pas`                                                                                  |
| `ClavierPin`                        | Pavé 3 x 4, 6 points, empreinte, effacer, 3 essais puis blocage 15 min                                                |
| `SaisieCode`                        | Code à 4 ou 6 cases, un seul vrai champ `autocomplete="one-time-code"`, WebOTP                                        |
| `CompteurCoupures`                  | 10 000 × 48, 5 000 × 36... avec total ; total aussi saisissable                                                       |
| `ChampRecherche`                    | Loupe, saisie, effacement, région `search`                                                                            |
| `DemoFormulaires` (`demo.tsx`)      | Page de démo du banc de fidélité                                                                                      |

Tous les champs sont utilisables au clavier physique et ont un nom accessible (label relié par `htmlFor`/`useId`, ou `aria-label`).

## ClavierPin

```tsx
<ClavierPin
  titre="Mon PIN · Mme Essono"
  sousTitre="6 chiffres · jamais partagé"
  onComplet={async (pin) => (await verifierSurLeServeur(pin)).ok} // false = essai raté
  onBlocage={({ jusqua }) => alerterLePatron(jusqua)} // 3e échec : clavier bloqué 15 min
  onEmpreinte={() => demanderWebAuthn()}
/>
```

- Le PIN n'existe que dans un tampon mémoire (hors état React, hors DOM, hors `localStorage`). Il est remis une seule fois à `onComplet`, puis le tampon est mis à zéro ; l'affichage ne connaît que le nombre de chiffres.
- `onComplet` renvoie `false` pour un PIN refusé (compte un essai) ; tout autre retour l'accepte. Une exception est une erreur technique et ne compte pas.
- `essaisMax` (3) et `dureeBlocageMs` (15 min) sont réglables. Le blocage vit dans le composant : pour qu'il survive à un rechargement, l'appelant garde `jusqua` (reçu par `onBlocage`) et le repasse en `bloqueJusqua`. Le vrai verrou reste côté serveur.
- Empreinte : la touche n'apparaît que si `onEmpreinte` est fourni et que `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` répond oui (`empreinte="auto"`). Sinon, PIN seul. `verifierEmpreinte(options)` appelle `navigator.credentials.get` avec les options (dont le défi) fournies par le serveur.

## SaisieCode

```tsx
<SaisieCode longueur={4} onComplete={(code) => verifier(code)} />
```

Le SMS doit se terminer par `@domaine #code` pour que WebOTP (Chrome Android) le propose ; sur iOS et ailleurs, l'attribut `one-time-code` suffit à faire apparaître le code au-dessus du clavier.

## CompteurCoupures

Toucher une coupure ajoute un billet. Retrait : appui long, clic droit ou Retour arrière / Suppr / flèche bas sur la coupure. `onChange(comptage, total)`.

## Tests

```
pnpm --filter @afrimove/ui run test
pnpm --filter @afrimove/ui run typecheck
pnpm --filter @afrimove/ui run lint
```
