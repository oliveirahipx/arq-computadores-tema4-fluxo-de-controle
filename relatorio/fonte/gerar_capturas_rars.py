"""Executa a PoC no RARS 1.6 (linha de comando) e gera as Figuras 6 e 7 a partir da saída real.

Uso: python relatorio/fonte/gerar_capturas_rars.py <caminho/rars1_6.jar>

Figura 6: execução completa digitando -3, -1 e 5 (console, contagem de instruções e registradores).
Figura 7: execução parada no caso base de fatorial(5) e dump da pilha lido da memória do RARS.
"""
import html
import os
import subprocess
import sys
import tempfile

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
JAR = sys.argv[1]
PROG = "poc/fatorial_completo_tema4.s"
FIGS = os.path.join(RAIZ, "relatorio", "figuras")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def rars(entrada, args):
    r = subprocess.run(["java", "-jar", JAR, "nc", "me", *args, PROG], input=entrada, cwd=RAIZ,
                       capture_output=True, text=True, timeout=60)
    return r.stdout, r.stderr


def render(nome, comando, blocos, largura=1100):
    linhas = []
    for cls, texto in blocos:
        for l in texto.rstrip("\n").split("\n"):
            linhas.append(f'<div class="{cls}">{html.escape(l) or "&nbsp;"}</div>')
    pagina = f"""<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;background:#fff;font-family:Consolas,monospace}}
.win{{margin:12px;border:1px solid #9AA5B4;border-radius:6px;overflow:hidden;width:{largura - 26}px}}
.bar{{background:#0B2545;color:#fff;font:600 14px Arial;padding:7px 12px}}
.term{{background:#1E1E1E;padding:12px 16px;font-size:15px;line-height:1.45;white-space:pre}}
.cmd{{color:#9CDCFE}} .out{{color:#E6E6E6}} .msg{{color:#F2C14E}} .reg{{color:#B5E8A8}} .mem{{color:#CE9178}}
</style></head><body><div class="win"><div class="bar">RARS 1.6 – execução em linha de comando</div>
<div class="term">{"".join(f'<div class="cmd">{html.escape(c)}</div>' for c in comando)}{''.join(linhas)}</div></div></body></html>"""
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(pagina)
    altura = 70 + 22 * (len(linhas) + len(comando)) + 30
    png = os.path.join(FIGS, nome + ".png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                    f"--window-size={largura},{altura}", "--force-device-scale-factor=2",
                    "file:///" + f.name.replace("\\", "/")], capture_output=True, timeout=120)
    os.unlink(f.name)
    print("ok", png)



# ---------------------------------------------------------------- Figura 6
out, err = rars("-3\n-1\n5\n", ["ic", "s0", "s1", "a0", "t0", "sp"])
render("captura_rars_execucao",
       [f"$ java -jar rars1_6.jar ic s0 s1 a0 t0 sp {PROG}", "# entradas digitadas: -3, -1, 5"],
       [("out", out.replace("\r", "")), ("msg", err.replace("\r", ""))])

# ---------------------------------------------------------------- Figura 7
passos = 44  # instruções até o caso base de fatorial(5): PC em epilogo com a0 = 1
dump = os.path.join(tempfile.gettempdir(), "pilha_rars.txt")
out, err = rars("5\n", [str(passos), "sp", "ra", "a0", "s0",
                        "dump", "0x7fffefd4-0x7ffff000", "HexText", dump])
palavras = open(dump).read().split()
os.unlink(dump)
mem = ["Conteúdo de pilha.txt (coluna \"significado\" anotada pelos autores):", "endereço      conteúdo      significado"]
for k, v in enumerate(palavras[:10]):
    end = 0x7FFFEFD4 + 4 * k
    sig = ("n = " + str(int(v, 16))) if k % 2 == 0 else ("ra salvo (volta ao main)" if v == "00400040" else "ra salvo (após o jal recursivo)")
    mem.append(f"0x{end:08x}    0x{v}    {sig}")
render("captura_rars_pilha",
       [f"$ java -jar rars1_6.jar {passos} sp ra a0 s0 dump 0x7fffefd4-0x7ffff000 HexText pilha.txt {PROG}",
        "# entrada digitada: 5"],
       [("out", out.replace("\r", "")), ("msg", err.replace("\r", "")), ("mem", "\n".join(mem))])
