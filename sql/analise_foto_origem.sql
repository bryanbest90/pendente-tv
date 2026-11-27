-- ============================================================
-- DE ONDE VEIO A FOTO
--
-- Roda uma vez, no SQL Editor. Acrescenta uma coluna à
-- analise_foto; não mexe em mais nada e não apaga dado nenhum.
--
-- POR QUE ELA EXISTE: etapa com BAIXA INTERNA não carrega foto no
-- GEOCALL. As fotos vão para um álbum do Google Fotos e o link
-- fica escrito nas Observações de Execução. Até 27/11/2026 o robô
-- só gritava esse link no log, então a etapa chegava a quem julga
-- como "sem foto" — havendo foto.
--
-- Agora o robô baixa o álbum e as fotos entram MISTURADAS às do
-- GEOCALL, como qualquer outra (decisão do Bryan, 27/11/2026) —
-- com esta coluna dizendo de onde vieram, porque não são a mesma
-- coisa: a do GEOCALL passou pelo PDA no campo; a do álbum alguém
-- subiu à mão, e pode ser de outro dia ou de outro serviço. Quem
-- julga precisa ver isso na tela.
--
-- O DEFAULT É 'geocall' DE PROPÓSITO: as fotos que já estão lá
-- vieram todas do GEOCALL, porque até hoje não havia outro
-- caminho. E com NOT NULL + DEFAULT o robô pode continuar a não
-- mandar a coluna nas fotos do GEOCALL — uma coluna a menos por
-- linha, e o valor certo do mesmo jeito.
-- ============================================================

ALTER TABLE analise_foto
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'geocall';

COMMENT ON COLUMN analise_foto.origem IS
  'De onde a foto veio: geocall (baixa pelo PDA, o caminho normal) '
  'ou google_fotos (álbum linkado na observação de uma baixa interna).';


-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------
-- A coluna está lá, com o default certo?
-- SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'analise_foto' AND column_name = 'origem';
-- Esperado: origem | NO | 'geocall'::text

-- Nenhuma foto antiga pode ter ficado sem valor:
-- SELECT origem, count(*) FROM analise_foto GROUP BY origem ORDER BY 2 DESC;
-- Antes de a primeira coleta nova rodar, só deve existir 'geocall'.

-- Depois de uma rodada com álbum, as fotos do Google têm nome
-- começando em "gfoto_" — e isso é o que impede uma foto de álbum
-- de colidir com uma do GEOCALL do mesmo segundo na chave
-- (pedido_id, numero_os, tse, arquivo), onde o upsert é
-- ignore-duplicates e a segunda sumiria calada:
-- SELECT origem, count(*) FILTER (WHERE arquivo LIKE 'gfoto!_%' ESCAPE '!') AS com_prefixo,
--        count(*) AS total
--   FROM analise_foto GROUP BY origem;
-- Esperado: google_fotos com com_prefixo = total; geocall com 0.


-- ------------------------------------------------------------
-- DESFAZER
-- ------------------------------------------------------------
-- A tela e o robô continuam funcionando sem a coluna: o robô
-- pergunta se ela existe antes de mandá-la, e a tela trata o que
-- vier vazio como foto do GEOCALL. O que se perde é a etiqueta.
--
-- ALTER TABLE analise_foto DROP COLUMN IF EXISTS origem;
