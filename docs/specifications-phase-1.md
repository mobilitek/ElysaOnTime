# OnTime — Spécifications fonctionnelles de la phase 1

## 1. Objet du document

Ce document rassemble les exigences confirmées pour reconstruire OnTime avec :

- Bun comme environnement d'exécution;
- ElysiaJS pour l'API;
- PostgreSQL pour la persistance;
- React et Vite pour l'interface Web.

Il décrit le comportement attendu. Il ne constitue pas encore un plan
d'implémentation détaillé.

## 2. Vision du produit

OnTime est une application de journal de travail. Elle permet de gérer des
clients et leurs projets, de consigner des entrées de temps, de calculer leur
valeur, de suivre leur état de facturation et de produire des exports Excel
destinés aux clients.

La phase 1 est mono-utilisateur, mais les données seront rattachées à un
utilisateur afin de préparer une évolution multi-utilisateur.

## 3. Périmètre de la phase 1

La phase 1 comprend :

- une authentification par adresse courriel et mot de passe;
- un compte créé par une commande d'administration;
- la gestion du profil;
- la gestion des clients;
- la gestion des projets et de leur taux horaire;
- la gestion des entrées du journal de travail;
- les filtres, tris, totaux et la pagination du journal;
- un mode confidentiel;
- une interface bilingue français/anglais;
- un export Excel `.xlsx`.

La phase 1 ne comprend pas :

- l'inscription publique;
- la récupération du mot de passe par courriel;
- la gestion de véritables factures;
- la recherche textuelle dans les descriptions;
- la gestion de plusieurs devises;
- la configuration du format de date par utilisateur ou client;
- la configuration personnalisée des exports par client;
- la prise en compte des jours fériés lors de la duplication.

## 4. Authentification et profil

### 4.1 Compte initial

- Aucun formulaire public de création de compte n'est disponible.
- Le premier compte est créé par une commande d'administration.
- Le mot de passe n'est jamais inscrit dans le code ou dans Git.

### 4.2 Connexion

- L'utilisateur se connecte avec son adresse courriel et son mot de passe.
- Une session normale utilise un cookie de session supprimé à la fermeture du
  navigateur.
- L'option « Rester connecté » crée une session persistante de 30 jours.
- La déconnexion invalide la session côté serveur et supprime le cookie.
- Le cookie d'authentification est sécurisé et `HttpOnly`.

### 4.3 Profil

Le profil permet de modifier :

- le prénom;
- le nom;
- l'adresse courriel;
- le mot de passe.

Le prénom et le nom sont conservés dans deux champs distincts. Ils servent
notamment à construire le nom des fichiers Excel.

### 4.4 Phase 2 envisagée

La phase 2 pourra ajouter :

- la création publique de profils;
- plusieurs utilisateurs avec isolation complète de leurs données;
- la récupération du mot de passe par courriel.

## 5. Préférences d'interface

### 5.1 Langue

- L'interface est bilingue français/anglais dès la phase 1.
- La langue choisie est mémorisée dans un cookie persistant.
- Les libellés et les noms de jours dans l'export Excel suivent la langue
  active.

### 5.2 Mode confidentiel

- Le mode confidentiel est un mode d'affichage et d'export.
- Son état est mémorisé dans un cookie persistant.
- Le cookie contient une préférence non sensible, distincte du cookie
  d'authentification.
- En mode confidentiel, aucune information financière ne doit apparaître, ni à
  l'écran ni dans l'export Excel.
- Sont notamment masqués :
  - le taux horaire;
  - la valeur de chaque entrée;
  - la valeur totale;
  - toute autre information financière ajoutée ultérieurement.
- La date, la durée, la description et le statut facturé restent utilisables
  dans l'application.

L'affichage conditionnel des colonnes Client et Projet dépend des filtres et
non du mode confidentiel.

### 5.3 Format des dates et montants

