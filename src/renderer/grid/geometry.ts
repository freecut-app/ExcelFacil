// Posições acumuladas de linhas e colunas (para achar a célula sob o mouse e o que é visível).

export class Axis {
  readonly offsets: Float64Array;
  constructor(
    readonly count: number,
    size: (i: number) => number,
  ) {
    this.offsets = new Float64Array(count + 1);
    let acc = 0;
    for (let i = 0; i < count; i++) {
      this.offsets[i] = acc;
      acc += size(i);
    }
    this.offsets[count] = acc;
  }
  pos(i: number): number {
    return this.offsets[Math.max(0, Math.min(i, this.count))];
  }
  size(i: number): number {
    return this.offsets[i + 1] - this.offsets[i];
  }
  get total(): number {
    return this.offsets[this.count];
  }
  /** Índice cuja faixa contém `px` (busca binária). */
  indexAt(px: number): number {
    if (px <= 0) return 0;
    if (px >= this.total) return this.count - 1;
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= px) lo = mid;
      else hi = mid - 1;
    }
    // Pula itens de tamanho zero (linhas ocultas).
    while (lo < this.count - 1 && this.size(lo) === 0) lo++;
    return lo;
  }
}
