#!/usr/bin/env node
// 商品画像の解像度・余白・重複を監査する補助ツール。
// 画像自体は変更せず、CSS表示時に粗くなる可能性がある素材を絞り込む。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('C:/Users/akama/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const root = __dirname;
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf8')).items;
const pages = JSON.parse(fs.readFileSync(path.join(root, 'data/pages.json'), 'utf8')).flyers;
const flyerByName = new Map(pages.map(f => [f.name, f]));

function targetPhotoHeight(item) {
  return flyerByName.get(item.flier)?.tokens?.photoHeight || 200;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

async function inspect(item) {
  const file = path.join(root, item.image.replace(/^\.\//, ''));
  const input = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const metadata = await sharp(input).metadata();
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const samples = [];
  const edge = Math.max(1, Math.min(10, Math.floor(Math.min(info.width, info.height) / 8)));
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x >= edge && x < info.width - edge && y >= edge && y < info.height - edge) continue;
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 230) samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const bg = [0, 1, 2].map(c => percentile(samples.map(v => v[c]), 0.5) ?? 255);
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const a = data[i + 3];
      if (a < 20) continue;
      const diff = Math.max(
        Math.abs(data[i] - bg[0]),
        Math.abs(data[i + 1] - bg[1]),
        Math.abs(data[i + 2] - bg[2]),
      );
      if (diff < 20) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const fgW = maxX >= minX ? maxX - minX + 1 : info.width;
  const fgH = maxY >= minY ? maxY - minY + 1 : info.height;
  const widthOccupancy = fgW / info.width;
  const heightOccupancy = fgH / info.height;
  const targetW = 340;
  const targetH = targetPhotoHeight(item);
  const displayScale = Math.min(targetW / metadata.width, targetH / metadata.height);
  return {
    id: item.id,
    maker: item.maker,
    name: item.name,
    image: item.image,
    bytes: input.length,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    widthOccupancy,
    heightOccupancy,
    displayScale,
    hash,
  };
}

(async () => {
  const rows = [];
  for (const item of products) rows.push(await inspect(item));

  const duplicateGroups = new Map();
  for (const row of rows) {
    const group = duplicateGroups.get(row.hash) || [];
    group.push(row);
    duplicateGroups.set(row.hash, group);
  }

  // object-fit: contain の実表示倍率で判定する。縦長・横長の画像は片側が180px未満でも
  // 短辺方向に拡大されるとは限らないため、幅・高さ単独では低解像度扱いにしない。
  const lowResolution = rows
    .filter(r => r.displayScale > 1.35)
    .sort((a, b) => b.displayScale - a.displayScale);
  const excessiveWhitespace = rows
    .filter(r => r.widthOccupancy < 0.52 || r.heightOccupancy < 0.52)
    .sort((a, b) => Math.min(a.widthOccupancy, a.heightOccupancy) - Math.min(b.widthOccupancy, b.heightOccupancy));
  const duplicates = [...duplicateGroups.values()].filter(group => group.length > 1);

  const summary = {
    images: rows.length,
    minWidth: Math.min(...rows.map(r => r.width)),
    minHeight: Math.min(...rows.map(r => r.height)),
    p10Width: percentile(rows.map(r => r.width), 0.1),
    p10Height: percentile(rows.map(r => r.height), 0.1),
    lowResolution: lowResolution.length,
    excessiveWhitespace: excessiveWhitespace.length,
    duplicateGroups: duplicates.length,
  };
  if (process.argv.includes('--compact')) {
    const makers = [...new Set(rows.map(r => r.maker))].map(maker => {
      const own = rows.filter(r => r.maker === maker);
      return {
        maker,
        images: own.length,
        uniqueImages: new Set(own.map(r => r.hash)).size,
        lowResolution: own.filter(r => lowResolution.includes(r)).length,
        excessiveWhitespace: own.filter(r => excessiveWhitespace.includes(r)).length,
      };
    });
    const suspiciousDuplicates = duplicates
      .filter(group => new Set(group.map(r => r.name)).size > 1)
      .map(group => ({
        products: group.length,
        names: [...new Set(group.map(r => r.name))],
        ids: group.map(r => r.id),
        images: group.map(r => r.image),
      }));
    console.log(JSON.stringify({
      summary,
      makers,
      worstLowResolution: lowResolution.slice(0, 25),
      worstWhitespace: excessiveWhitespace.slice(0, 25),
      suspiciousDuplicates,
    }, null, 2));
  } else {
    console.log(JSON.stringify({ summary, lowResolution, excessiveWhitespace, duplicates }, null, 2));
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
