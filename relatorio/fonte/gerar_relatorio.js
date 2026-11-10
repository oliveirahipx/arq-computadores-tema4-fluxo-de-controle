/* Gera o Relatório Técnico-Acadêmico (ABNT) do Tema 4 em .docx.
 * Uso: node gerar_relatorio.js <raiz_do_trabalho> <saida.docx>
 * Todos os números citados vêm de poc/resultados/resultados.json.
 */
const fs = require("fs");
const path = require("path");
const D = require("docx");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType,
  HeadingLevel, WidthType, BorderStyle, ShadingType, Header, PageNumber, TableOfContents,
  SequentialIdentifier, LevelFormat, PageBreak, TabStopType, VerticalAlign,
} = D;

const ROOT = process.argv[2];
const OUT = process.argv[3];
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "poc/resultados/resultados.json"), "utf8"));
const FIG = (f) => path.join(ROOT, "relatorio/figuras", f);
const ASM = fs.readFileSync(path.join(ROOT, "poc/fatorial_completo_tema4.s"), "utf8").split(/\r?\n/);
const ASM_IT = fs.readFileSync(path.join(ROOT, "poc/fatorial_iterativo.asm"), "utf8").split(/\r?\n/);
const ASM_ERR = fs.readFileSync(path.join(ROOT, "poc/erros_comuns.asm"), "utf8").split(/\r?\n/);
const TRACE = fs.readFileSync(path.join(ROOT, "poc/resultados/trace_programa.csv"), "utf8")
  .split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(";"));

const FONT = "Arial";
const MONO = "Consolas";
const W = 9071; // largura útil (A4 com margens 3/2 cm), em DXA
const NAVY = "0B2545";
const HL = "yellow";

// ---------------------------------------------------------------- utilidades
const M = R.execucao_completa.metricas;
const L = R.labels;
const LST = R.listagem;
const at = (src, k = 0) => LST.filter((l) => l.fonte === src)[k].end;
const hex8 = (n) => "0x" + n.toString(16).padStart(8, "0");
const plus4 = (h) => hex8(parseInt(h, 16) + 4);
const BGE_W = at("bge a0, zero, fim_while");
const J_W = at("j laco_while");
const J_W_BAS = LST.find((l) => l.end === J_W).basica.replace("zero", "x0").replace("-", "−");
const JAL_MAIN = at("jal ra, fatorial", 0);
const JAL_REC = at("jal ra, fatorial", 1);
const RET_REC = plus4(JAL_REC);
const C = Object.fromEntries(R.comparacao.map((r) => [r.n, r]));
const fmt = (n) => n.toLocaleString("pt-BR");
const pct = (a, b) => (100 * a / b).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function runs(text, base = {}) {
  const out = [];
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\])/g);
  for (const t of parts) {
    if (!t) continue;
    if (t.startsWith("**")) out.push(new TextRun({ ...base, text: t.slice(2, -2), bold: true }));
    else if (t.startsWith("`")) out.push(new TextRun({ ...base, text: t.slice(1, -1), font: MONO, size: (base.size || 24) - 2 }));
    else if (t.startsWith("[[")) out.push(new TextRun({ ...base, text: t.slice(2, -2), highlight: HL }));
    else if (t.startsWith("*")) out.push(new TextRun({ ...base, text: t.slice(1, -1), italics: true }));
    else out.push(new TextRun({ ...base, text: t }));
  }
  return out;
}

const p = (t, o = {}) => new Paragraph({
  children: runs(t), alignment: AlignmentType.JUSTIFIED,
  indent: { firstLine: 709 }, spacing: { line: 360, after: 0 }, ...o,
});
const pn = (t, o = {}) => p(t, { indent: { firstLine: 0 }, ...o });
const blank = () => new Paragraph({ children: [], spacing: { line: 360 } });
const center = (t, o = {}) => new Paragraph({ children: runs(t, o.run || {}), alignment: AlignmentType.CENTER, spacing: { line: 360, ...(o.spacing || {}) } });

const h1 = (t, opts = {}) => new Paragraph({
  heading: HeadingLevel.HEADING_1, children: [new TextRun(t)],
  alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
  pageBreakBefore: opts.noBreak ? false : true,
});
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });

const bullet = (t) => new Paragraph({
  children: runs(t), numbering: { reference: "marcadores", level: 0 },
  alignment: AlignmentType.JUSTIFIED, spacing: { line: 360 },
});
const numbered = (t, ref = "numeros") => new Paragraph({
  children: runs(t), numbering: { reference: ref, level: 0 },
  alignment: AlignmentType.JUSTIFIED, spacing: { line: 360 },
});

const CNT = {};
function caption(kind, title) {
  CNT[kind] = (CNT[kind] || 0) + 1;
  return new Paragraph({
    style: `Legenda${kind}`, keepNext: true,
    children: [new TextRun({ text: `${kind} ${CNT[kind]} – `, bold: true }), ...runs(title)],
  });
}
// Fonte só quando o material se baseia em outra obra; o que é dos próprios autores fica sem fonte.
const fonte = (t) => (!t || /^(Rastreador|Captura de tela|Elaborado pelos autores \(2026\))/.test(t))
  ? new Paragraph({ spacing: { before: 0, after: 240, line: 240 }, children: [] })
  : new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: 240 },
    children: runs(t.startsWith("Nota:") ? t : `Fonte: ${t}`, { size: 20 }),
  });

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function figure(file, title, widthPx = 600, src) {
  const f = FIG(file);
  const { w, h } = pngSize(f);
  return [
    caption("Figura", title),
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { line: 240 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(f), transformation: { width: widthPx, height: Math.round(widthPx * h / w) } })],
    }),
    fonte(src),
  ];
}
function placeholderFigure(title, instr, arquivo) {
  // Se a captura já estiver em relatorio/figuras, entra no lugar do quadro tracejado.
  if (arquivo && fs.existsSync(FIG(arquivo + ".png"))) return figure(arquivo + ".png", title, 600);
  const cell = new TableCell({
    width: { size: W, type: WidthType.DXA },
    shading: { fill: "F4F6F9", type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 600, bottom: 600, left: 300, right: 300 },
    verticalAlign: VerticalAlign.CENTER,
    borders: allBorders("9AA5B4", BorderStyle.DASHED),
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "[INSERIR CAPTURA DE TELA DO RARS]", bold: true, highlight: HL, size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: runs(instr, { size: 20, color: "5B6573" }) }),
    ],
  });
  return [caption("Figura", title), new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ cantSplit: true, children: [cell] })] }), fonte("Captura de tela do simulador RARS 1.6, elaborada pelos autores (2026).")];
}

function allBorders(color = "9AA5B4", style = BorderStyle.SINGLE) {
  const b = { style, size: 4, color };
  return { top: b, bottom: b, left: b, right: b };
}
function table(kind, title, headers, rows, widths, src, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const sz = opts.size || 20;
  const mk = (txt, i, head, shade) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: head ? { fill: NAVY, type: ShadingType.CLEAR, color: "auto" } : (shade ? { fill: "EEF3FA", type: ShadingType.CLEAR, color: "auto" } : undefined),
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    verticalAlign: VerticalAlign.CENTER,
    borders: allBorders("B7C0CC"),
    children: String(txt).split("\n").map((line) => new Paragraph({
      keepNext: opts.keep !== undefined ? !!opts.keep : rows.length <= 25,
      alignment: (opts.align && opts.align[i]) || AlignmentType.LEFT,
      spacing: { line: 240 },
      children: runs(line, { size: sz, ...(head ? { bold: true, color: "FFFFFF" } : {}) }),
    })),
  });
  const t = new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => mk(h, i, true)) }),
      ...rows.map((r, k) => new TableRow({ cantSplit: true, children: r.map((c, i) => mk(c, i, false, opts.zebra !== false && k % 2 === 1)) })),
    ],
  });
  return [caption(kind, title), t, fonte(src)];
}

function code(lines, opts = {}) {
  const size = opts.size || 17;
  return lines.map((l, i) => new Paragraph({
    spacing: { line: 240, before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 200 : 0 },
    shading: { fill: "F4F6F9", type: ShadingType.CLEAR, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: "1F5FAD", space: 8 } },
    indent: { left: 170 },
    keepLines: true, keepNext: i < lines.length - 1 && lines.length < 30,
    children: [new TextRun({ text: l.length ? l.replace(/\t/g, "    ") : " ", font: MONO, size })],
  }));
}
function asmRange(startPat, endPat, src = ASM) {
  const s = src.findIndex((l) => l.trim().startsWith(startPat));
  const e = src.findIndex((l, i) => i > s && l.includes(endPat));
  return src.slice(s, e + 1);
}

// --------------------------------------------- reconstrução do estado (fat 3)
function fat3States() {
  const regs = { sp: "0x7fffeffc", ra: "0x00400068", a0: "0x00000003", s0: "0x10010000", t1: "0x00000000" };
  const st = {};
  for (const t of R.fatorial3.trace) {
    Object.assign(regs, t.regs);
    st[t.passo] = { ...regs, basica: t.basica, mem: t.mem };
  }
  return st;
}

// ================================================================== CONTEÚDO
const n5 = C[5], n12 = C[12];
const capa = [
  center("**UNIVERSIDADE CATÓLICA DE BRASÍLIA**"),
  center("**PRÓ-REITORIA ACADÊMICA – PROACAD**"),
  center("**CURSO DE CIÊNCIA DA COMPUTAÇÃO**"),
  blank(), blank(), blank(),
  center("ADAM AMARILDO GUEDES CARNEIRO"),
  center("MIGUEL OLIVEIRA SILVA"),
  center("YUDI YUMETSU UEYAMA"),
  blank(), blank(), blank(), blank(), blank(),
  center("**FLUXO DE CONTROLE EM ASSEMBLY RISC-V:**"),
  center("**desvios, saltos condicionais, pilha de execução e recursão**"),
  blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(),
  center("BRASÍLIA"),
  center("2026"),
];

