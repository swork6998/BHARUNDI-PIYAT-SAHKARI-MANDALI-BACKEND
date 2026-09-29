const fs = require('fs');

const buf = fs.readFileSync('frontend/public/fonts/OFFSYM-N.TTF');

// TTF format:
// 4 bytes: sfnt version (0x00010000)
// 2 bytes: numTables
const numTables = buf.readUInt16BE(4);
console.log('numTables:', numTables);

let postOffset = 0, postLength = 0;
let cmapOffset = 0, cmapLength = 0;

for (let i = 0; i < numTables; i++) {
    const tag = buf.toString('ascii', 12 + i * 16, 12 + i * 16 + 4);
    const offset = buf.readUInt32BE(12 + i * 16 + 8);
    const length = buf.readUInt32BE(12 + i * 16 + 12);
    if (tag === 'post') {
        postOffset = offset;
        postLength = length;
    }
    if (tag === 'cmap') {
        cmapOffset = offset;
        cmapLength = length;
    }
}

console.log('post table:', { postOffset, postLength });
console.log('cmap table:', { cmapOffset, cmapLength });

if (postOffset > 0) {
    const format = buf.readUInt32BE(postOffset);
    console.log('post format:', '0x' + format.toString(16));
    if (format === 0x00020000) {
        const numGlyphs = buf.readUInt16BE(postOffset + 32);
        console.log('numGlyphs in post:', numGlyphs);
        const glyphNameIndex = [];
        let p = postOffset + 34;
        for (let i = 0; i < numGlyphs; i++) {
            glyphNameIndex.push(buf.readUInt16BE(p));
            p += 2;
        }
        const pascalStrings = [];
        while (p < postOffset + postLength) {
            const len = buf.readUInt8(p);
            p++;
            pascalStrings.push(buf.toString('ascii', p, p + len));
            p += len;
        }
        console.log('Total custom glyph names:', pascalStrings.length);
        console.log('First 50 custom glyph names:', pascalStrings.slice(0, 50));
    }
}
