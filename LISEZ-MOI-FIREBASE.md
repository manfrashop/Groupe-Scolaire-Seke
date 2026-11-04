## V14 — sécurité

Les mots de passe Firebase ne sont plus intégrés au HTML. Les comptes doivent être créés dans Firebase Authentication avant utilisation. Les mots de passe des anciennes versions doivent être rotatés. Voir `SECURITE-V14.md`.

# Mise en service de Firebase pour GSPS

L'application est maintenant branchée sur Firestore (projet `groupe-scolaire-seke-siguiri`).
Toutes les données (élèves, paiements, personnel, etc.) sont stockées dans un seul document
Firestore partagé par tous les postes de l'école, avec synchronisation en temps réel.

## 1. Activer Firebase Authentication et créer les 5 comptes (une seule fois)

L'application **ne crée plus aucun compte** et **ne contient aucun mot de passe**. Les comptes sont créés
à la main dans la console.

1. Allez sur https://console.firebase.google.com et ouvrez le projet **groupe-scolaire-seke-siguiri**
2. **Build → Authentication → Commencer**
3. Onglet **Sign-in method** → **E-mail/Mot de passe** → activez → Enregistrer
4. Onglet **Settings → Authorized domains** → ajoutez votre domaine Netlify (ex. `gsseke.netlify.app`)
5. Onglet **Users** → **Ajouter un utilisateur** : créez les 5 comptes ci-dessous, chacun avec un
   mot de passe fort et unique :
   - `direction@gsps-seke-siguiri.local`
   - `comptabilite@gsps-seke-siguiri.local`
   - `secretariat@gsps-seke-siguiri.local`
   - `enseignant@gsps-seke-siguiri.local`
   - `transport@gsps-seke-siguiri.local`

Sur chaque appareil, la première connexion d'un profil demande le mot de passe Firebase de ce compte.
Firebase garde ensuite la session : il n'est plus redemandé à chaque ouverture.

**Anciennes versions (v10 à v13)** : leurs mots de passe étaient lisibles dans le code source. Changez-les
tous dans Firebase Authentication avant la mise en production (voir `SECURITE-V14.md`).

Codes d'erreur affichés sur l'écran de connexion :
- `auth/configuration-not-found` : Authentication pas encore activé (étape 2)
- `auth/operation-not-allowed` : fournisseur E-mail/Mot de passe non activé
- `auth/unauthorized-domain` : domaine absent des domaines autorisés
- `auth/invalid-credential` / `auth/wrong-password` : mot de passe incorrect ou compte inexistant
- `auth/network-request-failed` : vraie coupure réseau

## 1 bis. Page Administration (Direction)

Le menu **Administration** (visible uniquement par la Direction) contient :

- **Profils / Matrice** : modules accessibles à chaque profil, activation/désactivation d'un profil,
  préréglages, dernière connexion, activité récente.
- **Utilisateurs** (v17) : la Direction crée des utilisateurs nommés (nom, prénoms, rôle), change leur
  rôle, les désactive ou les supprime. À la connexion d'un profil qui a des utilisateurs actifs, après le
  PIN et l'authentification Firebase, la personne choisit son nom. Ce nom s'affiche dans l'application et
  dans le journal de traçabilité (« Prénoms NOM (Profil) »). Sans utilisateur, la connexion se fait
  directement avec le profil.

Les droits sont stockés dans la base (`db.droits`) et lus par `firestore.rules` : republiez ce fichier
après chaque mise à jour. Le champ `utilisateurs` n'est modifiable que par la Direction.

**Limite** : le PIN et le compte Firebase restent propres au rôle, pas à la personne. Le choix du nom sert
à la traçabilité, ce n'est pas une authentification individuelle.

## 2. Créer la base Firestore (si pas déjà fait)

1. Menu **Build → Firestore Database**
2. Cliquez sur **Créer une base de données**
3. Choisissez une région proche (ex. `eur3` ou une région africaine si disponible)
4. Démarrez en **mode production** (les règles ci-dessous sécurisent l'accès)

## 3. Appliquer les règles de sécurité

1. Dans Firestore Database, onglet **Règles**
2. **Avant de publier**, collez le contenu de `firestore.rules` dans l'onglet **Rules Playground**
   (bouton à côté de Publier) et testez au moins un cas par profil (ex. simuler une écriture
   « Enseignant » sur la collection `paiements` → doit être refusée ; sur `notes` → doit être
   acceptée). Ces règles n'ont pu être testées que par simulation de mon côté, pas sur votre
   projet Firebase réel — cette vérification dans la Playground évite une règle mal calibrée qui
   bloquerait tout le monde une fois publiée.
3. Remplacez le contenu de l'onglet **Règles** par celui du fichier `firestore.rules` fourni
4. Cliquez sur **Publier**

Ces règles autorisent la lecture à tout profil reconnu, mais n'autorisent chaque profil à
**modifier** que les données de ses propres modules (voir détail plus bas).

## 4. Déployer l'application

Aucune étape supplémentaire : le fichier `GSPS_Gestion_Scolaire.html` contient déjà
tout le nécessaire (config Firebase incluse). Déployez-le comme avant sur votre
hébergement (Vercel / Netlify / Cloudflare Pages) avec `sw.js` au même niveau.

## Sécurité par profil (nouveau)

Avant, une fois le PIN contourné (ex. via les outils développeur du navigateur), n'importe quel
appareil connecté pouvait lire **et modifier** l'intégralité des données de l'école. Ce n'est
plus le cas : chaque profil ne peut désormais modifier, même en contournant le PIN, que les
collections correspondant à ses propres pages dans l'application (ex. un compte Enseignant ne
peut pas écrire dans les paiements, le personnel ou la paie). La Direction garde un accès complet.