const folhaRosto = [
  center("ADAM AMARILDO GUEDES CARNEIRO"),
  center("MIGUEL OLIVEIRA SILVA"),
  center("YUDI YUMETSU UEYAMA"),
  blank(), blank(), blank(), blank(), blank(),
  center("**FLUXO DE CONTROLE EM ASSEMBLY RISC-V:**"),
  center("**desvios, saltos condicionais, pilha de execução e recursão**"),
  blank(), blank(), blank(),
  new Paragraph({
    indent: { left: 4536 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 240 },
    children: runs("Relatório técnico-acadêmico apresentado à unidade curricular Arquitetura de Computadores do curso de Ciência da Computação da Universidade Católica de Brasília, como requisito parcial de avaliação da atividade teórico-prática do Tema 4 – Fluxo de Controle em Assembly.", { size: 20 }),
  }),
  new Paragraph({ indent: { left: 4536 }, spacing: { before: 240, line: 240 }, children: runs("Professor: Weldes Lima Oliveira.", { size: 20 }) }),
  blank(), blank(), blank(), blank(), blank(), blank(), blank(), blank(),
  center("BRASÍLIA"),
  center("2026"),
];

const resumo = [
  center("**RESUMO**", { spacing: { after: 360 } }),
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { line: 240 },
    children: runs(`Neste trabalho, procuramos entender o que acontece dentro do processador quando um programa executa um laço, toma uma decisão ou chama uma função, inclusive quando essa função chama a si mesma. Usamos a arquitetura RISC-V de 32 bits (RV32I, com a extensão M para multiplicação) e o simulador RARS. Como o simulador não informa ciclos de *clock*, escrevemos também um pequeno rastreador em Python que executa o mesmo código e registra cada instrução. A prova de conceito lê um número digitado pelo usuário, mostrando uma mensagem de erro e repetindo a leitura enquanto ele for negativo, e depois calcula o fatorial desse número de forma recursiva, com um quadro de pilha de 8 bytes por chamada. Para comparação, um segundo programa calcula o mesmo fatorial de forma iterativa. Ao longo do relatório, mostramos como o contador de programa (PC) é atualizado em cada desvio, como as instruções de desvio são codificadas em binário e como a pilha cresce e diminui durante a recursão. Também reproduzimos de propósito alguns erros comuns, como o laço que não termina por causa de uma condição invertida e o retorno perdido quando o registrador ra não é salvo. Nas medições, o fatorial recursivo executou 13n − 4 instruções e fez 4n − 1 acessos à memória, enquanto o iterativo executou 4n + 1 instruções sem acessar a memória de dados. Para n = 5, isso representa cerca de ${n5.rec.ciclos_pipeline5} ciclos contra ${n5.it.ciclos_pipeline5} em um *pipeline* de cinco estágios. A principal conclusão é que *if*, *while* e chamadas de função têm um custo real no hardware, e que entender esse custo ajuda tanto a escrever código mais rápido quanto a encontrar erros difíceis.`),
  }),
  new Paragraph({ spacing: { before: 360, line: 240 }, children: runs("**Palavras-chave:** Arquitetura de computadores. RISC-V. Linguagem de montagem. Fluxo de controle. Pilha de execução.") }),
];

const listas = [
  center("**LISTA DE FIGURAS**", { spacing: { after: 240 } }),
  new TableOfContents("Lista de figuras", { hyperlink: true, stylesWithLevels: [new D.StyleLevel("LegendaFigura", 1)] }),
  new Paragraph({ children: [new PageBreak()] }),
  center("**LISTA DE QUADROS**", { spacing: { after: 240 } }),
  new TableOfContents("Lista de quadros", { hyperlink: true, stylesWithLevels: [new D.StyleLevel("LegendaQuadro", 1)] }),
  new Paragraph({ children: [new PageBreak()] }),
  center("**LISTA DE TABELAS**", { spacing: { after: 240 } }),
  new TableOfContents("Lista de tabelas", { hyperlink: true, stylesWithLevels: [new D.StyleLevel("LegendaTabela", 1)] }),
  new Paragraph({ children: [new PageBreak()] }),
  center("**LISTA DE ABREVIATURAS E SIGLAS**", { spacing: { after: 240 } }),
  ...[
    ["ABI", "*Application Binary Interface* (interface binária de aplicação)"],
    ["CISC", "*Complex Instruction Set Computer*"],
    ["CPI", "Ciclos por instrução"],
    ["EFLAGS", "Registrador de sinalizadores da arquitetura x86"],
    ["fp", "*Frame pointer* (ponteiro de quadro; s0/x8 no RISC-V)"],
    ["ISA", "*Instruction Set Architecture* (arquitetura do conjunto de instruções)"],
    ["PC", "*Program Counter* (contador de programa)"],
    ["psABI", "*Processor-specific ABI* do RISC-V"],
    ["ra", "*Return address* (endereço de retorno; x1)"],
    ["RARS", "*RISC-V Assembler and Runtime Simulator*"],
    ["RAW", "*Read-After-Write* (dependência de dados verdadeira)"],
    ["RISC", "*Reduced Instruction Set Computer*"],
    ["sp", "*Stack pointer* (ponteiro de pilha; x2)"],
    ["ULA", "Unidade lógica e aritmética"],
  ].map(([s, d]) => new Paragraph({
    spacing: { line: 360 }, tabStops: [{ type: TabStopType.LEFT, position: 1700 }],
    children: [new TextRun({ text: s, bold: true }), new TextRun("\t"), ...runs(d)],
  })),
  new Paragraph({ children: [new PageBreak()] }),
  center("**SUMÁRIO**", { spacing: { after: 240 } }),
  new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-2" }),
];

// ------------------------------------------------------------- 1 INTRODUÇÃO
const intro = [
  h1("1 INTRODUÇÃO", { noBreak: true }),
  p("Quem programa em C, Java ou Python escreve *if*, *while* e funções sem pensar muito em como isso funciona por baixo. O processador, porém, não conhece nenhuma dessas estruturas. Ele busca uma instrução na memória, executa e passa para a próxima, e o endereço dessa próxima instrução fica guardado em um único registrador, o contador de programa (PC). Toda decisão que um programa toma acaba se resumindo a isso: o PC avança para a instrução seguinte ou recebe outro endereço (PATTERSON; HENNESSY, 2017; TANENBAUM; AUSTIN, 2013)."),
  p("Escolhemos estudar esse mecanismo porque ele aparece em praticamente qualquer programa e tem consequências que vão além da teoria. Em processadores com *pipeline*, um desvio pode obrigar o processador a descartar instruções que ele já tinha começado a buscar, e por isso há décadas se pesquisam formas de prever desvios (SMITH, 1981; HENNESSY; PATTERSON, 2019). A pilha de execução, usada nas chamadas de função, também é fonte de problemas conhecidos, como o estouro de pilha e a corrupção do endereço de retorno, que já foi explorada em ataques de *buffer overflow* (ALEPH ONE, 1996)."),
  p("Este relatório corresponde ao Tema 4 da atividade avaliativa (Fluxo de Controle em Assembly: desvios, saltos condicionais e manipulação de dados). Nosso objetivo foi explicar, com dados medidos em simulação, como as estruturas de controle de alto nível viram instruções de máquina. Mais especificamente, buscamos:"),
  bullet("entender o papel do PC, dos desvios condicionais e dos saltos no ciclo de instrução;"),
  bullet("comparar o uso de *flags* no x86 com a comparação feita dentro da própria instrução de desvio no RISC-V;"),
  bullet("escrever em Assembly um laço *while*, uma decisão *if/else* e uma função recursiva (o fatorial), acompanhando a pilha a cada chamada;"),
  bullet("medir quanto custa a versão recursiva em relação à iterativa;"),
  bullet("provocar de propósito os erros mais comuns do tema e observar o que o processador faz em cada caso."),
  p("Usamos o RISC-V de 32 bits por ser uma arquitetura aberta e bem mais enxuta que a x86, o que facilita enxergar o mecanismo sem os detalhes de compatibilidade histórica das arquiteturas comerciais (ASANOVIĆ; PATTERSON, 2014; WATERMAN, 2016). Os programas rodaram no RARS, um simulador derivado do MARS e bastante usado no ensino de Assembly (VOLLMAR; SANDERSON, 2006). O código da prova de conceito partiu do roteiro de apresentação montado pelo grupo, e todas as medições foram feitas sobre exatamente esse código, para que os *slides*, a demonstração e o relatório falassem da mesma coisa."),
  p("Na seção 2 apresentamos a base teórica. A seção 3 traz os diagramas da arquitetura, desenhados com os endereços reais do programa. A seção 4 descreve o ambiente e o desenvolvimento da prova de conceito, e a seção 5 discute os resultados. As conclusões estão na seção 6, e os apêndices reúnem o código completo, o rastro de execução e o roteiro da demonstração."),
];

