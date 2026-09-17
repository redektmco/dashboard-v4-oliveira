// ============================================================
// Gerador de QR Code — modo byte, correção de erro M, versões 1 a 10.
//
// Escrito à mão porque o único uso é o link de aprovação (uma URL curta)
// e um QR falso — desenho bonito que não lê — seria pior do que não ter
// QR nenhum: o cliente aponta a câmera e nada acontece.
//
// Versões 1..10 em nível M cobrem até 213 bytes, folga de sobra para
// "https://<host>/a/<token>". Acima disso `encodeQR` devolve null e a
// interface mostra só o link.
//
// Referência: ISO/IEC 18004. Etapas: dados -> blocos -> Reed-Solomon ->
// matriz -> máscara escolhida por penalidade.
// ============================================================

/** Matriz quadrada de módulos: true = escuro. */
export type QRMatrix = boolean[][];

// ----------------------------- GF(256) -----------------------------
// Polinômio primitivo 0x11D, gerador 2 — o que a especificação manda.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Polinômio gerador de grau `degree`, para os códigos de correção. */
function generator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let d = 0; d < degree; d++) {
    const next = new Uint8Array(poly.length + 1);
    for (let i = 0; i < poly.length; i++) {
      next[i] ^= poly[i];
      next[i + 1] ^= mul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

/** Resto da divisão dos dados pelo gerador = códigos de correção do bloco. */
function ecBytes(data: Uint8Array, count: number): Uint8Array {
  const gen = generator(count);
  const rem = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[count - 1] = 0;
    for (let i = 0; i < count; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

// -------------------- tabelas por versão (nível M) --------------------
// [códigos de correção por bloco, blocos do grupo 1, dados por bloco do
//  grupo 1, blocos do grupo 2, dados por bloco do grupo 2]
const EC_M: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

/** Centros dos padrões de alinhamento por versão (vazio na versão 1). */
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Informação de versão (18 bits, BCH) — só existe da versão 7 em diante. */
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

const dataCodewords = (v: number) => {
  const [, b1, d1, b2, d2] = EC_M[v];
  return b1 * d1 + b2 * d2;
};

// ------------------------------ bitstream ------------------------------
class Bits {
  private bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
  /** Fecha com terminador, alinha em byte e completa com 0xEC/0x11. */
  toBytes(capacityBytes: number): Uint8Array {
    const capacity = capacityBytes * 8;
    for (let i = 0; i < 4 && this.bits.length < capacity; i++) this.bits.push(0);
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    const out = new Uint8Array(capacityBytes);
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | this.bits[i + j];
      out[i / 8] = byte;
    }
    for (let i = this.bits.length / 8, pad = 0; i < capacityBytes; i++, pad++) {
      out[i] = pad % 2 === 0 ? 0xec : 0x11;
    }
    return out;
  }
}

// ------------------------------- matriz -------------------------------
type Grid = { size: number; mods: Int8Array; used: Uint8Array };

const at = (g: Grid, x: number, y: number) => g.mods[y * g.size + x] === 1;

function set(g: Grid, x: number, y: number, dark: boolean, reserve = true) {
  g.mods[y * g.size + x] = dark ? 1 : 0;
  if (reserve) g.used[y * g.size + x] = 1;
}

function finder(g: Grid, ox: number, oy: number) {
  // O padrão de busca é 7x7 mais um separador claro de um módulo em volta.
  for (let y = -1; y <= 7; y++) {
    for (let x = -1; x <= 7; x++) {
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= g.size || py >= g.size) continue;
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      set(g, px, py, x >= 0 && x <= 6 && y >= 0 && y <= 6 && (ring === 3 || ring <= 1));
    }
  }
}

function alignment(g: Grid, version: number) {
  const centers = ALIGN[version];
  for (const cy of centers) {
    for (const cx of centers) {
      // Os cantos onde já há padrão de busca ficam de fora.
      const corner =
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === g.size - 7) ||
        (cx === g.size - 7 && cy === 6);
      if (corner) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          set(g, cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
        }
      }
    }
  }
}