**Limite qui reste à connaître** : la *lecture* n'est pas cloisonnée par profil (tout profil
connu peut lire l'ensemble des données — cloisonner aussi la lecture demanderait de séparer
chaque module dans son propre document, un chantier plus large). Les mots de passe Firebase
ne sont plus présents dans le code de la page (depuis v14).

## Mode 100% hors-ligne

L'application fonctionne pleinement hors-ligne, sur plusieurs postes en même temps :

- Chaque navigateur garde une copie complète des données en local (base IndexedDB gérée
  automatiquement par Firestore). Consultation, ajout, modification : tout fonctionne
  instantanément, connexion internet ou non.
- Un petit badge en bas à droite indique l'état : **● Synchronisé** (vert) quand le
  poste est bien relié au serveur, ou **○ Hors-ligne — travail local en cours** (orange)
  sinon. Le travail continue normalement dans les deux cas.
- Dès qu'une connexion réapparaît (même quelques minutes, même via un point d'accès
  mobile ponctuel), toutes les modifications faites hors-ligne sont automatiquement
  envoyées, et les modifications faites par les autres postes pendant votre absence
  sont automatiquement récupérées.
- Plusieurs postes peuvent travailler hors-ligne en parallèle et ajouter des données
  différentes (nouvel élève, nouveau paiement...) sans risque de s'écraser mutuellement :
  chaque enregistrement est fusionné individuellement à la resynchronisation.

**Important — premier lancement** : la toute première fois qu'**un profil donné** est utilisé
sur **un appareil donné**, il faut une connexion internet (le temps que Firebase vérifie le
compte de ce profil une fois). Ensuite, ce couple profil + appareil fonctionne hors-ligne
indéfiniment. Concrètement : si trois employés différents utilisent la même tablette à tour de
rôle, chacun doit se connecter une première fois en ligne sur cette tablette — ensuite les
trois peuvent y travailler hors-ligne normalement.

## Un point à connaître : un seul « document école »

Toutes les données sont actuellement stockées sous un identifiant fixe
(`ecoles/gsps-seke-siguiri`). C'est adapté à une seule école avec plusieurs employés,
comme demandé. Si un jour vous gérez plusieurs écoles séparées, il faudra adapter
l'identifiant `ECOLE_ID` dans le code (dites-le-moi le moment venu, c'est un
changement simple).


## Connexion par code PIN local

L'ancien mot de passe (« direction2027 », etc.) est supprimé. La connexion se fait maintenant
avec un **code PIN à 4 chiffres** saisi sur un pavé numérique.

- **Première connexion** de chaque profil : le PIN initial est **2027**. L'application impose
  immédiatement de choisir un nouveau PIN (2027, 1234, 0000... sont refusés).
- Le PIN est **haché (SHA-256 + sel)** et stocké **uniquement sur l'appareil**. Il n'apparaît
  jamais en clair et fonctionne **sans internet**.
- **5 essais ratés** = blocage de 30 secondes (le blocage survit au rechargement de la page).
- **Changer son PIN** : Paramètres → « Code PIN de connexion ».
- **PIN oublié par un employé** : la Direction se connecte, va dans Paramètres et clique sur le
  profil concerné pour le remettre à 2027.
- **PIN oublié (tout profil, Direction comprise)** : sur l'écran de connexion, choisir le profil, puis
  « PIN oublié ? » et saisir le **mot de passe Firebase** du compte de ce profil. Le PIN est remis à
  2027 sur cet appareil. Le code de récupération universel `gsps` n'existe plus.

**Important à savoir** : chaque appareil a ses propres PIN. Changer le PIN sur un poste ne le
change pas sur les autres. C'est voulu (fonctionnement 100 % hors-ligne), mais il faut donc
définir le PIN sur chaque appareil utilisé.

**Limite de sécurité** : ce PIN protège contre un accès accidentel ou curieux au quotidien.
La protection contre quelqu'un qui manipule directement le code de la page est désormais
assurée côté serveur par les règles Firestore par profil (`firestore.rules`), avec la limite
décrite plus haut (« Sécurité par profil »).


## Traçabilité et tableau d'honneur

**Traçabilité (menu réservé à la Direction).** Chaque ajout, modification ou suppression
d'un enregistrement est consigné automatiquement avec le profil, la date et l'heure, ainsi que
les changements de droits, de barème et de paramètres, et les connexions. Le journal peut être
filtré, exporté en CSV, imprimé et purgé (les profils autres que la Direction ne peuvent
qu'ajouter des entrées, jamais en supprimer : c'est imposé par `firestore.rules`).

Le journal est stocké dans le même document que les autres données (limite d'1 Mo) : surveillez
sa taille dans la page Traçabilité, exportez puis purgez les anciennes entrées de temps en temps.

**Tableau d'honneur.** Calculé à partir des moyennes du livret scolaire, par période et par
classe : félicitations (16 et plus), encouragements (14 et plus), tableau d'honneur (moyenne
minimale au choix). Les élèves dont une matière n'est pas notée ou qui ont une sanction modérée
ou grave sont écartés (case à décocher pour ne pas exclure les sanctionnés). Impression de la
liste et certificat individuel (avec le cachet enregistré dans Paramètres).

**Important au déploiement : republiez `firestore.rules` en même temps que le HTML.** Sans les
nouvelles règles, les profils autres que la Direction verraient leurs enregistrements refusés,
car chaque écriture ajoute maintenant une entrée au journal.
