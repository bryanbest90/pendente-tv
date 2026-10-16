# Pendente-TV — decisões que valem para sempre

Regras de negócio que já foram decididas e não devem ser revertidas sem o
Bryan pedir. Elas existem aqui porque são o tipo de coisa que, sem
registro, volta a ser "corrigida" errado meses depois.

## Famílias

- **DESOBSTRUÇÃO faz parte da carteira.** Não excluir em lugar nenhum:
  nem no `EXCLUDED_FAMILIES` do robô, nem no `EXCLUDED_DISPLAY` do site.
  O site sempre a mostrou; era o robô que a escondia do gráfico, e isso
  fazia a tabela e o gráfico falarem de universos diferentes.
  *(Bryan, 07/10/2026)*

- **GARANTIA não faz parte da carteira.** Fica nas duas listas de
  exclusão. É serviço de verificação de garantia.
  *(Bryan, 06/10/2026)*

As duas listas precisam ser olhadas juntas quando uma família muda de
status: `EXCLUDED_DISPLAY` em `src/App.jsx` controla o que a tela mostra;
`EXCLUDED_FAMILIES` em `robo-geocall/index.js` controla o que entra na
foto diária e no histórico, que é o que alimenta o gráfico.

## Dados

- **A unidade do negócio é o par (numero_os, tss)**, não a OS. Uma OS que
  gera duas etapas conta duas vezes — é assim que a equipe é medida.

- **"Saiu da carteira" não é "executada".** Pode ter sido cancelada ou
  encerrada sem execução. O porquê está na aba Etiquetas.

- **A coluna Entradas não subtrai.** Ela mede quantos serviços foram
  solicitados; executar a OS não apaga o pedido.

## IDG / ISAP

- **A conta do IDG foi decifrada da planilha ISAP e conferida contra ela.**
  Em 01 a 12/10/2026, nos 2.840 serviços que estão nas duas bases: data de
  competência igual em 100%, frente igual em 100%, prazo em 2.839 de 2.840,
  e o veredito dentro/fora em 2.834 — 99,79%. Não refazer a análise do zero
  sem ler o `ANALISE_IDG_ISAP.md`.

- **A `v_idg` viva é a do `sql/isap_espelho.sql`, não a do
  `sql/isap_execucao.sql`.** Dois arquivos criam uma view com esse
  nome e quem rodou por último manda. A do espelho tem 19 colunas — a
  19ª é `no_espelho`, a regra da troca de ramal. Em 16/10 eu usei a
  de 18 como modelo e ia apagar o `no_espelho` sem avisar; quem
  impediu foi o erro 42P16 do Postgres reclamando da posição da
  coluna, não uma conferência minha. **Antes de recriar qualquer view
  deste projeto, olhar as colunas que ela realmente tem** — é um
  SELECT.

- **APLICADO em 16/10/2026, 13h56, e CONFERIDO contra a Sabesp.** As
  13.486 horas do backfill (agosto, setembro, outubro, da tela Lista
  OS) mais as 984 da carteira aberta deixaram 13.572 de 15.076 linhas
  da `os_entrada` com hora — 90%. Resultado medido:

  | | antes | depois | Sabesp |
  |---|---|---|---|
  | veredito igual ao deles | 97,53% | **98,69%** | — |
  | IDG 01-14/10 | 85,20% | **86,36%** | 87,33% |
  | setembro | 78,63% | **81,08%** | — |

  Diferença caiu de 2,13 pp para **0,97 pp**, e o ISAPe passou a dar
  +0,39 — ficamos ligeiramente ACIMA deles numa frente. O que ainda
  diverge: 34 expurgos de transmissão (OS que nunca passaram pelo
  pendente, logo sem hora), 3 de suspensão (não temos o campo) e 9
  divergências reais.

- **O expurgo de transmissão foi LIGADO em 16/10/2026** (`sql/transmissao.sql`,
  seção 6), e a regra do NULL é o coração dele: **sem a hora da
  inserção, não expurga**. Quem foi executado antes de 16/10 tem
  `dh_insercao` nulo, e `NULL >= 4` não é verdadeiro — o passado fica
  intocado. Por isso **outubro é um mês misturado**: até 15/10 sem o
  expurgo, de 16/10 em diante com ele. O índice do mês fechado vai
  cair entre o nosso número antigo e o da Sabesp, e isso não é
  defeito. A conferência está no fim do arquivo: no período
  01-14/10 tem de dar ZERO expurgos de transmissão.

