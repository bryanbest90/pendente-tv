-- ============================================================
-- BIBLIOTECA DE COORDENADAS — uma linha por rua
--
-- Por que uma linha por RUA e nao uma por endereco:
--
-- Sao 4.523 ruas e 47.246 enderecos. Guardando por endereco,
-- uma consulta de um modal com 300 OS pediria umas 3.000 linhas
-- e esbarraria no limite de 1.000 do PostgREST — teria que
-- paginar dentro de um clique. Guardando por rua, o mesmo modal
-- pede no maximo 300 linhas, sempre, e o formato que chega no
-- navegador e exatamente o que o acharCoord ja usava. Menos
-- codigo novo, menos coisa para quebrar.
--
-- p e o array de pontos da rua, cada ponto no formato
--   [lat, lon, numero, observacoes, desvio_m]
-- ja ordenado por numero — o site procura o vizinho mais proximo.
-- ============================================================

CREATE TABLE IF NOT EXISTS coord_rua (
  rua           TEXT PRIMARY KEY,
  p             JSONB NOT NULL,
  pontos        INT   NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A TV roda sem login, e o modal do Pendente e que consulta.
-- Entao a leitura precisa valer para anon. E dado operacional
-- derivado (nome de rua -> coordenada), nao ha nada de pessoal
-- aqui — o endereco em si ja aparece na tela.
ALTER TABLE coord_rua ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coord_rua_read ON coord_rua;
CREATE POLICY coord_rua_read ON coord_rua FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON coord_rua TO anon, authenticated;

-- Escrita: NINGUEM pelo navegador. Quem grava e o
-- scripts/subir_coordenadas.cjs, com a chave service_role, que
-- ignora RLS por definicao. Sem policy de INSERT/UPDATE/DELETE,
-- nenhuma requisicao com a chave anon consegue mexer aqui.
REVOKE INSERT, UPDATE, DELETE ON coord_rua FROM anon, authenticated;


-- ------------------------------------------------------------
-- Conferencia depois de rodar o subir_coordenadas.cjs:
--
--   SELECT count(*) AS ruas, sum(pontos) AS enderecos,
--          max(atualizado_em) AS ultima_carga FROM coord_rua;
--   -- esperado hoje: 4523 ruas, 47246 enderecos
--
--   SELECT rua, pontos, p->0 AS primeiro_ponto
--     FROM coord_rua WHERE rua LIKE 'AV MARIA DE JESUS BELLO%';
--
-- E que o anon le mas nao escreve:
--   SET ROLE anon; SELECT count(*) FROM coord_rua;          -- ok
--   SET ROLE anon; DELETE FROM coord_rua WHERE rua='X';     -- erro
--   RESET ROLE;
-- ------------------------------------------------------------
