# O IDG por conta própria — o que a planilha do ISAP esconde

Análise pedida em 13/10/2026 — Bryan Mendes Deodato
Base: `ISAP_servi_os_PARCIAL_01_10_2026_ate_31_10_2026_09_10.xlsx`
(2.089 linhas, OSM, contrato 4600060285, execuções fechadas de
01/10 a 08/10/2026)

---

## Resumo em seis linhas

1. **A conta foi decifrada inteira, com zero exceção em 2.089 linhas.** Não é aproximação: as cinco colunas de veredito deles são reprodutíveis a partir das datas.
2. **O expurgo nunca tira ninguém de dentro do prazo. Ele só resgata quem já estava fora.** 1.754 dentro continuaram dentro; os 335 fora se dividiram em 233 fora + 102 expurgos. Soma exata.
3. São **três motivos de expurgo, com ordem de precedência**: suspensão > tempo de execução zero > atraso de transmissão acima de 4 horas.
4. O expurgo vale **+5,29 pontos no ISAPa**. Não é detalhe: é a diferença entre 81,93% e 87,22%.
5. **O nosso cálculo bate com o deles.** Em 1.259 serviços que estão nas duas bases, 1.256 vereditos iguais — 99,76%. A fórmula está certa.
6. **O que nos falta não é cálculo, é dado.** 27% do universo do IDG são serviços que a Sabesp encerra **sem execução** — imóvel fechado, duplicidade, trata-se de outro serviço. Eles contam no índice e nós não temos nenhum deles no banco. É aí que o índice está sendo perdido.

---

## 1. Como eles calculam — a conta, linha por linha

### 1.1 O universo

A planilha não é "serviços solicitados no mês". É **serviços cuja execução fechou no mês**. Todas as 2.089 linhas têm `DATA_FIM_EXECUCAO` em outubro, de 01/10 06:58 a 08/10 17:11 (o arquivo é PARCIAL, tirado em 09/10). O acatamento, esse sim, é de qualquer data: 2 de julho, 2 de agosto, 540 de setembro, 1.545 de outubro.

Isso muda a leitura do número: **o mês é cobrado pelo que foi fechado nele, não pelo que entrou nele.** Um serviço de setembro que você baixa em outubro entra no índice de outubro, com a idade que acumulou.

A unidade é o par `(OS, TSS)`, igual à nossa. Zero pares duplicados na planilha.

### 1.2 O tempo de atendimento

```
tempo = DATA_FIM_EXECUCAO − DH_ACATAMENTO
```

Truncado para baixo na unidade do prazo: dia inteiro se `TIPO_PRAZO = DC`, hora inteira se `HS`. Conferido nas 2.089 linhas: fecha em 2.068. As 21 que não fecham são todas negativas — serviço baixado antes do acatamento existir —, e nelas eles truncam em zero. É a coluna `RETROATIVA = SIM`.

`DH_ACATAMENTO` é exatamente a nossa `data_competencia`: nos 1.259 serviços que casam, **1.259 datas idênticas**. Nem um minuto de diferença.

### 1.3 Dentro ou fora, antes de qualquer expurgo

```
PRE_EXPUGOS = FORA  se  tempo > PRAZO_CONTRATO
              DENTRO caso contrário
```

É `>`, não `>=` — 77 serviços encostaram no prazo exato e contaram como dentro. **2.089 de 2.089 linhas obedecem.** Zero exceção.

### 1.4 Os três expurgos, e a ordem entre eles

O expurgo só é consultado se o serviço caiu em FORA. Em quem está dentro, nenhuma das flags muda nada — conferido: os 129 serviços com `TEMPO = SIM` que estavam dentro continuaram `DENTRO_DO_PRAZO`.

Entre os 335 que caíram fora, a ordem é esta, e é exata:

| Ordem | Condição | Resultado | Qtd |
|---|---|---|---|
| 1º | `SUSPENSAO = SIM` | `EXPURGO_SUSPENSAO` | 2 |
| 2º | `TEMPO = SIM` | `EXPURGO_TEMPO_EXECUCAO` | 60 |
| 3º | `TRANSMISSAO = SIM` | `EXPURGO_ATRASO_TRANSMISSAO` | 40 |
| — | nenhuma delas | `FORA_DO_PRAZO` | 233 |

