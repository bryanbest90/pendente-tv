-- ============================================================
-- TAGS NA OBSERVAÇÃO
--
-- Rode DEPOIS do sql/os_nota.sql e do sql/os_nota_endereco.sql.
--
-- Texto livre serve para o detalhe; tag serve para o que o texto
-- nunca vai dar: contar, filtrar e agrupar. "CAMINHÃO" escrito de
-- cinco jeitos diferentes não vira número; a tag vira.
--
-- Por isso as duas coisas convivem, e nenhuma é obrigatória
-- sozinha — o que não pode é a nota ficar vazia das duas.
-- ============================================================

ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- AGENDADO sem data não informa nada. A data fica em coluna
-- própria, e não dentro do texto, porque assim dá para ordenar,
-- comparar com hoje e descobrir agendamento vencido.
ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS agendado_para DATE;

-- A nota deixa de ser obrigatória: "CAMINHÃO" sozinho já informa.
ALTER TABLE os_nota ALTER COLUMN nota DROP NOT NULL;
ALTER TABLE os_nota DROP CONSTRAINT IF EXISTS os_nota_nota_check;
ALTER TABLE os_nota DROP CONSTRAINT IF EXISTS os_nota_tem_conteudo;
ALTER TABLE os_nota ADD CONSTRAINT os_nota_tem_conteudo CHECK (
  length(btrim(COALESCE(nota, ''))) > 0 OR COALESCE(array_length(tags, 1), 0) > 0
);

-- AGENDADO exige data. Trava no banco, não só na tela: a tela é
-- uma das formas de gravar, não a única.
ALTER TABLE os_nota DROP CONSTRAINT IF EXISTS os_nota_agendado_com_data;
ALTER TABLE os_nota ADD CONSTRAINT os_nota_agendado_com_data CHECK (
  NOT ('AGENDADO' = ANY(tags)) OR agendado_para IS NOT NULL
);

-- Índice para a filtragem por tag (contains).
CREATE INDEX IF NOT EXISTS os_nota_tags ON os_nota USING GIN (tags);

-- DE PROPÓSITO não há CHECK limitando quais tags existem: a lista
-- vive no App.jsx e cresce com uma linha. Amarrar aqui faria cada
-- tag nova exigir migração de banco, e a lista vai crescer com o
-- uso — é ela que descreve o trabalho de vocês, não o contrário.


-- ------------------------------------------------------------
-- O que as tags passam a permitir
--
-- Quantas OS paradas por cada motivo:
--   SELECT unnest(tags) AS tag, count(*)
--     FROM os_nota GROUP BY 1 ORDER BY 2 DESC;
--
-- Agendamentos vencidos — a equipe não foi no dia marcado:
--   SELECT numero_os, tss, agendado_para, endereco
--     FROM os_nota
--    WHERE 'AGENDADO' = ANY(tags) AND agendado_para < current_date
--    ORDER BY agendado_para;
--
-- Tudo que depende de caminhão, para montar um dia de caminhão:
--   SELECT numero_os, tss, endereco, bairro
--     FROM os_nota WHERE tags @> ARRAY['CAMINHÃO'];
-- ------------------------------------------------------------
