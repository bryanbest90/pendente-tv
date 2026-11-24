-- ============================================================
-- ANÁLISE DE FOTOS — tabelas, permissão e bucket
--
-- A aba Análise deixa o Bryan e a Suzana escolherem um dia e
-- algumas equipes, pedirem as fotos daquele dia, e julgarem uma
-- a uma: o recorte da vala está dentro do padrão ou não.
--
-- QUEM JULGA É GENTE, NÃO É MODELO. O julgamento humano é o
-- gabarito: é contra ele que a gente vai medir, depois, se a IA
-- serve. Por isso o veredito é guardado com quem julgou e quando,
-- e por isso a foto julgada não se apaga — veredito sem a imagem
-- não dá para conferir nada. (24/11/2026)
--
-- O SITE NÃO ALCANÇA O GEOCALL. O pedido fica numa fila aqui; o
-- robô da nuvem vê a fila, coleta, sobe as fotos e marca pronto.
-- Entre o clique e as fotos passam alguns minutos.
--
-- Rodar inteiro, de uma vez, no SQL Editor do Supabase.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A permissão
--
-- Mesmo desenho da aba Produção: uma coluna em `perfis`. Quem não
-- tem, não vê a aba E não alcança os dados — a trava é no banco,
-- porque esconder a aba na tela não protege uma tabela que a
-- chave do navegador alcança.
-- ------------------------------------------------------------
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS pode_analise BOOLEAN NOT NULL DEFAULT false;

-- Função única de permissão. Escrever `EXISTS (SELECT ...)` dentro
-- de cada policy seria a mesma regra em seis lugares, e regra
-- copiada é regra que diverge.
CREATE OR REPLACE FUNCTION tem_analise() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT pode_analise FROM perfis WHERE id = auth.uid()), false);
$$;


-- ------------------------------------------------------------
-- 2. A fila de pedidos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analise_pedido (
  id            BIGSERIAL PRIMARY KEY,
  dia           DATE   NOT NULL,
  equipes       TEXT[] NOT NULL,
  -- O dia de hoje não entra: ele ainda não acabou, e etapa que
  -- fecha às 17h apareceria como inexistente numa análise feita
  -- ao meio-dia.
  CONSTRAINT analise_pedido_dia_passado CHECK (dia < CURRENT_DATE),
  CONSTRAINT analise_pedido_tem_equipe  CHECK (cardinality(equipes) > 0),

  estado        TEXT NOT NULL DEFAULT 'na_fila'
                CHECK (estado IN ('na_fila','coletando','pronto','falhou')),
  pedido_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pedido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  comecou_em    TIMESTAMPTZ,
  terminou_em   TIMESTAMPTZ,

  os_previstas  INT,     -- quantas OS a consulta encontrou
  os_coletadas  INT,     -- quantas o robô conseguiu abrir
  fotos         INT,
  erro          TEXT
);

-- O robô pega o mais antigo da fila primeiro.
CREATE INDEX IF NOT EXISTS analise_pedido_fila_idx
  ON analise_pedido (estado, pedido_em) WHERE estado = 'na_fila';

-- Mesmo dia + mesmas equipes não se pede duas vezes enquanto o
-- primeiro não terminou. Sem isto, dois cliques impacientes viram
-- duas coletas de vinte minutos no GEOCALL.
CREATE UNIQUE INDEX IF NOT EXISTS analise_pedido_sem_repetir_idx
  ON analise_pedido (dia, equipes) WHERE estado IN ('na_fila','coletando');


-- ------------------------------------------------------------
-- 3. As fotos
--
-- Uma linha por foto coletada. O arquivo em si mora no Storage;
-- aqui fica de onde ela veio — e é esse "de onde" que faz o
-- veredito valer alguma coisa depois.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analise_foto (
  id             BIGSERIAL PRIMARY KEY,
  pedido_id      BIGINT NOT NULL REFERENCES analise_pedido(id) ON DELETE CASCADE,

  numero_os      TEXT NOT NULL,
  tss            TEXT,
  tse            TEXT,
  equipe         TEXT,
  data_execucao  DATE,

  arquivo        TEXT NOT NULL,   -- foto_121816653.jpg
  caminho        TEXT NOT NULL,   -- caminho dentro do bucket
  -- O nome do arquivo é o relógio: foto_121816653 é 12:18:16.653.
  -- Guardado em coluna própria porque é com ele que se ordena a
  -- etapa e se reconhece a foto do "antes".
  tirada_em      TIME,
  latitude       NUMERIC,
  longitude      NUMERIC,
  bytes          INT,

  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, numero_os, tse, arquivo)
);

