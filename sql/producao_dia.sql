-- ============================================================
-- v_producao_dia — o gráfico da Produção, pela regra do Bryan
--
-- A REGRA, EM UMA FRASE
--
-- Cada barra é datada pelo PRÓPRIO FATO, não por diferença entre
-- fotos; as linhas continuam sendo a foto do fim do dia.
--
--   entraram        pela data de criação (Data de Inserção)
--   executados      pela data de execução
--   nao_executados  pela data de execução
--   sumiram         pelo dia em que deixou de estar na foto
--   carteira / no_prazo / fora_prazo   a foto daquele dia
--
-- POR QUE ISTO EXISTE
--
-- O gráfico anterior media o MOVIMENTO da carteira: comparava cada
-- foto com a anterior. Quem entrava e era executado no mesmo dia
-- nunca aparecia em foto nenhuma e, portanto, não aparecia como
-- executado. Em 16/11/2026, com a família VAZAMENTO, a tela mostrava
-- 10 executados num dia em que a produção por equipe era bem maior —
-- e o Bryan estava certo em estranhar.
--
-- A observação dele resolve a maior parte sozinha: o serviço que
-- nasce e morre no mesmo dia aparece SIM na execução das equipes,
-- então contá-lo pela data de execução já o traz de volta. E o que
-- não é executado continua na carteira, logo aparece na foto.
--
-- O QUE A REGRA DELE NÃO COBRE, E POR ISSO A COLUNA `sumiram`
--
-- Sobra um caso: o serviço que sai da carteira sem baixa NENHUMA —
-- nem executado, nem improdutiva. Não é executado (não tem data de
-- execução) e não está mais na foto. Cancelamento, mudança de status
-- que o tira do filtro, troca de família. Em 01/10/2026 eram 30 num
-- dia só. Sem essa coluna a carteira encolhe sozinha no gráfico e a
-- conta não fecha.
--
-- Com ela, a identidade vale:
--
--   carteira(ontem) + entraram − executados − nao_executados
--                   − sumiram  =  carteira(hoje)
--
-- A conferência no fim deste arquivo mede o quanto ainda sobra. Se
-- `sumiram` vier perto de zero nos dias recentes, a coluna pode sair
-- do gráfico — e aí o desenho fica mais simples.
--
-- DIA SEM FOTO FICA NULO, NÃO ZERO
--
-- As colunas da carteira vêm da foto. Faltando a foto do dia, elas
-- vêm NULAS de propósito, para a linha do gráfico quebrar em vez de
-- cair a zero e fingir que a carteira zerou. A `v_dias_sem_foto`
-- lista esses dias.
--
-- GRANT só para authenticated, e REVOKE de anon ANTES: o Supabase
-- tem DEFAULT PRIVILEGES que já concedem SELECT a anon em todo objeto
-- novo, então conceder a um papel não tira do outro. Esse erro já foi
-- cometido aqui em 16/10/2026, com a v_execucao_serie.
--
-- Rode depois de: carteira_foto.sql, carteira_movimento.sql,
-- execucao_serie.sql, entrada_serie.sql.
-- (19/11/2026)
-- ============================================================


-- ---------- 1. A LISTA DOS QUE SUMIRAM ----------
-- É o cartão que abre ao clicar na faixa cinza do gráfico. Existe
-- porque "sumiram 6" é um número que ninguém consegue checar: com a
-- OS na mão dá para abrir no GEOCALL e descobrir o motivo. E se a
-- maioria tiver baixa lá e não aqui, o defeito é do robô de
-- execuções, não do gráfico.
CREATE OR REPLACE VIEW v_producao_sumiram AS
WITH foto AS (
  SELECT DISTINCT dia, numero_os, tss, unidade, familia
    FROM pendente_diario_os
),
dd AS (
  SELECT dia, LAG(dia) OVER (ORDER BY dia) AS ant
    FROM (SELECT DISTINCT dia FROM pendente_diario_os) x
),
m AS (
  SELECT f.dia, f.numero_os, f.tss, f.unidade, f.familia,
         LEAD(f.dia) OVER (PARTITION BY f.numero_os, f.tss ORDER BY f.dia) AS prox_par,
         MIN(f.dia)  OVER (PARTITION BY f.numero_os, f.tss)                AS primeira_foto
    FROM foto f
)
SELECT dd.dia,                       -- o dia em que se percebeu a saída
       m.unidade,
       m.familia,
       m.numero_os,
       m.tss,
       m.dia                        AS ultima_foto,
       m.primeira_foto,
       (m.dia - m.primeira_foto)::int AS dias_na_carteira
  FROM dd
  JOIN m ON m.dia = dd.ant
 WHERE m.prox_par IS DISTINCT FROM dd.dia
   -- sem baixa NENHUMA: nem executado, nem improdutiva
   AND NOT EXISTS (
     SELECT 1 FROM v_execucao_final e
      WHERE e.numero_os = m.numero_os
        AND e.tss       = m.tss
        AND e.dia      <= dd.dia
   );

ALTER VIEW v_producao_sumiram SET (security_invoker = on);
REVOKE ALL ON v_producao_sumiram FROM anon;
GRANT SELECT ON v_producao_sumiram TO authenticated;


