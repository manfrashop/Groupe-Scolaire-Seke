# GSPS v28 — correction du blocage des boutons

- Correction : suppression des copies du bloc de zoom photo qui avaient été injectées dans plusieurs modèles HTML d’impression. Leurs balises `</script>` interrompaient le script principal de l’application et pouvaient laisser les boutons de l’accueil inactifs.
- Le zoom photo est conservé une seule fois, à la fin du document principal.
- Vérification : les balises `<script>` sont équilibrées et les scripts JavaScript extraits passent le contrôle syntaxique Node.js.
- Cache du service worker : `gsps-cache-v29` pour forcer le remplacement de l’ancienne version après une ouverture en ligne.
- Cette correction ne modifie pas les données scolaires ni les règles Firestore. La synchronisation entre appareils devra être vérifiée séparément après le déploiement.

# GSPS v27 — plus de fenêtre Firebase

- Les mots de passe Firebase des 5 comptes se renseignent UNE fois dans `ROLE_CREDENTIALS` (champ `password`, en haut du script du fichier HTML). La connexion se fait alors sans aucune fenêtre. Si un mot de passe reste vide, l'ancienne fenêtre de saisie sert de secours.
- Sécurité : ces mots de passe sont lisibles par quiconque obtient le fichier HTML. Utiliser des mots de passe forts et uniques, ne pas les réutiliser ailleurs, restreindre la clé API aux domaines de l'app, et les changer dans Firebase si le fichier fuite.
- Service worker : `gsps-cache-v27`.

# GSPS v26 — session Firebase persistante

- Session Firebase explicitement persistante (IndexedDB, puis localStorage en secours) + demande de stockage persistant : le mot de passe Firebase n'est saisi qu'UNE fois par appareil.
- Condition : l'app doit être ouverte à une adresse FIXE. Une adresse comme `127.0.0.1:<port aléatoire>` change d'origine à chaque lancement et fait perdre la session. Utiliser un port fixe, ou un hébergement (Firebase Hosting / GitHub Pages / domaine). Ajouter ce domaine dans Firebase > Authentication > Paramètres > Domaines autorisés.
- Service worker : `gsps-cache-v26`.

# GSPS v25 — correctifs

- **Première mise en service** : le document Firestore est créé avec une base VIERGE (plus de 210 faux élèves, paiements, personnel écrits dans la base réelle). Le mode hors-ligne « jamais synchronisé » affiche aussi une base vide. Les données de démonstration restent disponibles via Paramètres > Réinitialiser.
- **Service worker** : les deux copies de la réponse (page + alias hors-ligne) sont maintenant clonées avant d'être rendues au navigateur ; avant, l'alias pouvait échouer (« body already used »). Cache : `gsps-cache-v25`.
- **Journal** : au-delà de 1 000 entrées, la Direction (seule autorisée par les règles) conserve les 800 plus récentes et ajoute une entrée « Journal allégé ». Exportez une sauvegarde pour archiver l'historique complet.
- **Synchronisation temps réel** : les instantanés correspondant à nos propres écritures non confirmées sont ignorés, et la page n'est plus redessinée pendant qu'un champ de saisie a le focus.

Après déploiement : ouvrir l'app en ligne une fois pour que le nouveau service worker remplace l'ancien cache.
Non traité : lectures trop larges du document unique (voir SECURITE-V14.md), PIN local, numéros de reçus corrigés après coup.

