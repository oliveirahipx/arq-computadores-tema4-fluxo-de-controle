"""
rv32_tracer.py - montador + simulador mínimo RV32IM para a PoC do Tema 4.

Objetivo: executar o mesmo .asm usado no RARS e extrair, de forma
reprodutível, as métricas discutidas no relatório:
  * instruções executadas (por classe)
  * desvios tomados / não tomados
  * acessos à memória (busca de instrução + LOAD/STORE de dados)
  * profundidade máxima da pilha
  * ciclos estimados (modelo monociclo e modelo multiciclo de
    Patterson & Hennessy)
  * rastro passo a passo (PC, instrução, registradores e memória alterados)

As pseudo-instruções são expandidas como no RARS 1.6, de modo que os
endereços e a contagem de instruções coincidam com o simulador oficial.
Uso:  python rv32_tracer.py ../fluxo_controle.asm
"""
import os
import re
import sys
import json

TEXT_BASE = 0x00400000
DATA_BASE = 0x10010000
SP_INIT = 0x7FFFEFFC
GP_INIT = 0x10008000

ABI = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1",
       "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7",
       "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11",
       "t3", "t4", "t5", "t6"]
REG = {n: i for i, n in enumerate(ABI)}
REG.update({f"x{i}": i for i in range(32)})
REG["fp"] = 8

# Modelo multiciclo (Patterson & Hennessy): ciclos por classe
MULTI = {"load": 5, "store": 4, "alu": 4, "mul": 4, "branch": 3,
         "jump": 3, "system": 4, "upper": 4}

M32 = 0xFFFFFFFF


def s32(v):
    v &= M32
    return v - (1 << 32) if v & 0x80000000 else v


def reg(tok):
    tok = tok.strip()
    if tok not in REG:
        raise ValueError(f"registrador inválido: {tok}")
    return REG[tok]


def imm(tok):
    tok = tok.strip()
    return int(tok, 0)


def strip_comment(line):
    out, in_str = [], False
    for ch in line:
        if ch == '"':
            in_str = not in_str
        if ch == "#" and not in_str:
            break
        out.append(ch)
    return "".join(out).strip()


def split_ops(s):
    return [p.strip() for p in s.split(",")] if s.strip() else []


def hi_lo(offset):
    lo = offset & 0xFFF
    if lo & 0x800:
        lo -= 0x1000
    hi = ((offset - lo) >> 12) & 0xFFFFF
    return hi, lo


