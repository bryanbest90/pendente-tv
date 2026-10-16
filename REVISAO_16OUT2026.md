# Revisão geral — 16 de outubro de 2026

Pedido do Bryan: revisar o projeto inteiro, procurando falhas de
segurança e, principalmente, dado que não bate com a realidade. Junto,
conferir a planilha ISAP nova da Sabesp (01 a 15/10, PARCIAL) contra a
nossa base.

Tudo aqui foi **medido**, não suposto. Onde eu não consegui medir, está
escrito que não consegui.

---

## Parte 1 — O IDG contra a planilha da Sabesp

### O que foi comparado

Planilha: `ISAP_serviços_PARCIAL_01_10_2026_ate_31_10_2026_15_10.xlsx`,
3.534 linhas, execuções de 01/10 06:58 a 14/10 17:38.
Nosso lado: `v_idg`, mesma janela, 3.831 linhas.

**A chave que casa os dois:** o `NUM_OS` deles é o nosso número com
`20` na frente. Tem 12 **ou 13** dígitos, porque o nosso tem 10 ou 11.
Pegar "os últimos 10" parece funcionar e não funciona: corta os de 11 e
joga fora um quarto da planilha. Errei isso na primeira passada desta
análise, e o sintoma foi suspeito do jeito certo — 25% sem casar dos
**dois** lados, com os mesmos serviços nas mesmas quantidades. Gente
não some em pares assim; chave errada, sim.

### O resultado

| | batem | de | % |
|---|---|---|---|
| cobertura (pares deles que temos) | 3.520 | 3.534 | **99,6%** |
| data de competência | 3.520 | 3.520 | **100,00%** |
| indicador (frente) | 3.520 | 3.520 | **100,00%** |
| prazo do contrato | 3.519 | 3.520 | 99,97% |
| tempo de atendimento | 3.482 | 3.520 | 98,92% |
| veredito dentro/fora | 3.433 | 3.520 | **97,53%** |

Competência e frente em 100% de 3.520 linhas não é coincidência: a
leitura da planilha está certa.

### O IDG, lado a lado

Nas 3.520 linhas que os dois têm:

| frente | Sabesp | nosso | diferença |
|---|---|---|---|
| ISAPa | 86,76% | 84,11% | −2,65 pp |
| ISAPe | 83,40% | 83,40% | **0,00 pp** |
| ISAPr | 94,70% | 93,01% | −1,69 pp |
| **total** | **87,33%** | **85,20%** | **−2,13 pp** |

### A causa da diferença é uma só, e é conhecida

Dos 87 vereditos que divergem:

| situação | casos |
|---|---|
| eles expurgam por **atraso de transmissão**, nós não | 75 |
| eles expurgam por **suspensão**, nós não | 3 |
| divergência de verdade | **9** |

78 dos 87 são os dois expurgos que não temos como calcular. 78 em 3.520
dá 2,2 pp — que é quase exatamente os 2,13 pp de diferença no total.

**Em uma frase: o nosso número é pessimista em cerca de 2 pontos, e o
motivo é um só — falta a hora da Data Inserção para calcular o expurgo
de transmissão.** Está registrado no CLAUDE.md desde 13/10: a
`os_entrada.data_insercao` é DATE e não guarda a hora, e o histórico
não dá para reconstruir.

O ISAPe bater exatamente (83,40% nos dois) reforça: onde não há expurgo
de transmissão, a conta é idêntica.

### As 9 divergências de verdade

Seis são a **mesma baixa com data diferente** — eles contam uma baixa
que nós não contamos, ou o contrário:

| OS | serviço | fim deles | execução nossa |
|---|---|---|---|
| 2639228605 | CAVALETE QUEBRADO | 01/10 17:04 | 03/10 08:47 |
| 2639230499 | POUCA PRESSÃO | 01/10 17:04 | 02/10 12:46 |
| 2639282634 | LIGAÇÃO DE ÁGUA S/V | 14/10 08:54 | 07/10 12:19 |
| 2639463860 | LIGAÇÃO DE ÁGUA S/V | 13/10 14:03 | 08/10 09:00 |
| 2639467296 | LIGAÇÃO DE ÁGUA S/V | 13/10 10:08 | 07/10 11:55 |
| 2638339474 | LIGAÇÃO DE ESGOTO S/V | 02/10 08:17 | 01/10 10:09 |

Nos quatro de LIGAÇÃO (2540/5050) a data deles é **posterior** à nossa,
e por isso eles dão FORA onde damos DENTRO. Hipótese a testar: são OS
que receberam uma baixa depois da que nós consideramos final, e que a
nossa regra descarta (FIM DO DIA, CONTINUA, REPROGRAMAR ORDEM) mas a
deles não. Nos dois primeiros é o contrário — a nossa é posterior.

Três são desacordo no expurgo de tempo de execução (início igual ao
fim): 2 em que expurgamos e eles não, 1 em que eles expurgam e nós não.

**9 em 3.520 é 0,26%.** Não muda o índice; é o que sobra para fechar a
conta casa a casa.

### Os dois universos

| | qtd | o que é |
|---|---|---|
| só a Sabesp tem | **14** | espalhadas, sem padrão |
| só nós temos | **311** | 81 são vazamento |

As 14 que faltam na nossa base são poucas e merecem uma olhada caso a
caso — nenhuma delas tem nada em comum (ATC, dia, serviço).