## Matricule : manuel ou automatique
- **Nouvelle inscription** : champ « Matricule » dans le formulaire. Vide = numéro automatique (le prochain est affiché en grisé) ; saisi = matricule manuel.
- Un matricule manuel est mis en majuscules, sans espaces, 2 à 30 caractères (lettres, chiffres, `.` `_` `-`), et doit être **unique** (refusé sinon, avec le nom de l'élève qui le porte).
- **Modification d'une fiche** : seule la Direction peut changer le matricule ; les autres profils le voient en lecture seule. Champ vidé = matricule inchangé.
- **Import CSV des élèves** : colonne facultative « Matricule » ; ligne sans matricule = automatique, ligne avec un doublon = rejetée.
- La numérotation automatique repart toujours après le plus grand numéro `GSPS-…` existant : elle ne peut pas entrer en collision avec un matricule saisi à la main.

## Documents : liens vers le stockage cloud
- **Fiche élève** : nouvel onglet « Documents ». **Fiche personnel** (modification) : section « Documents (liens cloud) ».
- Ajouter : intitulé + lien de partage (Google Drive, Dropbox, OneDrive/SharePoint, Box, MEGA, iCloud). Seul le lien est stocké (≈ 100 octets) ; le fichier reste chez le fournisseur. 30 liens maximum par fiche.
- Sécurité : lien en **https** uniquement, domaine vérifié (un domaine du type `drive.google.com.autre.com` est refusé), vérification refaite à l'affichage, ouverture dans un nouvel onglet avec `noopener noreferrer`.
- Droits : mêmes que la modification de la fiche (secrétariat/comptabilité pour les élèves, Direction pour le personnel). Aucun changement des règles Firestore.
- La Direction peut autoriser d'autres domaines (bouton « Domaines autorisés ») ; la liste est dans `parametres.domainesDocs`.
- Rappel : tous les profils lisent le document Firestore, donc voient les liens ; la protection réelle est le partage réglé côté Drive/Dropbox.

## Préparation des leçons (nouveau module « 📝 Préparation des leçons »)
- **Fiche de préparation** : classe, matière (liste du cycle), titre/thème, date prévue, durée, statut (Brouillon / Prête / Réalisée) et 9 rubriques : objectifs, prérequis, matériel, introduction, développement, synthèse, évaluation, devoirs, bilan après séance (2 000 caractères max par rubrique).
- **Page** : liste filtrable (recherche, classe, matière, statut, « Mes leçons » / « Toutes »), fiche détaillée, **impression** A4 avec en-tête de l'école, **duplication** (pour réutiliser une fiche d'une année ou d'un collègue), boutons « Marquer prête / réalisée », **liens cloud** (Drive, Dropbox…) pour les supports.
- **Qui peut quoi** : enseignant et Direction par défaut (réglable dans Administration). Un enseignant ne modifie/supprime que SES fiches ; la Direction toutes. Tous les profils ayant le module peuvent lire, dupliquer et ajouter un lien. NB : cette restriction « auteur » est appliquée par l'application, pas par les règles Firestore (le compte « enseignant » est commun).
- Raccourci « Préparer une leçon » dans les accès rapides.
- **Déploiement** : (1) republier `firestore.rules` (collection `lecons` pour le profil enseignant) ; (2) la Direction doit se connecter une fois après la mise à jour : elle enregistre automatiquement l'ajout du module dans les droits (`droits.<profil>.collections`). Tant que ce n'est pas fait, l'enseignant verrait le module mais ses enregistrements seraient refusés (« permission-denied »).
- Les fiches sont dans le document unique (limite 1 Mo) : ~1,5 Ko par fiche typique, soit ~300 fiches pour 500 Ko. L'application refuse d'enregistrer au-delà de 97 % de la limite ; pour les cours longs, utiliser un lien cloud.


# GSPS v28 — état de synchronisation plus fiable
- Le badge ne devient plus vert avant la réception d'un instantané Firestore confirmé par le serveur.
- Les écritures locales en attente sont signalées explicitement (« Envoi des modifications… »).
- Les échecs serveur restent visibles au lieu de laisser un ancien statut vert.
- Le cache du service worker passe en v28 pour forcer le renouvellement des fichiers de l'application.
- Cette mise à jour améliore le diagnostic côté appareil ; elle ne remplace pas la publication des règles Firestore v27 dans la console Firebase.