233 + 60 + 40 + 2 = **335**. A conta fecha na unidade.

A precedência está provada pelos casos que carregam duas flags ao mesmo tempo: 2 serviços tinham `TEMPO` e `TRANSMISSAO` e saíram como `EXPURGO_TEMPO_EXECUCAO`; 1 tinha `SUSPENSAO` e `TRANSMISSAO` e saiu como `EXPURGO_SUSPENSAO`.

### 1.5 O que cada flag quer dizer

**`TEMPO = SIM` — e esta é a descoberta que importa.**

```
DATA_FIM_EXECUCAO == DATA_INICIO_EXECUCAO
```

Igualdade exata ao minuto. 189 linhas, **189 de 189**, sem um único falso positivo ou negativo. Nas outras 1.900, a diferença é de no mínimo 1 minuto.

Em português: **o serviço foi aberto e fechado no mesmo instante, ou seja, não houve execução de campo.** A equipe não gastou tempo nenhum nele. E o sistema entende que, se não houve execução, não faz sentido cobrar prazo de execução — então expurga.

Dos 60 `EXPURGO_TEMPO_EXECUCAO`, **51 são serviços encerrados sem execução** (imóvel fechado, duplicidade, serviço executado anteriormente). É coerente: ninguém executou nada, logo início e fim são o mesmo clique.

**`TRANSMISSAO = SIM`**

```
TEMPO_TRASMITIR >= 4 horas
```

Entre os 335 fora: os 292 com `NÃO` têm todos transmissão de 3 horas ou menos (o maior é 3h32); os 43 com `SIM` têm todos 4 horas ou mais. **Corte limpo em 4 horas**, sem sobreposição.

`TEMPO_TRASMITIR` é `DATA_CRIA_CONECTA_SERVICOS − DH_CRIACAO_SISTEMA`: o tempo entre a OS nascer no sistema da Sabesp e aparecer no Conecta, que é o que a equipe vê. É o atraso **deles**, não nosso — e por isso eles mesmos expurgam.

Atenção a uma pegadinha: a flag só é levantada em quem está fora. Existem serviços **dentro** do prazo com transmissão de 7.158 minuto (5 dias) e `TRANSMISSAO = NÃO`. Não é incoerência, é que a coluna só é preenchida quando serve para algo.

**`SUSPENSAO = SIM`**

Suspensão formal registrada pela Sabesp. Só 2 casos em outubro, os dois com idade absurda (74 e 68 dias). Não dá para reproduzir a condição a partir das datas — é um ato administrativo, um campo que alguém marca. **Este é o único dos três que nós nunca vamos conseguir calcular; teria que vir da Sabesp.**

### 1.6 O índice

Cada frente separada, expurgo fora **das duas pontas** (nem numerador nem denominador):

```
ISAPx = dentro / (dentro + fora)
IDG   = (ISAPa + ISAPe + ISAPr) / 3
```

O IDG é média simples das três frentes, não ponderada por volume. Confirmado: é a única forma que explica o número com ISAPr pesando igual ao ISAPa, apesar de ter 5 vezes menos serviços.

---

## 2. Outubro parcial (01 a 08/10) — o número deles

| Frente | Serviços | Dentro | Fora | Expurgo | Índice |
|---|---|---|---|---|---|
| ISAPa — água | 1.516 | 1.242 | 182 | 92 | **87,22%** |
| ISAPe — esgoto | 283 | 238 | 41 | 4 | **85,30%** |
| ISAPr — reposição | 290 | 274 | 10 | 6 | **96,48%** |
| **IDG** | **2.089** | | | **102** | **89,67%** |

### Quanto o expurgo vale

| Frente | Sem expurgo | Com expurgo | Ganho |
|---|---|---|---|
| ISAPa | 81,93% | 87,22% | **+5,29 pp** |
| ISAPe | 84,10% | 85,30% | +1,21 pp |
| ISAPr | 94,48% | 96,48% | +2,00 pp |
| **IDG** | **86,84%** | **89,67%** | **+2,83 pp** |

Quase 3 pontos de IDG vêm de expurgo. Vale conferir essa coluna todo mês: **cada expurgo que a Sabesp deixar de aplicar sai direto do nosso índice.**

---

## 3. O mesmo cálculo com os nossos dados

