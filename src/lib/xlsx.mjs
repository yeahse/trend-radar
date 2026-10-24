import zlib from 'node:zlib';

/** 외부 의존성 없는 최소 XLSX(ZIP) 리더 — 네이버 데이터랩 CSV 다운로드용 */
function findEOCD(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readCentralDirectory(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('EOCD not found (not a zip?)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    entries.set(name, { method, compSize, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf, entry) {
  const lo = entry.localOff;
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  return entry.method === 8 ? zlib.inflateRawSync(raw) : raw;
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

function colToIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** xlsx 바이트 → { sheetName: rows[][] } */
export function parseXlsx(buffer) {
  const entries = readCentralDirectory(buffer);

  const shared = [];
  if (entries.has('xl/sharedStrings.xml')) {
    const xml = readEntry(buffer, entries.get('xl/sharedStrings.xml')).toString('utf8');
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) {
      const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]));
      shared.push(texts.join(''));
    }
  }

  const sheets = {};
  for (const [name, entry] of entries.entries()) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const xml = readEntry(buffer, entry).toString('utf8');
    const rows = [];
    const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const cells = [];
      const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>/g;
      let cm;
      while ((cm = cellRe.exec(rm[1]))) {
        const attrs = cm[1];
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
        const t = (attrs.match(/t="([^"]+)"/) || [])[1];
        const vRaw = (cm[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        const isRaw = (cm[2].match(/<is>([\s\S]*?)<\/is>/) || [])[1];
        let val = '';
        if (t === 's' && vRaw !== undefined) val = shared[Number(vRaw)] ?? '';
        else if (isRaw) val = decodeXml([...isRaw.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (vRaw !== undefined) val = decodeXml(vRaw);
        const idx = ref ? colToIndex(ref) : cells.length;
        cells[idx] = val;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
      rows.push(cells);
    }
    sheets[name] = rows;
  }
  return sheets;
}

/** xlsx → 간단 2차원 배열 (첫 시트 기준) */
export function xlsxToRows(buffer) {
  const sheets = parseXlsx(buffer);
  const first = Object.keys(sheets)[0];
  return first ? sheets[first] : [];
}
