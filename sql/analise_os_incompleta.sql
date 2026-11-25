-- ============================================================
-- AS OS QUE VIERAM PELA METADE
--
-- Roda uma vez, no SQL Editor. Acrescenta uma coluna; não apaga
-- nada.
--
-- POR QUE ELA EXISTE: quando uma etapa não abre, a OS fica com
-- parte das fotos. Reenfileirar o pedido não resolvia, porque o
-- robô pula as OS que já têm foto — e essa tem. A retentativa era
-- por OS e a perda é por etapa.
--
-- Guardando aqui quais OS vieram incompletas, a rodada seguinte
-- volta nelas em vez de pulá-las. E só nelas: as OS inteiras
-- continuam sendo puladas, que é o que faz a retomada ser barata.
--
-- A OS entra na lista UMA vez. Voltando a falhar, ela sai e o
-- pedido fecha com o que há: sem isso, uma etapa que nunca abre
-- faria o pedido voltar para a fila todo minuto, para sempre.
-- (25/11/2026)
-- ============================================================

ALTER TABLE analise_pedido
  ADD COLUMN IF NOT EXISTS os_incompletas TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN analise_pedido.os_incompletas IS
  'OS em que alguma etapa não abriu. A próxima rodada tenta de novo '
  'só estas; depois da segunda tentativa a OS sai da lista.';

-- ---------- CONFERÊNCIA ----------
-- SELECT id, dia, fotos, os_incompletas, erro FROM analise_pedido ORDER BY id;

-- ---------- DESFAZER ----------
-- ALTER TABLE analise_pedido DROP COLUMN IF EXISTS os_incompletas;
