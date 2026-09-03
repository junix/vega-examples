'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'index.html');
const output = path.join(root, 'gallery.html');
const stylesheet = fs.readFileSync(path.join(root, 'assets', 'demo.css'), 'utf8');
const thumbnails = Object.fromEntries(
  fs.readdirSync(path.join(root, 'thumbs'))
    .filter(name => name.endsWith('.png'))
    .sort()
    .map(name => [name.slice(0, -4), `data:image/png;base64,${fs.readFileSync(path.join(root, 'thumbs', name)).toString('base64')}`])
);
let generated = fs.readFileSync(source, 'utf8').replace(
  '<!doctype html>',
  '<!doctype html>\n<!-- Generated from index.html by tools/build-gallery.cjs. -->'
);
generated = generated
  .replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Generated from index.html by tools/build-gallery.cjs. -->')
  .replace('<link rel="stylesheet" href="./assets/demo.css">', `<style>\n${stylesheet}\n</style>`)
  .replace('<script>\nvar GROUPS', `<script>\nvar GALLERY_THUMBS = ${JSON.stringify(thumbnails)};\nvar GROUPS`)
  .replace("img.src = './thumbs/' + slug + '.png';", 'img.src = GALLERY_THUMBS[slug];');

if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== generated) {
    console.error('stale gallery.html: run node tools/build-gallery.cjs');
    process.exit(1);
  }
  console.log('verified gallery.html mirrors the offline Vega catalog');
} else {
  fs.writeFileSync(output, generated);
  console.log('wrote gallery.html from the offline Vega catalog');
}
