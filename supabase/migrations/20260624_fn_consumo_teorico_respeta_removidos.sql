-- fn_generar_consumo_teorico: respeta ingredientes removidos (on=false)
-- y procesa extras/salsas como venta_items separados (cobertura automática)
CREATE OR REPLACE FUNCTION public.fn_generar_consumo_teorico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item        RECORD;
  v_ingrediente RECORD;
  v_removidos   TEXT[];
BEGIN
  IF NEW.estado = 'cerrada' AND (OLD.estado IS DISTINCT FROM 'cerrada') THEN
    FOR v_item IN
      SELECT id_item, cantidad, modificadores
      FROM venta_items
      WHERE id_venta = NEW.id AND tenant_id = NEW.tenant_id
    LOOP
      IF v_item.modificadores IS NOT NULL
         AND v_item.modificadores ? 'ingredientes'
         AND jsonb_typeof(v_item.modificadores->'ingredientes') = 'array'
      THEN
        SELECT ARRAY(
          SELECT elem->>'id'
          FROM jsonb_array_elements(v_item.modificadores->'ingredientes') AS elem
          WHERE (elem->>'on')::boolean = false
        ) INTO v_removidos;
      ELSE
        v_removidos := '{}';
      END IF;

      FOR v_ingrediente IN
        SELECT ri.id_producto, ri.cantidad, p.ultimo_costo
        FROM receta_ingredientes ri
        LEFT JOIN productos p ON p.id_producto = ri.id_producto
                              AND p.tenant_id = NEW.tenant_id
        WHERE ri.id_receta = v_item.id_item
          AND ri.tenant_id = NEW.tenant_id
          AND ri.activo != false
          AND ri.id_producto != ALL(COALESCE(v_removidos, '{}'))
      LOOP
        INSERT INTO consumo_teorico (
          tenant_id, id_venta, id_producto,
          cantidad_consumida, costo_unitario_snap, fecha_venta
        ) VALUES (
          NEW.tenant_id,
          NEW.id,
          v_ingrediente.id_producto,
          CAST(v_ingrediente.cantidad AS NUMERIC) * v_item.cantidad,
          v_ingrediente.ultimo_costo,
          DATE(NEW.created_at AT TIME ZONE 'America/Mexico_City')
        );
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
