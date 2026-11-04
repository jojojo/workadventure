# Woka personnalisés sans redéploiement

Depuis la racine du dépôt, ajouter un personnage complet :

```sh
npm run woka:add -- "/chemin/mon-personnage.png" --name "Mon personnage"
```

Le fichier doit être un PNG transparent non entrelacé, avec trois colonnes et quatre lignes :

- **96 × 128 pixels** pour des poses de **32 × 32** (format historique).
- **384 × 512 pixels** pour des poses de **128 × 128** (avatars uniquement).

Ordre des lignes : bas, gauche, droite, haut. La colonne centrale
est la pose d'arrêt. La commande vérifie la grille, les données PNG et leur intégrité avant de contacter
la production.

Le personnage apparaît dans la collection **Eoloa** du sélecteur. Rouvrir le sélecteur ou recharger
la page pour récupérer le catalogue actualisé. Aucun build, push Git, redéploiement ou redémarrage
n'est nécessaire pour un ajout. Le service Play valide aussi les nouveaux identifiants à la connexion.

## Avatars en poses de 128 × 128

La même commande accepte une planche de **384 × 512 pixels** :

```sh
npm run woka:add -- "/chemin/avatar-128.png" --name "Mon avatar 128"
```

La résolution est détectée dans l'image, y compris pour les autres joueurs qui chargent cet avatar.
Le personnage occupe toujours 32 × 32 pixels logiques dans le monde : taille, collisions et distances
ne changent pas. Le zoom et les aperçus peuvent afficher les détails des poses de 128 pixels. Les
vignettes de profil générées par le jeu conservent leur taille historique de 32 pixels.

Les animations restent sur douze poses, dans le même ordre. Les Woka existants restent compatibles.
Une image simplement agrandie depuis 32 pixels n'apporte pas de détails supplémentaires. Les compagnons
restent au format 32 pixels par pose. Recharger les onglets après le déploiement du support 128 pixels ;
un ancien client découperait incorrectement une planche haute résolution.

Pour reproduire le test isolé avec le moteur Phaser et les aperçus Svelte (dépendances du monorepo et
Google Chrome nécessaires) :

```sh
node contrib/tools/test-woka-resolution.mjs
# Variante Canvas : WOKA_TEST_RENDERER=canvas node contrib/tools/test-woka-resolution.mjs
# Planche personnelle : WOKA_TEST_AVATAR="/chemin/avatar-128.png" node contrib/tools/test-woka-resolution.mjs
```

Le test vérifie les 12 poses, la taille dans le monde, les corps de collision, le chargement à la demande,
le cache et les quatre directions dans les aperçus. Il écrit des sprites techniques, une capture de
comparaison et un rapport dans `~/.local/state/workadventure/woka-resolution-test/`.

## Animaux compagnons

Pour ajouter un animal qui suit le joueur, utiliser la même commande avec `--type companion` :

```sh
npm run woka:add -- "/chemin/mon-chat.png" --name "Félix" --type companion
```

L'animal apparaît dans la collection **Eoloa** du sélecteur des compagnons. Sa planche suit la même
grille de 96 × 128 pixels et le même ordre des directions que les Woka. Il reste un compagnon à
sélectionner séparément du personnage du joueur.

L'identifiant est préfixé par `custom-companion-` pour le distinguer des avatars. `--id` et `--replace`
permettent aussi de remplacer un animal existant. La métadonnée facultative `--behavior cat`,
`--behavior dog` ou `--behavior red_panda` correspond aux valeurs reconnues par WorkAdventure ;
elle ne crée pas de nouvelles animations ou de nouveaux comportements de déplacement.

Les compagnons et les Woka partagent le volume, le verrou et les sauvegardes. Chaque import préserve
les deux listes et refuse les identifiants utilisés par l'autre type de personnage. Le catalogue initial
contenant uniquement `wokas` reste compatible ; la liste `companions` est ajoutée au premier import animal.
Une installation mise à jour pour les animaux nécessite un déploiement du code, sans réinstaller le volume.

## Identifiants et remplacement

Par défaut, l'identifiant est dérivé du nom (`custom-mon-personnage`). Pour choisir un identifiant stable :

```sh
npm run woka:add -- "/chemin/alice.png" --name "Alice" --id custom-alice
```

Pour remplacer son image en conservant les sélections des utilisateurs :

```sh
npm run woka:add -- "/chemin/alice-v2.png" --name "Alice" --id custom-alice --replace
```

Une collision avec un autre personnage exige `--replace`. Les identifiants de cheveux, corps,
vêtements et autres couches intégrées ne peuvent pas être remplacés par un personnage complet.
Le nom du PNG servi dépend de son contenu : une nouvelle image évite les caches des anciennes images.
Une page déjà ouverte peut nécessiter un rechargement pour afficher la nouvelle texture.

## Stockage et accès

- Volume Docker externe : `workadventure_custom-wokas`, monté sur Play dans
  `/var/lib/workadventure/wokas`. Il est conservé lors des redéploiements.
- Catalogue : `catalog.json`, relu à chaque demande de liste ou de validation de personnage.
- PNG publics : `/custom-wokas/<sha256>.png`, accessibles en lecture. Le catalogue, les fichiers
  temporaires et le verrou ne sont pas exposés par cette route.
- Import par l'API Portainer, avec `~/.config/portainer.env` protégé en mode 600. Aucun endpoint d'écriture
  public, aucun nouveau jeton et aucun Docker local requis pour les imports.
- Verrou distant pendant l'import et renommage atomique du catalogue après vérification du PNG public.
  Le verrou local exclut également un déploiement simultané lancé depuis ce Mac.
- Sauvegardes privées sur le Mac : `~/.local/state/workadventure/deployments/woka-imports/`.
  Chaque import conserve les catalogues avant/après et une copie exacte du PNG. Sauvegarder également
  le volume serveur pour la reprise après sinistre ; les sprites ne sont pas automatiquement ajoutés à Git.

Le mécanisme complète le catalogue **local**, dans les installations sans API admin de Woka.
Après une interruption brutale d'import, un administrateur peut devoir retirer le dossier
`/var/lib/workadventure/wokas/.import-lock` après avoir vérifié qu'aucun import ne tourne.

## Installation initiale

Une seule installation du code et du volume est nécessaire. Suivre les prérequis et sauvegardes de
[la procédure de déploiement](eoloa-deployment.md), depuis un commit propre et poussé :

```sh
npm run prod:deploy -- --release v1.34.5 --enable-custom-wokas
```

Cette option ajoute explicitement le volume à Play dans la configuration effective de Portainer ; elle
refuse une configuration initiale ambiguë ou des montages Play préexistants. Elle s'utilise une seule fois.
Les déploiements suivants utilisent simplement `npm run prod:deploy` et préservent ce montage.
Le retour arrière de l'installation restaure l'ancienne stack et conserve le volume externe.

## Validation

```sh
python3 -m unittest discover -s contrib/tools -p 'test_woka_add.py'
python3 -m unittest discover -s contrib/tools -p 'test_deploy_production.py'
cd play
npm test -- --run tests/pusher/CustomWokas.test.ts
```
