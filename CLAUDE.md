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

- **O expurgo nunca tira ninguém de dentro do prazo**, só resgata quem caiu
  fora, nesta ordem: suspensão formal > início igual ao fim da execução >
  transmissão de 4 horas ou mais.

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

## Prazo da carteira

- **A carteira é medida pelo prazo do CONTRATO, não pelo do GEOCALL.**
  Quem está na régua do ISAP é medido por ela, a partir da Data de
  Competência; quem não está (FRESAR/RECAPEAR, HIDRÔMETRO VAZANDO,
  SINALIZAÇÃO VIÁRIA, VÁLVULA DE REDE) fica com o prazo do GEOCALL,
  porque prazo do GEOCALL é melhor que prazo nenhum. Em 15/10/2026 a
  régua cobria 786 dos 886 serviços da tela.

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