// ------------------------------------------------- 2 FUNDAMENTAÇÃO TEÓRICA
const fund = [
  h1("2 FUNDAMENTAÇÃO TEÓRICA"),
  h2("2.1 CICLO DE INSTRUÇÃO E CONTADOR DE PROGRAMA"),
  p("Na organização de von Neumann, instruções e dados ficam na mesma memória, e o processador repete sem parar um ciclo de busca, decodificação e execução (STALLINGS, 2017). Primeiro, o endereço guardado no PC é enviado à memória e a instrução correspondente é lida. Em seguida, a unidade de controle interpreta o código de operação (*opcode*) e os demais campos da instrução. Por fim, a ULA realiza a operação, e o resultado vai para um registrador ou para a memória."),
  p("Para este trabalho, o passo que mais interessa é o último de cada ciclo: a atualização do PC. Quando nada interfere, ele simplesmente avança para a próxima instrução. No RISC-V, em que as instruções básicas têm 32 bits, isso equivale a PC ← PC + 4. Só as instruções de controle de fluxo colocam no PC um valor diferente, e é apenas por meio delas que um programa consegue decidir, repetir ou chamar uma função (PATTERSON; HENNESSY, 2017)."),
  h2("2.2 A ARQUITETURA RV32I: REGISTRADORES E FORMATOS"),
  p("O RV32I é o conjunto básico de instruções inteiras de 32 bits do RISC-V. Ele tem 32 registradores de uso geral, de x0 a x31, todos com 32 bits. O x0 vale sempre zero, e o PC fica à parte, sem poder ser acessado como os outros (WATERMAN; ASANOVIĆ, 2019). Usamos também a extensão M, que acrescenta multiplicação e divisão, porque o fatorial precisa da instrução `mul`. Outra característica importante é que o RISC-V segue o modelo *load/store*: só `lw` e `sw` acessam a memória de dados, e as contas são sempre feitas entre registradores."),
  p("Cada registrador tem ainda um nome simbólico, definido pela convenção de chamada (ABI) e mostrado no Quadro 1. Para o hardware, com exceção do x0, todos são iguais. A convenção é um acordo de software, mas é ela que permite que funções escritas e compiladas separadamente funcionem juntas (PATTERSON; WATERMAN, 2017)."),
  ...table("Quadro", "Registradores inteiros do RV32I e convenção de chamada", ["Registrador", "Nome ABI", "Uso", "Preservado na chamada?"], [
    ["x0", "`zero`", "Constante zero (escritas são descartadas)", "—"],
    ["x1", "`ra`", "Endereço de retorno (*return address*)", "Não (chamador salva)"],
    ["x2", "`sp`", "Ponteiro de pilha (*stack pointer*)", "Sim"],
    ["x3 / x4", "`gp` / `tp`", "Ponteiro global / ponteiro de *thread*", "—"],
    ["x5–x7, x28–x31", "`t0`–`t6`", "Temporários", "Não"],
    ["x8", "`s0` / `fp`", "Registrador salvo / ponteiro de quadro (*frame pointer*)", "Sim (chamado salva)"],
    ["x9, x18–x27", "`s1`–`s11`", "Registradores salvos", "Sim (chamado salva)"],
    ["x10–x11", "`a0`–`a1`", "Argumentos e valores de retorno", "Não"],
    ["x12–x17", "`a2`–`a7`", "Argumentos (a7 também seleciona o serviço da `ecall`)", "Não"],
  ], [1700, 1500, 3971, 1900], "Adaptado de Waterman e Asanović (2019) e Patterson e Waterman (2017)."),
  p("Todas as instruções do RV32I ocupam 32 bits e seguem seis formatos: R, I, S, B, U e J. O *opcode* fica sempre nos bits 6 a 0, e os campos dos registradores (`rs1`, `rs2` e `rd`) estão sempre na mesma posição. Isso permite ler os registradores antes mesmo de terminar a decodificação, e Waterman (2016) aponta essa regularidade como uma escolha pensada para facilitar implementações rápidas. Os formatos que mais interessam aqui são o B, dos desvios condicionais, e o J, do salto com ligação, detalhados na seção 3.4."),
  h2("2.3 DESVIOS CONDICIONAIS E SALTOS INCONDICIONAIS"),
  p("Um desvio condicional compara dois registradores. Se a condição for verdadeira, ele soma um deslocamento ao PC; se não for, o PC segue normalmente para PC + 4. No primeiro caso dizemos que o desvio foi *tomado* e, no segundo, que *não foi tomado*. Já o salto incondicional muda o PC sempre. O RISC-V tem seis desvios condicionais e dois saltos, e as outras formas que aparecem no nosso código, como `ble`, `j` e `jr`, são pseudo-instruções que o montador traduz para essas oito (Quadro 2)."),
  ...table("Quadro", "Instruções de controle de fluxo do RV32I e pseudo-instruções usadas na PoC", ["Instrução", "Formato", "Semântica", "Observação"], [
    ["`beq rs1, rs2, L`", "B", "se R[rs1] = R[rs2]: PC ← PC + imm", "igualdade"],
    ["`bne rs1, rs2, L`", "B", "se R[rs1] ≠ R[rs2]: PC ← PC + imm", "desigualdade"],
    ["`blt rs1, rs2, L`", "B", "se R[rs1] < R[rs2] (com sinal)", "complemento de dois"],
    ["`bge rs1, rs2, L`", "B", "se R[rs1] ≥ R[rs2] (com sinal)", "complemento de dois"],
    ["`bltu` / `bgeu`", "B", "comparações sem sinal", "equivalem ao uso do *carry*"],
    ["`jal rd, L`", "J", "R[rd] ← PC + 4; PC ← PC + imm", "chamada de procedimento"],
    ["`jalr rd, imm(rs1)`", "I", "R[rd] ← PC + 4; PC ← (R[rs1] + imm) & ~1", "retorno e saltos indiretos"],
    ["`bgt a, b, L` / `ble a, b, L`", "pseudo", "`blt b, a, L` / `bge b, a, L`", "operandos trocados"],
    ["`j L`", "pseudo", "`jal x0, L`", "salto sem ligação"],
    ["`ret` / `jr ra`", "pseudo", "`jalr x0, 0(ra)`", "retorno de procedimento"],
    ["`mv`, `li`, `la`", "pseudo", "`add`/`addi`; `addi` ou `lui`+`addi`; `auipc`+`addi`", "não alteram o fluxo"],
  ], [2500, 1000, 3471, 2100], "Adaptado de Waterman e Asanović (2019)."),
  p("O deslocamento é contado a partir do próprio PC e é sempre par, já que o bit menos significativo não chega a ser armazenado. No formato B ele alcança 4 KiB para frente ou para trás; no formato J, 1 MiB. Para saltos mais longos, usa-se a combinação de `auipc` com `jalr` (WATERMAN; ASANOVIĆ, 2019)."),
  h2("2.4 REGISTRADORES DE ESTADO: O MODELO X86 E O MODELO RISC-V"),
  p("Na arquitetura x86, o desvio acontece em duas etapas. Uma instrução aritmética ou de comparação (`cmp`) atualiza o registrador de sinalizadores, o EFLAGS, ligando ou desligando bits como Zero (ZF), *Carry* (CF), Sinal (SF) e *Overflow* (OF). Depois, um salto condicional como `jz`, `jl` ou `jge` consulta esses bits e decide se o PC, que lá se chama EIP ou RIP, vai mudar (STALLINGS, 2017; TANENBAUM; AUSTIN, 2013)."),
  p("O RISC-V simplesmente não tem registrador de *flags*. A comparação e o desvio acontecem na mesma instrução, que lê os dois registradores e já decide o caminho. O manual da arquitetura explica que, dessa forma, nenhuma instrução aritmética precisa atualizar um estado escondido, o que simplifica processadores com *pipeline* e com execução fora de ordem, nos quais as *flags* criam dependências entre instruções que não têm relação nenhuma entre si (WATERMAN; ASANOVIĆ, 2019; WATERMAN, 2016). O Quadro 3 mostra o que corresponde a cada *flag* no RISC-V."),
  ...table("Quadro", "Correspondência entre flags do x86 e mecanismos do RISC-V", ["Flag (x86)", "Significado", "Equivalente no RISC-V"], [
    ["ZF (Zero)", "resultado igual a zero", "`beq`/`bne` comparando registradores (ou com `zero`)"],
    ["SF (Sinal)", "resultado negativo", "`blt`/`bge` com sinal, p. ex. `blt t1, zero, L`"],
    ["CF (*Carry*)", "vai-um / empréstimo sem sinal", "`bltu`/`bgeu` ou `sltu` explícito"],
    ["OF (*Overflow*)", "estouro em complemento de dois", "não há: verificação explícita em software (seção 5.5)"],
  ], [2000, 2700, 4371], "Elaborado pelos autores com base em Stallings (2017) e Waterman e Asanović (2019)."),
  p("Um exemplo ajuda a visualizar. A condição `if (a < b)` vira `cmp eax, ebx` seguido de `jge senao` no x86, enquanto no RISC-V basta `bge a0, a1, senao`. Repare que, nos dois casos, o desvio testa a condição contrária à do código em C, porque ele serve justamente para pular o bloco quando a condição é falsa. Essa inversão confunde bastante quem escreve Assembly à mão e volta a aparecer na seção 3.3."),
  h2("2.5 PROCEDIMENTOS, CONVENÇÃO DE CHAMADA E PILHA DE EXECUÇÃO"),
  p("Patterson e Hennessy (2017) dividem a execução de um procedimento em seis passos: colocar os argumentos em um lugar acessível, transferir o controle, reservar a memória necessária, executar a tarefa, deixar o resultado onde o chamador possa pegá-lo e voltar ao ponto de origem. No RISC-V, argumentos e resultado passam pelos registradores `a0` a `a7`. A transferência é feita por `jal ra, rotulo`, que guarda em `ra` o endereço de retorno (PC + 4) antes de saltar, e a volta é feita por `ret` ou `jr ra`, ambos equivalentes a `jalr x0, 0(ra)`."),
  p("A memória do terceiro passo vem da pilha de execução, uma região que cresce em direção aos endereços menores e cujo topo é apontado por `sp`. Cada chamada que precisa guardar dados reserva seu próprio quadro de pilha (*stack frame*), subtraindo um valor de `sp` no início da função, o prólogo, e devolvendo esse espaço no final, o epílogo. A convenção oficial do RISC-V pede que `sp` fique alinhado em 16 bytes (WATERMAN; ASANOVIĆ, 2019). Uma função que não chama nenhuma outra (função folha) pode até dispensar a pilha. Já uma função que chama outra precisa salvar pelo menos `ra`, porque o `jal` interno vai escrever por cima dele."),
  p("A convenção também separa os registradores em dois grupos. Os temporários e os de argumento (`t0`–`t6`, `a0`–`a7`), assim como o `ra`, podem ser destruídos pela função chamada, e quem chama é que deve guardá-los se precisar deles depois. Os registradores salvos (`s0`–`s11`) e o `sp` precisam sair da função com o mesmo valor com que entraram. O `s0` ainda pode servir como ponteiro de quadro (*frame pointer*), uma referência fixa ao quadro atual mesmo quando `sp` muda (PATTERSON; WATERMAN, 2017)."),
  h2("2.6 RECURSÃO, ITERAÇÃO E DESEMPENHO"),
  p("Uma função recursiva é uma função que chama a si mesma. Como cada chamada tem seus próprios argumentos e seu próprio endereço de retorno, cada nível da recursão precisa de um quadro de pilha separado, e a pilha cresce na mesma proporção que a profundidade da recursão. Se o caso base nunca for alcançado, ela cresce até acabar (*stack overflow*). A versão iterativa do mesmo algoritmo guarda o estado em registradores e reaproveita as mesmas variáveis a cada volta. Em alguns casos, compiladores otimizadores conseguem transformar uma recursão em laço, principalmente quando a chamada recursiva é a última coisa que a função faz, a chamada recursão de cauda (AHO et al., 2008)."),
  p("Para comparar as duas versões, usamos a equação clássica de desempenho: tempo de CPU = número de instruções × ciclos por instrução (CPI) × período do *clock* (HENNESSY; PATTERSON, 2019). O fluxo de controle mexe nos dois primeiros termos. Chamadas e retornos acrescentam instruções de prólogo, epílogo, `jal` e `jr`. Além disso, em um *pipeline*, cada desvio tomado pode obrigar o processador a descartar as instruções que já tinha buscado (risco de controle), e uma instrução que usa um valor recém-carregado por `lw` precisa esperar um ciclo (risco de dados do tipo RAW, ou *load-use*). Para diminuir os riscos de controle, os processadores usam previsores de desvio, que aproveitam o fato de um mesmo desvio costumar se comportar do mesmo jeito ao longo da execução (SMITH, 1981; HENNESSY; PATTERSON, 2019)."),
];

