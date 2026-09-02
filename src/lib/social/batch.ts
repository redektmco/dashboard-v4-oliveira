// ============================================================
// Parser das legendas em lote (portado do protótipo).
//
//   [arte-01.jpg]
//   Legenda do primeiro post.
//
//   ---
//
//   [arte-02.png]
//   Legenda do segundo post.
//
// Regras:
//  - `[arquivo]` abre um bloco e casa a legenda com a arte de nome igual.
//  - `---` também separa blocos.
//  - Blocos sem `[arquivo]` casam com as artes restantes por ordem.
// ============================================================

export interface CaptionBlock {
  filename?: string;
  caption: string;
}

const HEADER_RE = /^\s*\[(.+?)\]\s*$/;
const SEP_RE = /^\s*-{3,}\s*$/;

export function parseBatchCaptions(input: string): CaptionBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: CaptionBlock[] = [];
  let current: CaptionBlock | null = null;

  const push = () => {
    if (current) {
      current.caption = current.caption.replace(/^\n+/, "").replace(/\n+$/, "");
      blocks.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const header = line.match(HEADER_RE);
    if (header) {
      push();
      current = { filename: header[1].trim(), caption: "" };
      continue;
    }
    if (SEP_RE.test(line)) {
      push();
      continue;
    }
    if (!current) current = { caption: "" };
    current.caption += (current.caption ? "\n" : "") + line;
  }
  push();

  return blocks.filter((b) => b.filename || b.caption.trim().length > 0);
}

/**
 * Casa os blocos de legenda com os nomes de arquivo enviados.
 * Blocos ligados por nome vencem; o resto preenche por ordem.
 */
export function matchCaptionsToFiles(
  blocks: CaptionBlock[],
  fileNames: string[],
): string[] {
  const result = new Array<string>(fileNames.length).fill("");
  const used = new Set<number>();

  const positional: CaptionBlock[] = [];
  for (const block of blocks) {
    if (block.filename) {
      const idx = fileNames.findIndex(
        (n, i) =>
          !used.has(i) &&
          (n === block.filename ||
            n.toLowerCase() === block.filename!.toLowerCase()),
      );
      if (idx >= 0) {
        result[idx] = block.caption;
        used.add(idx);
        continue;
      }
    }
    positional.push(block);
  }

  let p = 0;
  for (let i = 0; i < fileNames.length && p < positional.length; i++) {
    if (used.has(i)) continue;
    result[i] = positional[p].caption;
    p++;
  }

  return result;
}
