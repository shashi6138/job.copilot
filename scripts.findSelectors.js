const { chromium } = require('playwright');

async function inspectSource(source) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const urls = {
    hirist: 'https://www.hirist.tech/k/technical-support-engineer-jobs-1',
    shine: 'https://www.shine.com/job-search/technical-support-engineer-jobs-in-india',
    foundit: 'https://www.foundit.in/srp/results?query=technical+support+engineer&location=India',
    wellfound: 'https://wellfound.com/jobs?q=technical%20support&l=India&remote=true',
    instahyre: 'https://www.instahyre.com/jobs/?designation=Support+Engineer&location=India'
  };
  
  await page.goto(urls[source], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Extract all elements that might be job cards
  const jobCards = await page.evaluate(() => {
    const candidates = document.querySelectorAll('[class*="job"], [class*="Job"], [class*="card"], [data-job-id], li, div');
    const samples = [];
    for (let i = 0; i < Math.min(candidates.length, 50); i++) {
      const el = candidates[i];
      if (el.innerText && el.innerText.length > 20 && el.innerText.includes('support')) {
        samples.push({
          html: el.outerHTML.slice(0, 500),
          class: el.className,
          tag: el.tagName
        });
      }
    }
    return samples;
  });
  
  console.log(`Found ${jobCards.length} candidate job cards for ${source}:`);
  jobCards.forEach((c, i) => {
    console.log(`\n--- Candidate ${i+1} ---`);
    console.log(`Class: ${c.class}`);
    console.log(`Tag: ${c.tag}`);
    console.log(`HTML snippet: ${c.html}`);
  });
  
  await browser.close();
}

const source = process.argv[2];
if (!source) console.error('Usage: node findSelectors.js <hirist|shine|foundit|wellfound|instahyre>');
else inspectSource(source);