Mesma janela, 01 a 08/10/2026, rodado em cima da tabela `execucao` do nosso Supabase, com a régua de prazo tirada da planilha deles:

| Frente | Serviços (nós) | Serviços (eles) | Índice (nós) | Índice deles, sem expurgo |
|---|---|---|---|---|
| ISAPa | 1.128 | 1.516 | 87,32% | 81,93% |
| ISAPe | 178 | 283 | 84,27% | 84,10% |
| ISAPr | 274 | 290 | 95,26% | 94,48% |
| **IDG** | **1.580** | **2.089** | **88,95%** | **86,84%** |

### A fórmula está certa — isso está provado

O teste que importa não é comparar o total: é comparar serviço por serviço, nos que estão nas duas bases. Casaram **1.259 pares (OS, TSS)**:

| | Eles: dentro | Eles: fora |
|---|---|---|
| **Nós: dentro** | 1.147 | 1 |
| **Nós: fora** | 2 | 109 |

**1.256 de 1.259 vereditos iguais — 99,76%.**

E as peças separadas:

- `data_competencia` igual a `DH_ACATAMENTO`: **1.259 de 1.259**
- prazo da régua igual ao `PRAZO_CONTRATO` deles: **1.258 de 1.259**
- `data_execucao` igual a `DATA_FIM_EXECUCAO`: 1.225 de 1.259
- tempo de atendimento idêntico: 1.237 de 1.259

As 3 divergências de veredito são todas pelas datas, nenhuma pela conta. Nos dois casos em que dizemos "fora" e eles dizem "dentro", o `DATA_FIM_EXECUCAO` deles é `2026-10-01 17:04:16` — **nos dois, o mesmo timestamp, com segundos**. É fechamento em lote feito pelo sistema deles, dias antes da baixa que o GEOCALL nos passou. Não é erro nosso.

### O que nos falta: 27% do universo

Essa é a parte que explica tudo. Das 2.089 linhas deles, **571 têm `COD_TSE = -1` e um motivo de não execução no lugar do serviço executado**:

| Motivo | Linhas | Fora do prazo | % fora |
|---|---|---|---|
| IMÓVEL FECHADO, ORDEM ENCERRADA | 263 | 29 | 11,8% |
| TRATA-SE DE OUTRO SERVIÇO | 120 | 33 | 22,6% |
| DUPLICIDADE | 108 | 33 | 35,1% |
| NADA CONSTA NO LOCAL | 34 | 9 | 32,1% |
| SERVIÇO EXECUTADO ANTERIORMENTE | 28 | 8 | 36,4% |
| outros 7 motivos | 18 | 3 | — |

Procurei os 571 na nossa base. Na `execucao` não estão — e está certo que não estejam, porque não foram executados. Na `os_desfecho`, que é onde a gente guarda quem saiu da carteira sem execução, achei **1**. Um, de 571.

E o teste que fecha o diagnóstico: entre as linhas da Sabesp com `COD_TSE` real (serviço de verdade), achamos **1.258 de 1.259 — 99,9%**. Entre as de `COD_TSE = -1`, achamos **1 de 571 — 0,2%**.

Não é um problema de 30% do nosso importador. É um buraco de **100% numa categoria inteira**: o encerramento sem execução. A nossa `os_desfecho` só tem 601 linhas de 20/09 a 12/10 e é alimentada pela nossa própria classificação, não pelo que a Sabesp registra.

### E isso não é neutro no índice

| Grupo | ISAPa | ISAPe | ISAPr | Média |
|---|---|---|---|---|
| Executados de verdade | 91,93% | 82,82% | 96,69% | 90,48% |
| Encerrados sem execução | **75,00%** | 88,79% | 95,24% | 86,34% |

**O ISAPa cai de 91,93% para 75% quando o serviço é encerrado sem execução.** É quase 17 pontos. O índice de água não está sendo perdido no campo — está sendo perdido no que nunca chegou a ser campo.

Dos 99 serviços de água encerrados sem execução e fora do prazo, a maior fatia é imóvel fechado, duplicidade e trata-se de outro serviço. Esses três motivos são **os três que não dependem de produtividade de equipe.** Dependem de triagem antes de mandar a equipe.

---

## 4. O que descobri de quebra, e que muda o painel de hoje