- **O expurgo nunca tira ninguém de dentro do prazo**, só resgata quem caiu
  fora, nesta ordem: suspensão formal > início igual ao fim da execução >
  transmissão de 4 horas ou mais. Conferido em 01-15/10/2026: os 75
  expurgos de transmissão têm todos `PRE_EXPUGOS = FORA_DO_PRAZO`, e as
  158 linhas com 4h+ que já estavam DENTRO não foram tocadas.

- **Tempo de transmissão = Data Inserção − Data de Competência**, em
  horas inteiras. É quanto a OS levou do acatamento na Sabesp até
  aparecer no Conecta/GEOCALL, onde a equipe consegue vê-la. Decifrado
  em 16/10/2026 contra a planilha deles: `DATA_CRIA_CONECTA_SERVICOS −
  DH_ACATAMENTO` reproduz o `TEMPO_TRASMITIR` em **3.534 de 3.534
  linhas**; as outras cinco combinações de datas ficaram abaixo de 93%.
  88,9% transmitem em menos de uma hora; a cauda de 6,8% com 4h ou mais
  é o que gera o expurgo.

- **A nossa Data Inserção É a `DATA_CRIA_CONECTA_SERVICOS` deles — na
  DATA.** Medido em 16/10/2026 nos 3.097 pares da planilha que existem
  na `os_entrada`: a data bate em **99,2%** (3.072), contra 97,2% para
  o `DH_CRIACAO_SISTEMA`. As 25 que não batem erram por 1 ou 2 dias.
  **A HORA continua sem prova**, e é ela que decide o corte de 4h: uma
  inserção às 23:50 com competência às 20:00 dá 3h50 ou 4h10 conforme
  o minuto, e a data bate nos dois casos. Só dá para provar depois de
  aplicar o `transmissao.sql` e receber uma planilha nova que contenha
  OS cuja hora a gente capturou. É o teste a fazer na próxima.

- **A hora da Data Inserção NUNCA se perdeu — está no `pendente_os.dados`.**
  Isto corrige o que estava escrito aqui antes. O export do GEOCALL
  sempre mandou `'Data Inserção' = '27/08/2025 11:44'`; quem a joga fora
  é a `os_entrada_do_jsonb`, com um `substring(... for 10)` para uma
  coluna DATE — e a prova estava no comentário do próprio
  `sql/os_entrada.sql`. O `sql/transmissao.sql` passa a guardá-la. Só
  vale do dia em que rodar em diante, mais as OS abertas naquele
  momento: o `pendente_os` guarda a carteira de agora, não o histórico.
  *(16/10/2026)*

- **Vazamento resolvido com TROCA DE RAMAL some do ISAP da Sabesp.** 45 de
  45 casos conferidos em outubro; nenhum dos 45 imóveis tem OS de TROCAR
  RAMAL DE ÁGUA (2840). A regra fica na tabela `isap_excecao`, ligável e
  desligável por UPDATE, porque o Bryan foi questionar a Sabesp e a
  resposta pode mudar isso. *(13/10/2026 — aguardando retorno)*

- **O espelho marca, não apaga.** A aba mostra o índice como a Sabesp conta
  (é o que vai ser cobrado) e, ao lado, o que essa regra esconde: nos 45
  casos, 144 dias de espera de cliente que não entram no índice.

- **A aba IDG é só do Bryan** (`perfis.pode_idg`), e a trava está no banco,
  na view `v_idg_seguro` — esconder a aba na tela não protegeria uma view
  que a chave do navegador alcança. *(Bryan, 13/10/2026)*

- **A Sabesp CONTA os não executados no ISAP.** Parece óbvio que serviços
  "matados" sem execução (TRATA-SE DE OUTRO SERVIÇO, DUPLICIDADE, IMÓVEL
  FECHADO) ficassem fora do índice. Não ficam: 660 das nossas 732 linhas de
  não executado estão na planilha deles — 90,2%, a mesma taxa dos
  executados. Tirá-las do espelho daria IDG 91,00 em vez de 88,59: um
  número falso e bonito. Não fazer. *(conferido 01-07/10/2026)*

- **Validar o IDG por frente, nunca pela média.** A média esconde frentes
  errando em direções opostas: em 01-07/10 o IDG batia em 0,10 pp enquanto
  água estava −0,68 e esgoto +1,02.

