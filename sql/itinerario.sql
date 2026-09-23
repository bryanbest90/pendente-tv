-- ============================================================
-- ITINERÁRIO — equipes, tipo de serviço e o plano do dia
--
-- Rode uma vez no SQL Editor do Supabase. Depois rode
--   python3 scripts/semear_itinerario.py
-- que preenche `equipe` e `tss_tipo` a partir do que as equipes
-- de fato executaram nos últimos meses (tabela execucao).
--
-- Por que o cadastro nasce da execução e não da sua digitação:
-- o nome da equipe que vale é o que aparece no GEOCALL, e a média
-- de OS por dia medida é mais honesta que uma estimativa. Você
-- corrige o que estiver errado depois, na tela.
-- ============================================================

-- ---------- Equipes ----------
CREATE TABLE IF NOT EXISTS equipe (
  nome         TEXT PRIMARY KEY,          -- exatamente como vem do GEOCALL
  tipo         TEXT NOT NULL,             -- VAZAMENTO, ASFALTO, LIGAÇÃO, ESGOTO, REPOSIÇÃO, MOTO, DESOBSTRUÇÃO, OBRAS, OUTROS
  lider        TEXT,
  whatsapp     TEXT,                      -- para mandar o itinerário depois
  os_por_dia   INT  NOT NULL DEFAULT 4,   -- quanto cabe num dia; medido na execução
  ativa        BOOLEAN NOT NULL DEFAULT TRUE,
  observacao   TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- De que tipo de equipe é cada serviço ----------
-- Medido: para cada TSS, o tipo de equipe que mais executou aquele
-- serviço nos últimos meses, com a confiança (0 a 1). Serve para o
-- site saber a quem oferecer cada OS. Onde a confiança é baixa, a
-- OS aparece para mais de um tipo — é sinal de que os dois fazem.
CREATE TABLE IF NOT EXISTS tss_tipo (
  tss        TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,
  confianca  REAL NOT NULL DEFAULT 1,
  execucoes  INT  NOT NULL DEFAULT 0
);

-- ---------- O plano do dia ----------
-- Uma linha por parada. A unidade é (numero_os, tss), a mesma do
-- resto do sistema: a OS pode ter dois serviços em equipes
-- diferentes no mesmo dia.
CREATE TABLE IF NOT EXISTS itinerario (
  dia          DATE NOT NULL,
  equipe       TEXT NOT NULL REFERENCES equipe(nome) ON UPDATE CASCADE,
  numero_os    TEXT NOT NULL,
  tss          TEXT NOT NULL,
  ordem        INT  NOT NULL DEFAULT 0,   -- ordem de visita
  origem       TEXT,                      -- 'sugerido' ou 'mao'
  endereco     TEXT,
  bairro       TEXT,
  lat          DOUBLE PRECISION,
  lon          DOUBLE PRECISION,
  familia      TEXT,
  autor_email  TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, numero_os, tss)       -- a mesma OS não vai para duas equipes no mesmo dia
);
CREATE INDEX IF NOT EXISTS itinerario_dia_equipe ON itinerario (dia, equipe);

-- ---------- Quem lê e quem escreve ----------
-- Lê: todo mundo, inclusive sem login — o itinerário vai ser visto
--     no celular do líder, que não tem usuário no sistema.
-- Escreve: só quem entrou com conta. Diferente da nota: nota é
--     recado de campo, itinerário é ordem de serviço.
ALTER TABLE equipe     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tss_tipo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipe_read ON equipe;
CREATE POLICY equipe_read ON equipe FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS equipe_write ON equipe;
CREATE POLICY equipe_write ON equipe FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tss_tipo_read ON tss_tipo;
CREATE POLICY tss_tipo_read ON tss_tipo FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tss_tipo_write ON tss_tipo;
CREATE POLICY tss_tipo_write ON tss_tipo FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS itinerario_read ON itinerario;
CREATE POLICY itinerario_read ON itinerario FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS itinerario_write ON itinerario;
CREATE POLICY itinerario_write ON itinerario FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON equipe, tss_tipo, itinerario TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipe, tss_tipo, itinerario TO authenticated;

-- O semeador precisa gravar com a chave anônima (ele roda no seu PC,
-- sem login). Se preferir fechar, troque as duas linhas abaixo por
-- nada e rode o semeador com a service_role do config.json.
DROP POLICY IF EXISTS equipe_semente ON equipe;
CREATE POLICY equipe_semente ON equipe FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tss_tipo_semente ON tss_tipo;
CREATE POLICY tss_tipo_semente ON tss_tipo FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT INSERT, UPDATE, DELETE ON equipe, tss_tipo TO anon;

-- ---------- Conferência ----------
--   SELECT tipo, count(*), sum(os_por_dia) FROM equipe WHERE ativa GROUP BY 1;
--   SELECT dia, equipe, count(*) FROM itinerario GROUP BY 1,2 ORDER BY 1 DESC, 2;