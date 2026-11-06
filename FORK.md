# Adaptations du fork Eoloa

Ce fichier explique les écarts avec WorkAdventure officiel pour faciliter les synchronisations et réduire
progressivement le code spécifique. Il complète l'historique Git et les consignes `AGENTS.md`.

**Principe : conserver les comportements nécessaires, pas les correctifs locaux à tout prix.** Lorsqu'une
amélioration du dépôt officiel couvre le besoin, adopter cette implémentation et retirer l'adaptation devenue
redondante, après vérification et migration éventuelle.

## Référence et états

- Dernière release officielle fusionnée : **`v1.34.5`**, synchronisation du 2 novembre 2026.
- Dernière fonctionnalité spécifique commitée à la création de cet inventaire : Google Meet, `80bf3c9e6`.
- Inventaire établi le **29 octobre 2026** à partir de `git diff v1.34.4 HEAD` et des changements locaux.
- La reprise de session Matrix et les salles Google Meet sont déployées depuis le 2 novembre 2026 ; leur validation avec un compte réel reste à confirmer.
- L'état du code ne prouve pas l'état de la production. Vérifier les images effectives et les sauvegardes
  lors d'un déploiement ; les fichiers Compose du dépôt peuvent différer de la stack en service.

Mettre cette référence et les états à jour après chaque fusion, remplacement ou commit concerné.

## Dernier déploiement confirmé — 4 novembre 2026

- Release : **v1.34.5**, code applicatif **`db677a761`**, déployé avec
  `npm run prod:deploy -- --release v1.34.5` (avatars 64 pixels et stabilité du rendu après zoom).
- Play et Back : images du fork `registry.eoloa.eu/workadventure-{play,back}:v1.34.5-db677a761`,
  construites depuis une archive Git pour `linux/amd64`, publiées et vérifiées par digest.
- Map Storage et Uploader : images officielles `v1.34.5`.
- Validation : **209 tests applicatifs réussis**, 2 ignorés ; **38 tests Python réussis** ;
  TypeScript Play/Back, Svelte, i18n et lint ciblé réussis.
- Production : sept services démarrés sans redémarrage ; contrôles de santé disponibles au vert ; page,
  `/ping` et `/map-storage/ping` en HTTP 200. Volume Woka, paramètres, ports et autres images conservés.
- L'avertissement d'authentification administrateur Matrix `M_INVALID_PARAM`, antérieur au déploiement,
  reste présent. Les parcours Matrix et Meet avec un compte réel restent à valider.
- Configuration effective, anciennes références d'images et preuves de validation sauvegardées hors du dépôt.
- Sauvegarde du dernier déploiement :
  `/Users/johancappi/.local/state/workadventure/deployments/v1.34.5-db677a761-mv25sm7s`.
- Avatar `custom-adrien-64` (« Adrien 64 ») importé depuis la planche utilisateur de 192 × 256 pixels,
  PNG public identique, identifiant accepté et aucun redémarrage lors de l'import. Les entrées
  préexistantes du catalogue sont conservées. Sauvegarde privée :
  `/Users/johancappi/.local/state/workadventure/deployments/woka-imports/20261104-105630-d7637880`.
- Avatar `custom-johan-128` (« Johan 128 ») importé depuis la planche utilisateur de 384 × 512 pixels,
  PNG public identique, service de validation et absence de redémarrage vérifiés. Sauvegarde privée :
  `/Users/johancappi/.local/state/workadventure/deployments/woka-imports/20261104-102624-09c6ef1e`.
- Lors du déploiement compagnons du 2 novembre, catalogue persistant comparé avant/après redéploiement :
  inchangé, Johan et chiens intégrés disponibles. Chargement dynamique d'un compagnon validé sur une même instance du service déployé, avec un catalogue
  temporaire isolé puis supprimé ; aucun compagnon de test ajouté au catalogue utilisateur.
- Le premier essai d'installation du volume (`6c3797b2b`) a restauré les anciennes images après un écart
  entre les représentations Docker `Binds` et `Mounts`. Contrôle corrigé et testé, puis installation validée.
- Import de Johan par `npm run woka:add -- ... --name Johan --id eoloa-johan --replace` réussi :
  PNG public vérifié, identifiant accepté par le service, catalogue publié et aucun changement d'identifiant
  de conteneur ni de compteur de redémarrage pendant l'import. Sauvegarde privée :
  `/Users/johancappi/.local/state/workadventure/deployments/woka-imports/20261102-100713-9d6eda52`.