function skeleton(version: number): Grid {
  const size = 17 + 4 * version;
  const g: Grid = { size, mods: new Int8Array(size * size), used: new Uint8Array(size * size) };

  finder(g, 0, 0);
  finder(g, size - 7, 0);
  finder(g, 0, size - 7);
  alignment(g, version);

  // Linhas de tempo: alternam escuro/claro na linha e coluna 6.
  for (let i = 8; i < size - 8; i++) {
    set(g, i, 6, i % 2 === 0);
    set(g, 6, i, i % 2 === 0);
  }

  // Módulo sempre escuro, logo acima do padrão inferior esquerdo.
  set(g, 8, size - 8, true);

  // Áreas de formato: reservadas agora, preenchidas depois da máscara.
  for (let i = 0; i < 9; i++) {
    if (i !== 6) set(g, i, 8, false);
    if (i !== 6) set(g, 8, i, false);
  }
  for (let i = 0; i < 8; i++) {
    set(g, size - 1 - i, 8, false);
    if (i < 7) set(g, 8, size - 1 - i, false);
  }

  if (version >= 7) {
    const info = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
      const dark = ((info >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(g, a, b, dark);
      set(g, b, a, dark);
    }
  }
  return g;
}

/** Percorre a matriz em ziguezague, de baixo para cima, pulando a coluna 6. */
function placeData(g: Grid, bytes: Uint8Array) {
  let bit = 0;
  let upward = true;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // a coluna de tempo não recebe dados
    for (let step = 0; step < g.size; step++) {
      const y = upward ? g.size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (g.used[y * g.size + x]) continue;
        const byte = bytes[bit >> 3];
        const dark = byte !== undefined && ((byte >> (7 - (bit & 7))) & 1) === 1;
        set(g, x, y, dark, false);
        bit++;
      }
    }
    upward = !upward;
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Bits de formato: nível M (0b00) + máscara, BCH(15,5) e XOR 0x5412. */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function applyFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  const size = g.size;
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    // Cópia 1, em volta do padrão superior esquerdo.
    if (i < 6) set(g, 8, i, dark);
    else if (i === 6) set(g, 8, 7, dark);
    else if (i === 7) set(g, 8, 8, dark);
    else if (i === 8) set(g, 7, 8, dark);
    else set(g, 14 - i, 8, dark);
    // Cópia 2, repartida entre os outros dois cantos.
    if (i < 8) set(g, size - 1 - i, 8, dark);
    else set(g, 8, size - 15 + i, dark);
  }
}

/** Penalidade da máscara — quanto menor, mais fácil a câmera lê. */
function penalty(g: Grid): number {
  const n = g.size;
  let score = 0;

  // Regra 1: sequências de 5 ou mais módulos iguais, em linha e coluna.
  for (let i = 0; i < n; i++) {
    for (const row of [true, false]) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        const a = row ? at(g, j, i) : at(g, i, j);
        const b = row ? at(g, j - 1, i) : at(g, i, j - 1);
        if (a === b) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Regra 2: blocos 2x2 de uma cor só.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = at(g, x, y);
      if (v === at(g, x + 1, y) && v === at(g, x, y + 1) && v === at(g, x + 1, y + 1)) score += 3;
    }
  }

  // Regra 3: o padrão 1:1:3:1:1 com 4 claros de um lado — imita o finder.
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x <= n - 11; x++) {
      const hit = (get: (k: number) => boolean, pat: boolean[]) => pat.every((p, k) => get(k) === p);
      if (hit((k) => at(g, x + k, y), A) || hit((k) => at(g, x + k, y), B)) score += 40;
      if (hit((k) => at(g, y, x + k), A) || hit((k) => at(g, y, x + k), B)) score += 40;
    }
  }

  // Regra 4: desequilíbrio entre módulos claros e escuros.
  let dark = 0;
  for (let i = 0; i < n * n; i++) if (g.mods[i] === 1) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;

  return score;
}

/**
 * Codifica `text` num QR nível M. Devolve a matriz de módulos, ou null se o
 * texto não couber na versão 10 (213 bytes) — aí a interface mostra só o link.
 */
export function encodeQR(text: string): QRMatrix | null {
  const data = new TextEncoder().encode(text);

  // Menor versão que comporta o conteúdo mais o cabeçalho.
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const header = 4 + (v >= 10 ? 16 : 8);
    if (dataCodewords(v) * 8 >= header + data.length * 8) {
      version = v;
      break;
    }
  }
  if (!version) return null;

  const bits = new Bits();
  bits.push(0b0100, 4); // modo byte
  bits.push(data.length, version >= 10 ? 16 : 8);
  for (const b of data) bits.push(b, 8);
  const payload = bits.toBytes(dataCodewords(version));

  // Reparte em blocos, calcula a correção de cada um e intercala — é assim
  // que um borrão no papel atinge poucos bytes de cada bloco, não um inteiro.
  const [ecLen, b1, d1, b2, d2] = EC_M[version];
  const blocks: Uint8Array[] = [];
  const ecs: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const len = i < b1 ? d1 : d2;
    const block = payload.slice(offset, offset + len);
    offset += len;
    blocks.push(block);
    ecs.push(ecBytes(block, ecLen));
  }

  const interleaved: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) {
    for (const block of blocks) if (i < block.length) interleaved.push(block[i]);
  }
  for (let i = 0; i < ecLen; i++) for (const ec of ecs) interleaved.push(ec[i]);

  // Testa as oito máscaras e fica com a de menor penalidade.
  const base = skeleton(version);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g: Grid = { size: base.size, mods: base.mods.slice(), used: base.used.slice() };
    placeData(g, new Uint8Array(interleaved));
    for (let y = 0; y < g.size; y++) {
      for (let x = 0; x < g.size; x++) {
        if (!g.used[y * g.size + x] && MASKS[m](x, y)) g.mods[y * g.size + x] ^= 1;
      }
    }
    applyFormat(g, m);
    const score = penalty(g);
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  }
  if (!best) return null;

  const out: QRMatrix = [];
  for (let y = 0; y < best.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < best.size; x++) row.push(at(best, x, y));
    out.push(row);
  }
  return out;
}

/**
 * QR como um único `<path>` SVG (um retângulo por módulo escuro). Uma string,
 * sem componente por módulo: a versão 10 tem 3.249 módulos.
 */
export function qrPath(m: QRMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join("");
}
