/* GSPS — Service worker.
   Stratégie « réseau d'abord, cache en secours » :
   - En ligne : chaque requête part au réseau (toujours la version la plus fraîche de l'app),
     et la réponse est mise en cache au passage.
   - Hors-ligne (ou requête réseau échouée) : on sert la dernière version connue depuis le cache,
     pour que l'application (page HTML, icônes, manifeste) se charge même sans connexion,
     y compris au tout premier écran (pas seulement les données, déjà gérées par Firestore).

   Important : à chaque mise à jour déployée de l'application, changez CACHE_NAME
   (ex. "gsps-cache-v26") pour que les anciens fichiers mis en cache soient purgés et
   remplacés par les nouveaux dès la prochaine visite en ligne. */

const CACHE_NAME = "gsps-cache-v26";
// Alias fixe sous lequel on garde toujours une copie de la dernière page HTML chargée,
// quel que soit son nom exact ou son chemin sur l'hébergement — pour pouvoir la retrouver
// hors-ligne même si l'URL de navigation diffère légèrement (avec ou sans paramètres, etc.).
const SHELL_ALIAS = "gsps-app-shell";

/* Bibliothèques tierces indispensables au démarrage : SDK Firebase (modules ES) et Chart.js.
   Elles sont versionnées dans leur URL, donc sûres à garder en cache : « cache d'abord ».
   Sans cela, l'application ne démarre pas hors-ligne (le SDK n'est pas chargé).
   Les échanges avec Firestore (firestore.googleapis.com) ne passent jamais par ce cache. */
const LIBS_PRECACHE = [
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"
];
// Fichiers locaux indispensables au démarrage (Chart.js est désormais hébergé avec l'application).
const LOCAL_PRECACHE = ["chart.umd.min.js"];
function estLibExterne(url){
  return (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) ||
         false;
}
/* Met en cache un module et, récursivement, les modules qu'il importe (./chunk.js). */
async function precacherModule(cache, urlStr, vus){
  if(vus.has(urlStr)) return;
  vus.add(urlStr);
  try{
    let rep = await cache.match(urlStr);
    if(!rep){
      rep = await fetch(urlStr, { mode: "cors" });
      if(!rep || !rep.ok) return;
      await cache.put(urlStr, rep.clone());
    }
    if(!/\.js($|\?)/.test(urlStr)) return;
    const txt = await rep.clone().text();
    const re = /(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g;
    let m; const suites = [];
    while((m = re.exec(txt))) suites.push(new URL(m[1], urlStr).href);
    await Promise.all(suites.map(u => precacherModule(cache, u, vus)));
  }catch(e){ /* hors-ligne pendant l'installation : sera rattrapé au prochain passage en ligne */ }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const vus = new Set();
      return Promise.all([
        ...LIBS_PRECACHE.map(u => precacherModule(cache, u, vus)),
        ...LOCAL_PRECACHE.map(u => cache.add(u).catch(()=>{}))
      ]);
    })
  );
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
  const url = new URL(req.url);
  if(req.method !== "GET"){ return; }

  // Bibliothèques externes (SDK Firebase, Chart.js) : cache d'abord, réseau ensuite (et mise en cache).
  if(url.origin !== self.location.origin){
    if(!estLibExterne(url)) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const enCache = await cache.match(req, { ignoreVary: true }) || await cache.match(req.url);
        if(enCache) return enCache;
        const res = await fetch(req);
        if(res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      })
    );
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