## Examen de la v1.34.5 — 2 novembre 2026

La comparaison officielle `v1.34.4..v1.34.5` ne modifie que
`play/src/front/Chat/Components/Room/MessageInputBar.svelte` : la limite des transferts de fichiers ne bloque
plus les messages texte sans pièce jointe. Ce correctif officiel est adopté sans adaptation.

Chaque adaptation a été comparée à cette release et à son code auto-hébergé :

| Adaptation                 | Décision et vérification                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Présence externe / 3CX     | Conserver : aucune configuration ou implémentation officielle équivalente ajoutée.                                         |
| Contrôle du profil Matrix  | Conserver : l'amont ne fournit pas `MATRIX_AUTO_SYNC` et l'action manuelle attendue.                                       |
| Reprise de session Matrix  | Conserver : le parcours officiel échange toujours le token SSO sans le contrôle de reprise ajouté dans `4fc1d8768`.        |
| Salles Google Meet         | Conserver : absence du module de zones `googleMeet` dans le code officiel auto-hébergé.                                    |
| Nom et locale OpenID       | Conserver : la sélection du claim d'affichage et la protection de la locale restent spécifiques.                           |
| URL des cartes             | Conserver : l'autorisation d'édition officielle reste limitée au motif `/~/`, sans le format `/_/` requis.                 |
| Types d'espace Back        | Conserver : l'amont utilise encore `parse`, sans conversion de l'erreur pour Node 24.                                      |
| Construction / déploiement | Conserver : le Dockerfile officiel lit encore les secrets Sentry obligatoires ; la stack effective reste externe au dépôt. |

Aucune adaptation n'est devenue redondante dans cette release ; aucune migration de configuration ou de
cartes n'est nécessaire. La validation fonctionnelle avec un compte réel pour la reprise Matrix et Meet reste
à effectuer après déploiement.

## Inventaire à réexaminer à chaque synchronisation

### Avatars en poses de 64 et 128 pixels — déployés, essai en jeu à confirmer

- Planches 192 × 256 ou 384 × 512 pixels, trois colonnes et quatre directions, reconnues après décodage de l'image par
  `WokaSpriteSheetFile`. Les 297 textures intégrées de 96 × 128 restent découpées en poses de 32 pixels.
- `SuperLoaderPlugin.wokaSpritesheet` couvre le chargement à la demande, les joueurs distants et le cache.
  `createWokaSprite` garde la taille logique de 32 pixels dans le monde et les vignettes de profil ;
  l'aperçu Svelte découpe les poses selon les dimensions réelles. Aucun changement de protocole réseau.
- Commande `woka:add` : avatars 32, 64 ou 128 pixels par pose, contrôle préalable du support serveur pour
  les avatars 64/128. Les compagnons restent en 32 pixels. [Documentation](docs/others/self-hosting/custom-wokas.md).
- `WaScaleManager` garde un canvas natif dès qu'un avatar 64/128 est chargé. L'ancien retour à un
  canvas réduit en fin de zoom écrasait les détails. Le zoom reste effectué par la caméra et les
  sessions sans avatar détaillé conservent le mode réduit. Les événements de chargement sont nettoyés
  lors du remplacement ou de la destruction du jeu. Les appels sans caméra utilisent la caméra active.
- Validation : test réel dans Chrome/Phaser en Canvas puis WebGL, 12 poses par résolution, taille affichée
  32 × 32, corps de collision 16 × 16, animation, chargement à la demande/cache et 12 aperçus Svelte.
  Reproduction : `node contrib/tools/test-woka-resolution.mjs`. Tests Python de grille et d'import HD.
- Test WebGL répété avec la planche utilisateur, comparaison exacte des pixels des quatre aperçus aux
  poses source ; import « Johan 128 » réalisé après le déploiement du 4 novembre 2026. L'ancien avatar
  Johan reste disponible. Un rechargement complet des clients est nécessaire pour utiliser le nouveau
  découpage ; le choix et la marche dans une carte réelle restent à confirmer par l'utilisateur.
