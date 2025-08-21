const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

async function checkSmallImageAvailable(workid) {
    const imageDir = path.join(__dirname, '..', 'stockroom', 'artworks', workid);
    const imageFile = path.join(imageDir, '1');
    const smallImageFile = path.join(imageDir, 'SMALL');
    if (!fs.existsSync(smallImageFile)) return false;
    const stats = fs.statSync(imageFile);
    const smallStats = fs.statSync(smallImageFile);
    if (stats.mtimeMs > smallStats.mtimeMs) return false;
    return true;
}
async function generateSmallImage(workid) {
    const imageDir = path.join(__dirname, '..', 'stockroom', 'artworks', workid);
    const imageFile = path.join(imageDir, '1');
    const smallImageFile = path.join(imageDir, 'SMALL');
    await sharp(imageFile).resize({
        width: 350,
        height: null,
        fit: 'inside',
        withoutEnlargement: true
    }).webp().toFile(smallImageFile);
}

const lrucache = require('lru-cache');
const bufferCache = new lrucache.LRUCache({ max: 8192, maxAge: 1000 * 60 * 60 });

function getSmallImageBuffer(workid) {
    if (bufferCache.has(workid)) {
        return bufferCache.get(workid);
    }
    const imageFile = path.join(__dirname, '..', 'stockroom', 'artworks', workid, 'SMALL');
    const buffer = fs.readFileSync(imageFile);
    bufferCache.set(workid, buffer);
    return buffer;
}

module.exports = {
    checkSmallImageAvailable,
    generateSmallImage,
    getSmallImageBuffer
};