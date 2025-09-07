/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

// prüft Existenz relativ zu /public
const existsInPublic = (rel) =>
  fs.existsSync(path.join(__dirname, "..", "public", rel));

function toJpg(p) {
  return p.replace(/\.jpeg$/i, ".jpg");
}

// aus "2-15057-272x183-01.jpg" -> "images/nain_trading/2-15057-272x183/2-15057-272x183-01.jpg"
function buildRelFromFilename(fileName) {
  const m = fileName.match(/^(\d+)-(\d+)-(\d+)x(\d+)-(\d+)\.(jpe?g)$/i);
  if (!m) return null;
  const base = `${m[1]}-${m[2]}-${m[3]}x${m[4]}`;
  return `images/nain_trading/${base}/${fileName}`;
}

async function run() {
  const rugs = await db.rug.findMany({
    select: { id: true, rugNumber: true, imagePath: true },
  });

  let fixed = 0, skipped = 0, missing = 0;

  for (const r of rugs) {
    let p = (r.imagePath || "").trim();
    if (!p) { skipped++; continue; }

    // Fall A: kompletter Pfad (enthält "/")
    if (p.includes("/")) {
      // 1) Wenn .jpeg -> .jpg probieren
      if (/\.jpeg$/i.test(p)) {
        const jpg = toJpg(p);
        if (existsInPublic(jpg)) {
          await db.rug.update({ where: { id: r.id }, data: { imagePath: jpg } });
          fixed++; continue;
        }
      }
      // 2) Wenn bereits .jpg, prüfen ob Datei existiert
      if (/\.jpg$/i.test(p)) {
        if (existsInPublic(p)) { skipped++; continue; }
        // Notfall: es gibt doch nur eine nackte Datei im Ordner?
        // (Nichts zu tun ohne weitere Heuristik)
        console.warn("Fehlt trotz .jpg:", p);
        missing++; continue;
      }

      // andere Endungen ignorieren
      skipped++; continue;
    }

    // Fall B: nur Dateiname ohne Ordner
    // Beispiel: "2-15057-272x183-01.jpg"
    let rel = buildRelFromFilename(p);
    if (!rel) {
      console.warn("Unerwartetes Dateinamensmuster:", p);
      missing++; continue;
    }

    // Stelle auf .jpg (Zielvorgabe)
    rel = toJpg(rel);

    if (existsInPublic(rel)) {
      await db.rug.update({ where: { id: r.id }, data: { imagePath: rel } });
      fixed++; continue;
    }

    console.warn("Nicht gefunden:", rel);
    missing++;
  }

  console.log(`Fertig. Korrigiert: ${fixed}, übersprungen: ${skipped}, weiterhin fehlend: ${missing}`);
  await db.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