- Essai 64 : planche Adrien fournie par l'utilisateur, validée en WebGL aux DPR 1 et 2. Le test
  reproduit le canvas réduit des avatars 32, puis vérifie le passage au natif au chargement du 64 et
  sa stabilité en fin de zoom et lors d'un appel sans caméra. Extension et correctif déployés puis
  « Adrien 64 » importé le 4 novembre 2026 ; la confirmation visuelle dans une carte réelle reste à faire.
- **Retrait possible :** résolution variable officiellement supportée dans tous ces parcours ; conserver
  la compatibilité avec les sprites 128 déjà importés et leur taille dans les cartes.

### Workflows GitHub de publication officielle — adaptés au fork

- `build-test-and-deploy.yml` et `release-chart.yml` sont réservés au dépôt
  `workadventure/workadventure` : registres officiels, Kubernetes et chart Helm ne correspondent pas au
  déploiement Eoloa. Leurs jobs dépendants sont ignorés sur le fork ; `continuous_integration.yml`
  reste actif pour les constructions, vérifications et tests du code. Les E2E Docker/Kubernetes de
  cette chaîne officielle ne tournent donc pas sur le fork.
- Les cinq appels de construction déclarent `contents: read` et `packages: write`, conformément aux
  permissions demandées par le workflow imbriqué, pour éviter son rejet avant le démarrage des jobs.
- Diagnostic du 2 novembre 2026 : CI du commit `bee0c081b` réussie ; workflow Docker rejeté avec
  « requesting 'packages: write', but is only allowed 'packages: read' » ; publication Helm échouée.
- Le déploiement Eoloa reste assuré par `npm run prod:deploy`, sans modification de la production lors
  de l'adaptation des workflows. Vérifier ces gardes à chaque synchronisation amont.
- **Retrait possible :** workflows officiels adaptés aux forks, sans publication ni secrets de
  l'infrastructure WorkAdventure, et validation compatible avec la procédure Eoloa.

### Catalogue Woka persistant — déployé le 2 novembre 2026

- Commande : `npm run woka:add -- fichier.png --name "Nom"`, avec `--id` et `--replace` pour conserver
  un identifiant lors d'une modification. [Procédure](docs/others/self-hosting/custom-wokas.md).
- Extension compagnons : `--type companion` ajoute un animal qui suit le joueur dans le sélecteur des
  compagnons. Catalogue `companions` facultatif, compatible avec les données Woka existantes ; extension
  déployée le 2 novembre 2026, avec conservation du volume et du catalogue de Johan.
- Code : `CustomWokaCatalog.ts`, `CustomWokaController.ts`, `LocalWokaService.ts` et
  `contrib/tools/woka-add.py`. Les Woka personnels complètent le catalogue local, sans API admin externe.
- Données hors image Docker : volume externe `workadventure_custom-wokas`, monté dans
  `/var/lib/workadventure/wokas`. Installation initiale par `prod:deploy -- --enable-custom-wokas` ;
  déploiements suivants sans cette option. Aucun redémarrage lors des imports.
- Import : validation PNG, sauvegardes privées, verrou distant, noms de fichiers par hash et publication
  atomique du catalogue après vérification HTTP du PNG. Les couches intégrées restent protégées.
- Validation : 16 tests Python d'import, 18 tests de déploiement et 13 tests de catalogue/routes Play,
  incluant les compagnons, les remplacements et la préservation des avatars existants.
  Import de Johan validé en production sans changement de conteneur ni redémarrage.
- L'installation vérifie la représentation Docker des volumes nommés via `HostConfig.Mounts`, avec
  `Binds` inchangé ; ce cas a été corrigé et couvert après le premier essai d'installation.
- **Retrait possible :** catalogue dynamique officiel disponible en auto-hébergement avec import en ligne
  de commande et persistance. Migrer les données et conserver les identifiants déjà sélectionnés.

### Woka personnel Johan — déployé le 2 novembre 2026

- Personnage complet `eoloa-johan` (nom affiché : `Johan`) désormais importé dans la collection persistante
  **Eoloa**. Son entrée intégrée dans `play/src/pusher/data/woka.json` reste en secours pour le retour arrière ;
  le catalogue dynamique la remplace sans doublon et conserve l'identifiant des sélections existantes.