class Program:
    def __init__(self, path):
        self.src = open(path, encoding="utf-8").read().splitlines()
        self.labels = {}
        self.data = bytearray()
        self.text = []          # lista de dicts {addr, op, args, src, line}
        self._assemble()

    # -------- passagem 1: tamanhos e rótulos --------------------------
    def _expand_size(self, op, args):
        if op == "la":
            return 2
        if op in ("lw", "lb", "lbu", "lh", "lhu") and "(" not in args[1]:
            return 2
        if op == "li":
            v = imm(args[1])
            return 1 if -2048 <= v <= 2047 else 2
        if op == "call":
            return 2
        return 1

    def _assemble(self):
        seg = "text"
        pc, dp = TEXT_BASE, DATA_BASE
        pending = []
        for ln, raw in enumerate(self.src, 1):
            line = strip_comment(raw)
            if not line:
                continue
            while True:
                m = re.match(r"^([A-Za-z_][\w.]*):\s*(.*)$", line)
                if not m:
                    break
                self.labels[m.group(1)] = pc if seg == "text" else dp
                line = m.group(2).strip()
            if not line:
                continue
            if line.startswith("."):
                parts = line.split(None, 1)
                d = parts[0]
                rest = parts[1] if len(parts) > 1 else ""
                if d == ".data":
                    seg = "data"
                elif d == ".text":
                    seg = "text"
                elif d == ".word":
                    while (dp - DATA_BASE) % 4:
                        self.data.append(0); dp += 1
                    for v in split_ops(rest):
                        self.data += (int(v, 0) & M32).to_bytes(4, "little")
                        dp += 4
                elif d == ".space":
                    n = int(rest, 0)
                    self.data += bytes(n); dp += n
                elif d in (".asciz", ".string"):
                    s = bytes(rest.strip()[1:-1], "utf-8").decode("unicode_escape")
                    b = s.encode("latin-1") + b"\0"
                    self.data += b; dp += len(b)
                continue
            parts = line.split(None, 1)
            op = parts[0]
            args = split_ops(parts[1]) if len(parts) > 1 else []
            n = self._expand_size(op, args)
            pending.append((pc, op, args, raw.strip(), ln))
            pc += 4 * n
        for pc, op, args, raw, ln in pending:
            for inst in self._expand(pc, op, args):
                inst.update(src=raw, line=ln)
                self.text.append(inst)
        self.by_addr = {i["addr"]: i for i in self.text}

    # -------- passagem 2: expansão de pseudo-instruções (estilo RARS) --
    def _lbl(self, t):
        return self.labels[t] if t in self.labels else imm(t)

    def _expand(self, pc, op, a):
        I = lambda addr, o, *x: {"addr": addr, "op": o, "args": list(x)}
        L = self._lbl
        if op == "li":
            v = imm(a[1])
            if -2048 <= v <= 2047:
                return [I(pc, "addi", reg(a[0]), 0, v)]
            hi, lo = hi_lo(v)
            return [I(pc, "lui", reg(a[0]), hi), I(pc + 4, "addi", reg(a[0]), reg(a[0]), lo)]
        if op == "la" or (op == "lw" and "(" not in a[1]):
            hi, lo = hi_lo(L(a[1]) - pc)
            r = reg(a[0])
            second = "addi" if op == "la" else "lw"
            return [I(pc, "auipc", r, hi), I(pc + 4, second, r, r, lo)]
        if op == "mv":
            return [I(pc, "add", reg(a[0]), 0, reg(a[1]))]
        if op == "neg":
            return [I(pc, "sub", reg(a[0]), 0, reg(a[1]))]
        if op == "nop":
            return [I(pc, "addi", 0, 0, 0)]
        if op == "j":
            return [I(pc, "jal", 0, L(a[0]) - pc)]
        if op == "jal":
            if len(a) == 1:
                return [I(pc, "jal", 1, L(a[0]) - pc)]
            return [I(pc, "jal", reg(a[0]), L(a[1]) - pc)]
        if op == "ret":
            return [I(pc, "jalr", 0, 1, 0)]
        if op == "jr":
            return [I(pc, "jalr", 0, reg(a[0]), 0)]
        swap = {"bgt": "blt", "ble": "bge", "bgtu": "bltu", "bleu": "bgeu"}
        if op in swap:
            return [I(pc, swap[op], reg(a[1]), reg(a[0]), L(a[2]) - pc)]
        zero_br = {"beqz": ("beq", 0), "bnez": ("bne", 0), "bgez": ("bge", 0),
                   "bltz": ("blt", 0), "blez": ("bge", 1), "bgtz": ("blt", 1)}
        if op in zero_br:
            o, rev = zero_br[op]
            r = reg(a[0])
            rs1, rs2 = (0, r) if rev else (r, 0)
            return [I(pc, o, rs1, rs2, L(a[1]) - pc)]
        if op in ("beq", "bne", "blt", "bge", "bltu", "bgeu"):
            return [I(pc, op, reg(a[0]), reg(a[1]), L(a[2]) - pc)]
        if op in ("lw", "sw"):
            m = re.match(r"(-?\w*)\((\w+)\)", a[1])
            off = int(m.group(1), 0) if m.group(1) else 0
            return [I(pc, op, reg(a[0]), reg(m.group(2)), off)]
        if op in ("add", "sub", "mul", "and", "or", "xor", "slt", "sltu", "sll", "srl", "sra"):
            return [I(pc, op, reg(a[0]), reg(a[1]), reg(a[2]))]
        if op in ("addi", "slli", "srli", "srai", "andi", "ori", "xori", "slti"):
            return [I(pc, op, reg(a[0]), reg(a[1]), imm(a[2]))]
        if op == "ecall":
            return [I(pc, "ecall")]
        raise ValueError(f"instrução não suportada: {op}")


