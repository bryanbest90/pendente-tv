-- ============================================================
-- REGISTRO DE ENTRADAS — nunca subtrai
--
-- Rode no SQL Editor do Supabase. Não precisa mexer no robô.
--
-- O PROBLEMA
-- A coluna Entradas lia a Data Inserção direto do pendente. A data é
-- exata, mas o pendente é uma foto do que está ABERTO: quando a OS é
-- executada ela some, e a entrada daquele dia some junto. Medido em
-- 02/10: de 266 serviços que entraram em 24/09 restavam 23. Para
-- contar quantos serviços são SOLICITADOS, isso não serve.
--
-- A SOLUÇÃO
-- Uma tabela que só cresce. Toda vez que o robô sobe o pendente, um
-- gatilho registra aqui os pares (OS, TSS) que ainda não estavam.
-- Quando a OS sai da carteira, a linha daqui fica.
--
-- Fica no banco e não no robô de propósito: o robô roda de hora em
-- hora e já grava o pendente — o gatilho pega carona nisso. Nada para
-- instalar na máquina dele, nada para lembrar de atualizar, e vale
-- também para a importação manual do xlsx.
--
-- O QUE ESTE DESENHO NÃO PEGA
-- Serviço que nasce e morre dentro da mesma hora, entre duas subidas
-- do pendente. É o mesmo limite que a coluna Baixas da Carteira já
-- tem, e de hora em hora ele é bem menor do que era de um dia para o
-- outro.
-- ============================================================

CREATE TABLE IF NOT EXISTS os_entrada (
  numero_os     TEXT NOT NULL,
  tss           TEXT NOT NULL,
  data_insercao DATE NOT NULL,
  familia       TEXT,
  atc           INT,
  unidade       TEXT,
  -- Guardados aqui porque a linha sobrevive à saída da carteira: sem
  -- isso, a lista de entradas de um dia antigo viria sem endereço.
  endereco      TEXT,
  bairro        TEXT,
  -- 'pendente' = Data Inserção do GEOCALL, exata.
  -- 'foto'     = primeiro dia em que a OS apareceu na foto diária,
  --              usada só no histórico que o pendente não alcança.
  origem        TEXT NOT NULL DEFAULT 'pendente',
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A data entra na chave porque uma OS+TSS pode ser reaberta depois
  -- com inserção nova — aí é entrada nova, e tem de contar de novo.
  PRIMARY KEY (numero_os, tss, data_insercao)
);

CREATE INDEX IF NOT EXISTS os_entrada_data ON os_entrada (data_insercao);
CREATE INDEX IF NOT EXISTS os_entrada_data_atc ON os_entrada (data_insercao, atc);

-- ---------- De onde sai cada campo do jsonb ----------
-- Função separada para o backfill e o gatilho usarem a mesma leitura.
CREATE OR REPLACE FUNCTION os_entrada_do_jsonb(d JSONB)
RETURNS TABLE (numero_os TEXT, tss TEXT, data_insercao DATE,
               familia TEXT, atc INT, unidade TEXT, endereco TEXT, bairro TEXT) AS $$
  SELECT nullif(trim(d->>'Número OS'),''),
         nullif(trim(d->>'TSS'),''),
         -- "27/08/2026 11:44" -> 2026-08-27. O regexp evita que uma
         -- linha com data torta derrube a subida inteira do pendente.
         CASE WHEN d->>'Data Inserção' ~ '^\s*\d{2}/\d{2}/\d{4}'
              THEN to_date(substring(trim(d->>'Data Inserção') from 1 for 10),'DD/MM/YYYY')
         END,
         nullif(trim(d->>'Família'),''),
         nullif(regexp_replace(coalesce(d->>'ATC',''),'\D','','g'),'')::INT,
         CASE nullif(regexp_replace(coalesce(d->>'ATC',''),'\D','','g'),'')::INT
           WHEN 923 THEN 'Interlagos' WHEN 929 THEN 'Grajau' WHEN 299 THEN 'Embu-Guacu' END,
         nullif(trim(concat_ws(', ', nullif(trim(d->>'Endereço'),''), nullif(trim(d->>'Número'),''))),''),
         nullif(trim(d->>'Bairro'),'');
$$ LANGUAGE sql IMMUTABLE;

