# Mise en production Eoloa

Le script [`deploy-production.py`](../../../contrib/tools/deploy-production.py) automatise la procédure
du fork. Il réutilise les accès déjà enregistrés sur ce Mac : aucun jeton à copier dans une commande.
Portainer nécessite toujours une authentification ; son jeton reste dans le fichier local protégé.

## Configuration initiale

Prérequis : Python 3.9 ou supérieur, Git, Docker avec Buildx, Node/npm et les dépendances/fichiers générés
du dépôt déjà installés. Le moteur Docker doit fonctionner et le dépôt doit pouvoir accéder à `origin`.

Le fichier **hors du dépôt** `~/.config/portainer.env` contient :

```dotenv
PORTAINER_URL=https://portainer.eoloa.net
PORTAINER_API_KEY='jeton-renseigne-localement'
```

```sh
chmod 600 ~/.config/portainer.env
```

Le script lit ce fichier sans l'exécuter comme un script shell. Il refuse des permissions trop ouvertes.
Il utilise le trousseau Docker configuré par :

```sh
docker login registry.eoloa.eu
```

Ces accès sont déjà configurés sur la machine de déploiement. Une nouvelle connexion n'est nécessaire
qu'en cas d'expiration ou de changement des identifiants. Les identifiants du registre enregistrés dans
Portainer ne sont pas utilisés pour les téléchargements : le script transmet en mémoire ceux du trousseau
Docker, sans les afficher, les enregistrer dans la stack ou les passer en arguments de processus.

## Vérifier sans déployer

Depuis la racine du dépôt :

```sh
npm run prod:check
```

Cette commande vérifie l'environnement `local` (ID 3), la stack Compose `workadventure` (ID 19), le
trousseau, la lecture du registre, le moteur Docker et les endpoints. Elle ne construit, ne publie et ne
redémarre aucun conteneur. Un accès en lecture au registre ne garantit pas le droit de publication.

## Déployer

Fusionner la release souhaitée, examiner les adaptations selon [FORK.md](../../../FORK.md), puis committer
et pousser les changements. Le script déploie **HEAD**, exige un dépôt propre et vérifie que ce commit
est présent dans `origin/master`. Il n'effectue aucune fusion ni aucun commit à votre place.

```sh
npm run prod:deploy
# Ou préciser la release officielle déjà fusionnée :
npm run prod:deploy -- --release v1.34.5
```

Sans option, la release est déduite du dernier tag stable accessible depuis HEAD. Le script :

1. Sauvegarde la stack effective et les images utilisées dans un dossier privé sous
   `~/.local/state/workadventure/deployments/` (dossiers 700, fichiers 600).
2. Exécute TypeScript Play/Back, Svelte, i18n et les tests Matrix, Meet et Space du fork.
3. Construit Play **et Back du fork** depuis une archive du commit validé, pour `linux/amd64`, et publie
   les tags `<release>-<commit>`. Vérifie les manifestes publiés et les digests.
   Un tag déjà publié est réutilisé, jamais écrasé, pour préserver les références de retour arrière.
4. Télécharge uniquement Play, Back, Map Storage et Uploader sur le serveur. Les deux dernières images
   proviennent de la release officielle. Vérifie les identifiants des images téléchargées.
5. Remplace uniquement les quatre lignes d'images de la configuration effective ; le Compose du dépôt
   n'est pas utilisé. Refuse une configuration ambiguë/interpolée ou modifiée pendant la préparation.
6. Redéploie sans actualiser les images des autres services, puis exige trois contrôles successifs : santé,
   images exactes, ports, volumes, paramètres préservés et endpoints `/`, `/ping`, `/map-storage/ping`.
7. Sauvegarde les logs sans les afficher, signale les avertissements connus et écrit `status.json`.

En cas d'échec après le début de la mise à jour, le script tente de restaurer la stack sauvegardée et de
vérifier son état. Il ne remplace pas une configuration modifiée entre-temps par quelqu'un d'autre.
Un verrou local empêche deux exécutions concurrentes utilisant le même dossier d'état. Il ne protège pas
contre un déploiement lancé depuis une autre machine.

Les tests ne remplacent pas la validation avec un compte réel des appels, de la reprise Matrix ou de Meet.
Les sauvegardes et logs peuvent contenir des secrets de la stack : ne pas les ajouter au dépôt ni les partager.

## Retour arrière explicite

Utiliser le dossier annoncé par **ce script** lors du déploiement :

```sh
npm run prod:rollback -- ~/.local/state/workadventure/deployments/v1.34.5-COMMIT-DOSSIER
```

Le retour arrière réutilise les anciennes images en cache sur le serveur ; il ne demande aucun accès au
registre. Il refuse de continuer si ces images ont disparu/changé ou si la stack ne correspond plus à celle
du déploiement. Les sauvegardes des anciennes procédures manuelles ont un format différent.

Les options globales `--config` et `--state-dir` sont disponibles en appelant directement le script :

```sh
python3 contrib/tools/deploy-production.py --help
```

## Tests du script

```sh
python3 -m unittest discover -s contrib/tools -p 'test_deploy_production.py'
```

Ces tests utilisent des données factices ; ils n'appellent ni Portainer, ni Docker, ni le registre.

## Ajout de Woka sans déploiement

Après l'installation initiale du volume et du chargement dynamique, utiliser
`npm run woka:add -- fichier.png --name "Nom"`.
Voir [les Woka personnalisés](custom-wokas.md) pour l'installation, les remplacements et les sauvegardes.

## Activer la présence événementielle (une fois)

Après validation du raccordement n8n, ajouter le secret dédié en même temps que
l'image Play, sans modifier les autres variables de production :

```sh
npm run prod:deploy -- --external-presence-token-file ~/.local/state/workadventure/presence-push-20261106/presence-token
```

Le fichier brut doit être hors dépôt, appartenir à l'utilisateur et avoir le mode
600. Utiliser un secret aléatoire de 32 à 128 caractères URL-safe. Le script refuse
un jeton déjà configuré ; les déploiements suivants se font sans cette option.
Il sauvegarde la configuration effective avant l'ajout et vérifie la présence du
secret dans le conteneur sans l'afficher. Les autres paramètres sont préservés.
[Contrat et configuration n8n](external-presence.md).
