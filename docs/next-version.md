# Prochaine version

## Améliorations légères à évaluer

La version 0.4.9 constitue un bon jalon. Avant d'ajouter une autre fonctionnalité
importante, laisser vivre la version en production quelques jours et utiliser les
journaux pour confirmer les besoins réels.

- Ajouter une recherche textuelle dans les activités : client, projet, action
  ou utilisateur.
- Ajouter un filtre de période « Du/Au » dans les activités utilisateur et les
  journaux techniques.
- Mémoriser dans le navigateur les préférences de pagination et les filtres.
- Afficher clairement les requêtes techniques lentes, avec un seuil initial à
  discuter (par exemple 500 ms).
- Permettre à l'administrateur de copier facilement un `requestId`.
- Ajouter un résumé administratif des erreurs et avertissements des dernières
  24 heures.

Ces éléments doivent rester de petites améliorations indépendantes. Leur ordre
de priorité sera déterminé à partir de l'utilisation réelle plutôt que de les
implémenter tous immédiatement.

## Optimisation de la conservation des journaux

À planifier pour la prochaine session de développement. Aucun changement
fonctionnel n'est inclus dans la version 0.4.9.

- Réduire le volume de `technical_logs` en ne conservant durablement que les
  erreurs, avertissements, requêtes lentes et opérations importantes.
- Ignorer ou échantillonner les requêtes répétitives à faible valeur de
  diagnostic, notamment `/api/system-info` et `/health`.
- Définir une conservation courte pour les succès techniques ordinaires
  (cible à discuter : 7 à 14 jours) et conserver la limite actuelle de 90 jours
  pour les événements techniques utiles.
- Ajouter un index sur `audit_events.created_at` pour la consultation
  administrative globale triée par date.
- Évaluer une politique de conservation explicite pour les activités
  utilisateur (cible à discuter : 1 à 3 ans).
- Remplacer éventuellement la pagination profonde avec `OFFSET` par une
  pagination par curseur si le volume le justifie.
- Évaluer un index adapté à la recherche partielle sur le chemin des requêtes
  techniques.
- Déplacer éventuellement le nettoyage vers une tâche planifiée plutôt que de
  le déclencher pendant une requête applicative.

### Validation attendue

- Mesurer le nombre de lignes et la taille des deux tables avant et après
  l'ajustement.
- Vérifier les plans d'exécution des filtres et tris principaux avec
  `EXPLAIN ANALYZE`.
- Confirmer que les erreurs restent corrélées aux activités utilisateur par le
  `requestId`.
- Tester la purge sans supprimer les événements encore requis pour le
  diagnostic ou l'historique utilisateur.
