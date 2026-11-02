# Woka personnalisés sans redéploiement

Depuis la racine du dépôt, ajouter un personnage complet :

```sh
npm run woka:add -- "/chemin/mon-personnage.png" --name "Mon personnage"
```

Le fichier doit être un PNG transparent non entrelacé de **96 × 128 pixels**, avec trois colonnes
et quatre lignes de cases de 32 pixels. Ordre des lignes : bas, gauche, droite, haut. La colonne centrale
est la pose d'arrêt. La commande vérifie la grille, les données PNG et leur intégrité avant de contacter
la production.

Le personnage apparaît dans la collection **Eoloa** du sélecteur. Rouvrir le sélecteur ou recharger
la page pour récupérer le catalogue actualisé. Aucun build, push Git, redéploiement ou redémarrage
n'est nécessaire pour un ajout. Le service Play valide aussi les nouveaux identifiants à la connexion.

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