// ---------------------------------------------- 3 MAPEAMENTO ARQUITETURAL
const s32h = (v) => { const x = parseInt(v, 16); return x > 0x7fffffff ? x - 2 ** 32 : x; };
const RET_MAIN = plus4(JAL_MAIN);
function fat3StatesY() {
  const regs = { sp: "0x7fffeffc", ra: RET_MAIN, a0: "0x00000003", t1: "0x00000000" };
  const st = {};
  for (const t of R.fatorial3.trace) { Object.assign(regs, t.regs); st[t.passo] = { ...regs }; }
  return st;
}
const st3 = fat3StatesY();
const snap5 = R.fatorial3.pilha_fatorial5_caso_base;
const est13 = R.execucao_completa.estouro13;
const virg = (x) => String(x).replace(".", ",");

const mapa = [
  h1("3 MAPEAMENTO ARQUITETURAL"),
  p("Todos os diagramas desta seção foram feitos a partir do próprio programa da prova de conceito. Os endereços, os códigos binários e o conteúdo da memória que aparecem neles são os valores obtidos na montagem e na execução descritas na seção 4, e os nomes dos registradores seguem o RV32I."),
  h2("3.1 ORGANIZAÇÃO DA MEMÓRIA NO SIMULADOR"),
  p(`A Figura 1 mostra como o RARS organiza a memória na configuração padrão. As instruções ficam no segmento de texto, que começa em \`0x00400000\`. Os dados estáticos começam em \`0x10010000\`, e a pilha parte de \`0x7fffeffc\` e cresce para baixo. No nosso programa, o laço \`laco_while\` está logo no início do segmento de texto, a função \`fatorial\` começa em \`${R.labels.fatorial}\` e o epílogo dela fica em \`${R.labels.epilogo}\`.`),
  ...figure("fig1_mapa_memoria.png", "Mapa de memória do RARS com os rótulos da prova de conceito", 590),
  h2("3.2 CAMINHO DE DADOS DA ATUALIZAÇÃO DO PC"),
  p("A Figura 2 mostra apenas a parte de um caminho de dados monociclo do RV32I que decide qual será o próximo PC. São três possibilidades, escolhidas por um multiplexador. A primeira é PC + 4, o caminho normal. A segunda é PC + imediato, calculado por um somador próprio e usado nos desvios tomados e no `jal`. A terceira é R[rs1] + imediato, calculado pela ULA e usado pelo `jalr`, que é como o `jr ra` acaba sendo executado. Quem escolhe entre elas é a lógica PCSrc, a partir dos sinais da unidade de controle e do resultado do comparador. O `jal` e o `jalr` ainda gravam PC + 4 no registrador de destino, e é essa ligação (*link*) que permite voltar depois."),
  ...figure("fig2_datapath_pc.png", "Caminho de dados simplificado do RV32I para a seleção do próximo PC", 600, "Elaborado pelos autores com base em Patterson e Hennessy (2017)."),
  p("O Quadro 4 resume, para cada tipo de instrução usada no programa, de onde vem o próximo valor do PC e se algum registrador é escrito."),
  ...table("Quadro", "Fonte do próximo PC e registrador escrito por classe de instrução", ["Classe", "Exemplo na PoC", "Próximo PC", "Escreve em rd?"], [
    ["Aritmética / memória", "`addi`, `lw`, `sw`, `mul`", "PC + 4", "`addi`, `lw`, `mul`: sim; `sw`: não"],
    ["Desvio não tomado", "`bge a0, zero, fim_while` com n < 0", "PC + 4", "não"],
    ["Desvio tomado", "`ble a0, t1, if_caso_base` com n ≤ 1", "PC + imm", "não"],
    ["Salto direto", `\`j laco_while\` = \`${J_W_BAS}\``, "PC + imm", "não (rd = x0)"],
    ["Chamada", "`jal ra, fatorial`", "PC + imm", "ra ← PC + 4"],
    ["Retorno", "`jr ra` = `jalr x0, 0(ra)`", "R[ra] + 0", "não (rd = x0)"],
  ], [2000, 2971, 1600, 2500], "Elaborado pelos autores (2026)."),
  h2("3.3 DAS ESTRUTURAS DE ALTO NÍVEL AO ASSEMBLY"),
  p("O Quadro 5 mostra como traduzimos cada estrutura. Uma coisa que chamou nossa atenção é que existem duas maneiras de montar um desvio condicional, e o programa usa as duas. No *while*, o desvio é tomado para sair do laço quando a condição de repetição deixa de valer (n ≥ 0). Enquanto ela vale, o programa segue em frente, mostra a mensagem de erro e um salto incondicional no final volta para o começo. No *if/else* do fatorial acontece o contrário: o desvio é tomado para entrar no caso base (n ≤ 1), enquanto o *else*, que é a chamada recursiva, fica no caminho sequencial e termina com `j epilogo` para não cair no caso base."),
  ...table("Quadro", "Padrões de tradução de estruturas de controle de C para RISC-V", ["Construção em C", "Assembly RISC-V (PoC)", "Mecanismo"], [
    ["`n = ler();`\n`while (n < 0) {`\n`  erro(); n = ler();`\n`}`", "`laco_while: ...ecall (a7 = 5)`\n`  bge a0, zero, fim_while`\n`  ...ecall (msg_erro)`\n`  j laco_while`\n`fim_while:`", "desvio tomado para sair + salto para trás"],
    ["`if (n <= 1) r = 1;`\n`else r = n * fat(n-1);`", "`ble a0, t1, if_caso_base`\n`  addi · jal · lw · mul`\n`  j epilogo`\n`if_caso_base: li a0, 1`\n`epilogo:`", "desvio tomado para o *then*; *else* no caminho sequencial"],
    ["`r = fatorial(n);`", "`jal ra, fatorial`\n`mv t0, a0`", "argumento em a0, ligação em ra, retorno em a0"],
    ["`return r;`", "`jr ra`  (`jalr x0, 0(ra)`)", "PC ← ra"],
  ], [2600, 3871, 2600], "Elaborado pelos autores (2026)."),
  p("A Figura 3 junta as duas rotinas em um fluxograma, com os rótulos e endereços reais. Os losangos são os desvios condicionais (formato B), a seta azul é o salto que repete o laço e a seta tracejada representa a chamada de função."),
  ...figure("fig3_fluxograma_while_if.png", "Fluxograma do laço while (main) e da decisão if/else com recursão (fatorial)", 600),
  h2("3.4 CODIFICAÇÃO BINÁRIA DAS INSTRUÇÕES DE DESVIO"),
  p("Na Figura 4, duas instruções da função `fatorial` aparecem separadas em campos de bits. Como o RISC-V não tem `ble` nativo, o montador transforma `ble a0, t1, if_caso_base` em `bge t1, a0, +24`, apenas trocando a ordem dos operandos (afinal, a0 ≤ t1 é o mesmo que t1 ≥ a0). O imediato de 13 bits fica espalhado em quatro campos, e o bit 0, que é sempre zero, nem chega a ser guardado."),
  p(`Já a chamada recursiva \`jal ra, fatorial\`, no endereço \`${JAL_REC}\`, carrega o deslocamento −24. Fazendo a conta, \`${JAL_REC} − 24\` dá \`${L.fatorial}\`, que é exatamente o rótulo \`fatorial\`. O campo \`rd = 00001\` indica que PC + 4, ou seja, \`${RET_REC}\`, vai para \`ra\`. Esse endereço, que é o do \`lw t1, 0(sp)\`, aparece de novo na pilha (Figura 5) como endereço de retorno das chamadas internas.`),
  ...figure("fig4_formatos_B_J.png", "Codificação das instruções bge (formato B) e jal (formato J) da função fatorial", 600, "Elaborado pelos autores com base em Waterman e Asanović (2019)."),
  h2("3.5 QUADRO DE PILHA DA FUNÇÃO FATORIAL"),
  p("Cada chamada de `fatorial` reserva 8 bytes na pilha: `ra` fica em `sp+4` e o argumento n em `sp+0`. O n precisa ser guardado porque `a0` é reaproveitado, primeiro para passar n − 1 adiante e depois para receber o resultado. O `ra` também, já que o `jal` interno escreve por cima dele. Optamos por 8 bytes porque é o suficiente para os dois valores e mantém `sp` alinhado em palavra, que é o que o RARS exige. A convenção oficial recomenda 16 bytes, e discutimos essa diferença na seção 5.7."),
  p(`A Figura 5 mostra a pilha real no momento em que \`fatorial(5)\` chega ao caso base. São cinco quadros, 40 bytes ao todo, com \`sp\` em \`${snap5.sp}\`. O quadro de cima guarda \`ra = ${RET_MAIN}\`, que leva de volta ao \`main\`, logo depois do \`jal ra, fatorial\`. Os outros guardam \`${RET_REC}\`, a instrução seguinte ao \`jal\` recursivo. Os valores de n, de 5 até 1, ficam empilhados em ordem e vão sendo recuperados um a um quando a recursão volta.`),
  ...figure("fig5_pilha_fatorial5.png", "Conteúdo da pilha no caso base de fatorial(5)", 600),
];

// ---------------------------------------------- 4 METODOLOGIA
let _a0 = 0, _a7 = 0, _fimWhile = false;
const nomeDe = (v) => (Object.entries(L).find(([k, a]) => parseInt(a, 16) === v) || [String(v)])[0];
const whileRows = [];
for (const r of TRACE) {
  if (_fimWhile) break;
  const regs = Object.fromEntries((r[4] || "").split(" ").filter(Boolean).map((kv) => kv.split("=")));
  if (regs.a0) _a0 = s32h(regs.a0);
  if (regs.a7) _a7 = parseInt(regs.a7, 16);
  const op = r[2];
  let eff;
  if (op === "ecall") eff = _a7 === 5 ? `ReadInt: a0 ← ${_a0} (digitado)` : `PrintString: exibe ${nomeDe(_a0)}`;
  else if (op.startsWith("bge")) { eff = _a0 >= 0 ? `n = ${_a0} ≥ 0: tomado → fim_while` : `n = ${_a0} < 0: não tomado (PC + 4)`; _fimWhile = _a0 >= 0; }
  else if (op.startsWith("jal zero")) eff = `PC ← laco_while (${L.laco_while})`;
  else eff = r[4] ? `\`${r[4]}\`` : "—";
  whileRows.push([r[0], `\`${r[1]}\``, `\`${op}\``, eff]);
}

