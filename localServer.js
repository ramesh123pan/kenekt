import express from "express";
import scrapeProperty from "./api/scrapeProperty.js";

const app = express();
const PORT = 3000;

app.get("/api/scrapeProperty", (req, res) => {
  scrapeProperty(req, res); // reuse the same serverless function
});

app.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
});
