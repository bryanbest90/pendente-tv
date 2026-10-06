-- ============================================================
-- CADASTRO DE LIGAÇÕES — RGI, fornecimento e hidrômetro por imóvel
--
-- Rode no SQL Editor do Supabase, NA ORDEM, e importe o CSV no meio
-- (o passo 3 diz onde).
--
-- DE ONDE VEM
-- Do pacote SignosMobile da Sabesp (ugr_msl.geodatabase), camada
-- rede_re_ligacao: 318.387 ligações do polo. Cada linha é um imóvel
-- ligado à rede, com RGI, número de fornecimento, hidrômetro, setor e
-- a posição do cavalete.
--
-- O NOME DA RUA NÃO VEIO NO PACOTE. O campo de endereço da camada vem
-- vazio em 100% das linhas; a rua está só como `codlog`, um código. O
-- nome do logradouro mora na outra geodatabase (ugr_msl1), e as duas
-- não têm código em comum — testei, bate em 0,1%. O que elas têm em
-- comum é o LUGAR. Então o nome foi amarrado pela posição: para cada
-- codlog, o trecho de via mais próximo de cada ligação vota, e o nome
-- mais votado vence. Fechou 99,7% das linhas. O `rua` desta tabela é
-- resultado disso, não dado original do pacote — por isso ele pode
-- errar, e por isso a busca por coordenada (vizinhos) não depende
-- dele.
--
-- POR QUE ISTO É MAIS FECHADO DO QUE O RESTO DO BANCO
-- O sql/producao.sql avisa que a chave anônima do site lê tudo
-- enquanto a etapa 2 dele não rodar. Esta tabela não entra nesse
-- buraco: ela NÃO dá nenhum acesso para `anon`. Só usuário logado e
-- com `pode_cadastro = true` lê, e isso vale desde já.
-- ============================================================


-- ---------- 1. A permissão, separada da Produção ----------
-- Separada de propósito: liberar a Produção para alguém não pode
-- liberar o cadastro de imóveis junto, sem ninguém perceber.
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS pode_cadastro BOOLEAN NOT NULL DEFAULT false;


-- ---------- 2. A tabela ----------
CREATE TABLE IF NOT EXISTS ligacao (
  rgi         TEXT PRIMARY KEY,
  codlog      TEXT,
  rua         TEXT,          -- deduzido pela posição (ver cabeçalho)
  rua_busca   TEXT,          -- sem acento, sem "RUA/AVENIDA", para procurar
  imovel      INT,           -- o número da porta
  complemento TEXT,          -- C/1, C/2, fundos… mesma porta, outra ligação
  setor       INT,
  rota        INT,
  quadra      INT,
  numero_sab  TEXT,          -- o fornecimento, 24 dígitos
  num_hidro   TEXT,          -- vazio quando a base diz SEM HIDRO
  categoria   TEXT,          -- Residencial, Comercial, Industrial, Misto
  status      TEXT,          -- R ativa, E/M/D/C… ver conferência no fim
  x           DOUBLE PRECISION NOT NULL,   -- UTM SIRGAS 2000 zona 23S
  y           DOUBLE PRECISION NOT NULL    -- (EPSG:31983), em metros
);

-- Busca por endereço digitado.
CREATE INDEX IF NOT EXISTS ligacao_rua_num ON ligacao (rua_busca, imovel);
-- Busca por vizinhança. O x sozinho já corta de 318 mil para algumas
-- dezenas num raio de 45 m; o y entra como filtro.
CREATE INDEX IF NOT EXISTS ligacao_x ON ligacao (x);
-- Autocompletar o nome da rua enquanto digita.
CREATE INDEX IF NOT EXISTS ligacao_rua_busca ON ligacao (rua_busca text_pattern_ops);


-- ---------- 3. AGORA IMPORTE O CSV ----------
-- Painel do Supabase → Table Editor → tabela `ligacao` → Insert →
-- Import data from CSV. São 4 arquivos (ligacao_1 a ligacao_4), de
-- ~80 mil linhas cada; importe um por vez, na ordem. Separá-los não
-- foi capricho: o importador do painel engasga com 318 mil linhas de
-- uma vez e falha sem dizer em que linha parou.
--
-- Confira depois: SELECT count(*) FROM ligacao;   -- 318387


-- ---------- 4. Quem lê ----------
ALTER TABLE ligacao ENABLE ROW LEVEL SECURITY;

-- Sem policy para `anon`: a chave que vai no site não lê esta tabela
-- de jeito nenhum, nem pelo console do navegador.
DROP POLICY IF EXISTS ligacao_read ON ligacao;
CREATE POLICY ligacao_read ON ligacao
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.pode_cadastro));

-- Ninguém escreve: não existe policy de INSERT/UPDATE/DELETE. Para
-- atualizar o cadastro, importa-se um pacote novo pelo painel.
REVOKE ALL ON ligacao FROM anon;
GRANT SELECT ON ligacao TO authenticated;


-- ---------- 5. A lista de ruas, para o autocompletar ----------
-- Existe para a tela não baixar 318 mil linhas só para montar a
-- lista de nomes. São ~5,7 mil.
CREATE OR REPLACE VIEW v_ligacao_rua AS
SELECT rua, rua_busca, count(*)::int AS ligacoes,
       min(imovel) AS menor_numero, max(imovel) AS maior_numero
  FROM ligacao
 WHERE rua IS NOT NULL AND rua <> ''
 GROUP BY 1, 2;

ALTER VIEW v_ligacao_rua SET (security_invoker = on);   -- herda a RLS da tabela
REVOKE ALL ON v_ligacao_rua FROM anon;
GRANT SELECT ON v_ligacao_rua TO authenticated;


-- ---------- 6. LIBERE VOCÊ MESMO ----------
-- Troque pelo seu e-mail. Enquanto ninguém estiver marcado, a aba
-- não aparece para ninguém — inclusive para você.
--
--   UPDATE perfis SET pode_cadastro = true WHERE email = 'seu@email';
--
-- Para liberar outra pessoa depois, é a mesma linha com o e-mail
-- dela. Para tirar, `false`.


-- ---------- Conferência ----------
-- Quantas ligações e quantas ruas:
--   SELECT count(*) AS ligacoes, count(DISTINCT rua) AS ruas FROM ligacao;
--
-- O que significa cada status (contagem no pacote de 21/09/2026):
--   R 270.059  ligação ativa
--   M  21.061 · C 8.252 · E 6.548 · D 2.703 · H 179 · S 94 · L 74 · O 20
--   e 9.397 em branco. A tela mostra o código cru: eu não sei o que
--   cada letra quer dizer no cadastro da Sabesp, e inventar legenda
--   seria pior do que mostrar a letra.
--
-- Imóvel com mais de uma ligação (é comum — vila, casa de fundos):
--   SELECT rua, imovel, count(*) FROM ligacao
--    GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC LIMIT 20;
--
-- Ligação sem nome de rua (o que o voto por posição não fechou):
--   SELECT count(*) FROM ligacao WHERE rua IS NULL OR rua = '';   -- 928
