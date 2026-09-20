# Mudar o prazo da data de competência para a data de inserção

Análise pedida em 20/09/2026 — Bryan Mendes Deodato

---

## Resumo em cinco linhas

1. Hoje o sistema **não calcula prazo nenhum**. Ele lê o `Tempo Residual` que o GEOCALL já entrega pronto.
2. Mudar para a data de inserção não é trocar um campo — é **passar a ser o autor do prazo**, e o prazo é da Sabesp.
3. Para calcular faltam duas coisas, e uma delas **nós não temos em lugar nenhum**: a tabela de dias por TSS.
4. O efeito no número é grande e num sentido só: **cai o "fora do prazo"**, sem nenhum serviço a mais ter sido feito.
5. A recomendação é **não substituir, e sim somar**: manter o prazo do GEOCALL e colocar do lado a *idade na carteira*. Isso já é possível hoje, é barato, e responde à pergunta certa sem brigar com a Sabesp.

---

## 1. O que o sistema faz hoje, exatamente

Vale começar por aqui porque muda a natureza da pergunta. O app inteiro só tem estas duas funções lidando com prazo:

```js
function tempo(val){ const s=String(val).trim();
  return !s ? null : s.startsWith("-") ? "fora" : "prazo"; }

function tempoDays(val){ const m=String(val).match(/(-?\d+)d/);
  return m ? parseInt(m[1]) : 0; }
```

A primeira olha se o texto começa com `-`. A segunda pega o número. **Não existe subtração de datas em lugar nenhum do código.** Todo o painel — o "no prazo / fora do prazo", a barra de proporção, a ordenação dos modais, o percentual por família — pendura em uma string que veio do relatório.

Consequência prática: hoje o nosso painel e o relatório da Sabesp **nunca divergem**, porque é literalmente o mesmo número. Isso não é pouco. É a razão de ninguém nunca ter chegado dizendo "o seu sistema está errado".

## 2. De onde vem cada data

| Data | Quem gera | Onde aparece para nós | O que ela significa |
|---|---|---|---|
| **Competência** | GEOCALL / Sabesp | só no relatório de **execução** (`DATA DE COMPETÊNCIA`) | quando a demanda virou responsabilidade da Sabesp — na prática, quando o cliente reclamou |
| **Inserção na carteira** | ninguém | não existe como campo | quando a OS chegou até nós |

Repare na segunda linha. **A data de inserção não é um campo que exista.** O pendente do GEOCALL é uma fotografia do agora: ele lista o que está aberto, não desde quando. Não há coluna para ler.

O que nós temos é a nossa própria série de fotos diárias (`pendente_diario_os`). O primeiro dia em que uma OS aparece nela é o dia em que ela entrou — é uma reconstrução, e boa, mas com um limite honesto: **ela só enxerga até o primeiro snapshot que guardamos.** Tudo que já estava na carteira antes disso aparece com a data do primeiro snapshot, que é um piso, não a data real.

Para medir o tamanho desse ponto cego:

```sql
SELECT min(dia) AS primeiro_snapshot,
       max(dia) AS ultimo_snapshot,
       count(DISTINCT dia) AS dias_guardados
  FROM pendente_diario_os;

-- Quantas OS do pendente de hoje já estavam na primeira foto.
-- Essas são as que NÃO têm data de entrada de verdade:
SELECT count(*) FROM v_os_entrada WHERE entrou_em = primeiro_dia_da_serie;
```

## 3. O que faltaria para calcular o prazo por conta própria

Um prazo é `data inicial + duração`. Trocaríamos a data inicial, mas **a duração continua sendo do GEOCALL** — e essa é a parte que ninguém repara.

Quantos dias tem `REPOR ASFALTO`? E `TELEVISIONAR REDE DE ESGOTO`? E `TRANSFORMAÇÃO LIG NOVA COM APROV RAMAL`? Hoje nós **não sabemos**, e nunca precisamos saber: o GEOCALL já entregava a conta feita. Para calcular por conta própria seria preciso uma tabela TSS → dias, com cerca de 200 linhas, que:

- só a Sabesp pode fornecer com autoridade (é contrato);
- muda quando o contrato muda;
- precisa de uma linha nova a cada TSS nova — e TSS nova aparece sozinha, sem avisar.

**E não dá para deduzir dos snapshots.** Pelo que o app lê da `pendente_diario_os`, a tabela guarda `fora_prazo` como booleano — não guarda os dias residuais. Então nem mesmo olhando para o passado dá para inferir a duração de cada TSS. Confirme com:

```sql
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'pendente_diario_os'
 ORDER BY ordinal_position;
```

Se `fora_prazo` for `boolean` e não houver coluna de dias, a tabela de durações tem que vir de fora. Não há atalho.

## 4. O que mudaria nos números

