/*
  Script: update_modelos.sql
  Acción: respalda MODELOS, elimina todos los registros y vuelve a insertar
          la lista oficial indicada por negocio.
    Nota: deja que IDMODELO se genere automáticamente desde el identity.
  Revisión: ejecutar en entorno de PRUEBAS antes de producción.
*/
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @src TABLE (
        DESCRIPCION NVARCHAR(500),
        MODELO NVARCHAR(200),
        ANO NVARCHAR(10),
        MARCA NVARCHAR(100),
        ESTADO INT
    );

    INSERT INTO @src (DESCRIPCION, MODELO, ANO, MARCA, ESTADO) VALUES
    ('DEFAULT', 'SIN MODELO', '0000', 'SIN MARCA', 1),
    ('DFSK - C31 (1.5L)', 'DFSK - C31 (1.5L)', '2024', 'DFSK', 1),
    ('DFSK - C32 (1.5L)', 'DFSK - C32 (1.5L)', '2024', 'DFSK', 1),
    ('DFSK - C35 (1.5L)', 'DFSK - C35 (1.5L)', '2024', 'DFSK', 1),
    ('DFSK - C37 (1.5L)', 'DFSK - C37 (1.5L)', '2024', 'DFSK', 1),
    ('DFSK - D1 (2.4L)', 'DFSK - D1 (2.4L)', '2024', 'DFSK', 1),
    ('DFSK - IX5 (1.5L TURBO)', 'DFSK - IX5 (1.5L TURBO)', '2024', 'DFSK', 1),
    ('DFSK - K02S (1.1L)', 'DFSK - K02S (1.1L)', '2024', 'DFSK', 1),
    ('DFSK - K05S (1.1L)', 'DFSK - K05S (1.1L)', '2024', 'DFSK', 1),
    ('SHINERAY - X30', 'SHINERAY - X30', '2023', 'SHINERAY', 1),
    ('DFSK - D51 (1.5L)', 'DFSK - D51 (1.5L)', '2025', 'DFSK', 1),
    ('SHINERAY - X30LS', 'SHINERAY - X30LS', '2024', 'SHINERAY', 1),
    ('DFSK - SIN MODELO (DEFAULT)', 'DEFAULT', '0000', 'SIN MARCA', 1),
    ('DFSK - D71 (2.0L)', 'DFSK - D71 (2.0L)', '2024', 'DFSK', 1),
    ('DFSK - D72 (2.0L)', 'DFSK - D72 (2.0L)', '2024', 'DFSK', 1),
    ('DFSK - E5', 'DFSK - E5', '2024', 'DFSK', 1),
    ('DFSK - GLORY 330 (1.5L)', 'DFSK - GLORY 330 (1.5L)', '2023', 'DFSK', 1),
    ('DFSK - GLORY 500 (1.5L)', 'DFSK - GLORY 500 (1.5L)', '2024', 'DFSK', 1),
    ('DFSK - GLORY 500 TURBO (1.5L TURBO)', 'DFSK - GLORY 500 TURBO (1.5L TURBO)', '2024', 'DFSK', 1),
    ('DFSK - GLORY 560 (1.8L)', 'DFSK - GLORY 560 (1.8L)', '2024', 'DFSK', 1),
    ('DFSK - GLORY 580 (1.8L)', 'DFSK - GLORY 580 (1.8L)', '2024', 'DFSK', 1),
    ('DFSK - GLORY 600 (1.5L TURBO)', 'DFSK - GLORY 600 (1.5L TURBO)', '2024', 'DFSK', 1),
    ('DFSK - K01S (1.1L)', 'DFSK - K01S (1.1L)', '2024', 'DFSK', 1),
    ('DFSK - K01S (1.2L)', 'DFSK - K01S (1.2L)', '2024', 'DFSK', 1),
    ('DFSK - K07S (1.1L)', 'DFSK - K07S (1.1L)', '2024', 'DFSK', 1),
    ('GAC - EMPOW', 'GAC - EMPOW', '2025', 'GAC', 1),
    ('GAC - EMPOW (R-STYLE)', 'GAC - EMPOW (R-STYLE)', '2025', 'GAC', 1),
    ('GAC - EMZOOM', 'GAC - EMZOOM', '2025', 'GAC', 1),
    ('GAC - EMZOOM (R-STYLE)', 'GAC - EMZOOM (R-STYLE)', '2025', 'GAC', 1),
    ('GAC - GS8', 'GAC - GS8', '2025', 'GAC', 1),
    ('GAC - S7', 'GAC - S7', '2025', 'GAC', 1),
    ('GAC - SMILODON PRO', 'GAC - SMILODON PRO', '2025', 'GAC', 1),
    ('GAC - SMILODON SE', 'GAC - SMILODON SE', '2025', 'GAC', 1);

    DECLARE @bkName NVARCHAR(128) = 'MODELOS_backup_' + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss');
    DECLARE @bkFull NVARCHAR(300) = N'DFSK.dbo.' + QUOTENAME(@bkName);
    DECLARE @sql NVARCHAR(MAX);

    SET @sql = N'SELECT * INTO ' + @bkFull + N' FROM DFSK.dbo.MODELOS;';
    EXEC sp_executesql @sql;

    DELETE FROM DFSK.DBO.MODELOS;

    DBCC CHECKIDENT ('DFSK.DBO.MODELOS', RESEED, 0);

    INSERT INTO DFSK.DBO.MODELOS (DESCRIPCION, MODELO, ANO, MARCA, ESTADO)
    SELECT s.DESCRIPCION, s.MODELO, s.ANO, s.MARCA, s.ESTADO
    FROM @src s
    ORDER BY CASE WHEN s.MODELO = 'SIN MODELO' THEN 0 ELSE 1 END,
             s.MODELO,
             s.DESCRIPCION;

    SELECT
        @bkFull AS BackupTable,
        (SELECT COUNT(*) FROM @src) AS InsertedRows,
        (SELECT COUNT(*) FROM DFSK.DBO.MODELOS) AS TotalRowsAfterInsert;

    SELECT IDMODELO, DESCRIPCION, MODELO, ANO, MARCA, ESTADO
    FROM DFSK.DBO.MODELOS
    ORDER BY CASE WHEN MODELO = 'SIN MODELO' THEN 0 ELSE 1 END,
             MODELO,
             IDMODELO;

    COMMIT TRANSACTION;

    PRINT 'MODELOS reemplazada correctamente.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    DECLARE @ErrNum INT = ERROR_NUMBER();
    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR('Error %d: %s', 16, 1, @ErrNum, @ErrMsg);
END CATCH