- Les dates sont affichées au format `JJ/MM/AAAA`, dans les deux langues, pour
  la phase 1.
- La zone métier est Montréal (`America/Toronto`).
- Les horodatages techniques sont stockés en UTC et affichés selon l'heure de
  Montréal.
- Les montants sont en dollars canadiens seulement.
- Le format d'affichage est nord-américain : `$3,560.00`.
- Le point sépare les décimales et la virgule sépare les milliers.
- Les montants ont exactement deux décimales.

## 6. Clients

Un client possède au minimum :

- un identifiant;
- un propriétaire (`user_id`);
- un nom;
- un statut actif/inactif;
- une date de création;
- une date de modification.

Règles :

- Un nouveau client est actif par défaut.
- Les noms sont uniques par utilisateur sans tenir compte de la casse.
- `MOBILITEK`, `Mobilitek` et `mobilitek` représentent donc le même nom.
- Un client inactif n'apparaît dans aucune liste de sélection du journal.
- Si un client est inactif, ses projets sont indisponibles dans le journal,
  même si leur propre statut est actif.
- Les entrées rattachées à un client inactif sont cachées du journal et exclues
  des totaux et exports.
- La réactivation du client peut faire réapparaître ses entrées, sous réserve
  que leurs projets soient également actifs.

Il n'y a pas de suppression physique des clients dans le fonctionnement
normal. Le statut actif/inactif assure leur retrait de l'utilisation courante.

## 7. Projets

Un projet possède au minimum :

- un identifiant;
- un client obligatoire;
- un nom;
- un taux horaire;
- un statut actif/inactif;
- une date de création;
- une date de modification.

Règles :

- Un nouveau projet est actif par défaut.
- Un projet appartient obligatoirement à un client.
- Le nom est unique à l'intérieur d'un client, sans tenir compte de la casse.
- Deux clients différents peuvent avoir des projets portant le même nom.
- Le taux horaire est obligatoire, non négatif et comporte deux décimales.
- Un taux de `0.00` est permis.
- Un projet inactif n'apparaît pas dans les sélecteurs du journal.
- Il est impossible de créer une entrée sur un projet inactif.
- Les entrées d'un projet inactif sont cachées du journal et exclues des totaux
  et exports.
- Réactiver le client et le projet fait réapparaître leurs entrées.

Il n'y a pas de suppression physique des projets dans le fonctionnement
normal.

### 7.1 Modification du taux horaire

Chaque entrée conserve une copie du taux appliqué lors de sa création.

Lorsqu'un taux de projet est modifié, l'utilisateur choisit entre :

1. appliquer le nouveau taux aux nouvelles entrées seulement;
2. mettre à jour et recalculer les anciennes entrées non facturées du projet;
3. annuler la modification.

Les entrées déjà facturées ne sont jamais recalculées automatiquement lors de
la modification du taux d'un projet.

## 8. Entrées du journal de travail

Une entrée possède au minimum :

- un identifiant;
- un propriétaire (`user_id`);
- un projet obligatoire;
- une date de travail;
- une durée en minutes;
- une description;
- une copie du taux horaire appliqué;
- une valeur calculée;
- un booléen `is_billed`;
- un booléen `is_deleted`;
- une date de création;
- une date de modification.

Le client est obtenu par la relation entre le projet et son client.

### 8.1 Création

- Un client actif précis et un projet actif précis doivent être sélectionnés
  dans le journal pour activer le bouton d'ajout.
- Le formulaire n'a pas besoin d'un sélecteur de projet : le projet provient du
  contexte du journal.
- Plusieurs entrées sont permises le même jour.
- Plusieurs entrées sont permises pour le même projet et la même date.
- Les dates futures sont permises.
- La description est obligatoire et ne peut pas être vide.
- La durée minimale est 15 minutes.
- La durée doit être un multiple de 15 minutes.
- Aucune durée maximale n'est imposée dans la phase 1.
- La durée est stockée en minutes et affichée au format `HH:MM`.
- Une nouvelle entrée est non facturée et non supprimée.