- **Restam 103 OS que não existem na planilha da Sabesp** (01-07/10, de
  1.963). Não é atraso deles (taxa plana nos sete dias), nem uma equipe
  (espalhadas por mais de vinte), nem um serviço. Tirando elas e a troca de
  ramal, toda frente fecha dentro de 0,3 pp. É o item a levar à Sabesp.
  Detalhe em `scratchpad/isap/sobram_01a07out.csv`.

## Saídas da carteira

- **A coluna "Saíram" é MEDIDA, não deduzida.** A antiga saía da
  identidade do estoque (saíram = entraram − variação do saldo), não
  sabia separar executado de não executado e deixava o primeiro dia da
  série sem valor. A nova vem da `v_execucao_serie`, serviço a serviço.

- **A `v_execucao_serie` sai de cima da `v_execucao_final`, e isso é o
  ponto.** A primeira versão reimplementava a regra da última baixa com
  um `DISTINCT ON` próprio. Funcionava — e estava errada de princípio:
  essa regra já existe, já foi conferida contra a planilha da Sabesp
  (1.796 de 1.796 pares) e mora na `v_execucao_final`. Herda de lá o
  `status_os='Fechada'`, o `cod_tss`, a `data_execucao` e a exclusão
  dos códigos.

- **Só entra na barra o que MATA a OS.** Três códigos não matam, e
  ficam de fora: `FJL` (FIM DO DIA), `901200` (CONTINUA — SERVIÇO NÃO
  CONCLUÍDO) e `902900` (IMÓVEL FECHADO, REPROGRAMAR ORDEM). São 903
  linhas de 5.445 em 01 a 15/10/2026. A equipe passou e volta amanhã:
  a OS continua viva, não saiu da carteira. Com eles fora: **3.158
  executados, 1.375 não — 30,3%**. *(Bryan, 16/10/2026)*