### O prazo que o GEOCALL nos manda não é o prazo do IDG

O pendente do GEOCALL traz duas colunas que nunca usamos: `Prazo de Execução - Início` e `Prazo de Execução - Fim`. Conferi o início: em **993 de 993** serviços da carteira aberta, `Prazo de Execução - Início` é exatamente a `Data de Competência`. O relógio começa no acatamento, igual ao da Sabesp. Até aqui, bate.

A janela é que não bate. Comparando `Fim − Início` com o `PRAZO_CONTRATO` do ISAP, em 820 serviços da carteira com régua:

| Tipo | Prazo ISAP | Janela GEOCALL | Confere? |
|---|---|---|---|
| HS 24h | 24h | 24h | sim (207 de 207) |
| DC 7 dias | 168h | **288h** (12 dias) | não (460 serviços) |
| DC 3 dias | 72h | 72h | sim |
| HS 48h | 48h | **72h** | não |
| HS 96h | 96h | **72h** | não |

Só 240 de 820 coincidem. O GEOCALL está medindo contra um prazo operacional interno, **não contra o prazo contratual do IDG**.

Consequência direta no nosso painel: hoje o "fora do prazo" da tela é o sinal de menos do `Tempo Residual` do GEOCALL. Na carteira aberta de hoje:

- GEOCALL diz fora do prazo: **223 serviços (27,2%)**
- A régua do ISAP diria fora: **259 serviços (31,6%)**
- Discordam em **62 serviços** — 49 que o GEOCALL dá por dentro e o IDG já conta como fora

**Estamos olhando 49 serviços como "no prazo" que, para o IDG, já estão perdidos.** O painel não está errado — ele está medindo outro prazo. Mas quem olha a tela pensando em IDG está vendo um número 4 pontos otimista.

Isso responde o que a análise de 20/09 deixou aberto. Ela concluía que nos faltava "a tabela de dias por TSS" e que, sem ela, não dava para calcular prazo por conta própria. **A tabela chegou — está na planilha do ISAP** e já está em `sql/isap_regua.sql`, com os 97 serviços.

---

## 5. O que dá para construir já, e o que depende de dado novo

### Dá para fazer hoje, com o que está no banco

Uma aba IDG que mostra ISAPa / ISAPe / ISAPr e o IDG do mês corrente, calculado em cima da `execucao`, **mais a projeção da carteira aberta**: todo serviço aberto que já passou do prazo do ISAP é um "fora" contratado, que vai entrar no índice no dia em que for baixado. Isso é o "enxergar antes" que você pediu — hoje são 259 serviços de dívida acumulada na carteira.

Vale com uma tarja honesta na tela: *"calculado sobre os serviços executados; não inclui os encerrados sem execução"*, com o número de quanto isso costuma representar (27% do universo).

### Depende de dado que não temos

Para fechar com a Sabesp casa-a-casa faltam, em ordem de impacto:

1. **Os serviços encerrados sem execução** — 27% do universo e o maior ofensor do ISAPa. Precisamos de um relatório do GEOCALL de OS fechadas que **inclua as não executadas**, com o MNE (motivo) e a data/hora do encerramento. O relatório de execução que o robô puxa hoje, pelo que a comparação mostra, só traz as que tiveram TSE de verdade.

2. **`DATA_INICIO_EXECUCAO`** — sem ela não dá para calcular `EXPURGO_TEMPO_EXECUCAO`, que é o maior dos três (60 de 102). Se o relatório de execução tiver coluna de início, resolve.

3. **`DATA_CRIA_CONECTA_SERVICOS` e `DH_CRIACAO_SISTEMA`** — para o `EXPURGO_ATRASO_TRANSMISSAO`. O pendente tem `Data Inserção`, que é candidata a uma das duas, mas isso precisa de conferência com um mês completo: no pendente só existe o que está aberto, e o ISAP só traz o que fechou. Não tenho as duas pontas ao mesmo tempo para provar.

4. **A suspensão** — não é calculável. Só se a Sabesp expuser.

**O que eu preciso que você responda ou levante:**

- O relatório de execução do GEOCALL, no site, tem as colunas de **início de execução** e de **motivo de não execução**? Se tiver, o robô passa a trazer e fechamos os itens 1 e 2 de uma vez.
- Existe algum relatório de **OS fechadas / encerradas** separado do de executadas?
- Quando chegar o ISAP fechado de outubro (o de 01 a 31), me manda: com o mês completo eu consigo provar o item 3 e conferir se a régua de prazo não mudou.