### 8.2 Valeur financière

La valeur d'une entrée est calculée côté serveur :

```text
valeur = durée en minutes / 60 × taux horaire historique
```

- Chaque entrée est arrondie au cent près.
- Les totaux additionnent ensuite les valeurs déjà arrondies.
- Le taux et la valeur ne sont pas saisis librement dans l'entrée.

### 8.3 Modification

- Les formulaires utilisent des actions explicites « Valider » et « Retour ».
- Il n'y a aucune sauvegarde automatique.
- « Retour » abandonne les changements qui n'ont pas été validés.
- Une entrée liée à un client ou projet inactif est cachée et ne peut pas être
  modifiée.
- Une entrée facturée demeure entièrement modifiable.
- Avant de modifier ou masquer une entrée facturée, l'application affiche un
  avertissement de confirmation.

### 8.4 Statut facturé

- `is_billed` est seulement un indicateur interne.
- Il n'existe pas de table ni de système de factures dans la phase 1.
- L'utilisateur peut sélectionner une ou plusieurs lignes et utiliser l'action
  de facturation.
- L'action inverse individuellement le booléen de chaque ligne sélectionnée :

```text
false -> true
true  -> false
```

- Une sélection peut donc contenir un mélange d'entrées facturées et non
  facturées.
- Le statut facturé n'est jamais exporté dans le fichier destiné au client.

### 8.5 Masquage et restauration

- Aucune entrée n'est supprimée physiquement dans le fonctionnement normal.
- Le bouton rouge agit sur toutes les lignes sélectionnées après confirmation.
- Il inverse individuellement `is_deleted`, de la même façon que `is_billed`.
- Une option « Afficher les entrées supprimées » contrôle leur visibilité :
  - décochée : seules les entrées avec `is_deleted = false` apparaissent;
  - cochée : toutes les entrées apparaissent, supprimées et non supprimées.
- Les entrées supprimées ont un style visuel distinct.
- Une entrée supprimée peut être restaurée avec le même bouton rouge.
- Lorsque l'option est cochée, les entrées supprimées participent aux résultats
  et à l'export Excel.
- Cette option ne permet pas de contourner l'inactivité d'un client ou projet :
  leurs entrées demeurent cachées.

### 8.6 Duplication

Deux actions de duplication sont disponibles :

1. copie intégrale à la même date;
2. copie intégrale au prochain jour ouvrable.

La copie conserve :

- le projet;
- la durée;
- la description;
- le taux historique exact de l'entrée originale.

La copie est toujours créée comme non facturée et non supprimée.

Pour la duplication au prochain jour ouvrable :

- lundi devient mardi;
- mardi devient mercredi;
- mercredi devient jeudi;
- jeudi devient vendredi;
- vendredi devient lundi;
- une source datée du samedi ou du dimanche mène au lundi suivant.

Les jours fériés ne sont pas pris en compte dans la phase 1.

## 9. Journal, filtres et totaux

### 9.1 Périodes

Les préréglages suivants sont conservés :

- Jour : une date;
- Semaine : du samedi au vendredi;
- Mois : le mois civil complet;
- Année : l'année civile complète;
- Aucun/Personnalisé : dates de début et de fin saisies manuellement.

Les flèches précédente et suivante déplacent la période selon le préréglage
actif : un jour, une semaine, un mois ou une année.

### 9.2 Filtres Client et Projet

- Le filtre Client contient « Tous les clients » et uniquement les clients
  actifs.
- Lorsqu'un client précis est choisi, le filtre Projet contient « Tous les
  projets » et uniquement les projets actifs de ce client.
- Lors de la sélection « Tous les clients », aucun projet individuel n'est
  sélectionnable.
- Une entrée est affichable uniquement si son client et son projet sont actifs.

### 9.3 Colonnes dynamiques

