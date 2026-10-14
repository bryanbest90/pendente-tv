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
