/*
  Script: update_modelo_equal_descripcion.sql
  Acción: 1) crea respaldo de las filas afectadas
          2) actualiza MODELO = DESCRIPCION para las descripciones indicadas
  Recomendación: ejecutar primero en `prueba_dfsk`.
*/
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;


    -- Nombre de backup (solo nombre de tabla, sin schema)
    DECLARE @bkName NVARCHAR(128) = 'MODELOS_modelo_backup_' + FORMAT(GETDATE(),'yyyyMMdd_HHmmss');
    DECLARE @bkFull NVARCHAR(300) = N'DFSK.dbo.' + QUOTENAME(@bkName);
    DECLARE @sql NVARCHAR(MAX);

    -- 1) crear backup de las filas que tienen esas DESCRIPCIONES
    SET @sql = N'SELECT * INTO ' + @bkFull + N' FROM DFSK.dbo.MODELOS WHERE DESCRIPCION COLLATE DATABASE_DEFAULT IN (
        ''DFSK - C31 (1.5L)'',''DFSK - C32 (1.5L)'',''DFSK - C35 (1.5L)'',''DFSK - C37 (1.5L)'',
        ''DFSK - D1 (2.4L)'',''DFSK - D51 (1.5L)'',''DFSK - D71 (2.0L)'',''DFSK - D72 (2.0L)'',
        ''DFSK - E5'',''DFSK - GLORY 330 (1.5L)'',''DFSK - GLORY 500 (1.5L)'',''DFSK - GLORY 500 TURBO (1.5L TURBO)'',
        ''DFSK - GLORY 560 (1.8L)'',''DFSK - GLORY 580 (1.8L)'',''DFSK - GLORY 600 (1.5L TURBO)'',''DFSK - IX5 (1.5L TURBO)'',
        ''DFSK - K01S (1.1L)'',''DFSK - K01S (1.2L)'',''DFSK - K02S (1.1L)'',''DFSK - K05S (1.1L)'',
        ''DFSK - K07S (1.1L)'',''GAC - EMPOW'',''GAC - EMPOW (R-STYLE)'',''GAC - EMZOOM'',
        ''GAC - EMZOOM (R-STYLE)'',''GAC - GS8'',''GAC - S7'',''GAC - SMILODON PRO'',''GAC - SMILODON SE'',
        ''SHINERAY - X30'',''SHINERAY - X30LS''
    )';
    EXEC sp_executesql @sql;

    -- 2) actualizar MODELO = DESCRIPCION para esas filas
    UPDATE DFSK.DBO.MODELOS
    SET MODELO = DESCRIPCION
    WHERE DESCRIPCION COLLATE DATABASE_DEFAULT IN (
        'DFSK - C31 (1.5L)','DFSK - C32 (1.5L)','DFSK - C35 (1.5L)','DFSK - C37 (1.5L)',
        'DFSK - D1 (2.4L)','DFSK - D51 (1.5L)','DFSK - D71 (2.0L)','DFSK - D72 (2.0L)',
        'DFSK - E5','DFSK - GLORY 330 (1.5L)','DFSK - GLORY 500 (1.5L)','DFSK - GLORY 500 TURBO (1.5L TURBO)',
        'DFSK - GLORY 560 (1.8L)','DFSK - GLORY 580 (1.8L)','DFSK - GLORY 600 (1.5L TURBO)','DFSK - IX5 (1.5L TURBO)',
        'DFSK - K01S (1.1L)','DFSK - K01S (1.2L)','DFSK - K02S (1.1L)','DFSK - K05S (1.1L)',
        'DFSK - K07S (1.1L)','GAC - EMPOW','GAC - EMPOW (R-STYLE)','GAC - EMZOOM',
        'GAC - EMZOOM (R-STYLE)','GAC - GS8','GAC - S7','GAC - SMILODON PRO','GAC - SMILODON SE',
        'SHINERAY - X30','SHINERAY - X30LS'
    );

    DECLARE @UpdatedRows INT = @@ROWCOUNT;

    SELECT @bkFull AS BackupTable, @UpdatedRows AS UpdatedRows;

    COMMIT TRANSACTION;
    PRINT 'MODELO actualizado a DESCRIPCION para la lista proporcionada.';

END TRY
BEGIN CATCH
    DECLARE @ErrNum INT = ERROR_NUMBER();
    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    ROLLBACK TRANSACTION;
    RAISERROR('Error %d: %s',16,1,@ErrNum,@ErrMsg);
END CATCH
