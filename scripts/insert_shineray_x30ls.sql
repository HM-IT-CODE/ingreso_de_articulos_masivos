/* Script de prueba: insertar/upsert solo para SHINERAY - X30LS
   Ejecutar en ambiente de pruebas primero (prueba_dfsk).
*/
SET NOCOUNT ON;

BEGIN TRANSACTION;

MERGE INTO DFSK.DBO.MODELOS AS target
USING (
    VALUES ('X30LS', 'SHINERAY - X30LS', '2024', 'SHINERAY', 1)
) AS src(MODELO, DESCRIPCION, ANO, MARCA, ESTADO)
    ON (ISNULL(target.MODELO,'') = ISNULL(src.MODELO,'') AND ISNULL(target.MARCA,'') = ISNULL(src.MARCA,''))
WHEN MATCHED THEN
    UPDATE SET
        target.DESCRIPCION = src.DESCRIPCION,
        target.ANO = src.ANO,
        target.ESTADO = src.ESTADO
WHEN NOT MATCHED BY TARGET THEN
    INSERT (DESCRIPCION, MODELO, ANO, MARCA, ESTADO)
    VALUES (src.DESCRIPCION, src.MODELO, src.ANO, src.MARCA, src.ESTADO)
;

SELECT 'UpsertCompleted' AS Result;

COMMIT TRANSACTION;

PRINT 'Prueba finalizada.';