# ---------------- codificação binária (formatos R/I/S/B/U/J) ----------
R_F = {"add": (0, 0), "sub": (0, 0x20), "sll": (1, 0), "slt": (2, 0), "sltu": (3, 0),
       "xor": (4, 0), "srl": (5, 0), "sra": (5, 0x20), "or": (6, 0), "and": (7, 0),
       "mul": (0, 1)}
I_F = {"addi": 0, "slti": 2, "xori": 4, "ori": 6, "andi": 7, "slli": 1, "srli": 5, "srai": 5}
B_F = {"beq": 0, "bne": 1, "blt": 4, "bge": 5, "bltu": 6, "bgeu": 7}


def encode(i):
    op, a = i["op"], i["args"]
    if op in R_F:
        f3, f7 = R_F[op]
        return (f7 << 25) | (a[2] << 20) | (a[1] << 15) | (f3 << 12) | (a[0] << 7) | 0x33, "R"
    if op in I_F:
        v = a[2] & 0xFFF
        if op == "srai":
            v |= 0x400
        return (v << 20) | (a[1] << 15) | (I_F[op] << 12) | (a[0] << 7) | 0x13, "I"
    if op == "lw":
        return ((a[2] & 0xFFF) << 20) | (a[1] << 15) | (2 << 12) | (a[0] << 7) | 0x03, "I"
    if op == "jalr":
        return ((a[2] & 0xFFF) << 20) | (a[1] << 15) | (a[0] << 7) | 0x67, "I"
    if op == "sw":
        v = a[2] & 0xFFF
        return ((v >> 5) << 25) | (a[0] << 20) | (a[1] << 15) | (2 << 12) | ((v & 0x1F) << 7) | 0x23, "S"
    if op in B_F:
        v = a[2] & 0x1FFF
        return (((v >> 12) & 1) << 31) | (((v >> 5) & 0x3F) << 25) | (a[1] << 20) | (a[0] << 15) | \
               (B_F[op] << 12) | (((v >> 1) & 0xF) << 8) | (((v >> 11) & 1) << 7) | 0x63, "B"
    if op == "jal":
        v = a[1] & 0x1FFFFF
        return (((v >> 20) & 1) << 31) | (((v >> 1) & 0x3FF) << 21) | (((v >> 11) & 1) << 20) | \
               (((v >> 12) & 0xFF) << 12) | (a[0] << 7) | 0x6F, "J"
    if op == "auipc":
        return (a[1] << 12) | (a[0] << 7) | 0x17, "U"
    if op == "lui":
        return (a[1] << 12) | (a[0] << 7) | 0x37, "U"
    if op == "ecall":
        return 0x00000073, "I"
    raise ValueError(op)


def disasm(i):
    op, a = i["op"], i["args"]
    r = lambda n: ABI[n]
    if op in R_F:
        return f"{op} {r(a[0])}, {r(a[1])}, {r(a[2])}"
    if op in I_F:
        return f"{op} {r(a[0])}, {r(a[1])}, {a[2]}"
    if op in ("lw", "jalr"):
        return f"{op} {r(a[0])}, {a[2]}({r(a[1])})"
    if op == "sw":
        return f"sw {r(a[0])}, {a[2]}({r(a[1])})"
    if op in B_F:
        return f"{op} {r(a[0])}, {r(a[1])}, {a[2]:+d}"
    if op == "jal":
        return f"jal {r(a[0])}, {a[1]:+d}"
    if op in ("auipc", "lui"):
        return f"{op} {r(a[0])}, 0x{a[1]:x}"
    return op


def classify(op):
    if op == "lw": return "load"
    if op == "sw": return "store"
    if op in B_F: return "branch"
    if op in ("jal", "jalr"): return "jump"
    if op == "mul": return "mul"
    if op == "ecall": return "system"
    if op in ("lui", "auipc"): return "upper"
    return "alu"


def sources(i):
    """Registradores-fonte lidos pela instrução (para detectar dependência RAW)."""
    op, a = i["op"], i["args"]
    if op in R_F or op in B_F or op == "sw":
        return {a[1], a[2]} - {0} if op in R_F else {a[0], a[1]} - {0}
    if op in I_F or op in ("lw", "jalr"):
        return {a[1]} - {0}
    return set()


