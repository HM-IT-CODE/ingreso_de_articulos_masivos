/*
  Script: insert_then_update_modelos.sql
  Acción: 1) Inserta los modelos que no existan (INSERT ... WHERE NOT EXISTS)
          2) Actualiza los registros existentes (UPDATE JOIN)
  Nota: Evita MERGE; usa collation DATABASE_DEFAULT en comparaciones.
  Recomendación: ejecutar primero en `prueba_dfsk`.
*/
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @src TABLE (
        MODELO NVARCHAR(200),
        DESCRIPCION NVARCHAR(500),
        ANO NVARCHAR(10),
        MARCA NVARCHAR(100),
        ESTADO INT
    );

    INSERT INTO @src (MODELO, DESCRIPCION, ANO, MARCA, ESTADO) VALUES
    ('DEFAULT','DFSK - SIN MODELO (DEFAULT)','0000','SIN MARCA',1),
    ('C31','DFSK - C31 (1.5L)','2024','DFSK',1),
    ('C32','DFSK - C32 (1.5L)','2024','DFSK',1),
    ('C35','DFSK - C35 (1.5L)','2024','DFSK',1),
    ('C37','DFSK - C37 (1.5L)','2024','DFSK',1),
    ('D1','DFSK - D1 (2.4L)','2024','DFSK',1),
    ('D51','DFSK - D51 (1.5L)','2025','DFSK',1),
    ('D71','DFSK - D71 (2.0L)','2024','DFSK',1),
    ('D72','DFSK - D72 (2.0L)','2024','DFSK',1),
    ('E5','DFSK - E5','2024','DFSK',1),
    ('GLORY330','DFSK - GLORY 330 (1.5L)','2023','DFSK',1),
    ('GLORY500','DFSK - GLORY 500 (1.5L)','2024','DFSK',1),
    ('GLORY500T','DFSK - GLORY 500 TURBO (1.5L TURBO)','2024','DFSK',1),
    ('GLORY560','DFSK - GLORY 560 (1.8L)','2024','DFSK',1),
    ('GLORY580','DFSK - GLORY 580 (1.8L)','2024','DFSK',1),
    ('GLORY600','DFSK - GLORY 600 (1.5L TURBO)','2024','DFSK',1),
    ('IX5','DFSK - IX5 (1.5L TURBO)','2024','DFSK',1),
    ('K01S_11','DFSK - K01S (1.1L)','2024','DFSK',1),
    ('K01S_12','DFSK - K01S (1.2L)','2024','DFSK',1),
    ('K02S','DFSK - K02S (1.1L)','2024','DFSK',1),
    ('K05S','DFSK - K05S (1.1L)','2024','DFSK',1),
    ('K07S','DFSK - K07S (1.1L)','2024','DFSK',1),
    ('X30','SHINERAY - X30','2023','SHINERAY',1),
    ('X30LS','SHINERAY - X30LS','2024','SHINERAY',1),
    ('G560','DFSK - GLORY 560','2024','DFSK',1),
    ('GAC_EMPOW','GAC - EMPOW','2025','GAC',1),
    ('GAC_EMPOW_R','GAC - EMPOW (R-STYLE)','2025','GAC',1),
    ('GAC_EMZOOM','GAC - EMZOOM','2025','GAC',1),
    ('GAC_EMZOOM_R','GAC - EMZOOM (R-STYLE)','2025','GAC',1),
    ('GAC_GS8','GAC - GS8','2025','GAC',1),
    ('GAC_S7','GAC - S7','2025','GAC',1),
    ('GAC_SMILODON_PRO','GAC - SMILODON PRO','2025','GAC',1),
    ('GAC_SMILODON_SE','GAC - SMILODON SE','2025','GAC',1)
    ;

    -- 1) Insertar sólo los que NO existen
    INSERT INTO DFSK.DBO.MODELOS (DESCRIPCION, MODELO, ANO, MARCA, ESTADO)
    SELECT s.DESCRIPCION, s.MODELO, s.ANO, s.MARCA, s.ESTADO
    FROM @src s
    WHERE NOT EXISTS (
        SELECT 1 FROM DFSK.DBO.MODELOS m
        WHERE ISNULL(m.MODELO,'') COLLATE DATABASE_DEFAULT = ISNULL(s.MODELO,'') COLLATE DATABASE_DEFAULT
          AND ISNULL(m.MARCA,'') COLLATE DATABASE_DEFAULT = ISNULL(s.MARCA,'') COLLATE DATABASE_DEFAULT
    );

    DECLARE @InsertedRows INT = @@ROWCOUNT;

    -- 2) Actualizar los existentes
    UPDATE m
    SET m.DESCRIPCION = s.DESCRIPCION,
        m.ANO = s.ANO,
        m.ESTADO = s.ESTADO
    FROM DFSK.DBO.MODELOS m
    JOIN @src s ON ISNULL(m.MODELO,'') COLLATE DATABASE_DEFAULT = ISNULL(s.MODELO,'') COLLATE DATABASE_DEFAULT
                 AND ISNULL(m.MARCA,'') COLLATE DATABASE_DEFAULT = ISNULL(s.MARCA,'') COLLATE DATABASE_DEFAULT;

    DECLARE @UpdatedRows INT = @@ROWCOUNT;

    SELECT @InsertedRows AS InsertedRows, @UpdatedRows AS UpdatedRows, (SELECT COUNT(*) FROM @src) AS TotalInList;

    COMMIT TRANSACTION;

    PRINT 'Script completed successfully.';

END TRY
BEGIN CATCH
    DECLARE @ErrNum INT = ERROR_NUMBER();
    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    ROLLBACK TRANSACTION;
    RAISERROR('Error %d: %s',16,1,@ErrNum,@ErrMsg);
END CATCH
