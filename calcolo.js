// calcolo.js — punto di uscita per paracadutista (tondo senza spinta o con efficienza)
// Convenzioni: direzione vento = direzione DA cui soffia (come nei bollettini).
// Il paracadutista si sposta SEMPRE verso la direzione opposta (sottovento).

const FT = 0.3048;      // metri per piede
const KT = 0.514444;    // m/s per nodo
const R_TERRA = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// vettore di spostamento (e = est, n = nord) in m/s, verso dove va l'aria
function ventoVettore(dirDa, kt) {
  const v = kt * KT;
  const a = rad(dirDa);
  return { e: -v * Math.sin(a), n: -v * Math.cos(a) };
}

// vento a una quota qualsiasi: interpolazione lineare delle componenti (non degli angoli)
function creaVento(livelli) {
  const L = livelli
    .map((l) => ({ h: l.quotaFt, ...ventoVettore(l.dirDa, l.kt) }))
    .sort((a, b) => a.h - b.h);
  return (h) => {
    if (h <= L[0].h) return L[0];
    if (h >= L[L.length - 1].h) return L[L.length - 1];
    for (let i = 1; i < L.length; i++) {
      if (h <= L[i].h) {
        const t = (h - L[i - 1].h) / (L[i].h - L[i - 1].h);
        return {
          e: L[i - 1].e + t * (L[i].e - L[i - 1].e),
          n: L[i - 1].n + t * (L[i].n - L[i - 1].n),
        };
      }
    }
  };
}

// differenza angolare minima in gradi (0..180)
function diffAngolo(a, b) {
  return Math.abs((((b - a) % 360) + 540) % 360 - 180);
}

// punto raggiunto spostandosi di (e, n) metri da lat/lon
function sposta(lat, lon, e, n) {
  return {
    lat: lat + deg(n / R_TERRA),
    lon: lon + deg(e / (R_TERRA * Math.cos(rad(lat)))),
  };
}

/**
 * @param {Object} p
 * @param {number} p.latAtterraggio, p.lonAtterraggio  punto di atterraggio desiderato
 * @param {number} p.quotaLancioFt     quota di lancio (ft AGL)
 * @param {number} p.quotaAperturaFt   quota di apertura (ft AGL)
 * @param {number} p.rateoCadutaLibera velocità di caduta libera (m/s), es. 50
 * @param {number} p.rateoVela         velocità di discesa sotto vela (m/s)
 * @param {number} [p.efficienza=0]    es. 3 per 3:1 (0 = tondo senza spinta)
 * @param {Array}  p.venti             [{quotaFt, dirDa, kt}, ...] ogni 1000 ft
 * @param {number} [p.sogliaDirDeg=90] salto di direzione che fa scattare la zampa di cane
 * @param {number} [p.ventoMinKt=0]    sotto questa velocità una misura non fa scattare la zampa di cane
 */
export function calcolaPuntoUscita(p) {
  const efficienza = p.efficienza ?? 0;
  const soglia = p.sogliaDirDeg ?? 90;
  const ventoMin = p.ventoMinKt ?? 0;
  const vento = creaVento(p.venti);

  // 1) zampe di cane: salto di direzione >= soglia tra due misure consecutive.
  //    Il calcolo si spezza alla quota della misura più alta della coppia.
  const misure = [...p.venti].sort((a, b) => b.quotaFt - a.quotaFt);
  const zampe = [];
  for (let i = 0; i < misure.length - 1; i++) {
    const a = misure[i];
    const b = misure[i + 1];
    if (a.kt < ventoMin || b.kt < ventoMin) continue;
    if (diffAngolo(a.dirDa, b.dirDa) >= soglia && a.quotaFt < p.quotaLancioFt) {
      zampe.push(a.quotaFt);
    }
  }

  // 2) punti di rottura: lancio, apertura, zampe di cane, suolo
  const quote = [...new Set([p.quotaLancioFt, p.quotaAperturaFt, ...zampe, 0])]
    .filter((q) => q >= 0 && q <= p.quotaLancioFt)
    .sort((a, b) => b - a);

  // 3) spostamento di ogni tratto, calcolato in avanti nel tempo e sempre sottovento
  const tratti = [];
  for (let i = 0; i < quote.length - 1; i++) {
    const hAlto = quote[i];
    const hBasso = quote[i + 1];
    const tipo = hBasso >= p.quotaAperturaFt ? "caduta" : "vela";
    const rateo = tipo === "caduta" ? p.rateoCadutaLibera : p.rateoVela;
    const tempo = ((hAlto - hBasso) * FT) / rateo;

    // vento medio del tratto (media vettoriale, campioni ogni ~50 ft)
    const passi = Math.max(1, Math.round((hAlto - hBasso) / 50));
    let e = 0;
    let n = 0;
    for (let k = 0; k < passi; k++) {
      const w = vento(hBasso + ((k + 0.5) * (hAlto - hBasso)) / passi);
      e += w.e;
      n += w.n;
    }
    e /= passi;
    n /= passi;

    // efficienza: avanzamento extra nella stessa direzione del vento
    const vVento = Math.hypot(e, n);
    let eGlide = 0;
    let nGlide = 0;
    if (tipo === "vela" && efficienza > 0 && vVento > 0) {
      const vOriz = efficienza * rateo;
      eGlide = (e / vVento) * vOriz;
      nGlide = (n / vVento) * vOriz;
    }

    tratti.push({
      tipo,
      quotaDaFt: hAlto,
      quotaAFt: hBasso,
      spostE: (e + eGlide) * tempo,
      spostN: (n + nGlide) * tempo,
      ventoVersoDeg: (deg(Math.atan2(e, n)) + 360) % 360, // verso dove va
      ventoDaDeg: (deg(Math.atan2(-e, -n)) + 360) % 360,  // da dove viene
      ventoKt: vVento / KT,
    });
  }

  // 4) uscita = atterraggio - spostamento totale (all'indietro, una volta sola)
  const totE = tratti.reduce((s, t) => s + t.spostE, 0);
  const totN = tratti.reduce((s, t) => s + t.spostN, 0);
  let cur = sposta(p.latAtterraggio, p.lonAtterraggio, -totE, -totN);
  const uscita = { ...cur };

  // 5) punti in avanti dall'uscita: ogni tratto parte dove finisce il precedente
  const punti = [{ nome: "uscita", quotaFt: p.quotaLancioFt, ...cur }];
  for (const t of tratti) {
    cur = sposta(cur.lat, cur.lon, t.spostE, t.spostN);
    t.da = punti[punti.length - 1];
    t.a = { lat: cur.lat, lon: cur.lon, quotaFt: t.quotaAFt };
    punti.push({ nome: "", quotaFt: t.quotaAFt, ...cur });
  }

  const apertura = punti.find((q) => q.quotaFt === p.quotaAperturaFt);
  return {
    uscita,
    apertura: apertura && { lat: apertura.lat, lon: apertura.lon },
    atterraggio: { lat: p.latAtterraggio, lon: p.lonAtterraggio },
    tratti, // tipo "caduta" = verde, tipo "vela" = blu
    zampeDiCane: zampe.map((q) => {
      const pt = punti.find((x) => x.quotaFt === q);
      return { quotaFt: q, lat: pt.lat, lon: pt.lon };
    }),
  };
}
