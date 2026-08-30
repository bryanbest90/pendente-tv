-- ============================================================
-- Tabela em_rua: serviços planejados por equipe (relatório EM RUA)
-- Executar no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS em_rua (
  id         BIGSERIAL PRIMARY KEY,
  dia        DATE NOT NULL,
  equipe     TEXT NOT NULL,
  lider      TEXT,
  numero_os  TEXT,
  tss        TEXT,
  status_os  TEXT,
  resultado  TEXT,
  causa_resultado TEXT,
  endereco   TEXT,
  bairro     TEXT,
  municipio  TEXT
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_em_rua_dia ON em_rua(dia);
CREATE INDEX IF NOT EXISTS idx_em_rua_tss ON em_rua(tss);
CREATE INDEX IF NOT EXISTS idx_em_rua_dia_tss ON em_rua(dia, tss);

-- RPC para limpar dados de um dia (usado antes de reimportar)
CREATE OR REPLACE FUNCTION limpar_em_rua(p_dia DATE DEFAULT CURRENT_DATE)
RETURNS VOID AS $$
BEGIN
  DELETE FROM em_rua WHERE dia = p_dia;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS (Row Level Security) — acesso anon para leitura
ALTER TABLE em_rua ENABLE ROW LEVEL SECURITY;

CREATE POLICY "em_rua_anon_select" ON em_rua
  FOR SELECT TO anon USING (true);

CREATE POLICY "em_rua_anon_insert" ON em_rua
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "em_rua_anon_delete" ON em_rua
  FOR DELETE TO anon USING (true);
