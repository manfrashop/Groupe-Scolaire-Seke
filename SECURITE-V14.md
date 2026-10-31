# GSPS v14 — durcissement de sécurité

## Changements appliqués

- Aucun mot de passe Firebase n'est désormais présent dans `GSPS_Gestion_Scolaire.html`.
- La création automatique des comptes Firebase depuis le navigateur a été supprimée.
- La connexion Firebase demande le mot de passe du compte lors de la première authentification sur un appareil lorsque Firebase n'a pas déjà restauré la session.
- Le code de récupération universel `gsps` a été supprimé.
- « PIN oublié ? » exige maintenant une authentification Firebase réelle du profil concerné.
- La base scolaire complète n'est plus recopiée dans `localStorage` par `saveDB()`.
- Le service worker est passé en `gsps-cache-v14` pour invalider le cache des versions précédentes.
- Les règles Firestore renforcent la protection des champs `droits` et `parametres` pour les profils restreints.

## Action obligatoire après déploiement

Les mots de passe présents dans les anciennes versions v10/v11/v12/v13 ont été exposés dans le code source. **Ils doivent être changés dans Firebase Authentication** avant la mise en production de v14.

Créer/maintenir les cinq comptes Firebase suivants :

- direction@gsps-seke-siguiri.local
- comptabilite@gsps-seke-siguiri.local
- secretariat@gsps-seke-siguiri.local
- enseignant@gsps-seke-siguiri.local
- transport@gsps-seke-siguiri.local

L'application ne crée plus ces comptes automatiquement.

## Limite architecturale restante

La base Firestore utilise encore un document agrégé `/ecoles/gsps-seke-siguiri`. Les profils reconnus peuvent donc encore lire ce document complet. Une isolation réelle des lectures nécessite une migration vers des sous-collections/documents séparés par domaine (élèves, paiements, paie, notes, etc.).

Cette limite est volontairement conservée en v14 pour éviter une migration destructive et préserver les fonctionnalités existantes.

## v15 — page Administration

- Refonte de la page Administration : cartes par profil (modules groupés, jauge d'accès, modules sensibles en orange), vue matrice conservée, préréglages (tout cocher, tout décocher, droits par défaut, copier depuis un autre profil), indicateurs, dernière connexion par profil, activité récente des droits et réglages.
- Texte obsolète corrigé : les comptes Firebase ne sont plus créés automatiquement.
- Service worker passé en `gsps-cache-v15`.

## v16 — correctifs synchronisation multi-appareils

- Écoute temps réel : le verrou `fbApplyingRemote` est toujours relâché (try/finally). Avant, une erreur pendant l'application d'une mise à jour distante bloquait définitivement les sauvegardes de l'appareil et les mises à jour suivantes.
- Si Firestore coupe l'écoute (droits, session), elle peut redémarrer et l'état est visible dans la pastille de connexion.
- La session Firebase est attendue (`authStateReady`) avant de tester l'utilisateur : le mot de passe n'est plus redemandé à chaque ouverture.
- Si la lecture initiale échoue, l'app n'écrit plus les données de secours sur le serveur (risque d'écrasement de la base).
- Service worker : `gsps-cache-v16`.

## v17 — utilisateurs nommés

- Administration > onglet « Utilisateurs » : la Direction crée des utilisateurs (nom, prénoms, rôle), peut changer leur rôle, les désactiver ou les supprimer.
- À la connexion d'un profil qui a des utilisateurs actifs, après le PIN et l'authentification Firebase, la personne choisit son nom. Ce nom s'affiche dans l'application et dans le journal de traçabilité (« Nom Prénoms (Profil) »).
- Les utilisateurs sont dans le champ `utilisateurs` du document école ; seule la Direction peut le modifier (le serveur refuse l'écriture aux autres profils). `firestore.rules` n'a pas besoin de changer.
- Limite : le PIN et le compte Firebase restent propres au rôle, pas à la personne. Le choix du nom sert à la traçabilité, ce n'est pas une authentification individuelle.
- Service worker : `gsps-cache-v17`.

## v18 — numéros uniques multi-appareils

- Matricule, numéro de reçu et numéro de bulletin sont maintenant calculés à partir du plus grand numéro réellement présent dans les données ET du compteur. Un compteur périmé (dernière écriture perdue) ne provoque plus de réutilisation d'un numéro.
- Deux appareils hors-ligne peuvent encore attribuer le même numéro. Après synchronisation, la Direction corrige automatiquement les doublons : le plus petit `id` garde son numéro, les autres reçoivent le numéro suivant libre. La correction est signalée par un message et inscrite au journal de traçabilité. Seule une session Direction effectue cette correction.
- Limite : si un reçu doublon a déjà été imprimé ou remis, son numéro change après correction (ancien → nouveau visible dans le journal).
- Service worker : `gsps-cache-v18`.

## v19 — saisie du mot de passe Firebase

- Le `prompt()` natif (champ non masqué, souvent bloqué dans les PWA installées) est remplacé par une fenêtre de l'application : champ masqué avec bouton d'affichage, validation par Entrée, 3 essais en cas de mot de passe incorrect. Utilisée à la connexion et pour « PIN oublié ».
- Service worker : `gsps-cache-v19`.

## v20 — système asynchrone

- Tous les `confirm()` (14) et le `prompt()` de purge du journal sont remplacés par `await confirmer(...)` / `await saisir(...)` : fenêtres de l'application, non bloquantes (l'interface, la synchronisation et le hors-ligne continuent de tourner pendant la question).
- Les fonctions concernées sont devenues `async` (suppressions, désactivations, réinitialisation PIN, purge, reset, génération des bulletins, relances).
- `saveDB()` renvoie une promesse (`true` = accepté ou mis en file hors-ligne, `false` = refusé/erreur) : `await saveDB()` est possible, les appels existants sans `await` continuent de fonctionner.
- La restauration d'une sauvegarde demande désormais une confirmation avant d'écraser les données.
- Service worker : `gsps-cache-v20`.

## v21 — démarrage hors-ligne

- Cause du blocage : le SDK Firebase (gstatic) et Chart.js (cdnjs) étaient chargés depuis Internet et ignorés par le service worker. Hors-ligne, le SDK ne se chargeait plus, donc l'application ne démarrait pas.
- Le service worker met désormais ces bibliothèques en cache (« cache d'abord ») et les précharge à l'installation, y compris les modules qu'elles importent.
- Chart.js est chargé avec `crossorigin` ; un filet de sécurité évite un plantage si Chart.js manque.
- Message clair si les composants Firebase ne sont pas chargés (première ouverture hors-ligne).
- Prérequis : ouvrir l'application EN LIGNE au moins une fois après ce déploiement, sur chaque appareil.
- Limite : Firebase Authentication ne garde qu'un compte connecté à la fois par appareil. Hors-ligne, seul le profil authentifié en dernier sur l'appareil peut se connecter.
- Service worker : `gsps-cache-v21`.
