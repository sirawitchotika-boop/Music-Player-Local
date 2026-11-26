const sharp = require('sharp');
sharp('icon.svg').resize(512, 512).png().toFile('icon.png')
  .then(() => console.log('Generated icon.png successfully.'))
  .catch(err => { console.error(err); process.exit(1); });