- Ressource : `play/public/resources/characters/pipoya/bonhomme-chauve-barbe-lunettes-v2.png`.
- Validation : PNG transparent de 96 × 128 pixels, grille de 3 × 4 cases de 32 pixels ; ordre visuel
  bas, gauche, droite, haut conforme aux animations. Déclaration JSON et unicité de l'identifiant vérifiées.
- Conserver cette ressource et sa déclaration lors des synchronisations ; le catalogue officiel ne fournit
  pas cet avatar personnel. La sélection et la marche en jeu restent à valider après déploiement de Play.

### Présence externe et téléphonie 3CX — actif

**Besoin :** synchroniser la disponibilité avec les appels 3CX via le producteur WebSocket n8n.

- Depuis la migration du 6 novembre 2026 : module `external-presence` sur l'API existante
  `POST /external-module/event`, secret dédié `EXTERNAL_PRESENCE_API_TOKEN`. Routage par identité
  dans `ExternalPresenceService.ts` et `PusherRoom.ts`, transport `externalModuleMessage` existant.
- Front : `ExternalPresenceSync.ts`, `ExternalPhoneStore.ts`, `MediaStore.ts`, `RoomConnection.ts`.
  Présence transitoire, sans écraser ni enregistrer le statut manuel. Libellé français
  `BACK_IN_A_MOMENT` conservé : « 📞 Au téléphone ».
- Polling navigateur, GET de présence, client 3CX direct et anciennes variables retirés.
  n8n reste seul consommateur 3CX ; snapshots périodiques du producteur pour contrôle de fraîcheur.
- Cache ciblé, état à l'entrée dans une salle, séquences monotones et rejet des doublons/retards.
  Expiration locale après 120 s : UNKNOWN conservateur. Aucun secret téléphonique côté navigateur.
- [Contrat, configuration, limites et retour arrière](docs/others/self-hosting/external-presence.md).
  Une seule instance Play requise tant qu'aucun bus partagé n'est raccordé.
- Validation : tests du service, de l'authentification et de la disponibilité dérivée réelle ;
  SQL n8n sur MariaDB isolée. Un appel réel reste nécessaire après déploiement pour valider
  l'ensemble 3CX → n8n → WorkAdventure.
- **Retrait possible :** intégration officielle disponible en auto-hébergement couvrant le même
  producteur et les règles d'identité, de disponibilité et de fraîcheur.

### Contrôle du profil Matrix — actif

**Besoin :** conserver la possibilité de désactiver la synchronisation automatique du nom/avatar WOKA
vers Matrix, tout en permettant une synchronisation manuelle de l'avatar.

- Code : `play/src/front/Chat/Connection/Matrix/MatrixChatConnection.ts`,
  `services/WaMatrixProfileService.ts`, `play/src/front/Chat/Connection/ChatConnection.ts`,
  composants `play/src/front/Components/Woka/` et configuration `MATRIX_AUTO_SYNC`.
- Origine de l'option : `6e94e15b9`, adaptée lors des fusions ultérieures.
- Documentation : [intégration Matrix](docs/others/self-hosting/matrix.md).
- Validation : avec `MATRIX_AUTO_SYNC=false`, absence de modification automatique du profil ; synchronisation
  manuelle toujours utilisable ; avec l'option active, synchronisation normale ; une erreur de profil ne doit
  pas empêcher l'ouverture du chat. Tests dans `MatrixChatConnection.test.ts`.
- **Retrait possible :** contrôles officiels équivalents, incluant l'action manuelle et le comportement en cas
  d'erreur. Prévoir la compatibilité ou la migration de `MATRIX_AUTO_SYNC` avant de supprimer l'option locale.
- Particularité de déploiement à conserver : `MATRIX_API_URI` désigne la racine du serveur, sans suffixe
  `/_matrix`, puisque WorkAdventure ajoute le chemin API.

### Reprise de session Matrix après SSO — déployée, validation utilisateur restante

**Besoin :** éviter qu'une réauthentification WorkAdventure crée systématiquement un nouvel appareil Matrix
et impose une nouvelle vérification dans Element.

- Code : `MatrixClientWrapper.resumeSessionOrExchangeLoginToken()` et appel dans
  `play/src/front/Phaser/Game/GameManager.ts`.
