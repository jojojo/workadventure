# Présence téléphonique événementielle Eoloa

Le workflow n8n `pBIy9M2QHG6G5YG9` reçoit les événements WebSocket 3CX,
conserve les snapshots dans `3cx_presence_shadow`, puis envoie les statuts par
identité WorkAdventure. Le producteur fournit aussi un snapshot de contrôle
chaque minute. WorkAdventure ne fait plus de requêtes périodiques vers n8n ou 3CX.

## Contrat

`POST /external-module/event`, en-tête `Authorization` contenant exactement le
jeton dédié `EXTERNAL_PRESENCE_API_TOKEN` (32 caractères minimum, sans préfixe).
Stocker ce secret dans la stack et dans un credential n8n `httpHeaderAuth` ;
ne jamais le placer dans le workflow, le navigateur ou un fichier versionné.
Ce jeton ne permet pas d'utiliser les autres modules ou routes administratives.

```json
{
  "data": {
    "moduleId": "external-presence",
    "message": {
      "rows": [
        {
          "identifier": "person@example.invalid",
          "status": "BUSY",
          "sequence": 1793955000000000,
          "observedAt": 1793955000000
        }
      ]
    }
  }
}
```

Les identités correspondent au `userUuid` connecté (courriel dans ce déploiement
sans Admin API). Comparaison insensible à la casse, espaces extérieurs retirés.
Statuts acceptés : `ONLINE`, `BUSY`, `UNKNOWN`. Les nombres sont des entiers sûrs
JavaScript. `observedAt` est un timestamp Unix en millisecondes ; `sequence`
est strictement croissant pour chaque identité, y compris après un redémarrage
n8n. Le producteur utilise l'horloge en millisecondes multipliée par 1000.
Le SQL de correspondance et le workflow inactif sans credentials sont versionnés
sous `cloudron-admin/workflows/n8n.eoloa.eu/3cx-presence/`.

Un lot invalide, trop ancien (120 s), trop futur (30 s), ou dépassant 10 000
identités en cache est refusé intégralement avec HTTP 400. Un credential incorrect
reçoit HTTP 401. Les doublons et séquences plus anciennes sont ignorés avec succès,
pour autoriser les retries HTTP. Les comparaisons de séquence et le cache sont en
mémoire : ils ne constituent pas un journal durable au-delà du processus Play.

## Routage et disponibilité

Le module distribue uniquement le statut de chaque identité aux WebSockets
correspondants, dans toutes les salles et tous les onglets de l'instance Play.
Aucune diffusion globale des courriels ou des statuts des autres personnes.
À l'entrée dans une salle, le dernier état connu est envoyé immédiatement.
Sans état connu, la disponibilité normale est conservée jusqu'au prochain snapshot.
Après un redémarrage Play, ce snapshot arrive au plus tard au prochain contrôle du
producteur, sous réserve du fonctionnement de n8n et du réseau.

Un état connu non renouvelé dans les 120 s devient `UNKNOWN` par un timer local,
sans accès réseau. `BUSY` et `UNKNOWN` affichent le statut « 📞 Au téléphone » en
première priorité, devant les statuts orange BUSY/AWAY, les statuts manuels et les
activités WorkAdventure. En fin d'appel, le statut correspondant à la situation
courante réapparaît. La présence téléphonique est transitoire :
elle ne modifie ni le choix manuel ni sa sauvegarde locale. Fin d'appel et sortie
de connexion retirent seulement cette présence téléphonique.

Ce routage suppose **une instance Play**, comme la production vérifiée le
6 novembre 2026. Plusieurs instances exigent une distribution des mêmes événements
à toutes les instances ou un bus partagé ; ne pas placer ce POST derrière un
équilibreur multi-Play sans ce raccordement.

Les anciennes variables `EXTERNAL_PRESENCE_URL`, `EXTERNAL_PRESENCE_AUTH_TOKEN`,
`EXTERNAL_PRESENCE_MATCH_FIELD`, `EXTERNAL_PRESENCE_POLL_INTERVAL` et `THREE_CX_*`
ne sont plus utilisées. L'ancien GET `/external-presence-status` et le client
3CX intégré sont retirés. Le lecteur n8n « Get Phone status » peut rester actif
pour d'autres consommateurs ; cette migration ne le supprime pas.

## Vérifications et retour arrière

Les tests ciblent le routage, les onglets, le réabonnement, l'ordre, les doublons,
l'expiration, les lots invalides, l'authentification et la disponibilité réelle.
Le SQL est testé sur MariaDB isolée sans credentials de production.
Pour un retour arrière, restaurer ensemble l'image Play précédente et la version
publiée sauvegardée du workflow n8n. Conserver le webhook lecteur et les anciennes
variables de stack pendant la validation permet à l'ancien Play de reprendre ses
lectures. Suivre la procédure de déploiement Eoloa ; sauvegardes privées hors Git.