---

## 6. As oportunidades de melhoria que a planilha mostra

Essas saem direto dos números, sem precisar de dado novo.

**1. Imóvel fechado é o maior ofensor isolado — 263 serviços em 8 dias.** 29 deles fora do prazo. Não é problema de equipe, é problema de ir ao imóvel na hora em que tem gente. Vale olhar horário das visitas que deram imóvel fechado contra as que deram execução.

**2. Duplicidade perde 35% dos casos no prazo — a pior taxa da planilha.** 108 serviços em 8 dias, 33 fora. Uma OS duplicada fica parada enquanto ninguém percebe que já existe outra igual, e o relógio corre nas duas. Dá para detectar duplicidade no nosso próprio pendente (mesmo PDE, mesma TSS, datas próximas) e tratar antes de virar fora do prazo. **Isto nós podemos construir.**

**3. "Serviço executado anteriormente" perde 36% — 28 casos.** Mesmo padrão da duplicidade, e também detectável do nosso lado.

**4. Vazamento de água em leito pavimentado é o serviço que mais perde prazo: 45 dos 233 fora.** Prazo de 24 horas. Vale ver se o gargalo é a abertura ou a reposição que vem depois.

**5. 24 dos 233 fora passaram do prazo por uma unidade só** — um dia ou uma hora. Dez por cento dos fora estavam a um passo. Em HS 24h, isso é uma hora de diferença.

**6. O expurgo precisa ser auditado todo mês.** Vale 2,83 pontos de IDG. Com a regra decifrada, dá para calcular quantos expurgos *deveriam* ter sido aplicados e comparar com quantos a Sabesp aplicou. Se faltar algum, é número para cobrar — e é exatamente o "confrontar com o deles" que você pediu.

---

## 7. O relatório de 37 colunas — o buraco fechou

*Adendo de 13/10/2026, depois do `552656-EXECU__ES_20261013_114531222.xlsx`*

O relatório novo tem 4.612 linhas, 37 colunas, e traz tudo o que faltava:

| O que faltava | Coluna no relatório novo |
|---|---|
| os serviços encerrados sem execução | `Resultado` — "DUPLICIDADE", "IMÓVEL FECHADO, ORDEM ENCERRADA", ... |
| `DATA_INICIO_EXECUCAO` | `Data Início Execução` |
| separar baixa final de baixa de etapa | `Status da OS` + `Etapa` |
| casar sem brigar com acento | `Código TSS` — o mesmo `COD_TSS` deles |

### A cobertura

Casando por `(Número OS, Código TSS)`, com fallback em `(PDE, Código TSS, Data Fim Execução)` para as 259 linhas que a Sabesp manda sem número de OS:

| | Relatório antigo | Relatório novo |
|---|---|---|
| Linhas da Sabesp encontradas | 1.278 de 2.089 — **61%** | 2.085 de 2.089 — **99,8%** |
| Nos serviços executados | 1.258 de 1.461 — 86% | 99,9% |
| Nos encerrados sem execução | **1 de 628 — 0,2%** | **571 de 571 com OS — 100%** |

As 4 que ainda faltam: duas têm `DATA_FIM_EXECUCAO` com segundos (fechamento em lote do sistema deles) e duas estão na virada do dia 01/10.

### O que a Sabesp conta, exatamente

Medido nas 3.174 linhas fechadas de 01 a 08/10:

1. **`Status da OS = Fechada`.** Despachada, Reprogramável, Cancelada e Suspensa: zero entraram.
2. **TSS dentro do escopo ISAP.** 135 linhas fechadas têm TSS que não existe na planilha deles — COMPACTAR E SELAR BASE, TESTE DE COMPACTAÇÃO. São etapas internas de qualidade, não serviço de carteira.
3. **Baixa final, não baixa de etapa.** "FIM DO DIA" (424 linhas) e "IMÓVEL FECHADO, REPROGRAMAR ORDEM" (64) não entraram **nenhuma vez**; "CONTINUA - SERVIÇO NÃO CONCLUÍDO" entrou 4 de 261 vezes.
4. **Uma linha por par (OS, TSS)** — a última baixa.

