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
