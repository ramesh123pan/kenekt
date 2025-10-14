import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');  
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

      // --- GEOGRAPHY LOGIC ---
      let city_suburb = null;
      let state = null;
      let country = null;

      if (locality) {
        const parts = locality.split(',').map(part => part.trim()).filter(Boolean);
        
        if (parts.length >= 1) city_suburb = parts[0];
        if (parts.length >= 2) state = parts[1];
        if (parts.length >= 3) country = parts[parts.length - 1];
      }
      // --- END ADDED LOGIC FOR GEOGRAPHY ---

      const priceDisplay = getText("h3.text-xl") || null;
      const priceValue = priceDisplay ? Number(priceDisplay.replace(/[^0-9.-]+/g, "")) : null;

      // Status Capture Logic
      let status = getText('turbo-frame[id^="portal_property_status"] div.h5') || null;
      
      const details = {};
      Array.from(document.querySelectorAll("dl.grid")).forEach(dl => {
        const dts = dl.querySelectorAll("dt");
        const dds = dl.querySelectorAll("dd");
        dts.forEach((dt, i) => {
          const key = dt.innerText.trim().replace(/\s+/g, '_').replace(/\./g, '').toLowerCase();
          const value = (dds[i]?.innerText || "").trim();
          if (key) details[key] = value || null;
        });
      });

      if (!status) {
          status = details['status'] || details['property_status'] || null;
      }
      if (status) details['status'] = status;
      
      const features = Array.from(document.querySelectorAll("ul.inline-flex li")).map(li => li.innerText.trim());

      const description = document.querySelector(".lexxy-content")?.innerText.trim() || null;
      
      // ------------------------------------------------------------------
      // --- CAPTURE IMAGE AND PDF URLS (Updated Logic) ---
      // ------------------------------------------------------------------
      
      // 1. Floor Plan Image URL
      const floorplanImg = document.querySelector("#floorplan img")?.src || null;

      // 2. Header / Gallery Images: NOW USING THE CORRECT SELECTOR
      const imageGallery = Array.from(document.querySelectorAll('.flex.flex-wrap img'))
          .map(img => img.src)
          .filter(src => src && !src.includes('default-placeholder') && !src.includes('map'));

      // 3. PDF Attachment Link
      const pdfAttachment = document.querySelector('a[href$=".pdf"], a[title*="Brochure"], a[title*="Download"]') 
          ? document.querySelector('a[href$=".pdf"], a[title*="Brochure"], a[title*="Download"]').href
          : null;
      // ------------------------------------------------------------------


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
      
      const finalStatus = status;

      return {
        title,
        address,
        locality, 
        city_suburb,
        state,
        country,
        priceDisplay,
        priceValue,
        status: finalStatus,
        features,
        details,
        description,
        inclusions,
        locationData,
        // --- RETURNED FILE URLS ---
        gallery_images: imageGallery,
        floorplan_image: floorplanImg,
        pdf_link: pdfAttachment
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