const ev = [
  [3, "prólogo de fatorial(3) concluído"],
  [7, "jal: chamada a fatorial(2)"],
  [10, "prólogo de fatorial(2) concluído"],
  [14, "jal: chamada a fatorial(1)"],
  [17, "prólogo de fatorial(1) concluído"],
  [20, "caso base: a0 ← 1"],
  [23, `jr ra → ${RET_REC} (volta a fatorial(2))`],
  [25, "mul: a0 = 2 × 1"],
  [29, `jr ra → ${RET_REC} (volta a fatorial(3))`],
  [31, "mul: a0 = 3 × 2"],
  [35, `jr ra → ${RET_MAIN} (volta ao main)`],
].map(([s, e]) => [String(s), e, `\`${st3[s].sp}\``, `\`${st3[s].ra}\``, String(parseInt(st3[s].a0, 16)), String(parseInt(st3[s].t1, 16))]);

const metod = [
  h1("4 METODOLOGIA E DESENVOLVIMENTO"),
  h2("4.1 AMBIENTE DE SIMULAÇÃO E MEDIÇÃO"),
  p("Escrevemos a prova de conceito (PoC) em Assembly RISC-V e a executamos no RARS 1.6, um simulador educacional derivado do MARS (VOLLMAR; SANDERSON, 2006). Com ele é possível montar o código, ver as pseudo-instruções já expandidas, executar passo a passo e acompanhar, a cada instrução, os registradores, o PC e o conteúdo da memória."),
  p("O RARS, porém, não conta ciclos de *clock*. Para chegar a esses números, o grupo escreveu um rastreador em Python, o `rv32_tracer.py`. Ele monta o mesmo arquivo `.asm`, expande as pseudo-instruções do mesmo jeito que o RARS (por isso os endereços e as contagens batem) e anota, para cada instrução executada, o PC, a instrução, os registradores alterados e os acessos à memória. As leituras de teclado (`ecall` 5) recebem valores fixos, definidos antes da execução."),
  p("A partir desse rastro, estimamos os ciclos com dois modelos descritos por Patterson e Hennessy (2017). No modelo multiciclo, `lw` leva 5 ciclos, `sw`, operações da ULA e `mul` levam 4, e desvios e saltos levam 3. No modelo de *pipeline* de cinco estágios com adiantamento (*forwarding*), cada dependência *load-use* custa 1 ciclo de bolha e cada desvio tomado ou salto custa 2 ciclos descartados, supondo que o processador sempre aposte em \"não tomado\" e só descubra o resultado no estágio EX. O Quadro 6 resume o ambiente usado."),
  ...table("Quadro", "Ambiente de desenvolvimento, simulação e medição", ["Item", "Especificação"], [
    ["Arquitetura (ISA)", "RISC-V RV32I + extensão M (apenas para `mul`), 32 bits"],
    ["Simulador", "RARS 1.6, configuração de memória padrão, pseudo-instruções habilitadas"],
    ["Ambiente de execução", "Java SE 8; sistema operacional Windows 11"],
    ["Rastreador e métricas", "`poc/tracer/rv32_tracer.py` (Python 3), desenvolvido pelo grupo"],
    ["Programas da PoC", "`poc/fatorial_completo_tema4.s` (principal), `poc/fatorial_iterativo.asm` (versão iterativa, para comparação) e `poc/erros_comuns.asm` (falhas)"],
    ["Saídas geradas", "`poc/resultados/resultados.json` e `trace_programa.csv` (rastro de todas as instruções)"],
    ["Validação cruzada", "resultados e contagem de instruções conferidos no próprio RARS 1.6 (opção `ic` da linha de comando)"],
  ], [2600, 6471], "Elaborado pelos autores (2026)."),
  h2("4.2 ESTRUTURA DA PROVA DE CONCEITO"),
  p("O programa principal, `fatorial_completo_tema4.s` (Apêndice A), tem três partes, uma para cada estrutura pedida no tema:"),
  numbered("**Parte 1, laço while:** pede um número n pelo console (`ecall` com `a7` = 5) e, enquanto ele for negativo, mostra uma mensagem de erro e pede de novo;"),
  numbered("**Parte 2, if/else:** dentro da função `fatorial`, testa o caso base (n ≤ 1) para decidir entre devolver 1 e continuar a recursão;"),
  numbered("**Parte 3, recursão e pilha:** `fatorial(n)` chama `fatorial(n − 1)`, e cada chamada abre um quadro de 8 bytes na pilha."),
  p(`No final, o resultado é impresso no console. Na execução que usamos como referência, digitamos ${R.execucao_completa.entradas.join(", ")}: as duas primeiras entradas são recusadas pelo laço, cada uma com a mensagem de erro, e a terceira é aceita, e o programa imprime ${fmt(R.execucao_completa.resultado)}. Digitando 13, aparece o estouro de 32 bits comentado na seção 4.5. Para comparar a recursão com um laço, escrevemos um segundo programa, \`fatorial_iterativo.asm\` (Apêndice B), que calcula o mesmo fatorial com uma função folha, sem usar a pilha. Há ainda um terceiro, \`erros_comuns.asm\` (Apêndice C), feito só para reproduzir os erros típicos do tema.`),
  h2("4.3 PARTE 1: LAÇO WHILE"),
  p("O laço mostra a mensagem, lê o valor digitado (que o sistema coloca em `a0`) e testa o sinal com `bge a0, zero, fim_while`. A ULA compara `a0` com `x0`: se `a0` for maior ou igual a zero, o PC recebe o endereço de `fim_while`; se não, segue para PC + 4, que é o corpo do laço. Ali o programa guarda o valor lido em `s1`, mostra a mensagem de erro e o `j laco_while` manda tudo de volta para o começo. Em C, o código equivale a `n = ler(); while (n < 0) { erro(); n = ler(); }`."),
  ...code(asmRange("laco_while:", "fim_while:")),
  p(`A Tabela 1 traz o rastro das três passagens pelo laço. Nas duas primeiras o número lido é negativo (o −3 aparece como \`0xfffffffd\`, em complemento de dois), então o \`bge\` não é tomado, a mensagem de erro aparece e o \`j\` em \`${J_W}\` leva o PC de volta a \`${L.laco_while}\`. Na terceira, com o valor 5, o desvio é tomado e o PC pula de \`${BGE_W}\` para \`${L.fim_while}\`.`),
  ...table("Tabela", "Rastro das três passagens pelo laço while (entradas −3, −1 e 5)", ["Passo", "PC", "Instrução básica", "Efeito"], whileRows, [800, 1700, 2700, 3871], "Rastreador rv32_tracer.py, elaborado pelos autores (2026).", { size: 17 }),
  h2("4.4 PARTES 2 E 3: IF/ELSE, RECURSÃO E A VERSÃO ITERATIVA"),
  p("A função recursiva tem quatro partes: prólogo, teste do caso base, chamada recursiva e epílogo. O *if/else* é a instrução `ble a0, t1, if_caso_base`, com `t1` valendo 1. Se n ≤ 1, o desvio é tomado, e o caso base coloca 1 em `a0` e cai direto no epílogo. Caso contrário, o programa segue para o *else* e chama `fatorial(n − 1)`. Quando essa chamada volta, o valor de n já não está em nenhum registrador, por isso ele é lido de novo da pilha com `lw t1, 0(sp)` antes da multiplicação. O `j epilogo` no fim do *else* serve para não executar o caso base por engano."),
  ...code(asmRange("fatorial:", "Retorna ao chamador")),
  p("A versão iterativa, que está no arquivo `fatorial_iterativo.asm`, faz a mesma conta usando um acumulador em `t0`. Como não chama nenhuma outra função, não precisa salvar `ra` nem mexer em `sp`:"),
  ...code(asmRange("fatorial_it:", "retorna ao chamador", ASM_IT)),
  p(`Para acompanhar a pilha passo a passo, executamos a função recursiva com n = 3 no mesmo contexto do \`main\` (\`ra = ${RET_MAIN}\`). Foram ${R.fatorial3.metricas.instrucoes} instruções e ${R.fatorial3.metricas.acessos_memoria_dados} acessos à pilha no total (o rastro completo está no Apêndice D), e a Tabela 2 mostra só os momentos de chamada e retorno. Dá para ver \`sp\` descendo 8 bytes a cada chamada e subindo 8 a cada retorno até voltar a \`0x7fffeffc\`, o que garante que o \`main\` encontre a pilha do jeito que deixou. Também aparece \`t1\` recebendo da pilha o n de cada nível logo antes de cada \`mul\`.`),
  ...table("Tabela", "Estado dos registradores nos eventos de chamada e retorno de fatorial(3)", ["Passo", "Evento", "sp", "ra", "a0", "t1"], ev, [700, 3571, 1500, 1500, 900, 900], "Rastreador rv32_tracer.py, elaborado pelos autores (2026).", { size: 17, keep: true }),
  h2("4.5 ESTOURO SILENCIOSO DE 32 BITS"),
  p(`A instrução \`mul\` guarda em \`rd\` só os 32 bits menos significativos do produto. Quando digitamos 13, o resultado correto seria 6.227.020.800, mas o maior inteiro positivo que cabe em 32 bits é 2.147.483.647. As duas versões, a recursiva e a iterativa, imprimiram ${fmt(est13.res[0])}, que é exatamente 6.227.020.800 − 2³², o resto da divisão por 2³². Não houve exceção nem aviso de nenhum tipo, e o programa simplesmente continuou com o valor errado.`),
  h2("4.6 REPRODUÇÃO DOS DESAFIOS COMUNS"),
  p("O programa `erros_comuns.asm` escolhe uma de três falhas conforme o valor carregado em `s11`. Rodamos cada uma no rastreador com um limite de 200.000 instruções, para conseguir identificar os laços que não terminam. O Quadro 7 resume o que aconteceu em cada caso."),
  ...table("Quadro", "Falhas reproduzidas, sintomas observados e correções", ["Cenário", "Código com erro", "Sintoma observado", "Correção"], [
    ["1. Condição de saída invertida", "`bge a0, zero, fim1` com a0 = −1 e `addi a0, a0, −1` no corpo", "PC preso no laço em `0x00400024`; a0 = −66.667 após 200.000 instruções; só terminaria após ~2³¹ iterações, quando o valor \"dá a volta\"", "`ble a0, zero, fim1` (sair quando a0 ≤ 0)"],
    ["2. `ra` não preservado", "função recursiva `conta` sem salvar `ra` antes do `jal` interno", "`ra` = `0x00400044` aponta para o próprio `ret`; PC preso em `0x00400044` indefinidamente", "salvar `ra` no prólogo e restaurá-lo no epílogo"],
    ["3. Pilha desalinhada", "`addi sp, sp, −6` seguido de `sw ra, 0(sp)`", "exceção de alinhamento no 8º passo: endereço `0x7fffeff6` não é múltiplo de 4", "reservar múltiplos de 4 bytes (8, como na PoC, ou 16, como na psABI)"],
  ], [1900, 2400, 2971, 1800], "Elaborado pelos autores (2026).", { size: 18, keep: true }),
  h2("4.7 PROCEDIMENTO DE EXECUÇÃO NO RARS"),
  p("No RARS, o programa é aberto em File › Open, montado com Run › Assemble (F3) e executado de uma vez com Run › Go (F5) ou passo a passo com Run › Step (F7). Os valores de n são digitados na janela *Run I/O*. A aba *Text Segment* mostra, para cada instrução, o endereço, o código de máquina, a instrução básica e a linha original, que são os mesmos dados da Figura 4. Para ver a pilha, basta escolher \"current sp\" na janela *Data Segment*. As métricas podem ser conferidas em Tools › Instruction Counter (total de instruções) e Tools › Instruction Statistics (instruções por categoria). O roteiro completo da demonstração está no Apêndice E."),
  p("Para conferir o rastreador, rodamos os mesmos programas no RARS 1.6 pela linha de comando, que mostra a saída do console, o total de instruções executadas (opção `ic`) e o valor final dos registradores pedidos. A Figura 6 mostra a execução completa com as entradas −3, −1 e 5. Na Figura 7, a execução foi interrompida no 44º passo, que é o momento em que `fatorial(5)` chega ao caso base, e o trecho da pilha foi salvo com a opção `dump`. Os valores lidos da memória do RARS são os mesmos da Figura 5."),
  ...placeholderFigure("Execução completa de fatorial_completo_tema4.s no RARS 1.6 com as entradas −3, −1 e 5: console, total de instruções e registradores", "Após Run › Go, digite −3, −1 e 5 na janela *Run I/O* e capture a tela mostrando o console (duas mensagens de erro e o resultado 120) e a aba *Registers* com s0 = 5 e a0 = 120.", "captura_rars_execucao"),
  ...placeholderFigure("Pilha no caso base de fatorial(5) lida da memória do RARS 1.6 (execução interrompida no 44º passo)", `Coloque um *breakpoint* em \`epilogo\` (${R.labels.epilogo}), execute com n = 5 até a 1ª parada (a0 = 1) e capture a janela *Data Segment* em "current sp" (sp = ${snap5.sp}), comparando com a Figura 5.`, "captura_rars_pilha"),
];