Les colonnes Client et Projet évitent de répéter une information déjà imposée
par les filtres :

| Filtre Client | Filtre Projet | Colonnes d'identification |
|---|---|---|
| Tous les clients | Tous les projets | Client et Projet |
| Un client précis | Tous ses projets | Projet seulement |
| Un client précis | Un projet précis | Aucune des deux |

Les autres colonnes comprennent selon le contexte :

- jour;
- date;
- taux, hors mode confidentiel;
- valeur, hors mode confidentiel;
- description;
- durée;
- statut facturé, dans l'application seulement.

### 9.4 Tri

- Le tri par défaut est la date décroissante.
- L'entrée la plus récente apparaît en premier.
- Cliquer sur l'en-tête d'une colonne alterne entre le tri croissant et
  décroissant de cette colonne.

### 9.5 Pagination

- Les tailles disponibles sont 10, 25, 50 et 100 entrées par page.
- La valeur par défaut est 50.
- Le choix est mémorisé dans un cookie persistant.
- Les totaux sont calculés sur l'ensemble des résultats filtrés, pas seulement
  sur la page visible.

### 9.6 Résumé

Le journal affiche au minimum :

- le nombre total d'entrées filtrées;
- le total des heures filtrées;
- la valeur totale filtrée lorsque le mode confidentiel est désactivé.

## 10. Export Excel

### 10.1 Portée

- Le format est `.xlsx`.
- L'export porte sur l'ensemble des résultats filtrés, indépendamment de la
  page visible.
- Il respecte la période, le client, le projet, l'activité des clients et
  projets, ainsi que l'option d'affichage des entrées supprimées.
- `is_billed` n'est jamais exporté, car le fichier est destiné au client.

### 10.2 Colonnes dynamiques

Les colonnes Client et Projet suivent la même règle dynamique que le journal :

- tous les clients : Client et Projet;
- un client et tous ses projets : Projet seulement;
- un client et un projet : ni Client ni Projet.

Les colonnes non financières comprennent :

- Jour;
- Date;
- Description;
- Heures.

Lorsque le mode confidentiel est désactivé, l'export ajoute :

- Taux;
- Valeur;
- une ligne finale avec le total des heures et le total de la valeur.

Lorsque le mode confidentiel est activé :

- aucune colonne financière n'est exportée;
- aucun total financier n'est exporté.

Les en-têtes et les noms de jours suivent la langue active de l'interface.

Une configuration personnalisée des colonnes par client pourra être étudiée
ultérieurement.

### 10.3 Nom du fichier

Le nom du fichier contient :

- le prénom et le nom de l'utilisateur;
- `OnTime`;
- le client sélectionné ou le libellé représentant tous les clients;
- la date de début;
- la date de fin.

Structure indicative :

```text
NomUtilisateur_OnTime_Client_DateDebut_to_DateFin.xlsx
```

Exemple :

```text
EricTremblay_OnTime_5xperts-Garda_01-07-2026_to_31-07-2026.xlsx
```

Lorsque tous les clients sont sélectionnés :

- français : `TousLesClients`;
- anglais : `AllClient`.

Les caractères incompatibles avec un nom de fichier sont nettoyés.

## 11. Modèle de données pressenti

Le schéma définitif sera établi pendant la conception technique. Les tables
minimales pressenties sont les suivantes.

### 11.1 `users`

| Champ | Type pressenti | Contraintes principales |
|---|---|---|
| `id` | `uuid` | clé primaire |
| `email` | texte insensible à la casse | obligatoire, unique |
| `password_hash` | `text` | obligatoire |
| `first_name` | `varchar` | obligatoire |
| `last_name` | `varchar` | obligatoire |
| `created_at` | `timestamptz` | obligatoire |
| `updated_at` | `timestamptz` | obligatoire |

### 11.2 `sessions`

