-- ============================================================
-- COORDENADAS CADASTRADAS A MAO
--
-- Por que uma tabela SEPARADA da coord_rua, e nao uma linha a
-- mais dentro dela:
--
-- A coord_rua e reescrita inteira toda vez que voce roda o
-- subir_coordenadas.cjs — o upsert troca a linha da rua por
-- completo, e o --limpar apaga tudo antes. Se o cadastro manual
-- morasse la, a proxima carga de relatorio apagaria calado todo
-- o trabalho de garimpar coordenada no mapa. Separado, a carga
-- automatica nunca encosta nele.
--
-- As duas sao juntadas na hora da consulta, no navegador, e o
-- manual ganha do automatico quando o numero bate: se voce olhou
-- o mapa e marcou, e porque a leitura de GPS estava errada.
-- ============================================================

CREATE TABLE IF NOT EXISTS coord_manual (
  rua               TEXT NOT NULL,
  -- -1 significa "vale para a rua inteira". Precisa ser NOT NULL
  -- com sentinela porque o upsert do PostgREST so casa por coluna,
  -- e em SQL NULL nunca e igual a NULL — dois cadastros da mesma
  -- rua sem numero viravam duas linhas em vez de uma correcao.
  numero            INT NOT NULL DEFAULT -1,
  lat               DOUBLE PRECISION NOT NULL,
  lon               DOUBLE PRECISION NOT NULL,
  endereco_original TEXT,          -- como veio na OS, para auditoria
  bairro            TEXT,
  nota              TEXT,
  criado_por        UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rua, numero),

  -- Trava contra o erro classico: colar longitude no lugar da
  -- latitude. A operacao inteira cabe em ~20 km de -23,75/-46,70;
  -- esta caixa tem uns 55 km de lado, entao nao atrapalha nada
  -- legitimo e barra o que esta invertido ou foi colado errado.
  CONSTRAINT coord_manual_na_regiao CHECK (
    lat BETWEEN -24.2 AND -23.3 AND lon BETWEEN -47.2 AND -46.2
  )
);

CREATE INDEX IF NOT EXISTS coord_manual_rua ON coord_manual (rua);


-- ------------------------------------------------------------
-- Quem le e quem escreve
--
-- Le: todo mundo, inclusive a TV, que roda sem login.
-- Escreve: so quem tem pode_importar — hoje so voce.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sou_importador() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.pode_importar);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER TABLE coord_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coord_manual_read ON coord_manual;
CREATE POLICY coord_manual_read ON coord_manual
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS coord_manual_write ON coord_manual;
CREATE POLICY coord_manual_write ON coord_manual
  FOR ALL TO authenticated USING (sou_importador()) WITH CHECK (sou_importador());

GRANT SELECT ON coord_manual TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON coord_manual TO authenticated;


-- ------------------------------------------------------------
-- Consultas uteis
--
-- O que voce ja cadastrou:
--   SELECT rua, CASE WHEN numero < 0 THEN 'a rua toda'
--                    ELSE numero::text END AS onde,
--          lat, lon, endereco_original, criado_em
--     FROM coord_manual ORDER BY criado_em DESC;
--
-- Ruas que voce cadastrou e que DEPOIS apareceram na carga
-- automatica — vale conferir se batem, uma distancia grande
-- entre as duas quer dizer que uma das duas esta errada:
--   SELECT m.rua, m.numero, m.lat, m.lon
--     FROM coord_manual m JOIN coord_rua r ON r.rua = m.rua;
-- ------------------------------------------------------------
