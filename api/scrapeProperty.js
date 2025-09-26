import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";
import localPuppeteer from "puppeteer"; // only for local dev

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing 'url'" });

  let browser = null;

  try {
    // Decide whether we are running on Vercel or local
    const isLocal = !process.env.AWS_REGION; // Vercel sets AWS_REGION

    if (isLocal) {
      // Local → use full puppeteer (it downloads Chromium itself)
      browser = await localPuppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } else {
      // Vercel → use puppeteer-core + chrome-aws-lambda
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: true,
      });
    }

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Minimal scrape for test
    const title = await page.$eval("h1, h2.text-xl", (el) => el.innerText);

    await browser.close();
    return res.status(200).json({ source_url: url, title });
  } catch (err) {
    if (browser) await browser.close();
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
