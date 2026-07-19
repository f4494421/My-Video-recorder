let createCanvas;
try {
    ({ createCanvas } = require('canvas'));
} catch (e) {
    console.error('缺少 canvas 模块，无法生成图标。');
    console.error('');
    console.error('安装方法（二选一）：');
    console.error('  1. npm install --save-dev canvas');
    console.error('     （需要 Visual Studio 2022 + "Desktop development with C++" 工作负载）');
    console.error('  2. 使用在线工具手动生成 16/32/48/128 尺寸的 PNG 图标');
    console.error('');
    console.error('当前图标文件已存在，无需重新生成即可正常使用扩展。');
    process.exit(1);
}
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