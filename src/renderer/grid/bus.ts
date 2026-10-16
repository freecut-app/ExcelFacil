// Canal simples para outras partes da interface conversarem com a grade.
export const gridBus = {
  ensureVisible: (_r: number, _c: number) => {},
  resetScroll: () => {},
  redraw: () => {},
  /** Substitui o texto do editor de célula (usado pela barra de fórmulas e pelo modo de apontar). */
  setEditorText: (_text: string, _caret?: number) => {},
  /** Coordenadas (na tela) de uma célula, para posicionar janelinhas. */
  cellScreenRect: (_r: number, _c: number): DOMRect | null => null,
};
