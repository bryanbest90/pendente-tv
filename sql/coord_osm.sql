-- ============================================================
-- ORIGEM DA COORDENADA CADASTRADA
--
-- Rode DEPOIS do sql/coord_manual.sql.
--
-- Passam a existir duas qualidades de cadastro na mesma tabela:
--
--   'mao'  voce abriu o mapa, olhou e marcou. Vale mais que
--          qualquer coisa automatica, inclusive que a leitura de
--          GPS da propria turma.
--
--   'osm'  o programa tirou do mapa do OpenStreetMap, e so quando
--          o nome da rua aparece em UM lugar so na regiao. Isso
--          da a rua certa, nunca o numero — e nao vale para rua
--          homonima, que fica de fora de proposito.
--
-- Nao sao tabelas diferentes porque a logica de consulta e a
-- mesma; o que muda e a prioridade e a cor na tela.
-- ============================================================

ALTER TABLE coord_manual
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'mao';

ALTER TABLE coord_manual DROP CONSTRAINT IF EXISTS coord_manual_origem;
ALTER TABLE coord_manual
  ADD CONSTRAINT coord_manual_origem CHECK (origem IN ('mao', 'osm'));

-- O que veio do mapa carrega o traçado de onde saiu, para dar
-- para conferir depois se alguma ficar suspeita.
ALTER TABLE coord_manual
  ADD COLUMN IF NOT EXISTS extensao_m INT;


-- ------------------------------------------------------------
-- Conferencia:
--
--   SELECT origem, count(*) FROM coord_manual GROUP BY origem;
--
-- Ruas do mapa que DEPOIS ganharam execucao de verdade — se as
-- duas estiverem longe uma da outra, uma delas esta errada:
--
--   SELECT m.rua, m.lat, m.lon, r.p->0 AS primeiro_ponto_real
--     FROM coord_manual m JOIN coord_rua r ON r.rua = m.rua
--    WHERE m.origem = 'osm';
-- ------------------------------------------------------------