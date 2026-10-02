-- ============================================================
-- ETIQUETA PRIORIDADE — quem pediu
--
-- Rode no SQL Editor do Supabase antes de publicar o site.
--
-- Prioridade sem dono é pressão sem responsável: daqui a um mês
-- ninguém lembra quem mandou furar a fila, e a OS que passou na
-- frente das outras não tem a quem ser cobrada. Por isso o nome é
-- obrigatório no formulário e fica gravado junto da etiqueta.
--
-- Guardado igual ao AGENDADO, que já usa `agendado_para`: uma
-- coluna ao lado das tags, e não um texto solto dentro da
-- observação — assim dá para contar por pessoa.
-- ============================================================

ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS prioridade_por TEXT;

COMMENT ON COLUMN os_nota.prioridade_por IS
  'Quem pediu a prioridade, sempre em caixa alta. NULL quando a etiqueta PRIORIDADE nao esta marcada.';

-- Caixa alta garantida no banco, não só na tela: nota gravada por
-- outro caminho (robô, script, importação) entra no mesmo padrão, e
-- sem isso "Roberto" e "ROBERTO" viram duas pessoas na contagem.
CREATE OR REPLACE FUNCTION os_nota_prioridade_caixa_alta()
RETURNS TRIGGER AS $$
BEGIN
  NEW.prioridade_por := nullif(btrim(upper(NEW.prioridade_por)), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_os_nota_prioridade ON os_nota;
CREATE TRIGGER trg_os_nota_prioridade
  BEFORE INSERT OR UPDATE ON os_nota
  FOR EACH ROW EXECUTE FUNCTION os_nota_prioridade_caixa_alta();

-- Índice só do que interessa: as linhas com prioridade são poucas
-- perto do total, e é por elas que a tela busca os nomes já usados.
CREATE INDEX IF NOT EXISTS idx_os_nota_prioridade
  ON os_nota (prioridade_por) WHERE prioridade_por IS NOT NULL;

-- ---------- Conferência ----------
-- Quem mais pediu prioridade, e quantas ainda estão abertas:
--   SELECT prioridade_por, count(*) FROM os_nota
--    WHERE 'PRIORIDADE' = ANY(tags) GROUP BY 1 ORDER BY 2 DESC;
--
-- Prioridade marcada sem nome (não deve haver nenhuma vinda da tela):
--   SELECT numero_os, tss, atualizado_em FROM os_nota
--    WHERE 'PRIORIDADE' = ANY(tags) AND prioridade_por IS NULL;
