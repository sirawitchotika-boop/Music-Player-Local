// Applies an obvious TEST badge only to the generated, disposable app icon.
// The original icon.svg and production build remain unchanged.
const sharp = require('sharp');
const { renameSync } = require('node:fs');
const badge = Buffer.from('<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="392" width="512" height="120" fill="#D92A2A"/><text x="256" y="474" fill="#FFFFFF" font-family="sans-serif" font-weight="bold" font-size="88" text-anchor="middle">TEST</text></svg>');
sharp('icon.png')
  .composite([{ input: badge }])
  .png()
  .toFile('gate1-icon.png')
  .then(() => { renameSync('gate1-icon.png', 'icon.png'); console.log('Added Gate 1 TEST badge to generated icon'); })
  .catch(error => { console.error(error); process.exitCode = 1; });
