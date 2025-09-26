import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Scraping logic
    const propertyData = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.innerText.trim() || null;

      const title = getText("h2.text-xl") || getText("h1") || null;

      const addressNodes = Array.from(document.querySelectorAll("div.text-gray-800.font-medium"));
      const address = addressNodes[0]?.innerText.trim() || null;
      const locality = addressNodes[1]?.innerText.trim() || null;

      const priceDisplay = getText("h3.text-xl") || null;
      const priceValue = priceDisplay ? Number(priceDisplay.replace(/[^0-9.-]+/g, "")) : null;

      const features = Array.from(document.querySelectorAll("ul.inline-flex li")).map(li => li.innerText.trim());

      const details = {};
      Array.from(document.querySelectorAll("dl.grid")).forEach(dl => {
        const dts = dl.querySelectorAll("dt");
        const dds = dl.querySelectorAll("dd");
        dts.forEach((dt, i) => {
          const key = dt.innerText.trim();
          const value = (dds[i]?.innerText || "").trim();
          if (key) details[key] = value || null;
        });
      });

      const description = document.querySelector(".lexxy-content")?.innerText.trim() || null;
      const floorplanImg = document.querySelector("#floorplan img")?.src || null;

      const extractListByHeading = (headingText) => {
        const headings = Array.from(document.querySelectorAll("h2, h3, h4"));
        const heading = headings.find(h => h.innerText && h.innerText.trim().toLowerCase() === headingText.toLowerCase());
        if (!heading) return [];

        let wrapper = heading.closest("div.relative") || heading.closest("section") || heading.parentElement;
        let ul = wrapper ? wrapper.querySelector("ul") : null;

        if (!ul && wrapper) {
          ul = Array.from(wrapper.querySelectorAll("ul"))[0] || null;
        }

        if (!ul) {
          let sibling = wrapper ? wrapper.nextElementSibling : null;
          while (sibling && !sibling.querySelector("ul")) sibling = sibling.nextElementSibling;
          ul = sibling ? sibling.querySelector("ul") : null;
        }

        if (!ul) return [];
        return Array.from(ul.querySelectorAll("li")).map(li => li.innerText.replace(/\s+/g, " ").trim()).filter(Boolean);
      };

      const inclusions = extractListByHeading("Inclusions");

      const locationData = Array.from(document.querySelectorAll('[data-map-target="listings"] > div')).map(el => ({
        title: el.getAttribute("data-title"),
        type: el.getAttribute("data-type"),
        lat: el.getAttribute("data-lat"),
        lng: el.getAttribute("data-lng")
      }));

      return {
        title,
        address,
        locality,
        priceDisplay,
        priceValue,
        features,
        details,
        description,
        inclusions,
        floorplanImg,
        locationData
      };
    });

    res.status(200).json({ source_url: url, ...propertyData });

  } catch (err) {
    console.error("Scrape error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}
