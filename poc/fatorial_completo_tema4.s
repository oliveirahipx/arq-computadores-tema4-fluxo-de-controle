# Arquivo: fatorial_completo_tema4.s
# Simulador: RARS (RISC-V)

.data
    msg_input:  .asciz "\nDigite um numero positivo para o fatorial: "
    msg_erro:   .asciz "\nErro: O numero nao pode ser negativo!"
    msg_output: .asciz "\nO resultado do fatorial eh: "

.text
.globl main

main:
    # =====================================================================
    # 1. ESTRUTURA DE REPETIÇÃO (Equivalente a WHILE)
    # Lógica: while (input < 0) { print erro; pede de novo; }
    # =====================================================================
laco_while:
    li a7, 4                # Imprime mensagem de input
    la a0, msg_input
    ecall

    li a7, 5                # Lê inteiro do teclado (fica no a0)
    ecall

    # Condição do While
    bge a0, zero, fim_while # Se a0 >= 0 (Branch if Greater or Equal), quebra o laço e vai para 'fim_while'

    # Corpo do While (se a0 < 0)
    mv s1, a0               # Guarda o valor temporariamente
    li a7, 4                # Imprime mensagem de erro
    la a0, msg_erro
    ecall
    j laco_while            # Salto incondicional voltando para o topo do laço (Loop)

fim_while:
    mv s0, a0               # Salva o input validado no registrador s0

    # Configuração e Chamada do Procedimento
    mv a0, s0               # Passa 'n' como argumento
    jal ra, fatorial        # Salta para a recursão, salvando o endereço de retorno em 'ra'

    # Saída de Dados
    mv t0, a0               # Guarda o resultado

    li a7, 4
    la a0, msg_output
    ecall

    mv a0, t0
    li a7, 1                # Imprime o resultado inteiro
    ecall

    li a7, 10               # Encerra o programa
    ecall

# =====================================================================
# 2. CHAMADA RECURSIVA SIMPLES E MANIPULAÇÃO DA PILHA (Stack Frame)
# =====================================================================
fatorial:
    # Prólogo: Empilhamento (Stack Frame)
    addi sp, sp, -8         # Aloca 8 bytes na pilha (Stack Pointer)
    sw ra, 4(sp)            # Salva o endereço de retorno na pilha
    sw a0, 0(sp)            # Salva o valor atual de 'n' na pilha

    # =====================================================================
    # 3. ESTRUTURA DE DECISÃO (Equivalente a IF/ELSE)
    # Lógica: if (n <= 1) { return 1; } else { return n * fatorial(n-1); }
    # =====================================================================
    li t1, 1
    ble a0, t1, if_caso_base # IF: Se a0 <= 1, desvia para 'if_caso_base'

    # ELSE (Corpo da recursão)
    addi a0, a0, -1         # Decrementa n
    jal ra, fatorial        # Chamada recursiva

    # Retorno do Else (Desempilhamento parcial)
    lw t1, 0(sp)            # Recupera o 'n' empilhado
    mul a0, t1, a0          # n * fatorial(n-1)
    j epilogo               # Pula o if_caso_base

if_caso_base:
    li a0, 1                # Retorna 1

epilogo:
    # Epílogo: Desempilhamento de dados (Stack Frame)
    lw ra, 4(sp)            # Recupera o endereço de retorno
    addi sp, sp, 8          # Libera os 8 bytes da pilha
    jr ra                   # Retorna ao chamador
