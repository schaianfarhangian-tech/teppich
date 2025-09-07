const express = require("express");
const path = require("path");
const app = express();

// WICHTIG: "public" als static root
app.use(express.static(path.join(__dirname, "public")));

// deine API-Routen danach
// Falls du eine routes.js oder routes/index.js hast, aktiviere die nächste Zeile:
// app.use("/api", require("./routes"));

/* --- ab hier wie gehabt --- */
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

app.use(cors());
app.use(express.json());

// Statische Dateien: /public wird als Website-Root ausgeliefert
app.use(express.static(path.join(__dirname, "public")));

// API: Teppiche laden (mit optionalen Filtern per Query-Params)
// /api/rugs?page=1&pageSize=50
app.get("/api/rugs", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize ?? "50", 10)));

  const [items, total] = await Promise.all([
    db.rug.findMany({
      where: { priceCents: { gt: 0 } }, // nur verkaufbare
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.rug.count({ where: { priceCents: { gt: 0 } } }),
  ]);

  res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

// Update einzelner Teppich (z.B. nur color)
app.put("/api/rugs/:rugNumber", async (req, res) => {
  const { rugNumber } = req.params;
  const { color, name, widthCm, lengthCm, priceCents, imagePath } = req.body; // wir erlauben mehrere Felder
  try {
    const updated = await db.rug.update({
      where: { rugNumber },
      data: {
        ...(color !== undefined ? { color } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(widthCm !== undefined ? { widthCm: Number(widthCm) } : {}),
        ...(lengthCm !== undefined ? { lengthCm: Number(lengthCm) } : {}),
        ...(priceCents !== undefined ? { priceCents: Number(priceCents) } : {}),
        ...(imagePath !== undefined ? { imagePath } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: "Update fehlgeschlagen" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
