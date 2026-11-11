// Da includere in index.html (<script src="registra-sw.js"></script>)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const avevaControllo = !!navigator.serviceWorker.controller;
    let ricaricata = false;

    // quando arriva una versione nuova del service worker, ricarica una volta sola
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!avevaControllo || ricaricata) return;
      ricaricata = true;
      location.reload();
    });

    try {
      const reg = await navigator.serviceWorker.register("./sw.js", {
        updateViaCache: "none",
      });
      if (navigator.onLine) await reg.update(); // controlla GitHub a ogni apertura
    } catch (err) {
      console.warn("Service worker non registrato:", err);
    }
  });
}
