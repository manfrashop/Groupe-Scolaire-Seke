/* GSPS — Service worker.
   Stratégie « réseau d'abord, cache en secours » :
   - En ligne : chaque requête part au réseau (toujours la version la plus fraîche de l'app),
     et la réponse est mise en cache au passage.
   - Hors-ligne (ou requête réseau échouée) : on sert la dernière version connue depuis le cache,
     pour que l'application (page HTML, icônes, manifeste) se charge même sans connexion,
     y compris au tout premier écran (pas seulement les données, déjà gérées par Firestore).

   Important : à chaque mise à jour déployée de l'application, changez CACHE_NAME
   (ex. "gsps-cache-v20") pour que les anciens fichiers mis en cache soient purgés et
   remplacés par les nouveaux dès la prochaine visite en ligne. */

const CACHE_NAME = "gsps-cache-v20";
// Alias fixe sous lequel on garde toujours une copie de la dernière page HTML chargée,
// quel que soit son nom exact ou son chemin sur l'hébergement — pour pouvoir la retrouver
// hors-ligne même si l'URL de navigation diffère légèrement (avec ou sans paramètres, etc.).
const SHELL_ALIAS = "gsps-app-shell";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne met en cache que les lectures, et uniquement sur notre propre origine :
  // les échanges avec Firestore/Firebase ne doivent jamais transiter par ce cache,
  // ils ont déjà leur propre gestion hors-ligne (IndexedDB via le SDK Firestore).
  if(req.method !== "GET" || new URL(req.url).origin !== self.location.origin){
    return;
  }

  const estNavigation = req.mode === "navigate";

  event.respondWith(
    fetch(req)
      .then((res) => {
        if(res && res.ok){
          const copie = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, copie);
            if(estNavigation) cache.put(SHELL_ALIAS, res.clone());
          });
        }
        return res;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const correspondance = await cache.match(req);
        if(correspondance) return correspondance;
        if(estNavigation){
          const shell = await cache.match(SHELL_ALIAS);
          if(shell) return shell;
        }
        return Response.error();
      })
  );
});
