-- ============================================================
-- O ESPELHO — contar como a Sabesp conta, sem perder o que ela não conta
--
-- Rode no SQL Editor depois do sql/isap_execucao.sql.
--
-- O QUE FOI DESCOBERTO
-- Quando um vazamento de água é resolvido com TROCA DE RAMAL, a etapa do
-- vazamento some do ISAP. Conferido em 01 a 12/10/2026: das 45 linhas
-- "TSS de vazamento + resultado TROCA DE RAMAL DE AGUA", 45 não estão na
-- planilha deles. Nenhuma exceção.
--
-- E não é que a OS vire outra: a Sabesp registra o TSE "TROCA DE RAMAL DE
-- AGUA" só sob a TSS 2840 (TROCAR RAMAL DE ÁGUA), que é OS própria,
-- aberta já como troca de ramal. Dos 45 imóveis, NENHUM tem OS 2840 —
-- nem na planilha dela, nem no nosso banco. A troca feita dentro da OS de
-- vazamento não vira etapa em lugar nenhum; o Bryan confirmou isso na
-- tela do GEOCALL, onde as reposições aparecem como "Etapa - <OS>" e a
-- troca de ramal não.
--
-- O EFEITO, E POR QUE ELE É GUARDADO E NÃO APAGADO
-- As reposições que vêm depois nascem com acatamento no instante em que o
-- vazamento foi baixado — relógio zerado. Então uma espera de 7 dias e 23
-- horas vira, no ISAP, dois serviços dentro do prazo e nenhum fora.
--
-- Nos 45 casos: a espera média do cliente foi de 77 horas contra prazo de
-- 24, a maior foi de 717 horas (30 dias), e somadas dão 3.461 horas —
-- 144 dias de espera que não aparecem no índice.
--
-- Por isso o espelho não apaga: ele MARCA. O índice espelho é o que a
-- Sabesp vai cobrar; o contador do lado é o tamanho da exposição se um
-- dia essa porta fechar.
-- ============================================================


-- ---------- 1. A régua das exceções ----------
-- Em tabela, e não dentro da view, de propósito: o Bryan vai questionar
-- a Sabesp. Se a resposta for "é falha nossa, vamos corrigir", desligar
-- é um UPDATE — não um deploy.
CREATE TABLE IF NOT EXISTS isap_excecao (
  id         BIGSERIAL PRIMARY KEY,
  cod_tss    INT,            -- NULL = qualquer serviço
  resultado  TEXT,           -- NULL = qualquer resultado
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  motivo     TEXT,
  conferido  TEXT,           -- o que foi medido, para não virar fé
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO isap_excecao (cod_tss, resultado, motivo, conferido)
SELECT v.cod_tss, 'TROCA DE RAMAL DE AGUA',
       'Vazamento resolvido com troca de ramal: a Sabesp não conta a etapa do vazamento',
       '45 de 45 linhas assim ausentes da planilha de 01 a 12/10/2026; nenhum dos 45 imóveis tem OS 2840'
  FROM (VALUES (3520),(3530),(3540),(3550),(3560),(3600)) AS v(cod_tss)
 WHERE NOT EXISTS (SELECT 1 FROM isap_excecao e
                    WHERE e.cod_tss = v.cod_tss AND e.resultado = 'TROCA DE RAMAL DE AGUA');

ALTER TABLE isap_excecao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isap_excecao_read ON isap_excecao;
CREATE POLICY isap_excecao_read ON isap_excecao FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON isap_excecao TO anon, authenticated;

-- Para desligar tudo quando a Sabesp responder:
--   UPDATE isap_excecao SET ativo = FALSE;


-- ---------- 2. A view, agora com as duas contas ----------
-- `no_espelho` diz se a linha entra na conta que a Sabesp faz.
-- Quem está FORA do espelho continua na view, com veredito e tempo —
-- é o que alimenta o contador da tela.
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
       END AS veredito,
       NOT EXISTS (
         SELECT 1 FROM isap_excecao e
          WHERE e.ativo
            AND (e.cod_tss   IS NULL OR e.cod_tss   = b.cod_tss)
            AND (e.resultado IS NULL OR e.resultado = b.resultado)
       ) AS no_espelho
  FROM b;

ALTER VIEW v_idg SET (security_invoker = on);
GRANT SELECT ON v_idg TO authenticated;


-- ---------- Conferência ----------
-- O índice espelho (o que a Sabesp cobra):
--   SELECT indicador,
--          count(*) FILTER (WHERE veredito='DENTRO') AS dentro,
--          count(*) FILTER (WHERE veredito='FORA')   AS fora,
--          round(100.0*count(*) FILTER (WHERE veredito='DENTRO')
--                /nullif(count(*) FILTER (WHERE veredito IN ('DENTRO','FORA')),0),2) AS indice
--     FROM v_idg
--    WHERE no_espelho AND dia BETWEEN '2026-10-01' AND '2026-10-12'
--    GROUP BY 1 ORDER BY 1;
--
-- Tem que dar perto de ISAPa 81,46 / ISAPe 86,32 / ISAPr 95,79.
-- A Sabesp, no mesmo período e com o mesmo expurgo, deu ISAPa 82,04.
--
-- E o que o espelho escondeu:
--   SELECT count(*) AS casos,
--          count(*) FILTER (WHERE veredito='FORA') AS fora,
--          round(avg(tempo_atendimento)) AS espera_media_h,
--          max(tempo_atendimento) AS pior_h,
--          sum(tempo_atendimento) AS horas_totais
--     FROM v_idg
--    WHERE NOT no_espelho AND dia BETWEEN '2026-10-01' AND '2026-10-12';
-- ============================================================