Com essas quatro regras: cobertura 99,8%, e 198 linhas que nós pegamos e a planilha deles não tem. Dessas, 45 são a mesma OS registrada sob outro `COD_TSS` (serviço reclassificado) e 153 são OS que a planilha não contém de jeito nenhum. O arquivo é `TIPO_PROCESSAMENTO = PARCIAL`, tirado em 09/10 — **o ISAP fechado de outubro é que diz se essas 198 entram depois ou se existe um critério que eu não achei.**

### A conta reproduzida

Nos 1.829 pares em que as duas bases falam do mesmo serviço:

| O que foi testado | Acerto |
|---|---|
| `Data de Competência` = `DH_ACATAMENTO` | 2.047 de 2.047 — **100%** |
| dentro/fora antes do expurgo | 1.826 de 1.829 — **99,84%** |
| a flag de expurgo por tempo de execução (`início = fim`) | 1.814 de 1.829 — **99,2%** |
| `EXPURGO_TEMPO_EXECUCAO` reproduzido | 57 de 58 |
| `Resultado` ↔ `DESC_MNE` | 1 para 1, exato |

### O número, comparando o que é comparável

Mesmo universo (os 2.085 serviços que estão nas duas bases), mesmo expurgo (só o de tempo de execução, o único que nós sabemos calcular hoje):

| Frente | Nós | Sabesp | Diferença |
|---|---|---|---|
| ISAPa | 84,78% | 84,95% | −0,17 pp |
| ISAPe | 85,36% | 85,00% | +0,36 pp |
| ISAPr | 95,12% | 95,47% | −0,35 pp |
| **IDG** | **88,42%** | **88,47%** | **−0,05 pp** |

**Cinco centésimos de ponto.** Com o relatório antigo essa comparação não era possível: faltava 31% do universo e nenhum dos expurgos.

Do IDG oficial, 89,67%, o que separa os 88,47% são **1,19 ponto** de expurgo de transmissão e suspensão.

### E esse 1,19 ponto também é alcançável

Provei a fórmula do tempo de transmissão dentro da própria planilha deles:

```
TEMPO_TRASMITIR = DATA_CRIA_CONECTA_SERVICOS − DH_ACATAMENTO
```

Com o acatamento como base, o limiar de 4 horas separa os 335 serviços fora do prazo em **292 sem expurgo / 43 com expurgo, sem um único erro**.

E a `DATA_CRIA_CONECTA_SERVICOS` é a nossa **`Data Inserção`**. Conferido em 1.729 OS: ela casa com a `Data Inserção` em 92% das datas, contra 90% para o `DH_CRIACAO_SISTEMA` — e o caso que decide é a OS 2640332929, com `Data Inserção` 08/10, `DATA_CRIA_CONECTA_SERVICOS` 08/10 09:00 e `DH_CRIACAO_SISTEMA` 07/10 13:52.

O problema é bobo e tem conserto: o pendente do GEOCALL manda `Data Inserção` **com hora** ("27/08/2025 11:44"), e a nossa `os_entrada.data_insercao` é `DATE` — a hora foi descartada na importação. Trocar para `TIMESTAMPTZ` recupera o expurgo de transmissão inteiro.

**Isso não se reconstrói do passado.** A hora só existe no relatório do dia; o que já está gravado como data perdeu a hora para sempre. Quanto antes mudar, menos histórico cego.

A suspensão fica de fora de vez: é ato administrativo, 2 casos em 2.089 (0,1%).

### Onde está a conta final

| Camada | O que nos falta | Quanto vale |
|---|---|---|
| dentro/fora + expurgo de tempo | nada, está feito | 88,42% ✓ |
| expurgo de transmissão | a hora da `Data Inserção` | +1,19 pp |
| expurgo de suspensão | não é calculável | 0,1% dos casos |
| as 198 linhas a mais | o ISAP fechado de outubro | a medir |

---

## 8. Arquivos desta análise

| Arquivo | O que é |
|---|---|
| `sql/isap_regua.sql` | A tabela `isap_tss` com os 97 serviços (frente + prazo + tipo), a coluna sem acento para casar com o nome que o GEOCALL manda, e a view `v_isap_execucao` sobre a `execucao` de hoje |
| `sql/isap_execucao.sql` | As colunas novas da `execucao` para o relatório de 37 colunas, a view `v_execucao_final` com as quatro regras de seleção, e a view `v_idg` com o cálculo completo |