CREATE INDEX IF NOT EXISTS analise_foto_pedido_idx ON analise_foto (pedido_id, numero_os, tse, tirada_em);


-- ------------------------------------------------------------
-- 4. Os vereditos
--
-- Separado da foto, e não uma coluna nela, por dois motivos: duas
-- pessoas podem julgar a mesma foto e discordar — e isso é
-- informação, não conflito —, e o histórico de quem mudou de
-- ideia não se perde.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analise_veredito (
  id             BIGSERIAL PRIMARY KEY,
  foto_id        BIGINT NOT NULL REFERENCES analise_foto(id) ON DELETE CASCADE,

  veredito       TEXT NOT NULL CHECK (veredito IN
                   ('CONFORME','NAO_CONFORME','NAO_DA_PARA_JULGAR','NAO_SERVE')),
  -- Asfalto e calçada são equipes diferentes, e uma não responde
  -- pela outra: sem esta coluna não dá para cobrar a certa.
  superficie     TEXT CHECK (superficie IN ('LEITO','CALCADA','AS_DUAS')),
  piso_especial  BOOLEAN,
  observacao     TEXT,

  julgado_por    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  julgado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (foto_id, julgado_por)
);

CREATE INDEX IF NOT EXISTS analise_veredito_foto_idx ON analise_veredito (foto_id);


-- ------------------------------------------------------------
-- 5. Permissões
--
-- REVOKE do anon ANTES do GRANT: o Supabase dá permissão ao anon
-- por DEFAULT PRIVILEGES, então criar a tabela já a deixa ao
-- alcance da chave que está dentro do bundle do site.
-- ------------------------------------------------------------
REVOKE ALL ON analise_pedido, analise_foto, analise_veredito FROM anon;
GRANT SELECT, INSERT          ON analise_pedido   TO authenticated;
GRANT SELECT                  ON analise_foto     TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON analise_veredito TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE analise_pedido_id_seq, analise_veredito_id_seq TO authenticated;

ALTER TABLE analise_pedido   ENABLE ROW LEVEL SECURITY;
ALTER TABLE analise_foto     ENABLE ROW LEVEL SECURITY;
ALTER TABLE analise_veredito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analise_pedido_ler ON analise_pedido;
CREATE POLICY analise_pedido_ler ON analise_pedido
  FOR SELECT TO authenticated USING (tem_analise());

DROP POLICY IF EXISTS analise_pedido_pedir ON analise_pedido;
CREATE POLICY analise_pedido_pedir ON analise_pedido
  FOR INSERT TO authenticated WITH CHECK (tem_analise() AND pedido_por = auth.uid());

DROP POLICY IF EXISTS analise_foto_ler ON analise_foto;
CREATE POLICY analise_foto_ler ON analise_foto
  FOR SELECT TO authenticated USING (tem_analise());

-- Todo mundo que analisa VÊ o veredito dos outros — é assim que
-- uma divergência aparece e vira conversa.
DROP POLICY IF EXISTS analise_veredito_ler ON analise_veredito;
CREATE POLICY analise_veredito_ler ON analise_veredito
  FOR SELECT TO authenticated USING (tem_analise());

-- ...mas cada um só escreve o seu. Ninguém corrige o julgamento
-- alheio por baixo do pano.
DROP POLICY IF EXISTS analise_veredito_julgar ON analise_veredito;
CREATE POLICY analise_veredito_julgar ON analise_veredito
  FOR INSERT TO authenticated WITH CHECK (tem_analise() AND julgado_por = auth.uid());

DROP POLICY IF EXISTS analise_veredito_mudar_de_ideia ON analise_veredito;
CREATE POLICY analise_veredito_mudar_de_ideia ON analise_veredito
  FOR UPDATE TO authenticated
  USING (julgado_por = auth.uid()) WITH CHECK (julgado_por = auth.uid());