// ---------------------------------------------- 5 DISCUSSÃO
const cls = M.por_classe;
const classRows = [
  ["ULA (`add`, `addi`)", cls.alu, 4], ["Multiplicação (`mul`)", cls.mul, 4], ["Carga (`lw`)", cls.load, 5],
  ["Armazenamento (`sw`)", cls.store, 4], ["Desvio condicional (tipo B)", cls.branch, 3], ["Salto (`jal`, `jalr`)", cls.jump, 3],
  ["`auipc` / `lui`", cls.upper, 4], ["Chamada de sistema (`ecall`)", cls.system, 4],
].map(([n, c, k]) => [n, fmt(c), pct(c, M.instrucoes) + "%", String(k), fmt(c * k)]);
classRows.push(["**Total**", `**${fmt(M.instrucoes)}**`, "**100%**", `**CPI ${virg(M.cpi_multiciclo)}**`, `**${fmt(M.ciclos_multiciclo)}**`]);

const compRows = [1, 3, 5, 10, 12].flatMap((n) => {
  const r = C[n];
  return [["rec", r.rec], ["it", r.it]].map(([k, m]) => [
    k === "rec" ? String(n) : "", k === "rec" ? "recursivo" : "iterativo", fmt(m.instrucoes), fmt(m.acessos_memoria_dados),
    fmt(m.acessos_barramento_total), `${m.profundidade_pilha_bytes} B`, fmt(m.ciclos_multiciclo), fmt(m.ciclos_pipeline5),
  ]);
});
const n3 = C[3];
const cadaQuantas = Math.round(M.instrucoes / M.descartes_controle);