-- ---------- 2. A SÉRIE DO GRÁFICO ----------
CREATE OR REPLACE VIEW v_producao_dia AS
WITH chaves AS (
  SELECT dia, unidade, familia FROM v_entrada_serie
  UNION
  SELECT dia, unidade, familia FROM v_execucao_serie
  UNION
  SELECT dia, unidade, familia FROM v_carteira_foto
  UNION
  SELECT dia, unidade, familia FROM v_producao_sumiram
),
sumiu AS (
  SELECT dia, unidade, familia, count(*)::int AS sumiram
    FROM v_producao_sumiram
   GROUP BY 1, 2, 3
)
SELECT k.dia,
       k.unidade,
       k.familia,
       COALESCE(e.entradas,  0)::int AS entraram,
       COALESCE(x.executados,0)::int AS executados,
       COALESCE(x.nao_executados, 0)::int AS nao_executados,
       COALESCE(s.sumiram,   0)::int AS sumiram,
       -- A carteira vem da foto e fica NULA no dia sem foto.
       c.total      AS carteira,
       c.no_prazo,
       c.fora_prazo
  FROM chaves k
  LEFT JOIN v_entrada_serie  e ON e.dia = k.dia AND e.unidade = k.unidade AND e.familia = k.familia
  LEFT JOIN v_execucao_serie x ON x.dia = k.dia AND x.unidade = k.unidade AND x.familia = k.familia
  LEFT JOIN v_carteira_foto  c ON c.dia = k.dia AND c.unidade = k.unidade AND c.familia = k.familia
  LEFT JOIN sumiu            s ON s.dia = k.dia AND s.unidade = k.unidade AND s.familia = k.familia
 WHERE k.unidade IS NOT NULL
   AND k.familia IS NOT NULL;

ALTER VIEW v_producao_dia SET (security_invoker = on);
REVOKE ALL ON v_producao_dia FROM anon;
GRANT SELECT ON v_producao_dia TO authenticated;


-- ============================================================
-- CONFERÊNCIA — rode e leia antes de confiar no gráfico
-- ============================================================

-- A) A CONTA FECHA? Para cada dia, a carteira de ontem mais o que
--    entrou menos o que saiu tem de dar a carteira de hoje. A coluna
--    `sobra` é o que nenhuma das barras explica: reabertura de OS,
--    serviço criado depois da foto, linha perdida pelo robô. Se ela
--    for pequena e sem tendência, o gráfico está honesto.
--
-- WITH t AS (
--   SELECT dia,
--          sum(entraram) e, sum(executados) x, sum(nao_executados) n,
--          sum(sumiram) s, sum(carteira) c
--     FROM v_producao_dia
--    GROUP BY 1
-- )
-- SELECT dia, c AS carteira, e, x, n, s,
--        LAG(c) OVER (ORDER BY dia) + e - x - n - s AS previsto,
--        c - (LAG(c) OVER (ORDER BY dia) + e - x - n - s) AS sobra
--   FROM t
--  WHERE dia >= current_date - 30
--  ORDER BY dia;

-- B) O CINZA VALE A PENA EXISTIR? Se `sumiram` for perto de zero nos
--    dias recentes, tire a faixa cinza do gráfico e esta view vira só
--    conferência. Se for dezena, olhe a lista da consulta (C) e veja
--    se aquelas OS têm baixa no GEOCALL — se tiverem, o buraco é do
--    robo-execucoes, não do desenho.
--
-- SELECT dia, sum(sumiram) AS sumiram, sum(executados) AS executados
--   FROM v_producao_dia
--  WHERE dia >= current_date - 30
--  GROUP BY 1 ORDER BY 1;

-- C) QUEM SÃO ELES, num dia:
--
-- SELECT * FROM v_producao_sumiram
--  WHERE dia = '2026-11-16'
--  ORDER BY dias_na_carteira DESC;

-- D) O NÚMERO QUE COMEÇOU ESTA CONVERSA. O gráfico antigo mostrava
--    10 executados para VAZAMENTO DE ÁGUA em 16/11; aqui tem de
--    aparecer o número cheio, que inclui quem entrou e saiu no mesmo
--    dia.
--
-- SELECT p.dia, p.executados AS agora,
--        (SELECT sum(m.saiu_executado) FROM v_carteira_movimento m
--          WHERE m.dia = p.dia AND m.familia = p.familia) AS antes
--   FROM v_producao_dia p
--  WHERE p.familia = 'VAZAMENTO DE ÁGUA' AND p.dia >= '2026-11-10'
--  GROUP BY p.dia, p.familia, p.executados
--  ORDER BY p.dia;


-- ============================================================
-- DESFAZER — volta tudo ao que era antes deste arquivo
-- ============================================================
-- As duas views são novas e nada mais depende delas; o gráfico antigo
-- (v_carteira_movimento) continua intocado. Derrubando as duas, a aba
-- volta ao comportamento anterior assim que o site for revertido.
--
-- DROP VIEW IF EXISTS v_producao_dia;
-- DROP VIEW IF EXISTS v_producao_sumiram;
