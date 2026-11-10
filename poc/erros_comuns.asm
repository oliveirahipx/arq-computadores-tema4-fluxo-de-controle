# =====================================================================
#  UCB - Arquitetura de Computadores - Tema 4
#  erros_comuns.asm : reprodução controlada dos "desafios comuns"
#
#  Altere o valor carregado em s11 para escolher a falha:
#    1 = laço (quase) infinito por condição de saída invertida
#    2 = sub-rotina que não preserva ra  -> retorno para o lugar errado
#    3 = ponteiro de pilha desalinhado   -> exceção de acesso à memória
#  Simulador: RARS 1.6 (pare a execução manualmente nos casos 1 e 2)
# =====================================================================
        .text
        .globl main
main:
        li    s11, 1              # <<< escolha o cenário (1, 2 ou 3)
        li    t6, 1
        beq   s11, t6, erro1
        li    t6, 2
        beq   s11, t6, erro2
        j     erro3

# ---------------------------------------------------------------------
# ERRO 1 - while (a0 > 0) a0--;  escrito com a condição invertida.
#   Correto  : ble a0, zero, fim   (sai quando a0 <= 0)
#   Errado   : bge a0, zero, fim   (sai quando a0 >= 0)
#   Com a0 = -1 o laço decrementa um número que já é negativo e só
#   termina após ~2^31 iterações, quando o valor "dá a volta" (wrap-around)
#   para positivo. RISC-V não tem flag de overflow que interrompa o laço.
# ---------------------------------------------------------------------
erro1:
        li    a0, -1
laco1:
        bge   a0, zero, fim1      # BUG: condição invertida
        addi  a0, a0, -1
        j     laco1
fim1:
        j     sair

# ---------------------------------------------------------------------
# ERRO 2 - função recursiva que NÃO salva ra na pilha.
#   O "jal ra, conta" interno sobrescreve ra. Quando o caso base executa
#   "ret", ele volta para dentro de conta; o "ret" seguinte usa o MESMO ra
#   e o PC fica preso para sempre em 0x...  (laço infinito de retorno).
# ---------------------------------------------------------------------
erro2:
        li    a0, 3
        jal   ra, conta
        j     sair
conta:
        beq   a0, zero, conta_fim # caso base
        addi  a0, a0, -1
        jal   ra, conta           # BUG: ra do chamador foi perdido
conta_fim:
        ret

# ---------------------------------------------------------------------
# ERRO 3 - frame com tamanho que não é múltiplo de 4.
#   sp passa a 0x7fffeff6; o "sw" seguinte gera a exceção
#   "Store address not aligned on word boundary" no RARS.
# ---------------------------------------------------------------------
erro3:
        addi  sp, sp, -6          # BUG: deveria ser -8 ou -16
        sw    ra, 0(sp)

sair:
        li    a7, 10
        ecall
