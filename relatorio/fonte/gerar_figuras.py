"""Gera as figuras do relatório (SVG -> PNG via Chrome headless).
Uso: python gerar_figuras.py <resultados.json> <pasta_saida>
"""
import json
import os
import subprocess
import sys

RES = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

NAVY, BLUE, CYAN, ORANGE = "#0B2545", "#1F5FAD", "#12A4B8", "#D9731F"
INK, MUTED, LINE, FILL, FILL2 = "#1B2430", "#5B6573", "#9AA5B4", "#EEF3FA", "#FFF4EA"
FONT = "Segoe UI, Arial, sans-serif"
MONO = "Consolas, 'Courier New', monospace"


def render(name, w, h, body):
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"
 font-family="{FONT}" fill="{INK}">
<defs>
 <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
  <path d="M0,0 L10,5 L0,10 z" fill="{NAVY}"/></marker>
 <marker id="arrO" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
  <path d="M0,0 L10,5 L0,10 z" fill="{ORANGE}"/></marker>
 <marker id="arrC" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
  <path d="M0,0 L10,5 L0,10 z" fill="{CYAN}"/></marker>
</defs>
<rect width="{w}" height="{h}" fill="#ffffff"/>
{body}
</svg>"""
    html = f"<!doctype html><html><head><meta charset='utf-8'><style>html,body{{margin:0;background:#fff}}</style></head><body>{svg}</body></html>"
    hp = os.path.abspath(os.path.join(OUT, name + ".html"))
    open(hp, "w", encoding="utf-8").write(html)
    png = os.path.abspath(os.path.join(OUT, name + ".png"))
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--screenshot={png}", f"--window-size={w},{h}",
                    "--force-device-scale-factor=2", "file:///" + hp.replace("\\", "/")],
                   check=True, capture_output=True)
    os.remove(hp)
    print("ok", name)


def box(x, y, w, h, title, sub="", fill=FILL, stroke=NAVY, r=8, tsize=15, ssize=12, mono_sub=False):
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>'
    lines = title.split("\n")
    sublines = sub.split("\n") if sub else []
    total = len(lines) * (tsize + 4) + len(sublines) * (ssize + 4)
    cy = y + h / 2 - total / 2 + tsize
    for t in lines:
        s += f'<text x="{x + w / 2}" y="{cy}" text-anchor="middle" font-size="{tsize}" font-weight="600">{t}</text>'
        cy += tsize + 4
    for t in sublines:
        fam = f' font-family="{MONO}"' if mono_sub else ""
        s += f'<text x="{x + w / 2}" y="{cy}" text-anchor="middle" font-size="{ssize}" fill="{MUTED}"{fam}>{t}</text>'
        cy += ssize + 4
    return s


def arrow(pts, color=NAVY, dash=False, marker="arr", width=1.8):
    d = " ".join(f"{x},{y}" for x, y in pts)
    da = ' stroke-dasharray="6 4"' if dash else ""
    return f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{width}"{da} marker-end="url(#{marker})"/>'


def label(x, y, t, size=12, color=MUTED, anchor="start", weight="400", mono=False):
    fam = f' font-family="{MONO}"' if mono else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" font-weight="{weight}"{fam}>{t}</text>'


L = {k: v for k, v in RES["labels"].items()}
_jals = [l for l in RES["listagem"] if l["fonte"] == "jal ra, fatorial"]
RET_MAIN = f"0x{int(_jals[0]['end'], 16) + 4:08x}"   # volta ao main
RET_REC = f"0x{int(_jals[1]['end'], 16) + 4:08x}"    # volta da chamada recursiva

# ---------------------------------------------------------------- Fig 1
def fig_mapa():
    w, h = 980, 640
    b = ""
    x0, bw = 260, 230
    segs = [  # (y, h, titulo, sub, fill, end_top, end_bot)
        (40, 120, "Pilha (stack)", "cresce para endereços menores ↓", FILL2, "0x7fffeffc  ← sp inicial", None),
        (160, 150, "Região livre", "", "#F6F7F9", None, None),
        (310, 70, "Heap", "cresce para cima ↑", "#F6F7F9", None, "0x10040000"),
        (380, 110, "Segmento de dados (.data)", "mensagens do console", FILL, None, "0x10010000"),
        (490, 50, "(reservado)", "", "#F6F7F9", None, None),
        (540, 70, "Segmento de texto (.text)", "instruções do programa", FILL, None, "0x00400000"),
    ]
    for y, hh, t, s, f, et, eb in segs:
        b += box(x0, y, bw, hh, t, s, fill=f, r=0, tsize=14)
        if et:
            b += label(x0 - 12, y + 14, et, 12, INK, "end", mono=True)
        if eb:
            b += label(x0 - 12, y + hh - 4, eb, 12, INK, "end", mono=True)
    b += label(x0 - 12, 30, "Endereços altos", 12, MUTED, "end")
    b += label(x0 - 12, 630, "Endereços baixos", 12, MUTED, "end")
    # detalhe do .data
    dx = 560
    b += label(dx, 372, "Rótulos do .data (PoC)", 13, NAVY, weight="700")
    rows = [("msg_input", "string: pedido de n"), ("msg_erro", "string: erro (n < 0)"),
            ("msg_output", "string: resultado")]
    for k, (n, d) in enumerate(rows):
        yy = 395 + k * 20
        b += label(dx, yy, L[n], 12, INK, mono=True) + label(dx + 100, yy, n, 12, BLUE, weight="700", mono=True) + label(dx + 185, yy, d, 12)
    b += arrow([(x0 + bw + 6, 435), (dx - 10, 435)], LINE)
    tx = 560
    b += label(tx, 528, "Rótulos do .text (PoC)", 13, NAVY, weight="700")
    rows = [("laco_while", "main: laço while (leitura)"), ("fim_while", "chamada do fatorial"),
            ("fatorial", "função recursiva"), ("if_caso_base", "caso base (if)"), ("epilogo", "epílogo do fatorial")]
    for k, (n, d) in enumerate(rows):
        yy = 550 + k * 20
        b += label(tx, yy, L[n], 12, INK, mono=True) + label(tx + 100, yy, n, 12, BLUE, weight="700", mono=True) + label(tx + 205, yy, d, 12)
    b += arrow([(x0 + bw + 6, 575), (tx - 10, 575)], LINE)
    sx = 560
    b += label(sx, 70, "Registradores especiais na partida", 13, NAVY, weight="700")
    b += label(sx, 92, "sp (x2) = 0x7fffeffc   gp (x3) = 0x10008000", 12, INK, mono=True)
    b += label(sx, 112, "pc      = 0x00400000   (rótulo main)", 12, INK, mono=True)
    b += label(sx, 138, "Cada chamada de fatorial reserva 8 bytes", 12)
    b += label(sx, 156, "(addi sp, sp, −8): fatorial(5) usa 40 bytes.", 12)
    b += arrow([(x0 + bw + 6, 100), (sx - 10, 100)], LINE)
    render("fig1_mapa_memoria", w, h, b)


# ---------------------------------------------------------------- Fig 2
def fig_datapath():
    w, h = 1060, 600
    b = ""
    b += box(40, 250, 80, 90, "PC", "32 bits")
    b += box(190, 230, 150, 130, "Memória de\nInstruções", "lê instr[31:0]")
    b += box(190, 70, 120, 60, "Somador", "PC + 4")
    b += box(430, 230, 170, 130, "Banco de\nRegistradores", "x0 … x31 (32 × 32 bits)")
    b += box(430, 420, 170, 60, "Gerador de\nImediato", "tipos I / B / J")
    b += box(690, 230, 150, 80, "Comparador", "beq/bne/blt/bge")
    b += box(690, 70, 150, 60, "Somador", "PC + imm")
    b += box(690, 410, 150, 60, "ULA", "rs1 + imm (jalr)")
    b += box(190, 500, 160, 60, "Unidade de\nControle", "decodifica opcode", fill=FILL2, stroke=ORANGE)
    b += box(870, 470, 110, 60, "Lógica\nPCSrc", "", fill=FILL2, stroke=ORANGE, tsize=14)
    # MUX trapezoid
    b += f'<path d="M960,60 L1000,85 L1000,255 L960,280 z" fill="{FILL}" stroke="{NAVY}" stroke-width="1.6"/>'
    b += label(980, 140, "MUX", 13, INK, "middle", "700")
    b += label(966, 96, "0", 11, MUTED) + label(966, 176, "1", 11, MUTED) + label(966, 262, "2", 11, MUTED)
    # fios
    b += arrow([(120, 295), (190, 295)])                        # PC -> IMEM
    b += arrow([(150, 295), (150, 100), (190, 100)])            # PC -> +4
    b += arrow([(150, 100), (150, 40), (660, 40), (660, 90), (690, 90)])  # PC -> PC+imm
    b += arrow([(310, 100), (380, 100), (380, 60), (920, 60), (920, 92), (960, 92)])   # PC+4 -> mux0
    b += label(400, 54, "PC + 4  (sequencial)", 12, INK)
    b += arrow([(840, 100), (930, 100), (930, 172), (960, 172)])  # PC+imm -> mux1
    b += label(848, 120, "alvo do desvio", 11)
    b += arrow([(840, 440), (940, 440), (940, 258), (960, 258)])  # ula -> mux2
    b += label(846, 432, "alvo jalr/ret", 11)
    b += arrow([(340, 280), (430, 280)]);  b += label(352, 272, "rs1, rs2", 11, INK, mono=True)
    b += arrow([(370, 280), (370, 450), (430, 450)]);  b += label(376, 400, "imm", 11, INK, mono=True)
    b += arrow([(340, 330), (360, 330), (360, 530), (350, 530)]);  b += label(300, 495, "opcode", 11, INK, mono=True, anchor="middle")
    b += arrow([(600, 260), (690, 260)]);  b += label(604, 253, "R[rs1]", 10, INK, mono=True)
    b += arrow([(600, 295), (690, 295)]);  b += label(604, 312, "R[rs2]", 10, INK, mono=True)
    b += arrow([(600, 450), (690, 450)])
    b += arrow([(650, 260), (650, 425), (690, 425)])
    b += arrow([(670, 450), (670, 110), (690, 110)])  # imm -> PC+imm
    b += label(676, 200, "imm", 11, INK, mono=True)
    b += arrow([(840, 270), (858, 270), (858, 500), (870, 500)]);  b += label(846, 262, "cond", 11, INK, mono=True)
    b += arrow([(350, 545), (925, 545), (925, 530)], ORANGE, marker="arrO");  b += label(600, 538, "Branch, Jump, Jalr", 11, ORANGE, mono=True)
    b += arrow([(980, 500), (1020, 500), (1020, 300), (980, 300), (980, 270)], ORANGE, marker="arrO")
    b += label(1026, 420, "sel", 11, ORANGE, mono=True)
    # saída do mux volta ao PC
    b += arrow([(1000, 170), (1045, 170), (1045, 20), (20, 20), (20, 295), (40, 295)], BLUE, width=2.2)
    b += label(560, 14, "próximo PC (atualizado a cada ciclo)", 12, BLUE, "middle", "700")
    # link
    b += arrow([(380, 100), (380, 210), (515, 210), (515, 230)], CYAN, dash=True, marker="arrC")
    b += label(390, 204, "jal/jalr gravam PC + 4 em rd (ra = link)", 11, CYAN, weight="600")
    render("fig2_datapath_pc", w, h, b)


# ---------------------------------------------------------------- Fig 3
def fig_fluxo():
    w, h = 1050, 900
    b = ""

    def diamond(cx, cy, w2, h2, t, sub):
        s = f'<path d="M{cx},{cy - h2} L{cx + w2},{cy} L{cx},{cy + h2} L{cx - w2},{cy} z" fill="{FILL2}" stroke="{ORANGE}" stroke-width="1.6"/>'
        s += label(cx, cy - 2, t, 15, INK, "middle", "700") + label(cx, cy + 16, sub, 11, MUTED, "middle", mono=True)
        return s

    def pill(cx, y, t, wd=200):
        return f'<rect x="{cx - wd / 2}" y="{y}" width="{wd}" height="40" rx="20" fill="{NAVY}"/>' + label(cx, y + 25, t, 13, "#fff", "middle", "700")

    # ---------------- coluna esquerda: main / while
    cx = 220
    b += label(40, 30, "(a) main — laço while", 15, NAVY, weight="700")
    b += pill(cx, 50, "Início (main)")
    b += arrow([(cx, 90), (cx, 125)])
    b += label(cx + 10, 118, "laco_while: " + L["laco_while"], 11, BLUE, mono=True)
    b += box(cx - 140, 125, 280, 70, "pedir n ao usuário", "PrintString (a7 = 4)\nReadInt (a7 = 5) → a0", tsize=14, mono_sub=True)
    b += arrow([(cx, 195), (cx, 230)])
    b += diamond(cx, 280, 140, 50, "n ≥ 0 ?", "bge a0, zero, fim_while")
    b += arrow([(cx - 140, 280), (cx - 185, 280), (cx - 185, 160), (cx - 140, 160)], BLUE, width=2.2)
    b += label(cx - 182, 300, "não: msg_erro", 11, BLUE, weight="700") + label(cx - 182, 315, "e j laco_while", 11, BLUE, weight="700", mono=True)
    b += arrow([(cx, 330), (cx, 370)]);  b += label(cx + 8, 355, "sim (desvio tomado)", 11, INK)
    b += label(cx + 10, 365, "", 1)
    b += box(cx - 140, 370, 280, 60, "s0 = n ; jal ra, fatorial", "ra ← " + RET_MAIN + " ; PC ← fatorial", tsize=14, mono_sub=True)
    b += arrow([(cx + 140, 400), (cx + 300, 400)], CYAN, dash=True, marker="arrC")
    b += label(cx + 150, 392, "chamada", 11, CYAN, weight="700")
    b += arrow([(cx, 430), (cx, 470)])
    b += box(cx - 140, 470, 280, 60, "impressão do resultado", "PrintString · PrintInt (a7 = 1)", tsize=14, mono_sub=True)
    b += arrow([(cx, 530), (cx, 565)])
    b += pill(cx, 565, "Fim (ecall 10)")

    # ---------------- coluna direita: fatorial (if/else)
    fx = 690
    b += label(480, 30, "(b) fatorial(n) — decisão if/else e recursão", 15, NAVY, weight="700")
    b += label(fx + 10, 75, "fatorial: " + L["fatorial"], 11, BLUE, mono=True)
    b += box(fx - 150, 80, 300, 70, "prólogo", "addi sp, sp, −8\nsw ra, 4(sp) · sw a0, 0(sp)", tsize=14, mono_sub=True)
    b += arrow([(fx, 150), (fx, 185)])
    b += diamond(fx, 235, 150, 50, "n ≤ 1 ?", "ble a0, t1, if_caso_base")
    b += arrow([(fx + 150, 235), (fx + 245, 235), (fx + 245, 560)]);  b += label(fx + 158, 226, "sim (tomado)", 11, INK)
    b += label(fx + 60, 552, "if_caso_base: " + L["if_caso_base"], 11, BLUE, mono=True)
    b += arrow([(fx, 285), (fx, 320)]);  b += label(fx + 8, 305, "não (PC + 4): else", 11, INK)
    b += box(fx - 150, 320, 300, 60, "chamada recursiva", "addi a0, a0, −1\njal ra, fatorial", tsize=14, mono_sub=True)
    b += arrow([(fx - 150, 350), (fx - 205, 350), (fx - 205, 115), (fx - 150, 115)], CYAN, dash=True, marker="arrC")
    b += label(fx - 200, 230, "novo", 11, CYAN, weight="700") + label(fx - 200, 245, "frame", 11, CYAN, weight="700")
    b += arrow([(fx, 380), (fx, 415)]);  b += label(fx + 8, 405, "volta em ra = " + RET_REC, 11, INK, mono=True)
    b += box(fx - 150, 415, 300, 70, "n × fatorial(n − 1)", "lw t1, 0(sp) · mul a0, t1, a0\nj epilogo", tsize=14, mono_sub=True)
    b += box(fx + 175, 560, 140, 50, "li a0, 1", "caso base", tsize=14, mono_sub=True)
    b += arrow([(fx, 485), (fx, 640)])
    b += arrow([(fx + 245, 610), (fx + 245, 625), (fx + 40, 625), (fx + 40, 640)])
    b += label(fx + 50, 655, "", 1)
    b += label(fx - 145, 635, "epilogo: " + L["epilogo"], 11, BLUE, mono=True)
    b += box(fx - 150, 640, 300, 70, "epílogo", "lw ra, 4(sp) · addi sp, sp, 8\njr ra  (PC ← ra)", tsize=14, mono_sub=True)
    b += arrow([(fx, 710), (fx, 745)])
    b += pill(fx, 745, "retorna ao chamador", 240)

    # notas
    ny = 810
    notes = ["Losango = desvio condicional (tipo B); seta azul = salto incondicional j (jal x0); seta ciano tracejada = chamada (jal ra).",
             "No while, o desvio é tomado para SAIR do laço; no if/else do fatorial, o desvio é tomado para ENTRAR no caso base,",
             "e o bloco else (chamada recursiva) é o caminho sequencial PC + 4."]
    for k, t in enumerate(notes):
        b += label(40, ny + k * 20, t, 12, INK)
    render("fig3_fluxograma_while_if", w, h, b)


# ---------------------------------------------------------------- Fig 4
def campos(code, fmt):
    bits = f"{int(code, 16):032b}"
    seg = lambda hi, lo: bits[31 - hi: 32 - lo]
    if fmt == "B":
        return [("31", 1, seg(31, 31), "imm[12]", FILL2), ("30:25", 6, seg(30, 25), "imm[10:5]", FILL2),
                ("24:20", 5, seg(24, 20), "rs2", FILL), ("19:15", 5, seg(19, 15), "rs1", FILL),
                ("14:12", 3, seg(14, 12), "funct3", "#E8F6F8"), ("11:8", 4, seg(11, 8), "imm[4:1]", FILL2),
                ("7", 1, seg(7, 7), "imm[11]", FILL2), ("6:0", 7, seg(6, 0), "opcode BRANCH", "#E8F6F8")]
    return [("31", 1, seg(31, 31), "imm[20]", FILL2), ("30:21", 10, seg(30, 21), "imm[10:1]", FILL2),
            ("20", 1, seg(20, 20), "imm[11]", FILL2), ("19:12", 8, seg(19, 12), "imm[19:12]", FILL2),
            ("11:7", 5, seg(11, 7), "rd", FILL), ("6:0", 7, seg(6, 0), "opcode JAL", "#E8F6F8")]


def fig_formatos():
    w, h = 1000, 360
    b = ""
    lst = RES["listagem"]
    br = next(l for l in lst if l["fonte"].startswith("ble") and "if_caso_base" in l["fonte"])
    jl = next(l for l in lst if l["fonte"].startswith("jal") and l["fonte"].endswith("fatorial")
              and int(l["end"], 16) > int(L["fatorial"], 16))

    def row(y, title, code, fields, regs):
        s = label(40, y - 38, title, 15, NAVY, weight="700")
        s += label(40, y - 18, code, 12, MUTED, mono=True)
        x = 40
        for bits, nbits, val, desc, fill in fields:
            ww = nbits * 28
            desc = regs.get(desc, desc)
            s += f'<rect x="{x}" y="{y}" width="{ww}" height="46" fill="{fill}" stroke="{NAVY}" stroke-width="1.2"/>'
            s += label(x + ww / 2, y - 4, bits, 10, MUTED, "middle", mono=True)
            s += label(x + ww / 2, y + 29, val, 13, INK, "middle", "700", mono=True)
            s += label(x + ww / 2, y + 64, desc, 11, INK, "middle")
            x += ww
        return s
    off_b = int(br["basica"].split(",")[-1])
    alvo_b = int(br["end"], 16) + off_b
    b += row(80, f"Tipo B — {br['basica']}   (expansão de  ble a0, t1, if_caso_base)",
             f"endereço {br['end']}   código {br['codigo']}   →  se t1 ≥ a0 (n ≤ 1):  PC = {br['end']} + {off_b} = 0x{alvo_b:08x}",
             campos(br["codigo"], "B"), {"rs2": "rs2 = a0", "rs1": "rs1 = t1", "funct3": "funct3 = bge"})
    off_j = int(jl["basica"].split(",")[-1])
    alvo_j = int(jl["end"], 16) + off_j
    b += row(220, f"Tipo J — {jl['basica'].replace('-', '−')}   (chamada recursiva  jal ra, fatorial)",
             f"endereço {jl['end']}   código {jl['codigo']}   →  ra = 0x{int(jl['end'], 16) + 4:08x};  PC = {jl['end']} − {-off_j} = 0x{alvo_j:08x}",
             campos(jl["codigo"], "J"), {"rd": "rd = ra"})
    b += label(40, 325, "Os imediatos de desvio são deslocamentos relativos ao PC, em múltiplos de 2 bytes (o bit 0 é implícito = 0).", 12, INK)
    b += label(40, 345, "Alcance: tipo B ±4 KiB; tipo J ±1 MiB. Cores: laranja = imediato, azul = registradores, ciano = opcode/funct3.", 12, MUTED)
    render("fig4_formatos_B_J", w, h, b)


# ---------------------------------------------------------------- Fig 5
def fig_pilha():
    snap = RES["fatorial3"]["pilha_fatorial5_caso_base"]
    words = snap["palavras"]
    ret_main = int(RET_MAIN, 16)
    w, h = 1000, 60 + 30 * len(words) + 110
    b = ""
    x0, cw, rh = 300, 190, 30
    y0 = 60
    b += label(x0 - 10, 40, "Endereço", 12, MUTED, "end", "700") + label(x0 + cw / 2, 40, "Conteúdo (word)", 12, MUTED, "middle", "700")
    b += label(x0 + cw + 14, 40, "Significado", 12, MUTED, weight="700")
    for k, wd in enumerate(words):
        y = y0 + k * rh
        frame = k // 2
        off = 4 - (k % 2) * 4
        fill = FILL if frame % 2 == 0 else FILL2
        b += f'<rect x="{x0}" y="{y}" width="{cw}" height="{rh}" fill="{fill}" stroke="{LINE}" stroke-width="1"/>'
        b += label(x0 - 10, y + 20, wd["end"], 12, INK, "end", mono=True)
        b += label(x0 + cw / 2, y + 20, wd["valor"], 13, INK, "middle", "700", mono=True)
        v = int(wd["valor"], 16)
        if off == 4:
            mean = "ra salvo → " + ("retorno ao main" if v == ret_main else "após o jal recursivo")
        else:
            mean = f"n salvo = {v}"
        b += label(x0 + cw + 14, y + 20, f"sp+{off}  {mean}", 12, INK)
    nfr = len(words) // 2
    for f in range(nfr):
        y = y0 + f * 2 * rh
        b += f'<rect x="{x0 - 175}" y="{y + 2}" width="8" height="{2 * rh - 4}" rx="3" fill="{BLUE if f % 2 == 0 else ORANGE}"/>'
        b += label(x0 - 160, y + 26, f"frame {f + 1}", 12, INK, weight="700")
        b += label(x0 - 160, y + 42, f"fatorial({nfr - f})", 12, MUTED, mono=True)
        b += f'<line x1="{x0}" y1="{y}" x2="{x0 + cw}" y2="{y}" stroke="{NAVY}" stroke-width="2"/>'
    yb = y0 + len(words) * rh
    b += f'<line x1="{x0}" y1="{yb}" x2="{x0 + cw}" y2="{yb}" stroke="{NAVY}" stroke-width="2"/>'
    sp_y = yb - rh / 2
    b += arrow([(x0 + cw + 330, sp_y), (x0 + cw + 280, sp_y)], ORANGE, marker="arrO")
    b += label(x0 + cw + 336, sp_y + 5, f"sp = {snap['sp']}", 13, ORANGE, weight="700", mono=True)
    top_y = y0 + 2
    b += arrow([(x0 + cw + 330, top_y), (x0 + cw + 280, top_y)], CYAN, marker="arrC")
    b += label(x0 + cw + 336, top_y + 5, "sp inicial = 0x7fffeffc", 13, CYAN, weight="700", mono=True)
    b += label(40, yb + 34, "Instantâneo no caso base de fatorial(5) (rótulo epilogo, a0 = 1). A pilha cresce para endereços menores: cada chamada", 12, INK)
    b += label(40, yb + 54, "executa addi sp, sp, −8 e grava ra e n antes de chamar a si mesma (5 frames × 8 B = 40 B). Na volta, lw t1, 0(sp) recarrega n,", 12, INK)
    b += label(40, yb + 74, "e o epílogo lê ra (lw ra, 4(sp)) e devolve o espaço (addi sp, sp, 8) antes do jr ra.", 12, INK)
    render("fig5_pilha_fatorial5", w, h, b)


# ---------------------------------------------------------------- Fig 6
def fig_grafico():
    comp = RES["comparacao"]
    w, h = 1020, 430
    b = ""
    def panel(px, title, key, ymax, ystep):
        pw, ph = 360, 280
        top = 70
        s = label(px, 32, title, 15, NAVY, weight="700")
        for k in range(0, ymax + 1, ystep):
            y = top + ph - k / ymax * ph
            s += f'<line x1="{px + 40}" y1="{y}" x2="{px + 40 + pw}" y2="{y}" stroke="#E3E7ED" stroke-width="1"/>'
            s += label(px + 32, y + 4, str(k), 11, MUTED, "end")
        xs = lambda n: px + 40 + (n - 1) / 11 * pw
        for n in range(1, 13):
            s += label(xs(n), top + ph + 18, str(n), 11, MUTED, "middle")
        s += label(px + 40 + pw / 2, top + ph + 40, "n (argumento do fatorial)", 12, INK, "middle")
        for kind, color, name in (("rec", ORANGE, "recursivo"), ("it", BLUE, "iterativo")):
            pts = [(xs(r["n"]), top + ph - r[kind][key] / ymax * ph) for r in comp]
            s += f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="none" stroke="{color}" stroke-width="2"/>'
            for x, y in pts:
                s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{color}" stroke="#fff" stroke-width="2"/>'
            last = comp[-1][kind][key]
            lx, ly = pts[-1]
            s += label(lx + 8, ly + 4 if kind == "rec" else ly - 6, f"{name}: {last}", 12, INK, weight="600")
        return s
    b += panel(30, "Instruções executadas", "instrucoes", 160, 40)
    b += panel(520, "Acessos à memória de dados (lw + sw)", "acessos_memoria_dados", 60, 15)
    b += f'<circle cx="300" cy="412" r="5" fill="{ORANGE}"/>' + label(310, 416, "fatorial recursivo: 13n − 4 instruções; 4n − 1 acessos", 12, INK)
    b += f'<circle cx="640" cy="412" r="5" fill="{BLUE}"/>' + label(650, 416, "iterativo: 4n + 1 instruções; 0 acessos", 12, INK)
    render("fig6_grafico_rec_vs_it", w, h, b)


fig_mapa()
fig_datapath()
fig_fluxo()
fig_formatos()
fig_pilha()
fig_grafico()