- Une session n'est reprise que si son propriétaire correspond à l'utilisateur WorkAdventure authentifié,
  si ses identifiants sont présents, si aucun nettoyage des stores n'est requis et si `/account/whoami`
  confirme l'utilisateur Matrix et l'appareil enregistrés.
- Une session révoquée est remplacée ; un incident réseau ou une limitation temporaire ne crée pas de nouvel
  appareil. Une déconnexion explicite reste une vraie déconnexion Matrix. La première vérification, un nouveau
  navigateur ou l'effacement des données peuvent toujours nécessiter une vérification.
- Validation actualisée le 2 novembre 2026 : **163 tests Matrix et Google Meet réussis**, TypeScript et Svelte sans erreur ni avertissement. Tests de reprise,
  changement de compte, données incomplètes, révocation et erreur réseau dans `MatrixClientWrapper.test.ts`.
  Le comportement avec un compte réel reste à confirmer après déploiement.
- **Retrait possible :** reprise officielle préservant l'appareil et ses clés, avec contrôle du propriétaire
  sur navigateur partagé et gestion des sessions invalides. Conserver ou adapter ces tests de comportement
  pour l'implémentation officielle, plutôt que maintenir deux parcours de connexion.

### Salles Google Meet — déployées, validation utilisateur restante

**Besoin :** représenter une réunion Meet dans WorkAdventure, ouvrir Meet dans un onglet et suspendre les
médias WorkAdventure pendant la participation déclarée.

- Commit : `80bf3c9e6`.
- Code : `play/src/front/ExternalModule/GoogleMeet/`, `Stores/ExternalMeetingStore.ts`, raccordement dans
  `GameScene.ts`, cycle des extensions, contraintes de capture/partage et lecture audio.
- Propriété de zone : `type: "extensionModule"`, `subtype: "googleMeet"`, données `{ title, url }`.
- Documentation et limites : [salles Google Meet](docs/map-building/google-meet.md).
- **Limite importante :** liens renseignés à l'avance. Aucune création automatique de Meet, aucune intégration
  OAuth Google, aucune observation des participants réels ni du raccrochage dans Meet. L'isolation de sessions
  confidentielles avec comptes rendus IA n'est pas assurée par ce module à lien fixe.
- Validation : tests `GoogleMeetSession`, `GoogleMeetPanel`, `GoogleMeetMedia`, règles de zones et analytics ;
  panneaux ordinateur/mobile, blocage de fenêtre, sortie de zone et restitution des préférences médias.
- **Retrait possible :** équivalent officiel disponible dans le code auto-hébergé, et pas seulement dans
  l'offre SaaS. Préserver ou migrer les zones déjà enregistrées avant de supprimer le module et ses raccordements.

### OpenID, noms affichés et langue — actif

- `play/src/pusher/services/OpenIDClient.ts` utilise `OPID_DISPLAY_NAME_CLAIM` pour le nom affiché.
- `play/src/pusher/controllers/AuthenticateController.ts` empêche les données brutes du fournisseur de
  réécrire la locale déjà calculée pour la réponse `/me`.
- Configuration et tests : validateurs front/pusher, `play/tests/pusher/AuthenticateControllerMe.test.ts`,
  `OpenIDClientRefresh.test.ts`, `EnvironmentVariable.test.ts`.
- Repères : `0fb490232` et fusions `cf6383b97`, `ebe200704`, `8adc90949`.
- **Retrait possible :** même sélection du nom affiché et de la locale dans l'amont. Vérifier les claims
  réellement utilisés et les sessions renouvelées avant de retirer les adaptations ; ne pas recopier un
  correctif de refresh token déjà présent dans la release officielle.

### Formats d'URL des cartes en auto-hébergement — actif

- `play/src/pusher/services/LocalAdmin.ts` accepte les chemins `~/…` et `_/…` pour déterminer les droits
  d'édition ; origine `11ba04bbc`.
- Validation : tester les deux formats avec les droits d'un éditeur et ceux d'un utilisateur sans ces droits.
- **Retrait possible :** gestion officielle des deux formats avec les mêmes décisions d'autorisation.
  Vérifier les groupes capturés et les indices utilisés si une expression régulière est remplacée.

### Validation des types d'espace Back — actif

- `back/src/Model/Space.ts` transforme un type d'espace invalide en erreur standard après `safeParse`,
  afin d'éviter le problème de journalisation observé avec Node 24 ; conservé dans `ebe200704` et `8adc90949`.
