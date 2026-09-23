-- ============================================================
-- CANTEIROS — de onde a equipe sai de manhã
--
-- Rode uma vez no SQL Editor do Supabase, DEPOIS de sql/itinerario.sql.
-- Salve como sql/canteiro.sql no repositório.
--
-- São dois canteiros: Interlagos, que atende as equipes de
-- Interlagos e Grajaú, e Embu-Guaçu. Como Interlagos e Grajaú estão
-- os dois no município de São Paulo e Embu-Guaçu é município
-- próprio, o município da OS é o que separa um canteiro do outro —
-- por isso a coluna `municipios` aqui embaixo.
-- ============================================================

CREATE TABLE IF NOT EXISTS canteiro (
  id            TEXT PRIMARY KEY,              -- INTERLAGOS, EMBU
  nome          TEXT NOT NULL,
  endereco      TEXT,
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  municipios    TEXT[] NOT NULL DEFAULT '{}',  -- municípios que este canteiro atende; vazio = todos
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO canteiro (id, nome, endereco, municipios) VALUES
  ('INTERLAGOS', 'Canteiro Interlagos',  NULL, ARRAY['SAO PAULO']),
  ('EMBU',       'Canteiro Embu-Guaçu',  NULL, ARRAY['EMBU-GUACU','EMBU GUACU'])
ON CONFLICT (id) DO NOTHING;

-- FALTA VOCÊ: endereço e coordenada dos dois. Sem lat/lon o site
-- continua funcionando, mas a ordem de visita não sai do canteiro e
-- o link de rota do WhatsApp não aparece.
--   UPDATE canteiro SET endereco='...', lat=-23.7xxx, lon=-46.7xxx WHERE id='INTERLAGOS';
--   UPDATE canteiro SET endereco='...', lat=-23.8xxx, lon=-46.8xxx WHERE id='EMBU';
-- A coordenada você tira de dentro do próprio sistema: procure o
-- endereço do canteiro na aba de coordenadas em vez de pegar do
-- Google, que erra nas ruas homônimas da região.

-- ---------- De qual canteiro sai cada equipe ----------
ALTER TABLE equipe ADD COLUMN IF NOT EXISTS canteiro_id TEXT
  REFERENCES canteiro(id) ON UPDATE CASCADE;

-- Preenche pelo município onde a equipe mais apareceu em campo
-- (em_rua). Mesmo espírito do semeador: o cadastro nasce do que a
-- equipe de fato fez, e você corrige o que estiver errado.
-- Só mexe em quem ainda está sem canteiro — rodar de novo não
-- desfaz correção sua.
WITH voto AS (
  SELECT equipe,
         municipio,
         row_number() OVER (PARTITION BY equipe ORDER BY count(*) DESC) AS rn
  FROM em_rua
  WHERE equipe IS NOT NULL AND municipio IS NOT NULL
  GROUP BY 1, 2
)
UPDATE equipe e
   SET canteiro_id = CASE
         WHEN upper(translate(v.municipio,'ÇÃÁÀÂÉÊÍÓÔÕÚ','CAAAAEEIOOOU')) LIKE 'EMBU%'
           THEN 'EMBU' ELSE 'INTERLAGOS' END
  FROM voto v
 WHERE v.rn = 1 AND v.equipe = e.nome AND e.canteiro_id IS NULL;

-- Quem nunca apareceu em em_rua cai no canteiro de Interlagos.
UPDATE equipe SET canteiro_id = 'INTERLAGOS' WHERE canteiro_id IS NULL;

-- ---------- Quem lê e quem escreve ----------
-- Igual às outras tabelas do itinerário: lê todo mundo (o líder abre
-- no celular sem login), escreve só quem entrou com conta.
ALTER TABLE canteiro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canteiro_read ON canteiro;
CREATE POLICY canteiro_read ON canteiro FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS canteiro_write ON canteiro;
CREATE POLICY canteiro_write ON canteiro FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON canteiro TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON canteiro TO authenticated;

-- ---------- Conferência ----------
-- Quantas equipes ficaram em cada canteiro (olhe se bate com a realidade):
--   SELECT c.nome, count(*) FROM equipe e JOIN canteiro c ON c.id=e.canteiro_id
--    WHERE e.ativa GROUP BY 1 ORDER BY 2 DESC;
--
-- Quem ficou em Embu (lista curta, dá para conferir na mão):
--   SELECT nome, tipo FROM equipe WHERE ativa AND canteiro_id='EMBU' ORDER BY tipo, nome;
--
-- As equipes que o Sugerir vai ignorar até você definir a frente:
--   SELECT nome FROM equipe WHERE ativa AND tipo='OUTROS' ORDER BY 1;
--
-- Corrigir uma na mão:
--   UPDATE equipe SET canteiro_id='EMBU' WHERE nome='...';