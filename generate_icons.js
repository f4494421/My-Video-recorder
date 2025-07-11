<<<<<<< HEAD
const { createCanvas } = require('canvas');
const fs = require('fs');

function drawCircle(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.45, 0, 2 * Math.PI);
    ctx.fillStyle = '#e53935';
    ctx.fill();
    fs.writeFileSync(filename, canvas.toBuffer('image/png'));
}

function drawSquare(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#e53935';
    const margin = size * 0.1;
    ctx.fillRect(margin, margin, size - margin * 2, size - margin * 2);
    fs.writeFileSync(filename, canvas.toBuffer('image/png'));
}

[16, 32, 48, 128].forEach(size => {
    drawCircle(size, `icon_record_${size}.png`);
    drawSquare(size, `icon_stop_${size}.png`);
});

=======
const { createCanvas } = require('canvas');
const fs = require('fs');

function drawCircle(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.45, 0, 2 * Math.PI);
    ctx.fillStyle = '#e53935';
    ctx.fill();
    fs.writeFileSync(filename, canvas.toBuffer('image/png'));
}

function drawSquare(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#e53935';
    const margin = size * 0.1;
    ctx.fillRect(margin, margin, size - margin * 2, size - margin * 2);
    fs.writeFileSync(filename, canvas.toBuffer('image/png'));
}

[16, 32, 48, 128].forEach(size => {
    drawCircle(size, `icon_record_${size}.png`);
    drawSquare(size, `icon_stop_${size}.png`);
});

>>>>>>> 669925d6fb0d7266ef8efb808c602034706c14d8
console.log('红色圆/方块图标已生成！');