"use strict";
const assert = require("assert");
const fs = require("fs");
const { buildPdfFromJpegBytes } = require("../sld-editor.js");
const { buildStoreZip, crc32, stringCsv, bomCsv } = require("../results-ui.js");

const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0xff,0xd9]);
const pdf = buildPdfFromJpegBytes(jpeg, 16, 9);
const pdfText = Buffer.from(pdf).toString("latin1");
assert(pdfText.startsWith("%PDF-1.4"));
assert(pdfText.includes("/Subtype /Image"));
assert(pdfText.includes("xref\n"));
assert(pdfText.endsWith("%%EOF\n"));
assert(Buffer.from(pdf).includes(Buffer.from(jpeg)), "PDF must embed rasterized SLD image bytes");

const entries = [
  { name: "manifest.json", data: JSON.stringify({ packVersion: "2.2.0", sourceFingerprint: "source-test" }) },
  { name: "E-401_Single_Line_Diagram.svg", data: "<svg><text>E-401 PRELIMINARY</text></svg>" },
  { name: "README.txt", data: "PRELIMINARY - NOT FOR CONSTRUCTION" }
];
const zip = buildStoreZip(entries);
assert.strictEqual(zip[0], 0x50);
assert.strictEqual(zip[1], 0x4b);
assert.strictEqual(zip[2], 0x03);
assert.strictEqual(zip[3], 0x04);
assert(Buffer.from(zip).includes(Buffer.from("manifest.json")));
assert(Buffer.from(zip).includes(Buffer.from("E-401_Single_Line_Diagram.svg")));
assert.strictEqual(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "CRC32 must match standard test vector");
fs.writeFileSync("/tmp/solar-v22-pack-test.zip", Buffer.from(zip));

const model = {
  strings: [{id:"STR-01",subArrayId:"SA-01",moduleCount:18,inverterNumber:1,mpptNumber:1,inputNumber:1,status:"pass"}],
  bom: [{category:"Module",item:"MOD-X",qty:18,unit:"ea",notes:"verified"}]
};
assert(stringCsv(model).includes("STR-01"));
assert(bomCsv(model).includes("MOD-X"));
console.log(`v2.2 export helpers: PASS (${pdf.length} PDF bytes, ${zip.length} ZIP bytes)`);
