const chromium = require("chrome-aws-lambda");

module.exports = async (req, res) => {
  let browser = null;

  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "networkidle0" });

    const screenshot = await page.screenshot({ encoding: "base64" });

    res.status(200).json({ screenshot });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
};