### Ordem de execução

1. `sql/isap_regua.sql` — cria a régua e já permite calcular com os dados de hoje
2. `sql/isap_execucao.sql` — abre espaço para o relatório novo
3. o leitor novo no `robo-executados/relatorios.js` — cabeçalhos diferentes, leitor novo e não ajuste
4. `os_entrada.data_insercao` de `DATE` para `TIMESTAMPTZ`, e o robô do pendente guardando a hora
5. a aba IDG no app

---

## 9. A conferência OS por OS — 01 a 07/10/2026

Feita como o Bryan propôs: pegar a planilha da Sabesp, procurar cada OS no
nosso banco, aplicar as nossas regras e ver se bate. A janela é 01 a 07/10
porque só esses dias têm o relatório novo carregado (ver a seção 10).

### O que a conferência separa

As duas perguntas estavam embaralhadas nas comparações anteriores, e é por
isso que o IDG médio parecia bater enquanto água e esgoto não batiam:

1. **A regra está certa?** — nas linhas que existem nas duas bases, o
   veredito que calculamos é o mesmo que o deles?
2. **O universo é o mesmo?** — as duas bases têm as mesmas linhas?

A resposta é: a regra está certa, o universo não é o mesmo, e **toda** a
diferença de índice vem da segunda.

### Pergunta 1 — a regra

| Campo | Igual |
|---|---|
| data de competência | 1.812 de 1.812 — 100% |
| frente (ISAPa/e/r) | 1.812 de 1.812 — 100% |
| prazo + tipo de prazo | 1.811 de 1.812 |
| fim da execução | 1.782 de 1.812 — 98,34% |
| tempo de atendimento | 1.789 de 1.812 |
| **veredito dentro/fora/expurgo** | **1.808 de 1.812 — 99,78%** |

4 discordâncias: 2 em ISAPa (nós FORA, eles DENTRO), 1 em ISAPe (nós
DENTRO, eles FORA), 1 em ISAPr (nós FORA, eles expurgaram).

E a prova de que a única linha deles que não achamos não muda nada: o
índice calculado com o veredito **deles** nas 1.812 linhas em comum é
idêntico ao da planilha inteira — 84,72 / 85,17 / 96,18.

### Pergunta 2 — o universo

Deles que achamos: 1.812 de 1.813 (99,94%). Nossos que eles têm: 1.812 de
1.963 — **sobram 151 linhas nossas**.

| Grupo | Linhas | O que é |
|---|---|---|
| 1 | 28 | Troca de ramal — a regra do espelho. **23 das 28 OS estão na planilha deles, só sem a etapa do vazamento**: a regra se confirma de novo. Todas ISAPa, 20 de 28 FORA. |
| 2 | 5 | A mesma etapa aparece na planilha, em outra data |
| 3 | 15 | A OS está na planilha com outro serviço, mas não esta etapa |
| 4 | **103** | **A OS não existe em lugar nenhum na planilha deles** |

### O índice, nas quatro leituras

| | ISAPa | ISAPe | ISAPr | IDG |
|---|---|---|---|---|
| SABESP | 84,72 | 85,17 | 96,18 | **88,69** |
| nosso, só o universo deles | 84,55 | 85,59 | 95,82 | 88,65 |
| nosso, espelho de hoje (sem troca de ramal) | 84,04 | 86,19 | 95,53 | 88,59 |
| nosso, espelho **e** sem as 103 | 84,57 | 85,06 | 95,91 | 88,51 |
| nosso, tudo (a conta honesta) | 82,89 | 86,19 | 95,53 | 88,21 |

Tirando a troca de ramal e as 103, **toda frente fica dentro de 0,3 pp** —
água −0,15, esgoto −0,11, reposição −0,27. É aí que a conta fecha.

E é por isso que o IDG médio engana: as 103 puxam o esgoto para cima
(+1,13 pp) e a água para baixo ao mesmo tempo, e a média esconde as duas.
**Nunca validar por IDG; validar por frente.**

### Uma hipótese que o teste derrubou

