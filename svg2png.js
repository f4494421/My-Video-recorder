const sharp = require('sharp');
const fs = require('fs');

const icons = [
    { svg: 'icon_record.svg', prefix: 'icon_record' },
    { svg: 'icon_stop.svg', prefix: 'icon_stop' }
];
const sizes = [16, 32, 48, 128];

icons.forEach(icon => {
    let svgContent;
    try {
        svgContent = fs.readFileSync(icon.svg, 'utf8');
    } catch (e) {
        console.error('读取SVG失败:', icon.svg, e);
        return;
    }
    sizes.forEach(size => {
        sharp(Buffer.from(svgContent), { density: 300 })
            .resize(size, size)
            .png()
            .toFile(`${icon.prefix}_${size}.png`, (err, info) => {
                if (err) console.error('生成PNG失败:', `${icon.prefix}_${size}.png`, err);
                else console.log(`生成: ${icon.prefix}_${size}.png`);
            });
    });
});