# ---------------- simulador -------------------------------------------
class CPU:
    def __init__(self, prog, entradas=()):
        self.p = prog
        self.entradas = list(entradas)   # valores "digitados" para o ecall 5
        self.x = [0] * 32
        self.x[2] = SP_INIT
        self.x[3] = GP_INIT
        self.mem = {}
        for k, b in enumerate(prog.data):
            self.mem[DATA_BASE + k] = b
        self.pc = TEXT_BASE
        self.out = []
        self.reset_stats()

    def reset_stats(self):
        self.stats = {"instrucoes": 0, "por_classe": {}, "desvios_tomados": 0,
                      "desvios_nao_tomados": 0, "loads": 0, "stores": 0,
                      "sp_min": self.x[2], "sp_ini": self.x[2], "ciclos_multiciclo": 0,
                      "bolhas_load_use": 0, "descartes_controle": 0}
        self.trace = []
        self.prev_load_rd = 0

    def rd(self, addr):
        if addr % 4:
            raise RuntimeError(f"Load address misaligned: 0x{addr:08x}")
        return int.from_bytes(bytes(self.mem.get(addr + k, 0) for k in range(4)), "little")

    def wr(self, addr, v):
        if addr % 4:
            raise RuntimeError(f"Store address misaligned: 0x{addr:08x}")
        for k, b in enumerate((v & M32).to_bytes(4, "little")):
            self.mem[addr + k] = b

    def cstr(self, addr):
        s = bytearray()
        while self.mem.get(addr, 0):
            s.append(self.mem[addr]); addr += 1
        return s.decode("latin-1")

    def step(self, record=False):
        i = self.p.by_addr.get(self.pc)
        if i is None:
            raise RuntimeError(f"PC fora do segmento de texto: 0x{self.pc:08x}")
        op, a, x = i["op"], i["args"], self.x
        old = list(x)
        pc0, npc = self.pc, self.pc + 4
        memop = None
        cls = classify(op)
        st = self.stats
        st["instrucoes"] += 1
        st["por_classe"][cls] = st["por_classe"].get(cls, 0) + 1
        st["ciclos_multiciclo"] += MULTI[cls]
        # pipeline de 5 estágios: bolha se a instrução lê o rd de um lw anterior
        if self.prev_load_rd and self.prev_load_rd in sources(i):
            st["bolhas_load_use"] += 1
        self.prev_load_rd = a[0] if op == "lw" else 0
        def W(r, v):
            if r: x[r] = v & M32
        if op == "add": W(a[0], x[a[1]] + x[a[2]])
        elif op == "sub": W(a[0], x[a[1]] - x[a[2]])
        elif op == "mul": W(a[0], s32(x[a[1]]) * s32(x[a[2]]))
        elif op == "and": W(a[0], x[a[1]] & x[a[2]])
        elif op == "or": W(a[0], x[a[1]] | x[a[2]])
        elif op == "xor": W(a[0], x[a[1]] ^ x[a[2]])
        elif op == "slt": W(a[0], int(s32(x[a[1]]) < s32(x[a[2]])))
        elif op == "addi": W(a[0], x[a[1]] + a[2])
        elif op == "slli": W(a[0], x[a[1]] << a[2])
        elif op == "srli": W(a[0], x[a[1]] >> a[2])
        elif op == "andi": W(a[0], x[a[1]] & a[2])
        elif op == "ori": W(a[0], x[a[1]] | a[2])
        elif op == "auipc": W(a[0], pc0 + (a[1] << 12))
        elif op == "lui": W(a[0], a[1] << 12)
        elif op == "lw":
            ad = (x[a[1]] + a[2]) & M32
            W(a[0], self.rd(ad)); st["loads"] += 1
            memop = ("R", ad, self.rd(ad))
        elif op == "sw":
            ad = (x[a[1]] + a[2]) & M32
            self.wr(ad, x[a[0]]); st["stores"] += 1
            memop = ("W", ad, x[a[0]])
        elif op in B_F:
            v1, v2 = x[a[0]], x[a[1]]
            take = {"beq": v1 == v2, "bne": v1 != v2,
                    "blt": s32(v1) < s32(v2), "bge": s32(v1) >= s32(v2),
                    "bltu": v1 < v2, "bgeu": v1 >= v2}[op]
            if take:
                npc = pc0 + a[2]; st["desvios_tomados"] += 1
            else:
                st["desvios_nao_tomados"] += 1
        elif op == "jal":
            W(a[0], pc0 + 4); npc = pc0 + a[1]
        elif op == "jalr":
            t = (x[a[1]] + a[2]) & ~1
            W(a[0], pc0 + 4); npc = t
        elif op == "ecall":
            svc = x[17]
            if svc == 1: self.out.append(str(s32(x[10])))
            elif svc == 4: self.out.append(self.cstr(x[10]))
            elif svc == 11: self.out.append(chr(x[10]))
            elif svc == 5:
                v = self.entradas.pop(0)
                self.out.append(f"{v}\n"); W(10, v)
            elif svc == 10: npc = None
        if npc is not None and npc != pc0 + 4:
            st["descartes_controle"] += 1      # desvio tomado / salto: 2 ciclos perdidos
        self.pc = npc
        st["sp_min"] = min(st["sp_min"], x[2])
        if record:
            ch = {ABI[r]: f"0x{x[r]:08x}" for r in range(32) if x[r] != old[r]}
            self.trace.append({"passo": st["instrucoes"], "pc": f"0x{pc0:08x}",
                               "basica": disasm(i), "fonte": i["src"].split("#")[0].strip(),
                               "regs": ch,
                               "mem": None if memop is None else
                               {"op": memop[0], "end": f"0x{memop[1]:08x}", "valor": s32(memop[2])}})
        return npc is not None

    def run(self, record=False, limit=1_000_000):
        while self.step(record):
            if self.stats["instrucoes"] > limit:
                raise RuntimeError("limite de instruções excedido (laço infinito?)")

    def call(self, label, arg, record=False):
        """Executa uma função isolada: a0 = arg, ra = endereço-sentinela."""
        SENT = 0x00000000
        self.reset_stats()
        self.x[10] = arg & M32
        self.x[1] = SENT
        self.pc = self.p.labels[label]
        while self.pc != SENT:
            self.step(record)
        return s32(self.x[10])

    def summary(self):
        st = dict(self.stats)
        st["acessos_memoria_dados"] = st["loads"] + st["stores"]
        st["acessos_barramento_total"] = st["instrucoes"] + st["acessos_memoria_dados"]
        st["profundidade_pilha_bytes"] = st["sp_ini"] - st["sp_min"]
        st["ciclos_monociclo"] = st["instrucoes"]
        st["cpi_multiciclo"] = round(st["ciclos_multiciclo"] / st["instrucoes"], 3)
        st["ciclos_pipeline5"] = st["instrucoes"] + 4 + st["bolhas_load_use"] + 2 * st["descartes_controle"]
        st["cpi_pipeline5"] = round(st["ciclos_pipeline5"] / st["instrucoes"], 3)
        del st["sp_min"], st["sp_ini"]
        return st


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "../fatorial_completo_tema4.s"
    outdir = sys.argv[2] if len(sys.argv) > 2 else "."
    path_it = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(path), "fatorial_iterativo.asm")
    os.makedirs(outdir, exist_ok=True)
    prog = Program(path)
    prog_it = Program(path_it)
    ultimo_int = lambda txt: int(re.findall(r"-?\d+", txt)[-1])

    # 1) Segmento de texto (como a aba "Text Segment" do RARS)
    listing = []
    for i in prog.text:
        code, fmt = encode(i)
        listing.append({"end": f"0x{i['addr']:08x}", "codigo": f"0x{code:08x}", "formato": fmt,
                        "basica": disasm(i), "linha": i["line"],
                        "fonte": i["src"].split("#")[0].strip()})

    # 2) Execução completa do programa: o usuário digita -3, -1 e por fim 5
    ENTRADAS = [-3, -1, 5]
    cpu = CPU(prog, ENTRADAS)
    cpu.run(record=True)
    full = {"entradas": ENTRADAS, "saida_console": "".join(cpu.out), "metricas": cpu.summary(),
            "registradores_finais": {ABI[r]: f"0x{cpu.x[r]:08x}" for r in range(32)},
            "resultado": ultimo_int("".join(cpu.out))}
    trace_full = cpu.trace

    # 2b) Execução com n = 13 (estouro de 32 bits)
    c13 = CPU(prog, [13]); c13.run()
    i13 = CPU(prog_it, [13]); i13.run()
    full["estouro13"] = {"saida_console": "".join(c13.out),
                         "res": [ultimo_int("".join(c13.out)), ultimo_int("".join(i13.out))]}
    c5 = CPU(prog, [5]); c5.run()
    full["so_5"] = {"metricas": c5.summary(), "saida_console": "".join(c5.out)}
    it5 = CPU(prog_it, [5]); it5.run()
    full["iterativo_5"] = {"metricas": it5.summary(), "saida_console": "".join(it5.out),
                           "resultado": ultimo_int("".join(it5.out))}

    # 3) Comparação recursivo x iterativo, n = 1..12
    comp = []
    for n in range(1, 13):
        c1 = CPU(prog); r1 = c1.call("fatorial", n); m1 = c1.summary()
        c2 = CPU(prog_it); r2 = c2.call("fatorial_it", n); m2 = c2.summary()
        comp.append({"n": n, "rec_valor": r1, "it_valor": r2, "rec": m1, "it": m2})

    # 4) Rastro detalhado de fatorial(3), chamado no mesmo contexto do main
    #    (ra = instrução seguinte ao "jal ra, fatorial")
    fat = prog.labels["fatorial"]
    ret_main = next(i["addr"] for i in prog.text
                    if i["op"] == "jal" and i["args"][0] == 1 and i["addr"] + i["args"][1] == fat
                    and i["addr"] < fat) + 4
    c = CPU(prog)
    c.reset_stats(); c.x[10] = 3; c.x[1] = ret_main
    c.x[8] = 3; c.pc = fat
    while c.pc != ret_main:
        c.step(record=True)
    fat3 = {"trace": c.trace, "metricas": c.summary()}

    # 5) Snapshot da pilha no caso base de fatorial(5), no programa completo
    c = CPU(prog, [5])
    snap = {}
    while not snap:
        if c.pc == prog.labels["epilogo"] and c.x[10] == 1:
            sp = c.x[2]
            snap = {"sp": f"0x{sp:08x}", "fp_s0": f"0x{c.x[8]:08x}", "ra": f"0x{c.x[1]:08x}",
                    "palavras": [{"end": f"0x{ad:08x}", "valor": f"0x{c.rd(ad):08x}"}
                                 for ad in range(SP_INIT - 4, sp - 4, -4)]}
            break
        c.step()
    fat3["pilha_fatorial5_caso_base"] = snap

    json.dump({"labels": {k: f"0x{v:08x}" for k, v in prog.labels.items()},
               "labels_iterativo": {k: f"0x{v:08x}" for k, v in prog_it.labels.items()},
               "listagem": listing, "execucao_completa": full,
               "comparacao": comp, "fatorial3": fat3},
              open(f"{outdir}/resultados.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(f"{outdir}/trace_programa.csv", "w", encoding="utf-8") as f:
        f.write("passo;pc;instrucao_basica;fonte;registradores_alterados;memoria\n")
        for t in trace_full:
            regs = " ".join(f"{k}={v}" for k, v in t["regs"].items())
            mem = "" if not t["mem"] else f"{t['mem']['op']} {t['mem']['end']} = {t['mem']['valor']}"
            f.write(f"{t['passo']};{t['pc']};{t['basica']};{t['fonte']};{regs};{mem}\n")

    print(full["saida_console"])
    print(json.dumps(full["metricas"], indent=1))
    print("n | rec instr | rec lw+sw | rec pilha | it instr | it lw+sw")
    for r in comp:
        print(r["n"], r["rec"]["instrucoes"], r["rec"]["acessos_memoria_dados"],
              r["rec"]["profundidade_pilha_bytes"], r["it"]["instrucoes"], r["it"]["acessos_memoria_dados"])


if __name__ == "__main__":
    main()
