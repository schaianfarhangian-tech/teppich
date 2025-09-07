/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

/* =========================
   Helper
========================= */
function euroToCents(val) {
  if (val === null || val === undefined || val === "") return null;

  // Excel gibt häufig schon eine Zahl
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val * 100);
  }

  // String normalisieren
  let s = String(val).trim();

  // Euro-Zeichen & Leerzeichen raus
  s = s.replace(/€/g, "").replace(/\s+/g, "");

  // DE-Schreibweise -> EN
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(/,/g, "."); // "1.480,92" -> "1480.92"
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(/,/g, "."); // "1480,92" -> "1480.92"
  }

  const euros = Number(s);
  if (!Number.isFinite(euros)) return null;
  return Math.round(euros * 100);
}

function toCm(val) {
  if (val === null || val === undefined || val === "") return null;
  let s = String(val).trim().toLowerCase().replace(/\s/g, "").replace(/,/g, ".");
  const m = s.match(/^(\d+(\.\d+)?)m$/); // "3.01m"
  if (m) return Math.round(Number(m[1]) * 100);
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Header normalisieren (Länge -> Lange etc.)
function normKey(k) {
  return String(k)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics weg
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// mehrere mögliche Headernamen (fallunabhängig)
function pick(row, keys) {
  const map = {};
  for (const raw in row) map[normKey(raw)] = row[raw];
  for (const k of keys) {
    const nk = normKey(k);
    if (nk in map) return map[nk];
  }
  return undefined;
}

/** Baut den Basisnamen ohne Endung */
function buildImageBase(sort, nummer, lengthCm, widthCm) {
  if (sort == null || !nummer || !lengthCm || !widthCm) return null;
  const s = String(sort).trim().replace(/\.0+$/, "");
  const L = Math.round(Number(lengthCm));
  const B = Math.round(Number(widthCm));
  return `${s}-${nummer}-${L}x${B}`;
}

/** Prüft, welche Endung existiert (.jpg oder .jpeg) und gibt den RELATIVEN Pfad zurück */
function resolveImagePathFromBase(base) {
  const relJpg  = `images/nain_trading/${base}/${base}-01.jpg`;
  const relJpeg = `images/nain_trading/${base}/${base}-01.jpeg`;
  const absJpg  = path.join(__dirname, "..", "public", relJpg);
  const absJpeg = path.join(__dirname, "..", "public", relJpeg);
  if (fs.existsSync(absJpg))  return relJpg;
  if (fs.existsSync(absJpeg)) return relJpeg;
  return null;
}

/** Nimmt einen (relativen) Pfad aus Excel und versucht .jpg/.jpeg beides */
function resolveProvidedImagePathMaybeSwapExt(rel) {
  if (!rel) return null;
  // absolut? -> auf relativ unter public mappen, wenn möglich
  let candidate = rel.replace(/^[./\\]+/, ""); // leading "./" oder "/" entfernen
  // Falls Pfad schon mit "public/" beginnt, abschneiden
  if (candidate.startsWith("public/")) candidate = candidate.slice("public/".length);

  const abs = path.join(__dirname, "..", "public", candidate);
  if (fs.existsSync(abs)) return candidate;

  // Endung tauschen
  const ext = path.extname(candidate).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    const without = candidate.slice(0, -ext.length);
    const tryJpg  = without + ".jpg";
    const tryJpeg = without + ".jpeg";
    const absJpg  = path.join(__dirname, "..", "public", tryJpg);
    const absJpeg = path.join(__dirname, "..", "public", tryJpeg);
    if (fs.existsSync(absJpg))  return tryJpg;
    if (fs.existsSync(absJpeg)) return tryJpeg;
  }

  return null;
}

/* =========================
   Main
========================= */
async function main() {
  // Excel öffnen
  const file = path.join(__dirname, "..", "data", "teppiche.xlsx");
  const wb = xlsx.readFile(file);

  // Sheet bestimmen (robust auf Groß/Kleinschreibung)
  const wanted = "Sheet1";
  const findSheetByName = (workbook, name) => {
    const norm = (s) => String(s).trim().toLowerCase();
    const direct = workbook.SheetNames.find((n) => n === name);
    if (direct) return direct;
    const loose = workbook.SheetNames.find((n) => norm(n) === norm(name));
    return loose || null;
  };

  const sheetName = findSheetByName(wb, wanted);
  if (!sheetName) {
    console.error("❌ Sheet 'Sheet1' nicht gefunden. Vorhandene Sheets:", wb.SheetNames);
    process.exit(1);
  }

  const ws = wb.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(ws, { defval: "", raw: true });

  console.log("Benutztes Sheet:", sheetName, "Zeilen:", rawRows.length);

  // Diagnose: Distinct Nummern
  const excelDistinct = new Set(
    rawRows
      .map((r) => String((r["Nummer"] ?? r["nummer"] ?? "").toString().trim()))
      .filter(Boolean)
  );
  console.log("Excel Zeilen:", rawRows.length, "Distinct Nummern:", excelDistinct.size);

  if (!rawRows.length) {
    console.log("Keine Zeilen gefunden. Ist die Datei/Sheet korrekt?");
    return;
  }

  // Debug Header + Beispiele
  console.log("Roh-Header:", Object.keys(rawRows[0]).join(" | "));
  const sample = rawRows.slice(0, 3).map((r) => {
    const out = {};
    for (const k in r) out[normKey(k)] = r[k];
    return out;
  });
  console.log("Beispiel (normalisierte Keys):", sample);

  let created = 0,
    updated = 0,
    skipped = 0,
    missingImages = 0;

  const skippedRows = [];
  let rowCounter = 0; // für Logging menschlich 1-basiert

  for (const r of rawRows) {
    rowCounter += 1;

    const nummer   = String(pick(r, ["Nummer", "nummer", "RugNumber"]) || "").trim();
    const name     = pick(r, ["Name", "Bezeichnung"]) ?? "";
    const sort     = pick(r, ["sort", "Sort"]) ?? "";
    const lengthCm = toCm(pick(r, ["Länge", "Lange", "Laenge", "length", "Length"]));
    const widthCm  = toCm(pick(r, ["Breite", "width", "Width"]));
    const priceCts = euroToCents(
      pick(r, ["Preis Gesamt", "PreisGesamt", "preis gesamt", "Price", "price"])
    );

    // Preis Pflicht (0/leer -> überspringen)
    if (priceCts == null || priceCts <= 0) {
      skipped++;
      skippedRows.push({
        row: rowCounter,
        reason: "Preis 0/leer – nicht verkäuflich",
        nummer,
        laenge: r["Länge"] ?? r["Lange"] ?? r["length"] ?? r["Length"],
        breite: r["Breite"] ?? r["width"] ?? r["Width"],
      });
      continue;
    }

    let color = (pick(r, ["Farbe", "farbe", "Color", "color"]) || "").toString().trim() || null;

    // Pflichtfelder
    if (!nummer || !lengthCm || !widthCm) {
      console.warn(
        `⚠️  Zeile ${rowCounter} übersprungen: Nummer=${nummer || "(leer)"} L=${
          pick(r, ["Länge", "Lange", "Laenge", "length", "Length"]) || "(leer)"
        } B=${pick(r, ["Breite", "width", "Width"]) || "(leer)"}`
      );
      skipped++;
      continue;
    }

    // Bildpfad
    let imagePath =
      (pick(r, ["Bild", "bild", "Image", "image", "imagePath"]) || "").toString().trim();

    if (imagePath) {
      // Falls geliefert: prüfen & ggf. Endung tauschen
      const resolved = resolveProvidedImagePathMaybeSwapExt(imagePath);
      if (resolved) {
        imagePath = resolved;
      } else {
        // Fallback über Basisnamen
        const base = buildImageBase(sort, nummer, lengthCm, widthCm);
        imagePath = base ? resolveImagePathFromBase(base) : null;
      }
    } else {
      // Kein Pfad geliefert -> automatisch bauen (.jpg/.jpeg Fallback)
      const base = buildImageBase(sort, nummer, lengthCm, widthCm);
      imagePath = base ? resolveImagePathFromBase(base) : null;
    }

    if (!imagePath) {
      console.warn(
        `🖼️  Zeile ${rowCounter}: Bild nicht gefunden (Nummer ${nummer}, sort=${sort}, L=${lengthCm}, B=${widthCm})`
      );
      missingImages++;
    }

    const data = {
      rugNumber: nummer,
      name: String(name || "").trim() || null,
      lengthCm,
      widthCm,
      color,
      priceCents: priceCts,
      imagePath: imagePath || null,
    };

    const res = await db.rug.upsert({
      where: { rugNumber: nummer },
      update: data,
      create: data,
    });

    if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
    else updated++;
  }

  console.log(
    `✅ Import fertig. Neu: ${created}, Aktualisiert: ${updated}, Übersprungen: ${skipped}, Bilder fehlen: ${missingImages}`
  );

  if (skippedRows.length) {
    console.log("ℹ️  Übersprungene Zeilen (Auszug):", skippedRows.slice(0, 10));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
