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

## Dernier déploiement confirmé — 2 novembre 2026

- Release : **v1.34.5**, code applicatif **`817bb3294`**.
- Play et Back : images du fork `registry.eoloa.eu/workadventure-{play,back}:v1.34.5-817bb3294`,
  construites depuis une archive Git pour `linux/amd64`, publiées et vérifiées par digest.
- Map Storage et Uploader : images officielles `v1.34.5`.
- Validation : **196 tests réussis**, 2 ignorés ; TypeScript Play/Back, Svelte, i18n et lint ciblé réussis.
- Production : sept services démarrés sans redémarrage ; contrôles de santé disponibles au vert ; page,
  JavaScript, `/ping` et `/map-storage/ping` en HTTP 200. Paramètres, volumes, ports et autres images conservés.
- L'avertissement d'authentification administrateur Matrix `M_INVALID_PARAM`, antérieur au déploiement,
  reste présent. Les parcours Matrix et Meet avec un compte réel restent à valider.
- Configuration effective, anciennes références d'images et preuves de validation sauvegardées hors du dépôt.

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

### Woka personnel Johan — ajouté, non déployé

- Personnage complet `eoloa-johan` (nom affiché : `Johan`) ajouté à la collection par défaut dans
  `play/src/pusher/data/woka.json`, après les personnages existants.
- Ressource : `play/public/resources/characters/pipoya/bonhomme-chauve-barbe-lunettes-v2.png`.
- Validation : PNG transparent de 96 × 128 pixels, grille de 3 × 4 cases de 32 pixels ; ordre visuel
  bas, gauche, droite, haut conforme aux animations. Déclaration JSON et unicité de l'identifiant vérifiées.
- Conserver cette ressource et sa déclaration lors des synchronisations ; le catalogue officiel ne fournit
  pas cet avatar personnel. La sélection et la marche en jeu restent à valider après déploiement de Play.

### Présence externe et téléphonie 3CX — actif

**Besoin :** synchroniser la disponibilité WorkAdventure avec une source externe, notamment les appels 3CX.

- Code : `play/src/front/Connection/ExternalPresenceSync.ts`,
  `play/src/pusher/controllers/ExternalPresenceController.ts`,
  `play/src/pusher/services/ThreeCxClient.ts`, `ThreeCxPresenceService.ts`, et raccordements
  dans `ConnectionManager.ts`, `play/src/pusher/app.ts` et la configuration front/pusher.
- Configuration : familles `EXTERNAL_PRESENCE_*` et `THREE_CX_*` ; valeurs documentées dans
  [les variables d'environnement](docs/others/self-hosting/env-variables.md).
- Le libellé français de `BACK_IN_A_MOMENT` est adapté en « 📞 Au téléphone » dans
  `play/src/i18n/fr-FR/actionbar.ts`. Réexaminer ce choix si l'amont introduit un statut téléphonique distinct.
- Origines : `acfcb8a82`, `490274bf3`, `50d1effb4` ; compléments de cache, d'en-têtes et de suivi
  dans `dd55848b6`, `506feb51a`, `d9a21288b`.
- Validation : début/fin d'appel, correspondance des utilisateurs, source indisponible, arrêt du polling à la
  déconnexion et retour au statut prévu. Vérifier aussi l'absence d'exposition des identifiants 3CX côté navigateur.
- **Retrait possible :** intégration officielle disponible en auto-hébergement, couvrant les sources et
  règles de correspondance utilisées. Migrer la configuration et retirer le polling ou les routes en double.

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
  `contrib/tools/test_deploy_production.py` (14 tests réussis). `prod:check` vérifié avec les accès existants ;
  aucun redéploiement n'est effectué lors de l'ajout du script.
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
