-- ============================================================
-- QUANDO A OS ENTROU NA CARTEIRA
--
-- O pendente que o GEOCALL devolve é uma foto do AGORA: ele não
-- diz desde quando a OS está lá. Quem sabe disso é a nossa
-- própria série de fotos diárias, a pendente_diario_os — o
-- primeiro dia em que a OS aparece é o dia em que ela entrou.
--
-- LIMITE HONESTO desta view: ela só enxerga a partir do dia em
-- que começamos a guardar snapshot. OS que já estava na carteira
-- antes disso aparece com a data do primeiro snapshot, e não com
-- a data real de entrada — que ninguém guardou. Por isso a view
-- devolve também `primeiro_dia_da_serie`: a tela usa isso para
-- dizer "está na carteira desde ANTES de <data>" em vez de
-- afirmar uma data que não é verdade.
-- ============================================================

-- A tela consulta esta view com filtro (entrou_em >= data), e o
-- min() por OS varre a serie inteira. Sem este indice cada clique
-- no filtro de data faz varredura da tabela toda.
CREATE INDEX IF NOT EXISTS pendente_diario_os_os_dia ON pendente_diario_os (numero_os, dia);

-- ESCOLHA: agrupa por numero_os, NAO pelo par (OS, TSS).
-- O par e a chave real de um item de carteira, mas quando uma OS
-- migra de TSS o par novo nasce hoje — e a OS, que esta parada ha
-- meses, apareceria no filtro como se tivesse acabado de entrar.
-- Agrupar pela OS erra para o lado seguro: nunca faz o velho
-- parecer novo. Para ver por par, troque o GROUP BY por
-- (d.numero_os, d.tss) e acrescente d.tss no SELECT.
CREATE OR REPLACE VIEW v_os_entrada AS
SELECT d.numero_os,
       min(d.dia)                                   AS entrou_em,
       (SELECT min(dia) FROM pendente_diario_os)    AS primeiro_dia_da_serie
  FROM pendente_diario_os d
 GROUP BY d.numero_os;

GRANT SELECT ON v_os_entrada TO anon, authenticated;


-- ------------------------------------------------------------
-- Conferência — desde quando dá para responder "entrou quando":
--
--   SELECT min(dia) AS primeiro_snapshot,
--          max(dia) AS ultimo_snapshot,
--          count(DISTINCT dia) AS dias_guardados
--     FROM pendente_diario_os;
--
-- Quantas OS do pendente de hoje já estavam na primeira foto —
-- essas são as que não têm data real de entrada:
--
--   SELECT count(*) FROM v_os_entrada
--    WHERE entrou_em = primeiro_dia_da_serie;
-- ------------------------------------------------------------
