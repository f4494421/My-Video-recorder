<<<<<<< HEAD
const sharp = require('sharp');
const fs = require('fs');

const icons = [
    { svg: 'icon_record.svg', prefix: 'icon_record' },
    { svg: 'icon_stop.svg', prefix: 'icon_stop' }
];
const sizes = [16, 32, 48, 128];

icons.forEach(icon => {
    const svgContent = fs.readFileSync(icon.svg, 'utf8');
    sizes.forEach(size => {
        sharp(Buffer.from(svgContent), { density: 300 })
            .resize(size, size)
            .png()
            .toFile(`${icon.prefix}_${size}.png`, (err, info) => {
                if (err) console.error(err);
                else console.log(`生成: ${icon.prefix}_${size}.png`);
            });
    });
});
=======
const sharp = require('sharp');
const fs = require('fs');

const icons = [
    { svg: 'icon_record.svg', prefix: 'icon_record' },
    { svg: 'icon_stop.svg', prefix: 'icon_stop' }
];
const sizes = [16, 32, 48, 128];

icons.forEach(icon => {
    const svgContent = fs.readFileSync(icon.svg, 'utf8');
    sizes.forEach(size => {
        sharp(Buffer.from(svgContent), { density: 300 })
            .resize(size, size)
            .png()
            .toFile(`${icon.prefix}_${size}.png`, (err, info) => {
                if (err) console.error(err);
                else console.log(`生成: ${icon.prefix}_${size}.png`);
            });
    });
});
>>>>>>> 669925d6fb0d7266ef8efb808c602034706c14d8
