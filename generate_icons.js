const { createCanvas } = require('canvas');
const fs = require('fs');

const drawCircle = (size, filename) => {
    try {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.45, 0, 2 * Math.PI);
        ctx.fillStyle = '#e53935';
        ctx.fill();
        fs.writeFileSync(filename, canvas.toBuffer('image/png'));
    } catch (e) {
        console.error('生成圆形图标失败:', filename, e);
    }
};

const drawSquare = (size, filename) => {
    try {
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#e53935';
        const margin = size * 0.1;
        ctx.fillRect(margin, margin, size - margin * 2, size - margin * 2);
        fs.writeFileSync(filename, canvas.toBuffer('image/png'));
    } catch (e) {
        console.error('生成方形图标失败:', filename, e);
    }
};

[16, 32, 48, 128].forEach(size => {
    drawCircle(size, `icon_record_${size}.png`);
    drawSquare(size, `icon_stop_${size}.png`);
});

console.log('红色圆/方块图标已生成！');