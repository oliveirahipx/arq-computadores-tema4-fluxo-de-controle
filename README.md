# Tema 4 – Fluxo de Controle em Assembly (RISC-V)

Arquitetura de Computadores – Universidade Católica de Brasília – Prof. Weldes Lima Oliveira

**Integrantes:** Adam Amarildo Guedes Carneiro, Miguel Oliveira Silva e Yudi Yumetsu Ueyama

Estudo de como laços (*while*), decisões (*if/else*) e chamadas de função, inclusive recursivas, são implementados no nível de instrução da arquitetura RISC-V de 32 bits (RV32I com extensão M), usando o simulador RARS 1.6.

## Entregáveis

| Entregável | Onde está |
|---|---|
| Relatório técnico-acadêmico (ABNT) | `relatorio/Relatorio_Tema4_Fluxo_de_Controle.pdf` (e `.docx`) |
| Prova de conceito (Assembly) | `poc/fatorial_completo_tema4.s` |
| Roteiro da demonstração | Apêndice E do relatório |

## Conteúdo

- `poc/fatorial_completo_tema4.s` – programa principal: laço *while* que lê n e mostra uma mensagem de erro enquanto ele for negativo, decisão *if/else* no caso base e fatorial recursivo com quadro de pilha de 8 bytes.
- `poc/fatorial_iterativo.asm` – o mesmo fatorial com um laço, usado na comparação recursão × iteração.
- `poc/erros_comuns.asm` – reprodução de falhas típicas: laço infinito, endereço de retorno perdido e pilha desalinhada (o cenário é escolhido pelo valor de `s11`).
- `poc/tracer/rv32_tracer.py` – rastreador desenvolvido pelo grupo para medir instruções, acessos à memória e ciclos estimados.
- `poc/resultados/` – resultados das medições e rastro de cada instrução executada.
- `relatorio/figuras/` – figuras do relatório.
- `relatorio/fonte/` – scripts usados para montar as figuras e o relatório.

## Como executar no RARS

1. Abrir o RARS 1.6 (`java -jar rars1_6.jar`).
2. File › Open › `poc/fatorial_completo_tema4.s`.
3. Run › Assemble (F3) e Run › Go (F5).
4. Digitar um número na janela *Run I/O*. Com 5, o programa imprime 120.

## Validação

O programa foi executado no RARS 1.6. Com as entradas −3, −1 e 5, ele mostra a mensagem de erro duas vezes e imprime 120. Com 13, imprime 1932053504, o resultado truncado em 32 bits. A pilha no caso base de `fatorial(5)` e as contagens de instruções conferem com as medições do rastreador. O contador do RARS mostra uma instrução a menos, porque não conta o `ecall` de saída.