-- ---------- O gatilho ----------
CREATE OR REPLACE FUNCTION os_entrada_registrar() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO os_entrada (numero_os, tss, data_insercao, familia, atc, unidade, endereco, bairro, origem)
  SELECT e.numero_os, e.tss, e.data_insercao, e.familia, e.atc, e.unidade, e.endereco, e.bairro, 'pendente'
    FROM os_entrada_do_jsonb(NEW.dados) e
   WHERE e.numero_os IS NOT NULL AND e.tss IS NOT NULL AND e.data_insercao IS NOT NULL
  ON CONFLICT (numero_os, tss, data_insercao) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS pendente_os_registra_entrada ON pendente_os;
CREATE TRIGGER pendente_os_registra_entrada
  AFTER INSERT ON pendente_os
  FOR EACH ROW EXECUTE FUNCTION os_entrada_registrar();

-- ---------- Backfill 1: a carteira de agora ----------
-- Data exata, para tudo que está aberto hoje.
INSERT INTO os_entrada (numero_os, tss, data_insercao, familia, atc, unidade, endereco, bairro, origem)
SELECT e.numero_os, e.tss, e.data_insercao, e.familia, e.atc, e.unidade, e.endereco, e.bairro, 'pendente'
  FROM pendente_os p, os_entrada_do_jsonb(p.dados) e
 WHERE e.numero_os IS NOT NULL AND e.tss IS NOT NULL AND e.data_insercao IS NOT NULL
ON CONFLICT (numero_os, tss, data_insercao) DO NOTHING;

-- ---------- Backfill 2: o que já saiu ----------
-- OPCIONAL, e por isso está separado: aqui a data NÃO é a Data
-- Inserção — é o primeiro dia em que a OS apareceu na foto diária,
-- que é o máximo que dá para saber de quem já saiu da carteira.
-- Conferido contra a Data Inserção nos 681 pares em que as duas
-- existem: 91% na mesma data, e as diferenças são sempre com a foto
-- ATRASADA, porque ela só sabe quando viu pela primeira vez.
--
-- Traz histórico desde 16/08/2026 marcado como origem='foto'. Não
-- cobre DESOBSTRUÇÃO (o robô não grava essa família na foto) e o dia
-- seguinte a um buraco na série acumula os dias do meio.
--
-- Se preferir começar limpo, com só o que é exato, não rode este
-- bloco — a tabela funciona sem ele, só com menos passado.
INSERT INTO os_entrada (numero_os, tss, data_insercao, familia, atc, unidade, endereco, bairro, origem)
SELECT d.numero_os, d.tss, min(d.dia), min(d.familia),
       CASE min(d.unidade) WHEN 'Interlagos' THEN 923 WHEN 'Grajau' THEN 929 WHEN 'Embu-Guacu' THEN 299 END,
       min(d.unidade),
       nullif(trim(concat_ws(', ', nullif(trim(min(d.endereco)),''), nullif(trim(min(d.numero_end)),''))),''),
       NULL,   -- a foto diária não guarda bairro
       'foto'
  FROM pendente_diario_os d
 WHERE d.numero_os IS NOT NULL AND d.tss IS NOT NULL
   -- Pula o par que o backfill 1 já trouxe com data exata. O ON
   -- CONFLICT abaixo não basta: ele compara a data também, e nos 9% em
   -- que a foto discorda da Data Inserção o par entraria DUAS vezes,
   -- em dois dias diferentes. Esta linha é o que impede a duplicata.
   AND NOT EXISTS (SELECT 1 FROM os_entrada o
                    WHERE o.numero_os = d.numero_os AND o.tss = d.tss)
 GROUP BY d.numero_os, d.tss
ON CONFLICT (numero_os, tss, data_insercao) DO NOTHING;

-- ---------- Quem lê ----------
ALTER TABLE os_entrada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS os_entrada_read ON os_entrada;
CREATE POLICY os_entrada_read ON os_entrada FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON os_entrada TO anon, authenticated;


-- ---------- Conferência ----------
-- Entradas por dia nas últimas duas semanas. A partir de agora este
-- número não encolhe mais quando o serviço é executado:
--   SELECT data_insercao, origem, count(*)
--     FROM os_entrada WHERE data_insercao >= current_date - 14
--    GROUP BY 1,2 ORDER BY 1,2;
--
-- Quanto veio de cada fonte:
--   SELECT origem, count(*), min(data_insercao), max(data_insercao)
--     FROM os_entrada GROUP BY 1;
--
-- O gatilho está vivo? Rode depois da próxima subida do robô e veja
-- se o registrado_em de hoje aumentou:
--   SELECT max(registrado_em) FROM os_entrada;