| Champ | Type pressenti | Contraintes principales |
|---|---|---|
| `id` | `uuid` | clé primaire |
| `user_id` | `uuid` | référence `users` |
| `token_hash` | `text` | obligatoire, unique |
| `expires_at` | `timestamptz` | nullable pour le cookie de session selon la stratégie retenue |
| `created_at` | `timestamptz` | obligatoire |

### 11.3 `clients`

| Champ | Type pressenti | Contraintes principales |
|---|---|---|
| `id` | `uuid` | clé primaire |
| `user_id` | `uuid` | référence `users` |
| `name` | texte insensible à la casse | obligatoire, unique par utilisateur |
| `is_active` | `boolean` | défaut `true` |
| `created_at` | `timestamptz` | obligatoire |
| `updated_at` | `timestamptz` | obligatoire |

### 11.4 `projects`

| Champ | Type pressenti | Contraintes principales |
|---|---|---|
| `id` | `uuid` | clé primaire |
| `client_id` | `uuid` | référence `clients`, obligatoire |
| `name` | texte insensible à la casse | obligatoire, unique par client |
| `hourly_rate` | `numeric(12,2)` | obligatoire, valeur >= 0 |
| `is_active` | `boolean` | défaut `true` |
| `created_at` | `timestamptz` | obligatoire |
| `updated_at` | `timestamptz` | obligatoire |

### 11.5 `work_entries`

| Champ | Type pressenti | Contraintes principales |
|---|---|---|
| `id` | `uuid` | clé primaire |
| `user_id` | `uuid` | référence `users` |
| `project_id` | `uuid` | référence `projects`, obligatoire |
| `work_date` | `date` | obligatoire |
| `duration_minutes` | `integer` | >= 15 et multiple de 15 |
| `description` | `text` | obligatoire, non vide |
| `hourly_rate` | `numeric(12,2)` | taux historique, valeur >= 0 |
| `amount` | `numeric(12,2)` | calculé côté serveur |
| `is_billed` | `boolean` | défaut `false` |
| `is_deleted` | `boolean` | défaut `false` |
| `created_at` | `timestamptz` | obligatoire |
| `updated_at` | `timestamptz` | obligatoire |

## 12. Principes de sécurité et d'intégrité

- Toutes les routes métier exigent une session authentifiée.
- Même en phase mono-utilisateur, les requêtes sont limitées au propriétaire
  des données.
- Les mots de passe sont stockés uniquement sous forme de hachage adapté aux
  mots de passe.
- Les valeurs financières sont calculées et validées côté serveur.
- Le client ne peut pas imposer arbitrairement un taux ou une valeur.
- Les règles d'activité des clients et projets sont vérifiées côté serveur, pas
  seulement dans l'interface.
- Les noms de clients et projets sont comparés sans tenir compte de la casse.
- Les contraintes importantes sont appliquées dans PostgreSQL lorsque
  possible, en plus de la validation de l'API.

## 13. Décisions pouvant évoluer ultérieurement

- Plusieurs utilisateurs et inscription publique.
- Récupération du mot de passe par courriel.
- Devise et format de date configurables par utilisateur ou client.
- Jours fériés dans le calcul du prochain jour ouvrable.
- Recherche textuelle dans les descriptions.
- Configuration des colonnes d'export par client.
- Véritable gestion de factures.
- Gestion plus avancée de l'archivage et de la suppression définitive.

## 14. Éléments à préciser pendant la conception technique

Les exigences métier principales sont définies. La conception technique devra
encore arrêter notamment :

- la bibliothèque de migration et d'accès à PostgreSQL;
- le mécanisme précis de hachage des mots de passe;
- la structure de l'application React et de l'API Elysia;
- le contrat des routes API;
- le format uniforme des réponses et erreurs;
- la bibliothèque de génération Excel;
- la stratégie de tests unitaires, d'intégration et d'interface;
- les détails visuels du nouveau design, qui peut reproduire les comportements
  sans nécessairement copier exactement l'apparence de l'ancienne application.