-- ------------------------------------------------------------
-- 6. O bucket das fotos
--
-- Privado. A imagem só chega ao navegador por URL assinada, que o
-- site pede com o token da sessão — o mesmo motivo de a aba
-- Produção buscar a série com o token e não com a chave anônima.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('analise-fotos', 'analise-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS analise_fotos_ler ON storage.objects;
CREATE POLICY analise_fotos_ler ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'analise-fotos' AND tem_analise());

-- Quem escreve no bucket é o robô, que usa a service_role e não
-- passa por policy nenhuma.


-- ------------------------------------------------------------
-- 7. Quem pode analisar
--
-- Rode estas duas. A Suzana precisa existir em Authentication →
-- Users antes (Add user, com "Auto Confirm User" marcado).
-- ------------------------------------------------------------
-- UPDATE perfis SET pode_analise = true, nome = 'Bryan'
--  WHERE email = 'bmdeodato@gmail.com';
-- UPDATE perfis SET pode_analise = true, nome = 'Suzana'
--  WHERE email = 'suzana@consorciointerlagos.com.br';


-- ============================================================
-- CONFERÊNCIA — rode junto, não depois
-- ============================================================
--
-- As travas deste arquivo foram MEDIDAS num Postgres 16 de teste,
-- em 24/11/2026, antes de ele sair daqui — não só lidas. Doze
-- conferências, todas no esperado:
--
--   pedido com a data de hoje ................. recusado
--   pedido de ontem ........................... aceito
--   o mesmo pedido duas vezes na fila ......... recusado
--   pedido com a lista de equipes vazia ....... recusado
--   veredito fora das quatro opções ........... recusado
--   quem não tem pode_analise:
--     vê pedidos ............................... 0
--     vê fotos ................................. 0
--     vê vereditos ............................. 0
--     consegue julgar .......................... não
--   o Bryan julga uma foto .................... entra
--   ele julgando a MESMA foto de novo ......... recusado (um por pessoa)
--   a Suzana julga a mesma foto ............... entra, e as duas convivem
--   ela mudando o veredito do Bryan ........... 0 linhas
--   ela apagando o veredito do Bryan .......... 0 linhas
--   ela mudando o DELA ........................ 1 linha
--   grants da chave anônima nas três tabelas .. nenhum
--
-- Mesmo assim rode A–E aqui no Supabase: o teste prova o arquivo,
-- não prova o SEU banco.

-- A) QUEM TEM ACESSO. Tem de aparecer só o Bryan e a Suzana.
-- SELECT email, nome, pode_analise FROM perfis WHERE pode_analise ORDER BY email;

-- B) O ANON NÃO ALCANÇA NADA. As três linhas têm de vir vazias.
-- SELECT table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE grantee = 'anon' AND table_name LIKE 'analise%';

-- C) A TRAVA DO DIA DE HOJE FUNCIONA. Tem de dar erro:
-- INSERT INTO analise_pedido (dia, equipes) VALUES (CURRENT_DATE, ARRAY['TESTE']);

-- D) E ONTEM PASSA. Tem de inserir e depois apagar:
-- INSERT INTO analise_pedido (dia, equipes) VALUES (CURRENT_DATE - 1, ARRAY['TESTE']) RETURNING id;
-- DELETE FROM analise_pedido WHERE equipes = ARRAY['TESTE'];

-- E) O BUCKET EXISTE E É PRIVADO.
-- SELECT id, public FROM storage.buckets WHERE id = 'analise-fotos';


-- ============================================================
-- DESFAZER
-- ============================================================
-- DROP TABLE IF EXISTS analise_veredito, analise_foto, analise_pedido CASCADE;
-- DROP FUNCTION IF EXISTS tem_analise();
-- ALTER TABLE perfis DROP COLUMN IF EXISTS pode_analise;
--
-- O BUCKET NÃO SE APAGA POR SQL. O Supabase recusa, com
-- "Direct deletion from storage tables is not allowed" — é uma
-- trava dele, para ninguém deixar arquivo órfão sem querer.
-- Apagar na tela: Storage → analise-fotos → ... → Delete bucket.
-- (medido em 24/11/2026, no banco do Bryan)
