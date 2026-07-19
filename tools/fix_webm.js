#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function usage() {
    console.log('Usage: node tools/fix_webm.js <file-or-directory>');
    process.exit(1);
}

if (process.argv.length < 3) usage();

const target = process.argv[2];
if (!fs.existsSync(target)) {
    console.error('路径不存在：', target);
    process.exit(2);
}

function findFiles(p) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
        return fs.readdirSync(p).flatMap(f => findFiles(path.join(p, f)));
    }
    return [p];
}

const files = fs.statSync(target).isDirectory() ? findFiles(target) : [target];
const webmFiles = files.filter(f => f.toLowerCase().endsWith('.webm'));
if (webmFiles.length === 0) {
    console.log('未找到 .webm 文件');
    process.exit(0);
}

function checkFfmpeg() {
    const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    return r.status === 0;
}

function getAvailableEncoders() {
    const r = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8' });
    const output = (r.stdout || '') + (r.stderr || '');
    const hasLibvpx = /libvpx\b/i.test(output);
    const hasLibvorbis = /libvorbis\b/i.test(output);
    const hasLibx264 = /libx264\b/i.test(output);
    const hasAac = /\baac\b/i.test(output);
    return { hasLibvpx, hasLibvorbis, hasLibx264, hasAac };
}

const hasFfmpeg = checkFfmpeg();
if (!hasFfmpeg) {
    console.error('未检测到 ffmpeg。请先安装 ffmpeg，然后重试。');
    console.error('Windows: https://ffmpeg.org/download.html 或使用 choco/scoop 安装');
    process.exit(3);
}

const encoders = getAvailableEncoders();

for (const file of webmFiles) {
    const dir = path.dirname(file);
    const base = path.basename(file, '.webm');
    const out = path.join(dir, base + '.fixed.webm');

    console.log(`修复: ${file} -> ${out}`);

    // 首先尝试直接拷贝容器头，通常可以修复损坏的索引/头
    const args = ['-y', '-err_detect', 'ignore_err', '-i', file, '-c', 'copy', out];
    const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
    if (r.status !== 0) {
        console.warn(`直接拷贝失败，尝试重编码：${file}`);

        let videoCodec, audioCodec, ext;
        if (encoders.hasLibvpx && encoders.hasLibvorbis) {
            videoCodec = 'libvpx';
            audioCodec = 'libvorbis';
            ext = '.reencode.webm';
        } else if (encoders.hasLibx264 && encoders.hasAac) {
            videoCodec = 'libx264';
            audioCodec = 'aac';
            ext = '.reencode.mp4';
            console.warn('未检测到 libvpx/libvorbis，回退到 H.264/AAC (MP4)');
        } else {
            console.error('未找到可用的视频编码器（需要 libvpx 或 libx264）。无法重编码。');
            continue;
        }

        const out2 = path.join(dir, base + ext);
        const args2 = ['-y', '-i', file, '-c:v', videoCodec, '-b:v', '1M', '-c:a', audioCodec, out2];
        const r2 = spawnSync('ffmpeg', args2, { stdio: 'inherit' });
        if (r2.status !== 0) {
            console.error(`尝试修复失败：${file}`);
        } else {
            console.log(`已生成重编码文件：${out2}`);
        }
    } else {
        console.log(`已生成修复文件：${out}`);
    }
}