Em uma frase: **cai o "fora do prazo"**, e cai porque o relógio foi zerado, não porque alguém trabalhou.

O caso típico é a OS que chega já vencida. Cliente reclamou em março, a OS rodou por outras mãos, e caiu na nossa carteira em setembro com `-180d`. Hoje ela entra vermelha no primeiro dia. Pelo critério novo ela entraria verde, com os dias inteiros pela frente.

Isso tem dois lados, e os dois são verdadeiros:

- **A favor:** é injusto cobrar da equipe os 180 dias em que a OS não estava com ela. Essa crítica está certa.
- **Contra:** o cliente está esperando há 180 dias de qualquer jeito. A OS vencida não fica menos vencida porque nós passamos a contar de outro jeito, e a Sabesp vai continuar contando do jeito dela.

Para ver o tamanho do efeito **antes** de mudar qualquer coisa — quantas OS estão hoje fora do prazo mas entraram na carteira há pouco tempo:

```sql
SELECT d.dia - e.entrou_em AS dias_na_carteira, count(*)
  FROM pendente_diario_os d
  JOIN v_os_entrada e ON e.numero_os = d.numero_os
 WHERE d.dia = (SELECT max(dia) FROM pendente_diario_os)
   AND d.fora_prazo
 GROUP BY 1 ORDER BY 1;
```

As linhas de cima dessa saída são exatamente as OS que mudariam de cor. Se forem poucas, a mudança é cosmética e não vale o risco. Se forem muitas, o problema real não é o critério do prazo — é que estamos recebendo carteira vencida, e isso se resolve conversando com quem entrega, não mudando o nosso cálculo.

## 5. O risco que eu não conseguiria contornar

Passar a calcular o prazo cria **dois números para a mesma pergunta**. O nosso painel diria "12% fora do prazo"; o relatório da Sabesp diria "31% fora do prazo". Os dois estariam certos dentro da própria régua, e é aí que começa o problema:

- o número que é auditado, cobrado e eventualmente descontado é o **da Sabesp**;
- quem usa o painel passa a se planejar pelo **nosso**;
- a conversa deixa de ser sobre o serviço e passa a ser sobre de quem é o número.

Um painel que discorda da fonte oficial não vira a fonte oficial — vira um painel em que as pessoas param de confiar. E o painel de vocês hoje tem a vantagem rara de ser indiscutível.

## 6. Recomendação

**Não trocar. Acrescentar.**

Manter o `Tempo Residual` do GEOCALL exatamente como está — é o prazo contratual, é o que a Sabesp mede, e é de graça. E colocar ao lado dele uma segunda coluna, com nome diferente para não se confundir com prazo:

> **Na carteira há 14 dias**

Calculada a partir da `v_os_entrada`, que já existe. Não é prazo, é **idade** — e como não se chama prazo, não briga com ninguém.

Com as duas lado a lado a leitura fica muito melhor do que com qualquer uma sozinha:

| Tempo Residual | Na carteira há | Como ler |
|---|---|---|
| `-40d` | 2 dias | chegou vencida — não é da equipe, é da entrega |
| `-40d` | 38 dias | está parada conosco — é nossa |
| `+3d` | 25 dias | o SLA está escondendo uma OS esquecida |
| `+3d` | 2 dias | normal |

A terceira linha é a que justifica o trabalho. Hoje ela é **invisível**: uma OS de prazo longo pode ficar 25 dias parada mostrando verde, e nada no painel chama atenção. A idade na carteira mostra isso, e o prazo do GEOCALL nunca vai mostrar.

Custo: a view já está escrita, o filtro por data já está na tela. Falta acrescentar a coluna nos modais e permitir ordenar por ela — pequeno.

## 7. Se mesmo assim você quiser trocar

Aí eu precisaria de duas coisas suas, e nenhuma delas é código:

1. **A tabela oficial de prazo por TSS**, vinda da Sabesp ou do contrato. Sem ela eu estaria chutando durações, e um painel com prazo chutado é pior do que painel nenhum.
2. **Uma decisão sobre o ponto cego**: o que fazer com as OS que entraram antes do primeiro snapshot. As opções honestas são mostrar "na carteira desde ANTES de DD/MM" (é o que o filtro novo já faz) ou deixá-las fora do indicador até a série cobrir todo mundo.

Com essas duas em mãos dá para fazer. O que eu não faria é começar sem elas.

---

### Uma observação de fora do pedido

Isso aqui é a mesma história do Google Sheets: funciona até a régua mudar de dono. Enquanto o prazo é do GEOCALL, qualquer divergência é problema dele. No dia em que o prazo passa a ser calculado aqui, toda divergência passa a ser sua — inclusive as causadas por uma TSS nova que ninguém cadastrou na tabela de durações. Vale entrar nisso com os olhos abertos, e a idade na carteira dá 90% do benefício sem assumir nada disso.