Parecia óbvio que a Sabesp não contasse no ISAP os serviços "matados" sem
execução — TRATA-SE DE OUTRO SERVIÇO, DUPLICIDADE, IMÓVEL FECHADO. **Ela
conta.** Das nossas 732 linhas de não executado, 660 estão na planilha
deles — 90,2%, praticamente a mesma taxa dos executados (93,6%).

| Resultado | Nossas | Na planilha deles |
|---|---|---|
| IMÓVEL FECHADO, ORDEM ENCERRADA | 233 | 218 |
| TRATA-SE DE OUTRO SERVIÇO | 160 | 138 |
| DUPLICIDADE | 117 | 107 |
| NADA CONSTA NO LOCAL | 36 | 33 |

Tirar os não executados do espelho daria IDG 91,00 em vez de 88,59. Seria
um número falso, e bonito — o pior tipo. **Não fazer.**

### As 103 — o item aberto

Não é atraso de processamento deles: a taxa de sobra é plana nos sete dias
(5,1% a 9,6%), e a planilha é de 13/10, muito depois. Não é uma equipe: as
103 se espalham por mais de vinte, a maior com 8. Não é um serviço:
TRANSFORMAÇÃO LIG NOVA (8), NIVELAR POÇO (8), DESOBSTRUIR RETORNO (8).

83 delas estão DENTRO do prazo, 18 FORA. Ou seja, **incluí-las melhora o
nosso número em esgoto e piora em água** — não há viés a nosso favor, o que
reforça que é escopo e não erro de lado nenhum.

Detalhe linha a linha: `scratchpad/isap/sobram_01a07out.csv`.

É isso que vale levar à Sabesp junto com a pergunta da troca de ramal.

---

## 10. Dois defeitos achados na conferência

### a) Paginação sem `order` — corrigido

O PostgREST, quando se pede `Range`, devolve as páginas em ordem
**arbitrária** se a consulta não tem `order`. A mesma consulta repetia e
omitia linhas: medi 512 e depois 513 linhas em 05/10 na mesma chamada.

Nove consultas paginadas do app estavam assim — seis sem `order` nenhum
(`fetchDiarioOS`, `fetchEntradaDesde`, `fetchExecucao`, `fetchProducao`,
`fetchEmRua`, `fetchEntradasDoDia`) e três com `order` **não único**
(`pendente_historico`, `os_nota`, `os_desfecho`), onde linhas empatadas
podem trocar de página no meio da leitura. A `fetchIdg` tinha
`dia,numero_os`, que empata quando uma OS tem duas etapas no mesmo dia.

Todas passaram a ter uma ordenação única. As que varrem faixa de data
(`fetchExecucao`, `fetchProducao`, `fetchEntradaDesde`) passam de mil
linhas com folga, então essas estavam errando de verdade.

**Regra: `Range` sem `order` único é bug, sempre.**

### b) O relatório novo só trouxe sete dias — causa desconhecida

A corrida de 13/10 15:55 gravou **2.682 linhas, 01 a 07/10 e nada mais**,
com 07/10 completo (execuções das 4h às 21h). Não foi corte no meio do dia.

**Eu atribuí isso a truncamento do export, e estava errado.** Era uma
observação só, e eu não abri o arquivo nem li a linha de conferência do
robô antes de afirmar.

O teste, em 14/10: uma rodada única de 01 a 14/10. A tela avisou "foram
encontradas 5.117 ordens, serão exibidas somente as 3.000 primeiras" — e o
arquivo trouxe **5.118 linhas, 100%**. O aviso é sobre a TELA, não sobre o
export. E as duas formas de puxar deram resultado idêntico:

| | em dois blocos | em bloco único |
|---|---|---|
| 01 a 12/10 | 4.665 linhas | 4.665 linhas, **dia a dia igual** |
| 13 e 14/10 | 487 | 647 |

A diferença dos dois últimos dias são as duas horas de campo entre uma
rodada e outra, não dado perdido.

Então o mês vem inteiro numa rodada só, e os blocos não são necessários.
A causa do que houve em 13/10 continua desconhecida. Quem avisa, se voltar
a acontecer, é a conferência do próprio robô: ele compara o que a tela
anunciou com o que o arquivo trouxe e grita se vier abaixo de 80%. Só
nesse caso vale quebrar em períodos menores.