- **O gráfico vive na aba Produção**, que é restrita, e a view é
  `GRANT` só para `authenticated`. Por isso a série é buscada dentro
  da própria aba, com o token da sessão, e não lá em cima com a chave
  anônima do bundle. *(Bryan, 16/10/2026 — "só eu e o gerente poderemos
  ver por hora")*

- **O `v_desfecho_dia` parou em 01/10/2026.** É ele que classifica o
  não executado em Improdutiva / Cancelada / Erro de base / Nada
  consta. Enquanto a `os_desfecho` não voltar a ser alimentada, a barra
  fica em duas cores; quatro exigiria reviver esse caminho.

## Prazo da carteira

- **A carteira é medida pelo prazo do CONTRATO, não pelo do GEOCALL.**
  Quem está na régua do ISAP é medido por ela, a partir da Data de
  Competência; quem não está (FRESAR/RECAPEAR, HIDRÔMETRO VAZANDO,
  SINALIZAÇÃO VIÁRIA, VÁLVULA DE REDE) fica com o prazo do GEOCALL,
  porque prazo do GEOCALL é melhor que prazo nenhum. Em 15/10/2026 a
  régua cobria 786 dos 886 serviços da tela.

- **"Prazo de 7 dias" é até o FIM do 7º dia.** A Sabesp faz
  `tempo = floor(decorrido/unidade)` e conta como DENTRO enquanto
  `tempo <= prazo`. Conferido na planilha deles: dos 107 serviços com
  tempo exatamente igual ao prazo, **107 entraram como dentro**, e
  prazo+1 é sempre fora. Por isso a contagem regressiva da carteira corre
  para `competência + (prazo+1) unidades` — é lá que o veredito vira. O
  `+1` no código não é engano; tirá-lo pinta de vermelho dezenas de
  serviços que a Sabesp ainda conta como dentro do prazo (92, na carteira
  de 15/10).

- **E ela é contagem de relógio, não de unidade truncada.** A truncagem é
  da conta do índice. Fazer `floor` aqui e multiplicar de volta enchia a
  coluna de "0m" e "1h,0m", sem um minuto quebrado — foi assim que o bug
  apareceu na tela. *(15/10/2026)*

- **A troca é feita reescrevendo o `Tempo Residual` da linha**, no app
  (`aplicarPrazoIsap`) e no robô (`comPrazoIsap`). Esse campo é lido pela
  tabela, pela cor, pela ordenação, pela contagem por família e pelos
  modais — campo paralelo seria a mesma regra em seis lugares, e regra
  copiada é regra que diverge. O valor do GEOCALL fica em
  `Tempo Residual GEOCALL`, para conferência.

- **No robô isso roda numa CÓPIA, depois de a carteira já ter sido
  gravada.** Reescrever antes do `enviarParaSupabase` congelaria o
  residual no instante da rodada, e o app — que recalcula contra o agora —
  pararia de recalcular, porque a linha já viria marcada.

- **O gráfico de prazo tem um degrau em 15/10/2026, e ele é correto.** O
  histórico anterior não pode ser recalculado: o `pendente_diario_os` não
  guarda a Data de Competência, e a `os_entrada` perdeu a hora. Não tentar
  "consertar" o degrau. O salto foi de cerca de +7 serviços fora do prazo.
  *(Bryan, 15/10/2026)*

## Robôs

- **O robô antigo de executados está desativado, e não volta.** Ele
  gravava chamando `limpar_execucao(ini,fim)`, que APAGA a faixa inteira
  e regrava com as 12 colunas antigas — destruindo `cod_tss`,
  `status_os`, `cod_resultado`, `executado`, `pde`, `familia` e
  `data_inicio_execucao`, e sumindo com todas as linhas de não executado.
  Com os dois ligados, cada rodada dele derrubava a última semana do IDG:
  foi o que deixou 08 a 13/10/2026 com `status_os` nulo e parou a aba no
  dia 07. O `robo-execucoes` faz o trabalho dele com mais dado e grava
  por upsert. A trava está no banco (`sql/desativar_robo_antigo.sql`):
  `limpar_execucao()` agora levanta exceção. *(14/10/2026)*

- **Todo robô tem prazo máximo, e quem estoura é morto.** Em 14/10/2026 o
  robô de ouvidorias ficou 16h35 parado: o Outlook abriu uma caixa de erro
  esperando um clique, o PowerShell ficou esperando o Outlook, o robô ficou
  esperando o PowerShell. Como a regra é um de cada vez, a carteira do site
  parou junto — quase 17 horas de dado velho, sem nada avisando na tela. O
  problema não foi a ouvidoria: foi um robô sem prazo, e **travado é pior
  que falho, porque falho avisa**. Prazos no código (`LIMITE` no
  `orquestrador.js`), sobrescritos por `limite_min` no config. No Windows o
  encerramento usa `taskkill /T`: matar só o primeiro processo deixaria o
  Chrome vivo, que é justamente o que costuma pendurar. *(15/10/2026)*

- **O orquestrador monta os jobs a partir do `config.orquestrador.json`**,
  e nenhuma lista de robôs é escrita duas vezes. Antes a lista estava no
  código (`CFG.executados.dir` fixo) e no config: tirar o robô do config
  quebrou o orquestrador antes de abrir o menu, e — pior, porque era
  silencioso — a ouvidoria estava no config havia semanas e nunca rodou,
  porque ninguém a acrescentou à lista do código. O menu do
  `RODAR_AGORA.bat` também passou a sair do config (`menu.js`).
  *(14/10/2026)*

- **Tela nova do GEOCALL se lê, não se adivinha — e quem navega é o
  Bryan.** Foram quatro rodadas gastas na tela de materiais porque eu
  programava a navegação antes de entender a tela, e cada tentativa
  custava uma OS. O `CHROME_ESPIAO.bat` + `ESPIAR.bat` inverteram isso:
  ele abre o Chrome com `--remote-debugging-port`, navega na mão pelo
  caminho que já funciona, e o robô conecta por `puppeteer.connect` e
  só **lê**. Custo zero por tentativa, e serve para qualquer tela.
  *(15/10/2026)*

- **O material entra por arrasto NATIVO do HTML, e só o CDP o produz.**
  A linha é `<tr draggable="true" ondragstart="ddstart(...)">`, e o
  `<img class="icon_dnd">` da primeira coluna é a **alça**, não um
  botão. Mouse sintético do Puppeteer nunca ia funcionar: o Chrome não
  gera `dragstart` a partir de `Input.dispatchMouseEvent`. O que
  funciona é `setDragInterception` + `mouse.drag/dragOver/drop` — popup
  em 1 segundo. O destino é o único elemento da tela que declara
  `ondrop`/`ondragover` (`<div id="AFRAME_…" class="tv">`); procurá-lo
  pelo cabeçalho não achava nada, porque a grade tem cabeçalho vazio no
  DOM. E o `mouse.drag` deixa o botão preso: soltar antes de qualquer
  clique seguinte. *(15/10/2026)*

- **Nome de campo do GEOCALL eu confiro, nunca invento.** Três vezes no
  mesmo robô: os campos do login, o campo da OS, e o da quantidade —
  que não é "Quantidade", é **"Qtde consumida"**, na janela "Inserção
  Novo Material". Essa última fez o robô inserir o material e reportar
  fracasso. Os rótulos dessa tela já mentiram três vezes (o rotulado
  "TSS" é o Tipo Resultado); o robô escreve por `name`, e o `name` sai
  de um despejo da tela. *(15/10/2026)*

- **O `robo-baixa-os` fechou o ciclo em 15/10/2026, 23h54:** lote de 4
  OS, 4 sem problema, 3min23 por OS. Fora do orquestrador, roda à mão.
  O que faltou: o `campos.icone_sucesso` continua vazio, então toda OS
  sai como "sim; sem confirmacao" — ele fez o trabalho mas não sabe
  provar. Conferência é por amostragem, no GEOCALL.

- **Espera no robô é pergunta, não relógio.** A primeira rodada boa do
  `robo-baixa-os` levou 6min24, e cerca de metade disso era `sleep` de
  tempo fixo meu. Tempo fixo erra dos dois lados: atrasa quando a tela
  já respondeu e desiste cedo quando ela demora mais que o chute — foi
  assim que as datas se perderam (600ms) e que o robô ficou lento (7s,
  8s, 10s espalhados). A regra: depois de cada clique, perguntar a cada
  400ms se a próxima tela chegou (`ate()`), e seguir no instante em que
  chega. O log imprime `⏱` com o tempo real de cada passo, que é o que
  permite melhorar o resto. O que sobra de espera é servidor de
  verdade: o popup do material leva ~17s, medidos. *(15/10/2026)*

- **Robô que GRAVA confere a tela antes de salvar.** Em 15/10/2026 o
  `robo-baixa-os` salvou uma OS sem nenhuma das quatro datas e horas, e
  o log tinha dado ✓ em todas: ele escrevia, dormia 600ms e seguia. O ✓
  era do `el.value` lido logo depois da atribuição — sempre verdadeiro,
  e sempre inútil, porque o GEOCALL redesenha a tela e joga o valor
  fora. A regra passa a ser: escrever, **ler de volta**, repetir até
  fixar, e no fim conferir a tela inteira campo a campo contra o
  esperado. Faltando um, não salva. Os outros robôs só leem — se erram,
  a gente puxa de novo. Este deixa OS errada no sistema da Sabesp, e
  desfazer é na mão. *(15/10/2026)*

- **O export do GEOCALL NÃO trunca, e o aviso da tela engana.** A tela diz
  "foram encontradas 5.117 ordens, serão exibidas somente as 3.000
  primeiras" — isso vale para a TELA. Medido em 14/10/2026: o arquivo
  trouxe 5.118 linhas para 5.117 anunciadas, 100%. O mês vem inteiro numa
  rodada só, e as duas formas (bloco único e blocos de uma semana) deram
  resultado idêntico linha a linha de 01 a 12/10.

  Eu afirmei o contrário em 13/10, a partir de uma observação só e sem
  abrir o arquivo: a rodada daquele dia pediu 01 a 13 e o banco ficou com
  01 a 07. A causa continua desconhecida, e **não é truncamento**. Se
  voltar a acontecer, quem avisa é a linha de conferência do próprio robô,
  que compara o que a tela anunciou com o que o arquivo trouxe e grita
  quando o arquivo vem abaixo de 80%. Só aí vale quebrar em períodos
  menores. *(corrigido em 14/10/2026)*

## PostgREST

- **`Range` sem `order` único é bug, sempre.** Sem `order` o PostgREST
  devolve as páginas em ordem arbitrária e a mesma consulta repete e omite
  linhas; com `order` não único, linhas empatadas trocam de página no meio
  da leitura. Dez consultas do app estavam assim e foram corrigidas em
  14/10/2026. Toda consulta paginada nova precisa de ordenação que termine
  numa chave única (em geral `...,numero_os.asc,tss.asc`).
