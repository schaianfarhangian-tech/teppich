// ---- Cloudinary-Konfiguration (nur Frontend-URL-Aufbau) ----
const CLOUDINARY_CLOUD_NAME = "dqgfwfxuw";
const CLOUDINARY_BASE_FOLDER = "teppiche";

/**
 * Baut aus einem DB-Pfad wie
 *   "images/nain_trading/1073-24860-141x72/1073-24860-141x72-01.jpg"
 * eine Cloudinary-URL:
 *   https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,w_800/teppiche/nain_trading/...
 *
 * - Entfernt führendes "images/"
 * - Kodiert jedes Segment sicher (Leerzeichen, Sonderzeichen)
 * - Lässt echte http(s)-URLs unverändert (falls bereits absolut)
 */
function toCloudinaryUrl(imagePath) {
  if (!imagePath) return "";

  // Falls bereits eine absolute URL vorliegt (Sonderfall)
  if (/^https?:\/\//i.test(imagePath)) return imagePath;

  // "images/..." entfernen & führende Slashes bereinigen
  const rel = String(imagePath)
    .replace(/^\/?images\//i, "")
    .replace(/^\/+/, "");

  // Jedes Pfadsegment URL-sicher kodieren
  const safeRel = rel
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");

  // Transformationen: automatische Formate/Qualität + Breite begrenzen
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,w_800/${CLOUDINARY_BASE_FOLDER}/${safeRel}`;
}


// NEU: getrennte Felder für Länge & Breite
const $lenMin = document.getElementById("filter-laenge-von");
const $lenMax = document.getElementById("filter-laenge-bis");
const $widMin = document.getElementById("filter-breite-von");
const $widMax = document.getElementById("filter-breite-bis");

const $priceMin = document.getElementById("filter-preis-von");
const $priceMax = document.getElementById("filter-preis-bis");

/* ---------------- State ---------------- */
let ALL_RUGS = [];
let FILTERED = [];

/* ---------------- Utils ---------------- */
const fmtPrice = (cents) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })
    : "";

const fmtSize = (w, l) => `${l} × ${w} cm`;

/** Zahl aus Input: "" -> null, "200,5" -> 200.5 */
function parseNum(el) {
  const raw = (el.value || "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

/* ---------------- Rendering ---------------- */
function renderTable(rows) {
  if (!rows.length) {
    $tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem;">Keine Treffer</td></tr>`;
    $pager.textContent = "";
    return;
  }

  const html = rows
    .map((r) => {
      const imgSrc = r.imagePath ? toCloudinaryUrl(r.imagePath) : "";
      const alt = r.name || r.rugNumber;
      return `
      <tr>
        <td>
          ${
            imgSrc
              ? `<img src="${imgSrc}" alt="${alt}" loading="lazy" style="max-width:160px;height:auto;object-fit:contain;">`
              : `<div style="width:160px;height:100px;background:#eee;display:flex;align-items:center;justify-content:center;color:#888;">kein Bild</div>`
          }
        </td>
        <td>${r.rugNumber || ""}</td>
        <td>${r.name || ""}</td>
        <td>${fmtSize(r.widthCm, r.lengthCm)}</td>
        <td>${r.color || ""}</td>
        <td class="price-col">${fmtPrice(r.priceCents)}</td>
      </tr>`;
    })
    .join("");

  $tbody.innerHTML = html;
  $pager.textContent = `${rows.length} Treffer`;
}

function populateNameFilter(rugs) {
  const names = uniqueSorted(rugs.map((r) => r.name && r.name.trim()));
  $filterName.innerHTML =
    `<option value="">Alle</option>` +
    names.map((n) => `<option value="${n}">${n}</option>`).join("");
}

/* ---------------- Filtering ---------------- */
function applyFilters() {
  const nameVal = $filterName.value.trim();

  // Länge (cm)
  const minLen = parseNum($lenMin);
  const maxLen = parseNum($lenMax);

  // Breite (cm)
  const minWid = parseNum($widMin);
  const maxWid = parseNum($widMax);

  // Preis (€) -> Cents
  const priceMin = parseNum($priceMin);
  const priceMax = parseNum($priceMax);
  const priceMinC = priceMin == null ? null : Math.round(priceMin * 100);
  const priceMaxC = priceMax == null ? null : Math.round(priceMax * 100);

  FILTERED = ALL_RUGS.filter((r) => {
    // Name (Dropdown exakter Match)
    if (nameVal && (r.name || "").trim() !== nameVal) return false;

    const len = Number(r.lengthCm) || 0;
    const wid = Number(r.widthCm) || 0;

    // Länge: von/bis inklusiv
    if (minLen != null && len < minLen) return false;
    if (maxLen != null && len > maxLen) return false;

    // Breite: von/bis inklusiv
    if (minWid != null && wid < minWid) return false;
    if (maxWid != null && wid > maxWid) return false;

    // Preis: von/bis inklusiv
    const p = Number(r.priceCents) || 0;
    if (priceMinC != null && p < priceMinC) return false;
    if (priceMaxC != null && p > priceMaxC) return false;

    return true;
  });

  renderTable(FILTERED);
}

function onInputChange() {
  clearTimeout(onInputChange._t);
  onInputChange._t = setTimeout(applyFilters, 120);
}

/* ---------------- Data loading ---------------- */
async function fetchAllRugs() {
  const pageSize = 200;
  let page = 1;
  let total = Infinity;
  const out = [];

  while ((page - 1) * pageSize < total) {
    const res = await fetch(`${API_URL}?page=${page}&pageSize=${pageSize}`);
    if (!res.ok) throw new Error("API-Fehler beim Laden");
    const json = await res.json();
    out.push(...json.items);
    total = json.total;
    page += 1;
  }
  return out;
}

/* ---------------- Init ---------------- */
async function init() {
  try {
    ALL_RUGS = await fetchAllRugs();

    populateNameFilter(ALL_RUGS);

    // Events
    $filterName.addEventListener("change", applyFilters);
    [$lenMin, $lenMax, $widMin, $widMax, $priceMin, $priceMax].forEach((el) =>
      el.addEventListener("input", onInputChange)
    );

    // Initial
    FILTERED = [...ALL_RUGS];
    renderTable(FILTERED);
  } catch (e) {
    console.error(e);
    $tbody.innerHTML = `<tr><td colspan="6" style="color:#c00; padding:2rem;">Fehler beim Laden der Daten.</td></tr>`;
  }
}

init();