- Test : `back/tests/Space.test.ts`.
- **Retrait possible :** l'amont refuse correctement ces valeurs et son traitement/journalisation de
  l'erreur fonctionne avec la version Node utilisée. Ne pas supprimer la validation avec le contournement.

### Construction et fichiers de déploiement — actifs, à distinguer de la production

- `play/Dockerfile` permet la construction sans les secrets Sentry obligatoires de l'ancienne étape ;
  origine `036fac52c`. L'ancien réglage de mémoire `7b6692f55` doit être réévalué sur le Dockerfile courant,
  pas réappliqué mécaniquement.
- `prod-docker-compose.yml` et `prod-traefik.yml` sont des configurations propres au déploiement.
  Ils ne sont pas la source de vérité de la stack effective et ne doivent pas recevoir de secrets.
- `contrib/tools/deploy-production.py` automatise le déploiement et le retour arrière, avec les accès
  Portainer locaux et le trousseau Docker. Commandes `npm run prod:check`, `prod:deploy` et `prod:rollback` ;
  [procédure et prérequis](docs/others/self-hosting/eoloa-deployment.md). Les jetons restent nécessaires à
  l'authentification mais ne sont plus recopiés à chaque exécution. Tests de protection des secrets,
  préservation des paramètres et refus d'un retour arrière sur une stack modifiée dans
  `contrib/tools/test_deploy_production.py` (16 tests réussis). Le contrôle distingue les variables Docker
  sans valeur, vides et absentes ; correction issue du premier essai de déploiement avec la commande.
  `prod:check` vérifié avec les accès existants.
- Validation : construction depuis une archive du commit, pour `linux/amd64`, puis procédure de déploiement
  et contrôles décrits dans les consignes locales. Garder les références d'images de retour arrière hors du dépôt.
- **Retrait possible :** construction officielle utilisable dans notre environnement sans secrets de
  télémétrie obligatoires. Migrer les paramètres de déploiement avant de retirer leurs fichiers locaux.

## Procédure de synchronisation avec le dépôt officiel

1. Partir d'un état Git identifié et distinguer les changements non commités. Choisir une référence officielle
   précise. Mettre à jour les références distantes et lire les changements de la release.
2. Pour **chaque entrée** ci-dessus, examiner le code, les tests et la disponibilité auto-hébergée de l'amont.
   Un nom similaire, une annonce commerciale ou l'absence de conflit Git ne prouve pas l'équivalence.
3. Décider : **conserver**, **adapter**, **remplacer partiellement** ou **retirer**. En cas de remplacement,
   décrire la migration des variables, données de carte, sessions et usages existants.
4. Intégrer la release puis retirer les morceaux redondants : implémentation, raccordements, variables,
   traductions, documentation et tests qui ne servent que l'ancien code. Conserver les tests de comportement
   utiles, en les adaptant au code officiel. Ne pas réinitialiser les données pour contourner une migration.
5. Exécuter les tests ciblés, vérifications TypeScript/Svelte/i18n et constructions pertinents. Contrôler les
   parcours utilisateurs listés dans l'inventaire, notamment les options désactivées et les erreurs réseau.
6. Mettre à jour ce fichier : référence officielle, décision par adaptation, limites restantes et preuves de
   validation. Pour une adaptation retirée, ajouter une ligne à l'historique ci-dessous avec la référence
   officielle qui la remplace et le commit local de retrait.

Pour retrouver les écarts sans confondre historique officiel et adaptations locales :

```sh
git diff --name-status v1.34.5 HEAD
git diff --stat v1.34.5 HEAD
git log --first-parent --oneline
```

Remplacer `v1.34.5` par la référence mise à jour en tête de ce fichier. Examiner aussi `git diff` pour les
changements en cours. La comparaison est un outil d'inventaire : ne pas remettre en bloc tous les fichiers
à la version officielle, ni considérer chaque ancien commit comme un correctif encore nécessaire.

## Historique des adaptations retirées

Pas de retrait documenté à la création de cet inventaire. Ne pas remplir cette section sur la seule base
d'une ressemblance avec une fonctionnalité officielle.

Format à utiliser : date ; adaptation ; release/PR/commit officiel de remplacement ; commit local de retrait ;
migration éventuelle ; validation effectuée.
