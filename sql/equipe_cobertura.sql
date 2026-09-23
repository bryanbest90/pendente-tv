-- ============================================================
-- COBERTURA DA EQUIPE — que serviço cada uma atende
--
-- Rode no SQL Editor do Supabase, depois de sql/itinerario.sql.
-- Salve como sql/equipe-cobertura.sql.
--
-- Dois níveis: a FRENTE (tipos) resolve o caso comum e continua
-- valendo para TSS cadastrada amanhã; a exceção por TSS (tss_extra
-- e tss_bloqueado) cobre o resto. A coluna `tipo` continua existindo
-- só para agrupar a lista de equipes na tela — o Sugerir passa a
-- obedecer `tipos`.
-- ============================================================

ALTER TABLE equipe ADD COLUMN IF NOT EXISTS tipos         TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE equipe ADD COLUMN IF NOT EXISTS tss_extra     TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE equipe ADD COLUMN IF NOT EXISTS tss_bloqueado TEXT[] NOT NULL DEFAULT '{}';

-- Quem já tinha uma frente no cadastro começa com ela.
UPDATE equipe SET tipos = ARRAY[tipo]
 WHERE cardinality(tipos) = 0 AND tipo IS NOT NULL AND tipo <> 'OUTROS';

-- ------------------------------------------------------------
-- OPCIONAL — rode UMA VEZ, antes de começar a editar na mão.
--
-- Preenche as frentes de cada equipe pelo que ela de fato executou:
-- toda frente que responde por pelo menos 5% das execuções da equipe
-- (e no mínimo 3 vezes) entra. É o que resolve as equipes que hoje
-- estão como OUTROS e as que fazem mais de uma frente. Depois disso,
-- o modal manda: esta consulta só mexe em quem tem 0 ou 1 frente.
--
-- Confira ANTES de aplicar, trocando o UPDATE por um SELECT:
--   SELECT equipe, tipos FROM forte ORDER BY 1;
-- ------------------------------------------------------------
WITH base AS (
  SELECT e.equipe, t.tipo, count(*) AS n
    FROM execucao e
    JOIN tss_tipo t ON t.tss = e.tss
   WHERE e.equipe IS NOT NULL
   GROUP BY 1, 2
), tot AS (
  SELECT equipe, sum(n) AS tot FROM base GROUP BY 1
), forte AS (
  SELECT b.equipe, array_agg(b.tipo ORDER BY b.n DESC) AS tipos
    FROM base b
    JOIN tot ON tot.equipe = b.equipe
   WHERE b.n >= 3 AND b.n::numeric / tot.tot >= 0.05
   GROUP BY 1
)
UPDATE equipe e
   SET tipos = f.tipos,
       tipo  = f.tipos[1]                -- frente principal: só agrupa a lista da tela
  FROM forte f
 WHERE f.equipe = e.nome AND cardinality(e.tipos) <= 1;

-- ---------- Conferência ----------
-- Quem ainda vai ficar de fora do Sugerir (sem frente nenhuma):
--   SELECT nome FROM equipe WHERE ativa AND cardinality(tipos)=0 ORDER BY 1;
--
-- Quem faz mais de uma frente (olhe se bate com a realidade):
--   SELECT nome, tipos FROM equipe WHERE ativa AND cardinality(tipos)>1 ORDER BY 1;
--
-- Quantas equipes por frente, contando as polivalentes em cada uma:
--   SELECT t AS frente, count(*) FROM equipe, unnest(tipos) t
--    WHERE ativa GROUP BY 1 ORDER BY 2 DESC;
--
-- Exceções cadastradas na mão:
--   SELECT nome, tss_extra, tss_bloqueado FROM equipe
--    WHERE cardinality(tss_extra)>0 OR cardinality(tss_bloqueado)>0;