const disc = [
  h1("5 DISCUSSÃO DOS RESULTADOS"),
  h2("5.1 VALIDAÇÃO FUNCIONAL"),
  p("A Tabela 3 compara o que esperávamos com o que foi obtido. Todos os valores bateram, inclusive o 13! truncado, que confirma o comportamento descrito na seção 4.5."),
  ...table("Tabela", "Resultados esperados e obtidos na execução dos programas", ["Verificação", "Onde conferir", "Esperado", "Obtido"], [
    ["Entradas −3 e −1 rejeitadas", "`bge` do *while* / `msg_erro`", "2 mensagens de erro", `${(R.execucao_completa.saida_console.match(/Erro:/g) || []).length} mensagens de erro`],
    ["Entrada 5 aceita", "`s0`", "5", String(parseInt(R.execucao_completa.registradores_finais.s0, 16))],
    ["fatorial recursivo(5)", "console / `a0`", "120", fmt(R.execucao_completa.resultado)],
    ["fatorial iterativo(5)", "console de `fatorial_iterativo.asm`", "120", fmt(R.execucao_completa.iterativo_5.resultado)],
    ["fatorial(13) em 32 bits", "console dos dois programas", "6.227.020.800 mod 2³² = 1.932.053.504", `${fmt(est13.res[0])} / ${fmt(est13.res[1])}`],
  ], [2700, 1900, 2771, 1700], "Rastreador rv32_tracer.py, elaborado pelos autores (2026).", { keep: true, align: [null, null, AlignmentType.RIGHT, AlignmentType.RIGHT] }),
  h2("5.2 PERFIL DE INSTRUÇÕES DO PROGRAMA"),
  p(`Com as entradas −3, −1 e 5, o programa inteiro executou ${fmt(M.instrucoes)} instruções, distribuídas por classe na Tabela 4. O RARS mostrou ${fmt(M.instrucoes - 1)} (Figura 6), uma a menos, porque o contador dele não inclui o \`ecall\` que encerra o programa: num teste com três instruções terminando em \`ecall\` 10, ele também contou só duas. Tirando essa diferença fixa, as contagens bateram em todas as execuções que conferimos. Desvios condicionais (${cls.branch}) e saltos (${cls.jump}) somam ${pct(cls.branch + cls.jump, M.instrucoes)}% do total. Dos ${cls.branch} desvios, ${M.desvios_tomados} foram tomados e ${M.desvios_nao_tomados} não. Juntando os saltos, o PC mudou de caminho ${M.descartes_controle} vezes, mais ou menos uma vez a cada ${cadaQuantas} instruções.`),
  ...table("Tabela", "Instruções executadas por classe e ciclos no modelo multiciclo", ["Classe", "Quantidade", "%", "Ciclos/instr.", "Ciclos"], classRows, [3471, 1300, 1100, 1500, 1700], "Elaborado pelos autores com base no modelo multiciclo de Patterson e Hennessy (2017).", { keep: true, align: [null, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT] }),
  p(`No modelo multiciclo, foram ${fmt(M.ciclos_multiciclo)} ciclos (CPI ${virg(M.cpi_multiciclo)}). No *pipeline* de cinco estágios, ${fmt(M.ciclos_pipeline5)} ciclos (CPI ${virg(M.cpi_pipeline5)}), que se dividem assim: ${M.instrucoes} ciclos de vazão ideal, 4 para encher o *pipeline*, ${M.bolhas_load_use} bolhas *load-use* e ${2 * M.descartes_controle} ciclos perdidos com os redirecionamentos do PC. Em outras palavras, cerca de ${pct(2 * M.descartes_controle, M.ciclos_pipeline5)}% dos ciclos foram gastos só por causa do fluxo de controle. Esse número ajuda a entender por que os processadores reais investem tanto em previsão de desvios.`),
  h2("5.3 RECURSÃO VERSUS ITERAÇÃO"),
  p("A Tabela 5 e a Figura 8 comparam as duas versões do fatorial para vários valores de n. As medições formaram retas perfeitas, e cada fórmula pode ser explicada contando as instruções do código:"),
  bullet("na versão recursiva, cada nível que não é o caso base executa 13 instruções (3 no prólogo, `li` e `ble` no teste, `addi` e `jal` na chamada, `lw`, `mul` e `j` depois do retorno e 3 no epílogo), e o caso base executa 9. Isso dá 13(n − 1) + 9 = **13n − 4 instruções**;"),
  bullet("cada nível faz 2 `sw` no prólogo e 1 `lw` no epílogo, e os níveis que não são o caso base fazem mais um `lw` para recuperar n. São 4 acessos por nível e 3 no caso base, ou seja, **4n − 1 acessos à memória**;"),
  bullet("a pilha cresce **8 bytes por nível**, um quadro para cada chamada ativa;"),
  bullet("a versão iterativa executa 2 instruções de preparação, 4 por volta do laço (são n − 1 voltas) e 3 na saída, o que dá **4n + 1 instruções**, sem nenhum acesso à memória de dados."),
  ...table("Tabela", "Custo do fatorial recursivo e iterativo em função de n", ["n", "Versão", "Instruções", "lw + sw", "Acessos totais", "Pilha", "Ciclos multiciclo", "Ciclos pipeline"], compRows, [600, 1300, 1150, 1000, 1350, 950, 1400, 1321], "Nota: acessos totais = busca de instruções + acessos à memória de dados.", { size: 18, keep: true, align: [AlignmentType.CENTER, null, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT] }),
  ...figure("fig6_grafico_rec_vs_it.png", "Instruções executadas e acessos à memória de dados em função de n", 600),
  p(`Para n = 3, a recursão executou ${n3.rec.instrucoes} instruções e fez ${n3.rec.acessos_memoria_dados} acessos à pilha, com cerca de ${n3.rec.ciclos_pipeline5} ciclos no *pipeline* estimado (CPI ${virg(n3.rec.cpi_pipeline5)}). São os mesmos números que o grupo tinha calculado à mão no roteiro da apresentação, o que serviu como uma boa conferência das duas partes do trabalho.`),
  p(`Para n = 5, a versão recursiva executa ${n5.rec.instrucoes} instruções contra ${n5.it.instrucoes} da iterativa, quase ${virg((n5.rec.instrucoes / n5.it.instrucoes).toFixed(1))} vezes mais. Ela também faz ${n5.rec.acessos_memoria_dados} acessos à memória de dados (a iterativa não faz nenhum) e, somando a busca das próprias instruções, chega a ${n5.rec.acessos_barramento_total} acessos à memória contra ${n5.it.acessos_barramento_total}. No *pipeline*, são ${n5.rec.ciclos_pipeline5} ciclos contra ${n5.it.ciclos_pipeline5}. Conforme n cresce, a recursão tende a executar 13/4 = 3,25 vezes mais instruções.`),
  p("O que achamos mais interessante é que o algoritmo é o mesmo nas duas versões: são sempre n − 1 multiplicações. Toda a diferença vem do controle, isto é, de salvar e restaurar o contexto, guardar o endereço de retorno e desviar três vezes por nível (`jal`, `j epilogo` e `jr ra`). É justamente esse custo que os compiladores tentam eliminar quando transformam recursões em laços ou expandem funções em linha (AHO et al., 2008)."),
  h2("5.4 DESVIOS, PIPELINE E PREVISÃO DE DESVIOS"),
  p("Um previsor de desvios só consegue esconder a penalidade se o desvio tiver um comportamento regular. Com n = 5, o `ble` do caso base é executado cinco vezes: não é tomado nas quatro primeiras e é tomado na última. O `ble` do laço iterativo segue o mesmo padrão. Smith (1981) mostrou que padrões assim são previstos com facilidade por contadores saturados de 2 bits."),
  p("O desvio do *while* é diferente, porque depende do número que o usuário digita, e o histórico não ajuda a adivinhá-lo. O mesmo acontece com um *if* que depende do conteúdo de um vetor. Se os dados estiverem ordenados, porém, o desvio muda de comportamento uma única vez e fica fácil de prever, e é por isso que percorrer um vetor ordenado pode ser mais rápido, como as próprias orientações da atividade lembram."),
  p(`O \`jr ra\` merece um comentário à parte. Ele é um salto indireto, cujo destino vem de um registrador, e na recursão o mesmo \`jr ra\` volta às vezes para \`${RET_REC}\` e às vezes para \`${RET_MAIN}\`. Processadores reais usam uma pequena pilha de endereços de retorno, em hardware, para prever esse tipo de salto (HENNESSY; PATTERSON, 2019). Já as ${M.bolhas_load_use} bolhas *load-use* vêm todas do mesmo lugar: o \`lw t1, 0(sp)\` seguido logo do \`mul a0, t1, a0\`, uma vez por nível de retorno. Em um processador real, daria para escondê-las colocando alguma instrução independente entre o \`lw\` e o \`mul\`.`),
  h2("5.5 ESTOURO ARITMÉTICO E AUSÊNCIA DE FLAGS"),
  p("No x86, uma multiplicação que estoura liga as *flags* CF e OF, e o programa pode verificar isso com um salto condicional (`jo`). No RISC-V não existe onde registrar o estouro, e por isso o 13! foi truncado sem nenhum aviso. Se for preciso detectar o problema, isso tem que ser feito no próprio código. Para multiplicação com sinal, uma forma é comparar a parte alta do produto (`mulh`) com a extensão de sinal da parte baixa:"),
  ...code([
    "        mul   t0, a0, a1      # parte baixa do produto (32 bits)",
    "        mulh  t1, a0, a1      # parte alta do produto (bits 63..32)",
    "        srai  t2, t0, 31      # extensão de sinal da parte baixa",
    "        bne   t1, t2, estouro # se diferentes, o produto não cabe em 32 bits",
  ]),
  p("São três instruções a mais, mas só nos lugares em que a verificação realmente importa. Esse foi o caminho escolhido pelo RISC-V: um hardware mais simples, sem estado escondido, em troca de verificações explícitas no software (WATERMAN; ASANOVIĆ, 2019)."),
  h2("5.6 FALHAS DE CONTROLE E SEGURANÇA"),
  p("As três falhas do Quadro 7 têm algo em comum: o processador faz exatamente o que o código manda, sem saber o que o programador queria. Uma condição invertida não gera erro nenhum, só um laço que não acaba. Um `ra` que não foi salvo faz o programa voltar para um endereço válido, só que errado. A única falha que gera exceção na hora é o desalinhamento, porque ela quebra uma regra do próprio hardware de acesso à memória."),
  p("O segundo caso também tem um lado de segurança. Se o endereço de retorno guardado na pilha puder ser sobrescrito por dados vindos de fora, por exemplo um vetor local escrito além do seu tamanho, o `jr ra` vai saltar para onde o atacante quiser. Essa é a ideia por trás dos ataques clássicos de estouro de *buffer* na pilha (ALEPH ONE, 1996)."),
  h2("5.7 ALINHAMENTO DO QUADRO DE PILHA E DOS DADOS"),
  p("Na PoC usamos quadros de 8 bytes, o mínimo para guardar `ra` e n mantendo `sp` múltiplo de 4, que é a única exigência que o RARS confere nos `lw` e `sw`. A convenção oficial, no entanto, pede `sp` alinhado em 16 bytes (WATERMAN; ASANOVIĆ, 2019), para que o código funcione com dados de 64 e 128 bits e com bibliotecas compiladas que contam com esse alinhamento. Em um programa isolado no simulador, como o nosso, 8 bytes funcionam bem e gastam metade da pilha. Se a função fosse misturada com código gerado por um compilador C, porém, seria preciso reservar 16 bytes por quadro, mesmo deixando metade sem uso."),
  p(`No segmento de dados, o alinhamento não chega a ser um problema no nosso programa, porque ele só guarda mensagens de texto, que são lidas byte a byte: \`msg_erro\`, por exemplo, começa em \`${L.msg_erro}\`, um endereço ímpar, e funciona normalmente. Se o programa precisasse gravar uma palavra (\`sw\`) logo depois dessas mensagens, porém, seria preciso usar a diretiva \`.align 2\` antes, senão o endereço poderia não ser múltiplo de 4 e o RARS pararia com erro de endereço desalinhado, que é o \"erro de alinhamento de memória\" citado nas orientações da atividade.`),
  h2("5.8 LIMITAÇÕES"),
  p("Alguns cuidados são necessários na leitura desses resultados. O RARS é um simulador funcional, então a contagem de instruções e de acessos à memória é exata, mas os ciclos são estimativas tiradas de modelos de livro-texto, sem cache, sem previsor de desvios e sem execução superescalar. Em um processador real, os 4n − 1 acessos à pilha da recursão caem em endereços vizinhos e próximos no tempo (localidade espacial e temporal) e provavelmente seriam atendidos pela cache L1. O previsor de desvios também reduziria as penalidades de controle."),
  p("Além disso, nosso rastreador só implementa as instruções do RV32IM que usamos no programa. Por fim, o fatorial é um exemplo pequeno e bem comportado. Em algoritmos com mais de uma chamada recursiva por nível, como o Fibonacci ingênuo, o número de chamadas cresce de forma exponencial, e as diferenças seriam bem maiores."),
  h2("5.9 IMPACTOS NO DESENVOLVIMENTO DE SOFTWARE DE ALTO DESEMPENHO"),
  p("Para quem desenvolve software, esses resultados viram algumas recomendações práticas. Em trechos críticos de desempenho, vale preferir laços a recursões profundas, ou pelo menos escrever a recursão de cauda para que o compilador consiga convertê-la. Funções pequenas e folha saem mais baratas, porque não usam a pilha. Quando a profundidade da recursão depende de dados externos, é prudente limitá-la para evitar o estouro de pilha. Organizar os dados de forma que os desvios fiquem previsíveis também ajuda. E, em código de baixo nível, seguir à risca a convenção de chamada e as regras de alinhamento evita falhas difíceis de encontrar, como as que reproduzimos no Quadro 7."),
];

// ---------------------------------------------- 6 CONCLUSÃO
const concl = [
  h1("6 CONCLUSÃO"),
  p("Ao longo do trabalho ficou claro que *if*, *while* e chamadas de função não existem no hardware. Tudo isso é construído com poucas instruções, cuja função é escolher o próximo valor do PC. No RISC-V, seis desvios condicionais e dois saltos são suficientes. E, como não há registrador de *flags*, comparar e desviar viram uma coisa só, o que simplifica o *pipeline* mas deixa para o programa a tarefa de detectar estouros, como vimos no cálculo de 13!."),
  p("A prova de conceito nos permitiu ver de perto o que o compilador normalmente esconde: o desvio que encerra um laço e o salto que o repete, as duas formas de montar um *if/else*, o endereço de retorno guardado em `ra` pelo `jal` e o quadro de pilha que cada chamada recursiva cria. Tudo isso com endereços e valores reais, que podem ser conferidos no simulador. As medições mostraram o preço dessa abstração: a versão recursiva do fatorial executa 13n − 4 instruções, faz 4n − 1 acessos à memória e usa 8n bytes de pilha, enquanto a iterativa executa 4n + 1 instruções e não acessa a memória de dados."),
  p("Algumas lições ficaram para o grupo. A primeira é que todo erro de fluxo de controle, no fim das contas, é um valor errado no PC, seja por uma condição invertida, seja por um endereço de retorno perdido. A segunda é que a convenção de chamada e o alinhamento funcionam como contratos, e quebrá-los quase nunca dá erro na hora, o que torna esses problemas difíceis de achar. A terceira é que o custo do controle pode ser medido e, em trechos curtos de código, chega a pesar mais do que a própria conta. Para quem vai seguir na área de computação, entender isso ajuda a ler o código que o compilador gera, a depurar falhas de baixo nível e a perceber riscos de segurança ligados à pilha."),
  p("Como continuação, seria interessante rodar a mesma PoC em um simulador de *pipeline* que conte ciclos de verdade, comparar com o código gerado por um compilador C em diferentes níveis de otimização e testar recursões com mais de uma chamada por nível, como o Fibonacci."),
];

