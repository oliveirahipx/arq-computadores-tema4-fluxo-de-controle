# Arquivo: fatorial_iterativo.asm
# Simulador: RARS (RISC-V)
#
# Versão ITERATIVA do fatorial, usada só para comparar com a versão
# recursiva de fatorial_completo_tema4.s (seção 5.3 do relatório e
# slide 5 da apresentação). A função fatorial_it é folha: não chama
# ninguém, então não precisa salvar ra nem mexer na pilha.

.data
    msg_input:  .asciz "\nDigite um numero positivo para o fatorial: "
    msg_output: .asciz "\nO resultado do fatorial (iterativo) eh: "

.text
.globl main

main:
    li a7, 4                # Imprime mensagem de input
    la a0, msg_input
    ecall

    li a7, 5                # Lê inteiro do teclado (fica no a0)
    ecall

    jal ra, fatorial_it     # a0 = fatorial_it(n)
    mv t2, a0               # Guarda o resultado

    li a7, 4
    la a0, msg_output
    ecall

    mv a0, t2
    li a7, 1                # Imprime o resultado inteiro
    ecall

    li a7, 10               # Encerra o programa
    ecall

# =====================================================================
# FATORIAL ITERATIVO (laço while, sem pilha)
# Lógica: acc = 1; while (n > 1) { acc *= n; n--; } return acc;
# =====================================================================
fatorial_it:
    li t0, 1                # t0 = acumulador = 1
    li t1, 1                # t1 = limite
fit_laco:
    ble a0, t1, fit_fim     # while (n > 1): se n <= 1, sai do laço
    mul t0, t0, a0          # acc *= n
    addi a0, a0, -1         # n--
    j fit_laco              # volta para o teste
fit_fim:
    mv a0, t0               # valor de retorno em a0
    jr ra                   # retorna ao chamador
