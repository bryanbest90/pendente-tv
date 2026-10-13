-- ============================================================
-- RECEBER O RELATÓRIO DE EXECUÇÕES COMPLETO
--
-- Rode no SQL Editor do Supabase, depois de sql/isap_regua.sql.
--
-- POR QUE
-- O relatório que o robô puxa hoje só traz serviço que teve TSE de
-- verdade. Conferido contra a planilha do ISAP: dos 1.461 executados,
-- achamos 1.258 (99,9%); dos 628 encerrados SEM execução (imóvel
-- fechado, duplicidade, trata-se de outro serviço), achamos 1. Um, de
-- 628. E esses contam no IDG igual aos outros.
--
-- O relatório novo, de 37 colunas, traz os dois grupos. Com ele a
-- cobertura foi de 61% para 99,8% e o índice calculado por nós ficou a
-- 0,05 ponto do da Sabesp.
--
-- A `execucao` continua sendo a mesma tabela: ela sempre foi "o que
-- recebeu baixa". Nenhuma coluna existente muda de significado.
-- ============================================================


-- ---------- 1. As colunas novas ----------
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS cod_tss       INT;
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS pde           TEXT;
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS familia       TEXT;
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS status_os     TEXT;

-- `resultado` é o Resultado do GEOCALL, cru. Quando houve execução ele
-- é o nome do TSE; quando não houve, é o motivo. É a mesma coisa que a
-- Sabesp parte em DESC_TSE_WFM e DESC_MNE — conferido 1 para 1 nos
-- 2.047 pares testados.
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS resultado     TEXT;

-- O código do resultado é quem decide se houve execução. Fica guardado
-- porque código não muda de acento nem de redação, e nome muda.
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS cod_resultado TEXT;

-- ---------- A COLUNA QUE PROTEGE A PRODUÇÃO ----------
-- Esta é a trava. A `execucao` passa a receber também as baixas sem
-- execução, e elas NÃO são produção. Quem resolve é o próprio GEOCALL:
--
--   106000 a 782000  -> é um TSE: executou
--   900200 a 930600  -> é um MNE: não executou
--   "FJL" (texto)    -> FIM DO DIA
--
-- Medido nas 4.610 linhas do arquivo real: 2.366 execuções, todas com
-- código abaixo de 800 mil; 2.244 não execuções, todas de 900200 para
-- cima. Zero sobreposição. E confirmado contra a Sabesp: nos 1.796
-- pares que casam com o ISAP, código >= 900000 coincide com
-- COD_TSE = -1 em 1.796 de 1.796.
--
-- Por isso não existe lista de motivos no robô: a Sabesp pode cadastrar
-- cinquenta motivos novos amanhã e nada precisa ser mexido.
--
-- NULL de propósito nas linhas antigas: o relatório velho só trazia
-- execução, então elas contam. As views abaixo usam IS NOT FALSE.
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS executado     BOOLEAN;

-- O início da execução é o que permite calcular o maior dos três
-- expurgos. Sem ele não existe EXPURGO_TEMPO_EXECUCAO.
ALTER TABLE execucao ADD COLUMN IF NOT EXISTS data_inicio_execucao TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS execucao_cod_tss   ON execucao (cod_tss);
CREATE INDEX IF NOT EXISTS execucao_pde       ON execucao (pde);
CREATE INDEX IF NOT EXISTS execucao_executado ON execucao (executado) WHERE executado IS FALSE;


-- ---------- 2. Preencher o código da TSS nas linhas antigas ----------
-- A Sabesp escreve "VAZAMENTO DE AGUA", o GEOCALL manda "VAZAMENTO DE
-- ÁGUA". O relatório novo traz "Código TSS" e o casamento fica exato.
-- As linhas antigas só têm o nome; dá para completar pela régua.
CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE execucao e
   SET cod_tss = r.cod_tss
  FROM isap_tss r
 WHERE e.cod_tss IS NULL
   AND r.tss_busca = upper(unaccent(e.tss));


-- ---------- 3. A PRODUÇÃO NÃO PODE MUDAR ----------
-- As duas views da produção faziam count(*) na tabela inteira. Sem a
-- cláusula abaixo, elas inflariam 83% no dia em que o robô novo subir —
-- medido: 3.135 baixas contra 1.708 execuções de 01 a 08/10.
--
-- Conferência que já fiz com o arquivo real, 01 a 08/10:
--   o que está na tabela hoje .... 1.708
--   o robô novo, só executadas ... 1.710
--   em comum ..................... 1.708
--   perderíamos .................. 0
--   ganharíamos .................. 2
-- Ou seja: a produção fica idêntica, e as outras 1.425 baixas entram
-- como informação nova, fora da conta de produção.
CREATE OR REPLACE VIEW v_producao_detalhe AS
SELECT dia,
       COALESCE(NULLIF(btrim(equipe), ''), '(sem equipe)') AS equipe,
       COALESCE(NULLIF(btrim(tss),    ''), '(sem TSS)')    AS tss,
       COALESCE(NULLIF(btrim(tse),    ''), '(sem TSE)')    AS tse,
       atc,
       municipio,
       count(*)                  AS qtd,
       count(DISTINCT numero_os) AS os_distintas
  FROM execucao
 WHERE executado IS NOT FALSE
 GROUP BY 1,2,3,4,5,6;