// ---------------------------------------------- REFERÊNCIAS
const refs = [
  "AHO, A. V.; LAM, M. S.; SETHI, R.; ULLMAN, J. D. **Compiladores**: princípios, técnicas e ferramentas. 2. ed. São Paulo: Pearson Addison-Wesley, 2008.",
  "ALEPH ONE. Smashing the stack for fun and profit. **Phrack Magazine**, v. 7, n. 49, 1996.",
  "ASANOVIĆ, K.; PATTERSON, D. A. **Instruction sets should be free**: the case for RISC-V. Berkeley: EECS Department, University of California, 2014. (Technical Report UCB/EECS-2014-146).",
  "HENNESSY, J. L.; PATTERSON, D. A. **Computer architecture**: a quantitative approach. 6. ed. Cambridge: Morgan Kaufmann, 2019.",
  "PATTERSON, D. A.; HENNESSY, J. L. **Computer organization and design RISC-V edition**: the hardware/software interface. Cambridge: Morgan Kaufmann, 2017.",
  "PATTERSON, D.; WATERMAN, A. **The RISC-V reader**: an open architecture atlas. Berkeley: Strawberry Canyon, 2017.",
  "SMITH, J. E. A study of branch prediction strategies. In: INTERNATIONAL SYMPOSIUM ON COMPUTER ARCHITECTURE, 8., 1981, Minneapolis. **Proceedings** [...]. Los Alamitos: IEEE Computer Society Press, 1981. p. 135-148.",
  "STALLINGS, W. **Arquitetura e organização de computadores**. 10. ed. São Paulo: Pearson Education do Brasil, 2017.",
  "TANENBAUM, A. S.; AUSTIN, T. **Organização estruturada de computadores**. 6. ed. São Paulo: Pearson Prentice Hall, 2013.",
  "VOLLMAR, K.; SANDERSON, P. MARS: an education-oriented MIPS assembly language simulator. **ACM SIGCSE Bulletin**, v. 38, n. 1, p. 239-243, 2006.",
  "WATERMAN, A. **Design of the RISC-V instruction set architecture**. 2016. Tese (Doutorado em Ciência da Computação) – University of California, Berkeley, 2016.",
  "WATERMAN, A.; ASANOVIĆ, K. (ed.). **The RISC-V instruction set manual**: volume I: unprivileged ISA. Document version 20191213. [*S. l.*]: RISC-V Foundation, 2019.",
];
const referencias = [
  h1("REFERÊNCIAS", { center: true }),
  ...refs.map((r) => new Paragraph({ children: runs(r), alignment: AlignmentType.LEFT, spacing: { line: 240, after: 240 } })),
];

// ---------------------------------------------- APÊNDICES
const fullTrace = R.fatorial3.trace.map((t) => [
  String(t.passo), `\`${t.pc}\``, `\`${t.basica}\``,
  `\`${[Object.entries(t.regs).map(([k, v]) => `${k}=${v}`).join(" "), t.mem ? `${t.mem.op === "W" ? "grava" : "lê"} [${t.mem.end}]=0x${(t.mem.valor >>> 0).toString(16).padStart(8, "0")}` : ""].filter(Boolean).join("; ") || "—"}\``,
]);

const apA = [h1("APÊNDICE A – CÓDIGO-FONTE DE FATORIAL_COMPLETO_TEMA4.S", { center: true }), ...code(ASM, { size: 16 })];
const apB = [h1("APÊNDICE B – CÓDIGO-FONTE DE FATORIAL_ITERATIVO.ASM", { center: true }), ...code(ASM_IT, { size: 16 })];
const apC = [h1("APÊNDICE C – CÓDIGO-FONTE DE ERROS_COMUNS.ASM", { center: true }), ...code(ASM_ERR, { size: 16 })];
const apD = [
  h1("APÊNDICE D – RASTRO COMPLETO DE FATORIAL(3)", { center: true }),
  pn(`Execução de \`fatorial(3)\` a partir do contexto do \`main\` (sp = \`0x7fffeffc\`, ra = \`${RET_MAIN}\`). A coluna \"Efeito\" lista os registradores alterados e o acesso à memória realizado pela instrução. A Tabela 6 mostra cada uma das instruções executadas, na ordem em que aconteceram.`),
  ...table("Tabela", "Rastro instrução a instrução de fatorial(3)", ["Passo", "PC", "Instrução básica", "Efeito"], fullTrace, [700, 1500, 2600, 4271], "Rastreador rv32_tracer.py, elaborado pelos autores (2026).", { size: 16 }),
];
const apE = [
  h1("APÊNDICE E – ROTEIRO DA DEMONSTRAÇÃO PRÁTICA (POC)", { center: true }),
  pn("Roteiro sugerido para a demonstração ao vivo e para a gravação de contingência recomendada nas orientações da atividade. Duração estimada: 6 a 8 minutos."),
  h3("Preparação"),
  numbered("Instalar o Java (versão 8 ou superior) e baixar o arquivo `rars1_6.jar`; abrir com `java -jar rars1_6.jar`.", "roteiro"),
  numbered("Em Settings, manter habilitadas as pseudo-instruções e a configuração de memória padrão.", "roteiro"),
  numbered("Abrir `poc/fatorial_completo_tema4.s` e montar (F3). Mostrar a aba *Text Segment*: endereço, código de máquina, instrução básica e fonte — por exemplo, `ble a0, t1, if_caso_base` aparece expandida como um `bge` com os operandos trocados, código `0x00a35c63` (Figura 4).", "roteiro"),
  h3("Demonstração 1 – laço while"),
  numbered(`Executar passo a passo (F7). Na leitura, digitar −3 na janela *Run I/O*: o \`bge\` em \`${BGE_W}\` não é tomado, o PC vai para \`${plus4(BGE_W)}\`, aparece a mensagem de erro e o \`j\` em \`${J_W}\` devolve o PC a \`${L.laco_while}\`.`, "roteiro"),
  numbered(`Digitar 5: o desvio é tomado e o PC salta para \`fim_while\` (\`${L.fim_while}\`). Mostrar \`a0\` = 5 na aba *Registers*.`, "roteiro"),
  h3("Demonstração 2 – if/else, recursão e pilha"),
  numbered(`Marcar *breakpoint* em \`epilogo\` (\`${L.epilogo}\`) e executar (F5). Na primeira parada, a0 = 1 (caso base).`, "roteiro"),
  numbered(`Na janela *Data Segment*, selecionar "current sp" e mostrar os 5 quadros (Figura 5): os \`ra\` salvos (\`${RET_MAIN}\` e \`${RET_REC}\`) e os valores de n de 5 a 1; na aba *Registers*, \`sp\` = \`${snap5.sp}\`.`, "roteiro"),
  numbered("Continuar a execução e mostrar `sp` subindo 8 bytes a cada `jr ra` até voltar a `0x7fffeffc`, e `t1` recebendo n antes de cada `mul`.", "roteiro"),
  h3("Demonstração 3 – métricas e estouro"),
  numbered(`Reiniciar, abrir Tools › Instruction Counter, conectar (*Connect to Program*) e executar digitando −3, −1 e 5: o contador deve mostrar ${M.instrucoes - 1} instruções (${R.execucao_completa.so_5.metricas.instrucoes - 1} se o valor 5 for digitado direto), uma a menos que o rastreador, porque o RARS não conta o \`ecall\` de saída.`, "roteiro"),
  numbered(`Abrir \`poc/fatorial_iterativo.asm\`, executar com 5 e comparar no Instruction Counter: ${R.execucao_completa.iterativo_5.metricas.instrucoes - 1} instruções contra ${R.execucao_completa.so_5.metricas.instrucoes - 1} da versão recursiva, para o mesmo resultado 120.`, "roteiro"),
  numbered(`Executar os dois programas digitando 13: ambos imprimem ${est13.res[0]}; explicar a ausência de *flag* de *overflow*.`, "roteiro"),
  h3("Demonstração 4 – falhas"),
  numbered("Abrir `poc/erros_comuns.asm` com `li s11, 1`: executar e mostrar o PC preso no laço; interromper (Stop).", "roteiro"),
  numbered("Trocar para `li s11, 2`: mostrar `ra` apontando para o próprio `ret` (`0x00400044`) e o PC preso.", "roteiro"),
  numbered("Trocar para `li s11, 3`: mostrar a mensagem de exceção de endereço desalinhado.", "roteiro"),
];

// ================================================================== DOCUMENTO
const pageProps = {
  page: { size: { width: 11906, height: 16838 }, margin: { top: 1701, left: 1701, bottom: 1134, right: 1134, header: 709 } },
};
const header = new Header({
  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })] })],
});

const doc = new Document({
  creator: "Grupo – Tema 4",
  title: "Fluxo de Controle em Assembly RISC-V",
  description: "Relatório técnico-acadêmico – Arquitetura de Computadores – UCB",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true, allCaps: true, color: "000000" },
        paragraph: { spacing: { before: 0, after: 360, line: 360 }, outlineLevel: 0, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: false, allCaps: true, color: "000000" },
        paragraph: { spacing: { before: 360, after: 240, line: 360 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: "000000" },
        paragraph: { spacing: { before: 240, after: 120, line: 360 }, outlineLevel: 2, keepNext: true } },
      ...["Figura", "Quadro", "Tabela"].map((k) => ({
        id: `Legenda${k}`, name: `Legenda${k}`, basedOn: "Normal", next: "Normal",
        run: { font: FONT, size: 20 },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 80, line: 240 }, keepNext: true },
      })),
    ],
  },
  numbering: {
    config: [
      { reference: "marcadores", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1069, hanging: 360 } } } }] },
      { reference: "numeros", levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: "%1)", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1069, hanging: 360 } } } }] },
      { reference: "roteiro", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 709, hanging: 360 } } } }] },
    ],
  },
  sections: [
    { properties: { ...pageProps }, children: capa },
    {
      properties: { ...pageProps, page: { ...pageProps.page, pageNumbers: { start: 1 } } },
      children: [
        ...folhaRosto, new Paragraph({ children: [new PageBreak()] }),
        ...resumo, new Paragraph({ children: [new PageBreak()] }),
        ...listas,
      ],
    },
    {
      properties: { ...pageProps },
      headers: { default: header },
      children: [...intro, ...fund, ...mapa, ...metod, ...disc, ...concl, ...referencias, ...apA, ...apB, ...apC, ...apD, ...apE],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("gerado:", OUT); });
