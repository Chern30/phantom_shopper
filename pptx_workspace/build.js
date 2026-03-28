const pptxgen = require('pptxgenjs');
const path = require('path');
const html2pptx = require('C:/Users/goh_e/.claude/plugins/marketplaces/anthropic-agent-skills/skills/pptx/scripts/html2pptx');

async function build() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = 'Digital Mystery Shopper';
  pptx.author = 'Tinyfish Hackathon 2026';

  const slidesDir = path.join(__dirname, 'slides');
  const slides = [
    'slide01_title.html',
    'slide02_problem.html',
    'slide03_insight.html',
    'slide04_howit works.html',
    'slide05_personas.html',
    'slide06_liveview.html',
    'slide07_report.html',
    'slide08_insightcard.html',
    'slide09_bizmodel.html',
    'slide10_mvp.html',
  ];

  for (const slideFile of slides) {
    const filePath = path.join(slidesDir, slideFile);
    console.log(`Processing: ${slideFile}`);
    await html2pptx(filePath, pptx);
  }

  const outPath = 'C:/Users/goh_e/Documents/EC_GOH/Projects/tinyfishhackathon/digital_mystery_shopper.pptx';
  await pptx.writeFile({ fileName: outPath });
  console.log(`\nSaved to: ${outPath}`);
}

build().catch(err => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