CREATE OR REPLACE VIEW v_producao_equipe_dia AS
SELECT dia,
       COALESCE(NULLIF(btrim(equipe), ''), '(sem equipe)') AS equipe,
       count(*)                  AS execucoes,
       count(DISTINCT numero_os) AS os_distintas,
       count(DISTINCT tss)       AS tipos_tss,
       count(DISTINCT tse)       AS tipos_tse
  FROM execucao
 WHERE executado IS NOT FALSE
 GROUP BY 1,2;

REVOKE ALL ON v_producao_detalhe, v_producao_equipe_dia FROM anon;
GRANT SELECT ON v_producao_detalhe, v_producao_equipe_dia TO authenticated;


-- ---------- 3b. IMPORTAR SEM NUNCA DEIXAR O PERIODO VAZIO ----------
-- O robô apagava o periodo e so depois inseria. Em 13/10/2026 o insert
-- falhou (as colunas acima ainda nao existiam) e outubro inteiro ficou
-- com ZERO linhas: o delete tinha passado, o insert nao.
--
-- Nao foi perda definitiva — o robô reimporta —, mas entre uma coisa e
-- outra a aba Producao mostrou o mes zerado. Qualquer queda de rede no
-- meio do envio faz o mesmo.
--
-- A ordem certa inverte isso: primeiro grava tudo (upsert, marcando a
-- hora da rodada), depois apaga do periodo so o que esta rodada NAO
-- tocou. Em nenhum instante o periodo fica vazio, e se a rodada morrer
-- no meio o que havia antes continua la.
CREATE OR REPLACE FUNCTION limpar_execucao_antiga(
  p_ini DATE, p_fim DATE, p_marca TIMESTAMPTZ
) RETURNS INT AS $$
DECLARE n INT;
BEGIN
  DELETE FROM execucao
   WHERE dia BETWEEN p_ini AND p_fim
     AND importado_em < p_marca;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION limpar_execucao_antiga(DATE, DATE, TIMESTAMPTZ) TO anon, authenticated;


-- ---------- 4. A baixa que conta para o IDG ----------
-- Uma OS pode receber várias baixas: a equipe fecha o dia, volta no dia
-- seguinte, fecha de novo. A Sabesp conta UMA por par (OS, TSS) — a
-- última, e só se ela encerrar a OS.
--
-- Os três códigos abaixo não encerram. Medido nas 3.174 linhas fechadas
-- de 01 a 08/10: "FIM DO DIA" (424 linhas) e "IMÓVEL FECHADO,
-- REPROGRAMAR ORDEM" (64) não entraram na planilha deles NENHUMA vez;
-- "CONTINUA - SERVIÇO NÃO CONCLUÍDO" entrou 4 de 261 vezes.
--
-- São códigos e não nomes, de propósito. E a regra é temporal antes de
-- ser lexical: das 2.289 últimas baixas, só 12 eram um desses três —
-- "FIM DO DIA" quer dizer que a equipe volta amanhã, então existe uma
-- baixa posterior que ganha sozinha. A lista só afina o resultado em
-- 6 linhas de 2.289.
CREATE OR REPLACE VIEW v_execucao_final AS
SELECT DISTINCT ON (numero_os, cod_tss) *
  FROM execucao
 WHERE status_os = 'Fechada'
   AND cod_tss IS NOT NULL
   AND data_execucao IS NOT NULL
   AND COALESCE(cod_resultado, '') NOT IN ('FJL', '901200', '902900')
 ORDER BY numero_os, cod_tss, data_execucao DESC;

ALTER VIEW v_execucao_final SET (security_invoker = on);
GRANT SELECT ON v_execucao_final TO authenticated;


