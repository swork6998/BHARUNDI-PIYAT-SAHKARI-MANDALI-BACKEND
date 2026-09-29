const fs = require('fs');

const buf = fs.readFileSync('frontend/public/fonts/OFFSYM-N.TTF');

const numTables = buf.readUInt16BE(4);
let cmapOffset = 0, cmapLength = 0;
let postOffset = 0, postLength = 0;

for (let i = 0; i < numTables; i++) {
    const tag = buf.toString('ascii', 12 + i * 16, 12 + i * 16 + 4);
    const offset = buf.readUInt32BE(12 + i * 16 + 8);
    const length = buf.readUInt32BE(12 + i * 16 + 12);
    if (tag === 'cmap') { cmapOffset = offset; cmapLength = length; }
    if (tag === 'post') { postOffset = offset; postLength = length; }
}

// Read glyph names from post table (format 2.0)
const numGlyphs = buf.readUInt16BE(postOffset + 32);
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

const standardMacNames = [
  ".notdef",".null","nonmarkingreturn","space","exclam","quotedbl","numbersign","dollar","percent","ampersand","quotesingle",
  "parenleft","parenright","asterisk","plus","comma","hyphen","period","slash","zero","one","two","three","four","five","six",
  "seven","eight","nine","colon","semicolon","less","equal","greater","question","at","A","B","C","D","E","F","G","H","I","J",
  "K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","bracketleft","backslash","bracketright","asciicircum",
  "underscore","grave","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z"
];

function getGlyphName(gid) {
    const idx = glyphNameIndex[gid];
    if (idx < 258) return standardMacNames[idx] || ('mac_' + idx);
    return pascalStrings[idx - 258] || ('custom_' + idx);
}

// Read cmap table
const numSubtables = buf.readUInt16BE(cmapOffset + 2);
console.log('cmap subtables:', numSubtables);

for (let i = 0; i < numSubtables; i++) {
    const platformId = buf.readUInt16BE(cmapOffset + 4 + i * 8);
    const encodingId = buf.readUInt16BE(cmapOffset + 4 + i * 8 + 2);
    const subtableOffset = cmapOffset + buf.readUInt32BE(cmapOffset + 4 + i * 8 + 4);
    const format = buf.readUInt16BE(subtableOffset);
    console.log(`Subtable ${i}: platform=${platformId}, encoding=${encodingId}, format=${format}`);

    if (format === 0) {
        // byte encoding
        for (let c = 32; c < 256; c++) {
            const gid = buf.readUInt8(subtableOffset + 6 + c);
            if (gid > 0) {
                console.log(`Byte 0x${c.toString(16).toUpperCase()} (${c}): GID ${gid} -> ${getGlyphName(gid)}`);
            }
        }
    } else if (format === 4) {
        // Format 4
        const segCountX2 = buf.readUInt16BE(subtableOffset + 6);
        const segCount = segCountX2 / 2;
        const endCodes = [];
        let cp = subtableOffset + 14;
        for (let s = 0; s < segCount; s++) { endCodes.push(buf.readUInt16BE(cp)); cp += 2; }
        cp += 2; // reservedPad
        const startCodes = [];
        for (let s = 0; s < segCount; s++) { startCodes.push(buf.readUInt16BE(cp)); cp += 2; }
        const idDeltas = [];
        for (let s = 0; s < segCount; s++) { idDeltas.push(buf.readInt16BE(cp)); cp += 2; }
        const idRangeOffsets = [];
        const rangeOffsetBase = cp;
        for (let s = 0; s < segCount; s++) { idRangeOffsets.push(buf.readUInt16BE(cp)); cp += 2; }

        for (let s = 0; s < segCount; s++) {
            for (let code = startCodes[s]; code <= endCodes[s]; code++) {
                if (code === 0xFFFF) break;
                let gid = 0;
                if (idRangeOffsets[s] === 0) {
                    gid = (code + idDeltas[s]) & 0xFFFF;
                } else {
                    const ro = idRangeOffsets[s];
                    const pGid = (rangeOffsetBase + s * 2) + ro + (code - startCodes[s]) * 2;
                    gid = buf.readUInt16BE(pGid);
                    if (gid !== 0) gid = (gid + idDeltas[s]) & 0xFFFF;
                }
                if (gid > 0) {
                    console.log(`Char 0x${code.toString(16).toUpperCase()} (${code}): GID ${gid} -> ${getGlyphName(gid)}`);
                }
            }
        }
    }
}