As 311 que só nós temos são 8% do nosso total, e as campeãs são
VAZAMENTO DE ÁGUA LEITO PAVIMENTADO (38), NO PASSEIO (27) e COM
INFILTRAÇÃO (16). É **a regra da troca de ramal**, já documentada no
CLAUDE.md e já levada à Sabesp: vazamento resolvido com troca de ramal
some do ISAP deles. O IDG dessas 311 é 70,7%, bem abaixo dos 87% —
incluí-las puxa o nosso número para baixo, que é o esperado.

### Veredito da Parte 1

**A nossa conta é confiável.** Competência e frente batem em 100%,
veredito em 97,5%, e a diferença de 2 pp tem uma causa única,
conhecida e documentada. Não encontrei nenhum erro de regra.

---

## Parte 2 — Segurança

Aqui está o problema sério, e ele não é teórico: testei contra o banco
de produção com a chave que está dentro do site, a mesma que qualquer
pessoa lê abrindo o código-fonte da página.

### Leitura

| objeto | a chave do site lê? | |
|---|---|---|
| `v_idg` | **SIM** | o IDG inteiro |
| `v_execucao_final` | **SIM** | a baixa final de cada OS |
| `execucao` | **SIM** | produção por equipe, dia a dia |
| `os_desfecho` | **SIM** | |
| `em_rua`, `equipe`, `tss_tipo`, `isap_tss` | SIM | menos grave |
| `v_idg_seguro` | não | bloqueado |
| `v_producao_detalhe`, `v_producao_equipe_dia` | não | bloqueado |
| `v_execucao_serie` | não | bloqueado hoje de manhã |

**A trava do IDG não está travando nada.** A aba é escondida pelo
`perfis.pode_idg` e a `v_idg_seguro` recusa a chave anônima — mas a
`v_idg`, que é a view de baixo, está aberta. É o mesmo erro que o
CLAUDE.md já descreve com todas as letras ("esconder a aba na tela não
protegeria uma view que a chave do navegador alcança"), um nível abaixo.

### Escrita — este é o pior

Testado com cargas que o banco **sempre** rejeita (chave duplicada,
campo obrigatório nulo), então nada foi gravado. O código do erro diz
se a permissão passou antes da rejeição.

| tabela | a chave do site escreve? |
|---|---|
| `execucao` | **SIM** (erro 23505 — duplicidade, ou seja, passou da permissão) |
| `equipe` | **SIM** |
| `tss_tipo` | **SIM** |
| `em_rua` | **SIM** |
| `perfis` | não (42501) |

`execucao` é a tabela que alimenta o IDG e a Produção. Qualquer pessoa
com a chave do site pode inserir linhas nela.

No `sql/itinerario.sql` as políticas `equipe_semente` e
`tss_tipo_semente` são `FOR ALL TO anon USING(true) WITH CHECK(true)` —
leitura, escrita e apagamento liberados. O nome diz "semente": nasceram
para carregar os dados iniciais e ficaram.

E no `sql/isap_execucao.sql`, linha 148:
`GRANT EXECUTE ON FUNCTION limpar_execucao_antiga(...) TO anon` — uma
função que **apaga** faixas da `execucao`, liberada para a chave do
site. Essa eu não testei, porque testar seria apagar.

### Por que isso acontece, em português claro

O site é uma página que roda no navegador de quem acessa. Para falar
com o banco, ele leva uma senha junto — a "chave anônima". Essa chave
está dentro do código da página: qualquer pessoa aperta Ctrl+U e lê.
Isso é normal e por design; o que protege o banco não é a chave ser
secreta, é o banco ter regras dizendo o que essa chave pode fazer.

As regras existem e funcionam em várias tabelas. Nas de cima, não.

### O que eu NÃO fiz

Não mexi em nada disso. Fechar essas portas quebra partes do site que
hoje dependem delas — a aba Carteira lê `execucao` direto, por
exemplo —, e não vou derrubar o painel às dez da manhã de uma sexta.

---

## Parte 3 — O que eu faria, nesta ordem

**1. Tirar o `anon` da função que apaga.** Uma linha, não quebra nada:

```sql
REVOKE EXECUTE ON FUNCTION limpar_execucao_antiga(DATE, DATE, TIMESTAMPTZ) FROM anon;
```

**2. Tirar a escrita do `anon` nas quatro tabelas.** Precisa conferir
antes se o robô grava com a chave anônima ou com login — se for com a
chave, isso derruba o robô e tem que trocar o robô primeiro.

**3. Fechar a `v_idg` e a `v_execucao_final`.** São as que carregam o
que você disse que só você e o gerente veem. O caminho já existe e está
pronto: a `v_idg_seguro` faz isso certo.

**4. Fechar a `execucao` (etapa 2 do `sql/producao.sql`).** É a maior,
porque exige criar a `v_execucao_publica` com só `numero_os, tss, dia`
para a aba Carteira continuar funcionando. Nunca foi rodada.

**5. Recuperar a hora da Data Inserção.** Não conserta o passado, mas a
partir do dia que entrar, o nosso IDG passa a bater com o deles nos 2
pontos que hoje faltam. É a única diferença de conta que resta.

**6. As 14 OS que só a Sabesp tem** e **as 6 com data de baixa
diferente** — item para levar junto com a troca de ramal, na próxima
conversa com eles.