-- ---------- 5. O IDG ----------
-- A conta inteira, do jeito que foi decifrada da planilha deles:
--
--   tempo = FIM EXECUÇÃO − COMPETÊNCIA, truncado para baixo na unidade
--           do prazo (dia se DC, hora se HS), nunca negativo
--   fora  = tempo > prazo      (com >, não >=: 77 serviços encostaram
--                               no prazo exato e contaram como dentro)
--
-- Só quem caiu FORA passa pelo expurgo, nesta ordem:
--   1. suspensão formal          — não temos o campo (2 casos em 2.089)
--   2. início == fim de execução — EXPURGO_TEMPO_EXECUCAO
--   3. transmissão >= 4 horas    — falta a hora da Data Inserção
--
-- Quem está DENTRO nunca é tocado pelo expurgo: conferido, os 129
-- serviços com início==fim que estavam dentro continuaram dentro.
CREATE OR REPLACE VIEW v_idg AS
WITH b AS (
  SELECT f.numero_os, f.cod_tss, f.tss, f.dia, f.equipe, f.resultado,
         f.executado, f.familia, f.bairro, f.atc,
         f.data_competencia, f.data_execucao, f.data_inicio_execucao,
         r.indicador, r.prazo, r.tipo_prazo,
         GREATEST(0, floor(
           EXTRACT(EPOCH FROM (f.data_execucao - f.data_competencia))
           / CASE WHEN r.tipo_prazo = 'DC' THEN 86400 ELSE 3600 END
         ))::INT AS tempo_atendimento
    FROM v_execucao_final f
    JOIN isap_tss r ON r.cod_tss = f.cod_tss
   WHERE f.data_competencia IS NOT NULL
)
SELECT b.*,
       CASE
         WHEN tempo_atendimento <= prazo THEN 'DENTRO'
         WHEN data_inicio_execucao IS NOT NULL
              AND data_inicio_execucao = data_execucao THEN 'EXPURGO_TEMPO_EXECUCAO'
         ELSE 'FORA'
       END AS veredito
  FROM b;

ALTER VIEW v_idg SET (security_invoker = on);
GRANT SELECT ON v_idg TO authenticated;


-- ---------- Conferência ----------
-- 1) A produção não mudou. Rode ANTES e DEPOIS da primeira subida do
--    robô novo e compare — tem que dar o mesmo número:
--      SELECT sum(execucoes) FROM v_producao_equipe_dia
--       WHERE dia BETWEEN '2026-10-01' AND '2026-10-08';
--
-- 2) O índice do mês, por frente:
--      SELECT indicador,
--             count(*) FILTER (WHERE veredito='DENTRO') AS dentro,
--             count(*) FILTER (WHERE veredito='FORA')   AS fora,
--             count(*) FILTER (WHERE veredito LIKE 'EXPURGO%') AS expurgo,
--             round(100.0 * count(*) FILTER (WHERE veredito='DENTRO')
--                   / nullif(count(*) FILTER (WHERE veredito IN ('DENTRO','FORA')),0), 2) AS indice
--        FROM v_idg
--       WHERE dia >= date_trunc('month', current_date)
--       GROUP BY 1 ORDER BY 1;
--
--    O IDG é a média simples das três linhas. Não é ponderada por
--    volume: o ISAPr pesa igual ao ISAPa apesar de ter 5 vezes menos
--    serviços. Foi a única forma que reproduziu o número deles.
--
--    Em 01 a 08/10/2026 isso deu ISAPa 84,78 / ISAPe 85,36 /
--    ISAPr 95,12, IDG 88,42. A Sabesp, no mesmo universo e com o mesmo
--    expurgo, deu 88,47. Diferença de 0,05 ponto.
--
-- 3) Onde o índice está sendo perdido:
--      SELECT resultado, count(*) AS total,
--             count(*) FILTER (WHERE veredito='FORA') AS fora
--        FROM v_idg WHERE dia >= date_trunc('month', current_date)
--       GROUP BY 1 ORDER BY 3 DESC LIMIT 15;
--
-- 4) Apareceu motivo de não execução novo? (não quebra nada, é só para
--    você saber que o GEOCALL cadastrou algo):
--      SELECT cod_resultado, resultado, count(*)
--        FROM execucao WHERE executado IS FALSE
--       GROUP BY 1,2 ORDER BY 3 DESC;


-- ============================================================
-- O QUE AINDA FALTA
--
-- A HORA DA "DATA INSERÇÃO" fecha o último expurgo calculável.
-- Provado: o TEMPO_TRASMITIR da Sabesp é
--   DATA_CRIA_CONECTA_SERVICOS − DH_ACATAMENTO
-- e o limiar de 4 horas separa os 335 serviços fora do prazo em 292
-- sem expurgo / 43 com expurgo, SEM UM ERRO.
--
-- A DATA_CRIA_CONECTA_SERVICOS é a nossa "Data Inserção" — o pendente
-- manda com hora ("27/08/2025 11:44") e a os_entrada.data_insercao é
-- DATE: a hora foi descartada na importação. Trocar para TIMESTAMPTZ
-- recupera 1,19 ponto de IDG em expurgo que hoje não conseguimos nem
-- calcular nem cobrar.
--
-- Isso NÃO se reconstrói do passado: a hora só existe no relatório do
-- dia. Quanto antes mudar, menos histórico cego.
--
-- A SUSPENSÃO não é calculável — é ato administrativo da Sabesp.
-- Foram 2 casos em 2.089 (0,1%).
-- ============================================================
