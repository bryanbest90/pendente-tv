-- ============================================================
-- ENTRADAS POR DIA, FAMÍLIA E UNIDADE — para o gráfico
--
-- Rode no SQL Editor do Supabase, depois de sql/os_entrada.sql.
--
-- Mesma forma da pendente_historico (dia, unidade, familia, número),
-- de propósito: o gráfico já filtra por unidade e por família em cima
-- daquela tabela, e assim as duas séries passam pelo mesmo filtro sem
-- código novo.
--
-- Existe para o gráfico não precisar baixar as ~11 mil linhas da
-- os_entrada e agrupar no navegador. Agregada, são ~45 dias × 18
-- famílias × 3 unidades.
-- ============================================================

-- ---------- ANTES DA VIEW: corrigir o primeiro dia da série ----------
-- O backfill 2 do os_entrada.sql datou com 16/08/2026 os 981 pares que
-- já estavam na carteira no primeiro dia em que começamos a fotografar.
-- Eles não ENTRARAM naquele dia: já estavam lá, e ninguém guardou a
-- data real. Deixados como entrada, viram um pico de 981 contra os
-- 250 de um dia normal — e, pior, puxam a escala do gráfico inteiro.
--
-- Viram origem 'inicial'. A linha continua existindo (é o acervo de
-- onde a série parte), só deixa de ser contada como entrada do dia.
UPDATE os_entrada
   SET origem = 'inicial'
 WHERE origem = 'foto'
   AND data_insercao = (SELECT min(dia) FROM pendente_diario_os);

CREATE OR REPLACE VIEW v_entrada_serie AS
SELECT data_insercao AS dia,
       unidade,
       familia,
       count(*)::int                                        AS entradas,
       count(*) FILTER (WHERE origem = 'foto')::int         AS aproximadas
  FROM os_entrada
 WHERE unidade IS NOT NULL AND familia IS NOT NULL
   AND origem <> 'inicial'   -- acervo do primeiro dia, não é entrada
 GROUP BY 1, 2, 3;

GRANT SELECT ON v_entrada_serie TO anon, authenticated;


-- ---------- Conferência ----------
-- Entradas por dia nas últimas duas semanas:
--   SELECT dia, sum(entradas) FROM v_entrada_serie
--    WHERE dia >= current_date - 14 GROUP BY 1 ORDER BY 1;
--
-- Dia útil fica entre 220 e 320; fim de semana entre 70 e 140.
--
-- ATENÇÃO À COMPARAÇÃO COM O SALDO
-- A os_entrada tem 6 famílias que a pendente_historico não tem:
-- VISTORIA, CORTE SUPRESSÃO ADM, FISCALIZAÇÃO, SERV COMPLEMENTAR,
-- ABASTECIMENTO e DESOBSTRUÇÃO — o robô as exclui do histórico. São
-- 2% das entradas. O gráfico ignora essas famílias para que entradas,
-- saídas e saldo falem do mesmo universo; sem isso a conta de saída
-- sairia inflada. Quem quiser o número cheio, é a coluna Entradas da
-- tabela, que não filtra nada:
--   SELECT familia, count(*) FROM os_entrada
--    WHERE familia IN ('VISTORIA','CORTE SUPRESSÃO ADM','FISCALIZAÇÃO',
--                      'SERV COMPLEMENTAR','ABASTECIMENTO','DESOBSTRUÇÃO')
--    GROUP BY 1 ORDER BY 2 DESC;
