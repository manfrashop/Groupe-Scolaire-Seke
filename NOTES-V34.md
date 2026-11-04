# GSPS v34 — correctifs de l'audit v33

## Corrigé
- **Mot de passe toujours vérifié** : `signInAsRole` ne réutilise plus une session Firebase existante quand un mot de passe est saisi sur l'écran de connexion. Le mot de passe est contrôlé par Firebase à chaque connexion ; la session n'est réutilisée que pour le rechargement de la page dans le même onglet (aucun mot de passe fourni).
- **Écran de connexion** : `loginModeLegacy()` renvoie toujours vrai. Le sélecteur de profil reste affiché même si d'anciens « utilisateurs nommés » existent dans le localStorage (le champ `#loginNom` n'existe plus).
- **Hachés de PIN supprimés** : `pinHash` / `pinSalt` sont retirés de `DB.utilisateurs` au chargement (puis de Firestore à la prochaine sauvegarde) ; le localStorage est purgé (`gsps_users_cache_v1`, `gsps_pins_v1`, `gsps_pinlock_v1`, `gsps_bio_v1`).
- **Texte d'aide** : le message de l'écran de connexion n'est plus écrasé par « code PIN ».
- **Ménage Paramètres / Administration** : panneau « Code PIN de connexion » et empreinte/visage retirés, boutons « PIN → 2027 » retirés, onglet « Utilisateurs » (PIN) retiré. Le panneau « Connexion » explique où changer les mots de passe.
- **Hors-ligne** : voir section « Ouverture hors-ligne » ci-dessous.
- **Version affichée** : écran de connexion et Paramètres (`APP_VERSION`). Cache du service worker : `gsps-cache-v34`.

## À faire côté Firebase (hors du code)
1. Vérifier dans Authentication > Users que les 5 comptes `@gsps-seke-siguiri.local` existent ; désactiver l'inscription libre si l'option est disponible (Authentication > Paramètres > Actions utilisateur).
2. Si les versions v27/v28 ont été déployées avec des `password` remplis dans `ROLE_CREDENTIALS`, changer ces 5 mots de passe.
3. Restreindre la clé API aux domaines de l'application.

## Non traité (connu)
- Lecture de tout le document `ecoles/{id}` par tous les profils (limite du modèle à document unique ; migration en sous-collections non demandée).
- Code mort PIN / biométrie / utilisateurs nommés encore présent dans le script (inatteignable) : suppression complète à faire dans une version dédiée, avec tests.
- Pas de SRI sur Chart.js ; SDK Firebase figé en 10.13.0 ; manifeste PWA en blob.
- Historique : les notes des versions v29 à v33 n'ont pas été rédigées ; seules v27/v28 sont documentées.

## Ouverture hors-ligne (corrigée en v34)
- **Service worker** : le pré-cache du SDK Firebase ne suivait que les imports relatifs ; les modules importés par URL absolue (`gstatic.com/firebasejs/…`) n'étaient pas mis en cache avant la 2e visite en ligne. L'expression suit maintenant aussi ces URL.
- **Première visite** : la page n'était jamais mise en cache (chargée avant que le service worker ne contrôle la page). La page envoie maintenant son URL et ses icônes au service worker (`cache-shell`).
- **Réseau lent / « connecté sans internet »** : la page bascule sur la copie en cache après 4 s au lieu d'attendre l'échec du réseau.
- **Connexion hors-ligne** : puisque le mot de passe est désormais toujours vérifié, sans réseau il ne pouvait plus l'être. Après une connexion en ligne réussie, un vérificateur dérivé (PBKDF2-SHA256, sel aléatoire, 250 000 itérations) est gardé dans le localStorage de l'appareil ; sans réseau, si la session Firebase de l'appareil est celle du profil et que le mot de passe correspond, l'app s'ouvre sur le cache local. Utiliser des mots de passe longs (un vérificateur local est attaquable hors-ligne si l'appareil est volé). « Appareil partagé » + déconnexion efface ce vérificateur.
- **Condition** : ouvrir et se connecter UNE fois en ligne par appareil, à une adresse fixe (https), après avoir déployé `sw.js` v34.
