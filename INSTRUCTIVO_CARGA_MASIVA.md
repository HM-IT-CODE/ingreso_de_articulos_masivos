# Instructivo para la Carga Masiva de Artículos

## Estructura del Archivo Excel

El archivo Excel debe tener las siguientes columnas (en este orden o con estos nombres exactos):

| CODIGO | MARCA | UNIDAD | GRUPO | MODELO         | NUMEROPARTE    | DESCRIPCION                           |
| ------ | ----- | ------ | ----- | -------------- | -------------- | ------------------------------------- |
| 88321  | 70    | UNID   | 13    | 39100ZG0A+B410 | 39100ZG0A+B410 | 39100ZG0A+B409/ (D1) TRIPOIDE DERECHO |
| 88322  | 70    | UNID   | 13    | 39100ZG0A+B411 | 39100ZG0A+B411 | 39100ZG0A+B409/ (D1) TRIPOIDE DERECHO |
| 88323  | 70    | UNID   | 13    | 39100ZG0A+B412 | 39100ZG0A+B412 | 39100ZG0A+B409/ (D1) TRIPOIDE DERECHO |
| 88324  | 70    | UNID   | 13    | 39100ZG0A+B413 | 39100ZG0A+B413 | 39100ZG0A+B409/ (D1) TRIPOIDE DERECHO |
| 88325  | 70    | UNID   | 13    | 39100ZG0A+B414 | 39100ZG0A+B414 | 39100ZG0A+B409/ (D1) TRIPOIDE DERECHO |

> **Nota:** El campo NUMEROPARTE puede ser igual al MODELO si así lo requiere tu operación, o puedes diferenciarlo según tu necesidad.

## Plantilla DFSK (nombres exactos)

## Enfoque recomendado

Para este proyecto, el enfoque recomendado es `SQL-first`:

1. Los catálogos oficiales deben vivir en consultas de SQL Server.
2. El Excel solo debe consumir esos resultados para ayudar al analista.
3. No conviene mantener catálogos manuales dentro del Excel como fuente principal.
4. Si cambia un grupo, categoría, marca, transmisión o puertas en la base de datos, la referencia correcta siempre debe salir de SQL Server.

Por eso, el archivo principal de referencia operativa pasa a ser [CONSULTAS_CATALOGOS_DFSK.sql](CONSULTAS_CATALOGOS_DFSK.sql).

Para la base DFSK, usa esta plantilla simplificada (sin campos amarillos):

| CODIGO   | DESCRIPCION | MARCA        | UNIDAD | GRUPOG | CLASIFICACION | GRUPOF | CATEGORIAF | MODELOF | CARACTERISTICASF | NUMEROPARTEF | APLICAF                         | UBICACIONF | TRANSMISIONF | PUERTASF  |
| -------- | ----------- | ------------ | ------ | ------ | ------------- | ------ | ---------- | ------- | ---------------- | ------------ | ------------------------------- | ---------- | ------------ | --------- |
| DF000012 | NEW-PRUEBAS | ALISTAMIENTO | UNID   | 1      | GRUPO 1       | A/A    | A/A        | D1      | new partes       | 809050HM     | SIN MODELO, C31, C32, GLORY 330 | E1 P       | SINCRONICO   | 4 PUERTAS |

Notas importantes:

1. `GRUPOG` es el grupo general (tipo `G` de tabla `CODIGOS`) y alimenta `ARTICULOS.GRUPO`.
2. `CLASIFICACION` es el campo visual de IMB (`GRUPO 1`, `GRUPO 2`, etc.) y alimenta `ARTICULOS.GRUPOA`.
3. Desde `GRUPOF` en adelante (`CATEGORIAF`, `MODELOF`, `CARACTERISTICASF`, `NUMEROPARTEF`, `APLICAF`, `UBICACIONF`) corresponde a la ficha técnica del artículo.
4. Si existe `CATEGORIA`, el sistema obtiene `IDGRUPO` e `IDCATEGORIA` desde catálogo.
5. Compatibilidad: también se aceptan columnas antiguas sin `F` (`CATEGORIA`, `MODELO`, `CARACTERISTICAS`, `NUMEROPARTE`, `APLICA`, `UBICACION`) y `GRUPO A` / `GRUPO`.
6. `TRANSMISIONF` y `PUERTASF` son de selección. Puedes cargar texto (`SINCRONICO`, `AUTOMATICO`, `4 PUERTAS`) o código numérico.
7. `IVA`, `FECHACIF`, `GARANTIA` y `USUARIO` son opcionales (se autocompletan en backend).

## Matriz de mapeo Excel -> IMB -> Base de datos

| Excel            | Pantalla IMB          | Tabla / columna destino                    | Cómo se llena                                                                   |
| ---------------- | --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| CODIGO           | Artículo              | ARTICULOS.ARTICULO                         | Lo escribe el usuario. No se autogenera hoy en la app.                          |
| DESCRIPCION      | Descripción principal | ARTICULOS.DESCRIPCION                      | Texto libre.                                                                    |
| MARCA            | Marca                 | ARTICULOS.MARCA                            | Se recomienda escribir el nombre exacto del catálogo. La app lo mapea a código. |
| UNIDAD           | Unidad                | ARTICULOS.UNIDAD                           | Nombre exacto o valor estándar de operación.                                    |
| GRUPOG           | Grupo general         | ARTICULOS.GRUPO                            | Catálogo tipo G. Idealmente mostrar código y nombre.                            |
| CLASIFICACION    | Clasificación         | ARTICULOS.GRUPOA                           | Lista fija tipo `GRUPO 1`, `GRUPO 2`.                                           |
| GRUPOF           | Grupo ficha           | ARTICULOSFICHAS.IDGRUPO                    | Catálogo de GRUPOSREPUESTO.                                                     |
| CATEGORIAF       | Categoría ficha       | ARTICULOSFICHAS.IDCATEGORIA                | Debe depender del `GRUPOF` seleccionado.                                        |
| MODELOF          | Modelo                | ARTICULOS.MODELO                           | Texto tal como aparece en IMB.                                                  |
| CARACTERISTICASF | Descripción de parte  | ARTICULOSFICHAS.CARACTERISTICAS            | Texto libre.                                                                    |
| NUMEROPARTEF     | Número de parte       | ARTICULOSFICHAS.NUMEROPARTE                | Texto libre.                                                                    |
| APLICAF          | Aplica                | ARTICULOSFICHAS.APLICA                     | Texto libre.                                                                    |
| UBICACIONF       | Ubicación             | ARTICULOS.UBICACION o tabla complementaria | Texto libre o catálogo interno si existe.                                       |
| TRANSMISIONF     | Transmisión           | ARTICULOS.TRANSMISION                      | Lista de selección. Puede venir como texto de combo o número.                   |
| PUERTASF         | Puertas               | ARTICULOS.PUERTAS                          | Lista de selección. Puede venir como texto de combo o número.                   |

## Qué poner en cada campo de la plantilla

Usa esta tabla como criterio operativo y también como base para los comentarios de cada columna dentro de Excel.

| Campo            | Qué debes escribir                   | Tipo esperado                       | Comentario sugerido para Excel                                                                                                                   |
| ---------------- | ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CODIGO           | Código del artículo                  | Código propio                       | Ingrese el código del artículo. No se autogenera. Puede ser numérico o alfanumérico según la serie usada.                                        |
| DESCRIPCION      | Descripción principal del artículo   | Texto libre                         | Ingrese la descripción principal del artículo. No use código. Es un campo de texto libre.                                                        |
| MARCA            | Nombre exacto de la marca            | Texto de catálogo                   | Escriba el nombre exacto de la marca según catálogo. Ejemplo: DFSK o ALISTAMIENTO. No use descripción inventada.                                 |
| UNIDAD           | Código corto oficial de la unidad    | Código de catálogo                  | Use el código oficial de unidad. Ejemplo: UNID, KILO o MTR. Si su operación trabaja por nombre, use el valor exacto del catálogo.                |
| GRUPOG           | Código del grupo general             | Código numérico de catálogo         | Ingrese el código del grupo general tipo G. Ejemplo: 1, 13, 66. No escriba la descripción si la plantilla guarda código.                         |
| CLASIFICACION    | Nombre visible de la clasificación   | Texto controlado                    | Escriba el texto exacto de la clasificación. Ejemplo: GRUPO 1, GRUPO 2 o GRUPO 3. No use número salvo que su proceso ya lo convierta.            |
| GRUPOF           | Nombre del grupo de ficha            | Texto de catálogo                   | Escriba el nombre exacto del grupo de ficha. Ejemplo: MOTOR. El sistema debe resolver el IDGRUPO desde catálogo.                                 |
| CATEGORIAF       | Nombre de la categoría de ficha      | Texto de catálogo                   | Escriba la categoría exacta según el GRUPOF seleccionado. No mezcle categorías de otro grupo.                                                    |
| MODELOF          | Nombre del modelo                    | Texto de catálogo o texto operativo | Escriba el modelo tal como aparece en IMB. Ejemplo: D1, C31, GLORY 500.                                                                          |
| CARACTERISTICASF | Descripción técnica o característica | Texto libre                         | Ingrese la descripción técnica de la parte. No use código.                                                                                       |
| NUMEROPARTEF     | Número de parte                      | Texto libre                         | Ingrese el número de parte exactamente como lo maneja operación. Puede contener letras, números o símbolos.                                      |
| APLICAF          | Aplicación del repuesto              | Texto libre                         | Ingrese el texto de aplicación del repuesto. Ejemplo: SIN MODELO, C31, C32, GLORY 330.                                                           |
| UBICACIONF       | Ubicación física o lógica            | Texto libre                         | Ingrese la ubicación del artículo. Ejemplo: E1 P. Si existe catálogo interno, use el valor oficial.                                              |
| TRANSMISIONF     | Transmisión                          | Texto de catálogo o código numérico | Puede escribir el texto visible del combo, por ejemplo SINCRONICO o AUTOMATICO. Si su proceso lo requiere, también puede usar el código oficial. |
| PUERTASF         | Cantidad o tipo de puertas           | Texto de catálogo o código numérico | Puede escribir el texto visible del combo, por ejemplo 2 PUERTAS o 4 PUERTAS. Si su proceso lo requiere, también puede usar el código oficial.   |

### Regla corta por tipo de campo

1. Si el campo identifica un catálogo técnico interno, normalmente debe ir en código: `UNIDAD` y `GRUPOG`.
2. Si el campo es de selección visible para el usuario, normalmente conviene escribir el texto exacto del catálogo: `MARCA`, `CLASIFICACION`, `GRUPOF`, `CATEGORIAF`, `MODELOF`.
3. Si el campo describe información operativa o comercial, debe ir como texto libre: `DESCRIPCION`, `CARACTERISTICASF`, `NUMEROPARTEF`, `APLICAF`, `UBICACIONF`.
4. En `TRANSMISIONF` y `PUERTASF` se aceptan ambas opciones, pero para captura manual es más seguro usar el texto visible del catálogo.
5. `CODIGO` siempre lo define operación; no es catálogo ni se autocompleta.

## Flujo recomendado para el analista

La forma correcta es esta:

1. Ejecutar las consultas de [CONSULTAS_CATALOGOS_DFSK.sql](CONSULTAS_CATALOGOS_DFSK.sql).
2. Exportar resultados a Excel solo cuando se necesite armar o validar la carga.
3. Usar el Excel como plantilla de captura, no como repositorio de catálogos.
4. Cuando el usuario seleccione `GRUPOF`, la lista correcta de `CATEGORIAF` debe salir de la consulta SQL correspondiente.
5. Para evitar errores humanos, es mejor mostrar nombre visible y no obligar al analista a memorizar códigos.

## Validación de datos en Excel para listas desplegables

Si ya tienes las consultas cargadas en hojas auxiliares de Excel, lo más práctico es usar `Datos > Validación de datos > Lista`.

Regla recomendada:

1. En la plantilla visible selecciona nombres descriptivos, no códigos, siempre que la app ya haga el mapeo.
2. Si un campo debe guardarse como número, puedes usar otra lista basada en la columna de código.
3. Para evitar fórmulas frágiles, usa rangos con nombre en vez de referencias fijas largas.

### Rangos con nombre recomendados

Si tu hoja de catálogos se llama `CODIGOS`, puedes crear estos nombres en `Fórmulas > Administrador de nombres`:

1. `LISTA_GRUPOG`: grupos generales visibles.
   Ejemplo: `=CODIGOS!$B$2:$B$68`
2. `LISTA_MARCAS`: marcas visibles.
   Ejemplo: `=CODIGOS!$E$2:$E$35`
3. `LISTA_UNIDADES`: unidades visibles.
   Ejemplo: `=CODIGOS!$H$2:$H$4`
4. `LISTA_PUERTAS`: puertas visibles.
   Ejemplo: `=CODIGOS!$H$7:$H$9`
5. `LISTA_MODELOS`: modelos visibles.
   Ejemplo: `=CODIGOS!$H$16:$H$35`
6. `LISTA_CLASIFICACION`: clasificación fija.
   Ejemplo: `="GRUPO 1,GRUPO 2,GRUPO 3"`
7. `LISTA_TRANSMISION`: lista de transmisión.
   Si no la tienes aún en Excel, crea una pequeña tabla auxiliar y nómbrala.
8. `LISTA_GRUPOF`: grupos de ficha.
   Debe salir de la consulta de `GRUPOSREPUESTO`.
9. `LISTA_CATEGORIAF`: categorías de ficha.
   Si no harás dependencia por grupo, usa la lista completa. Si sí la harás, usa una lista dependiente.

### Qué validación aplicar en cada columna de la plantilla

En la hoja `plantilla_dfsk`, para cada columna usa `Permitir: Lista` con este origen:

1. `MARCA`: `=LISTA_MARCAS`
2. `UNIDAD`: `=LISTA_UNIDADES`
3. `GRUPOG`: `=LISTA_GRUPOG`
4. `CLASIFICACION`: `=LISTA_CLASIFICACION`
5. `GRUPOF`: `=LISTA_GRUPOF`
6. `CATEGORIAF`: `=LISTA_CATEGORIAF`
7. `MODELOF`: `=LISTA_MODELOS`
8. `TRANSMISIONF`: `=LISTA_TRANSMISION`
9. `PUERTASF`: `=LISTA_PUERTAS`

Estos campos normalmente no llevan lista porque son texto libre:

1. `CODIGO`
2. `DESCRIPCION`
3. `CARACTERISTICASF`
4. `NUMEROPARTEF`
5. `APLICAF`
6. `UBICACIONF`

### Si quieres guardar código y no descripción

Si prefieres que el usuario seleccione el código directamente, cambia el origen de la lista a la columna de código.

Ejemplos:

1. `GRUPOG` por código: `=CODIGOS!$A$2:$A$68`
2. `MARCA` por código: `=CODIGOS!$D$2:$D$35`
3. `UNIDAD` por código: `=CODIGOS!$G$2:$G$4`

### Recomendación práctica para tu plantilla actual

Por lo que se ve en tu Excel, la opción más estable es esta:

1. En la hoja auxiliar deja una columna de código y una columna de descripción.
2. En la plantilla usa validación con la columna de descripción visible.
3. Si luego necesitas el código, usa una columna auxiliar oculta con `BUSCARX` o `BUSCARV`.

Ejemplo con `BUSCARX` para obtener el código de `GRUPOG` desde el nombre visible:

```excel
=BUSCARX(E2,CODIGOS!$B$2:$B$68,CODIGOS!$A$2:$A$68,"")
```

Ejemplo con `BUSCARX` para obtener código de marca desde el nombre visible:

```excel
=BUSCARX(C2,CODIGOS!$E$2:$E$35,CODIGOS!$D$2:$D$35,"")
```

Si tu Excel no tiene `BUSCARX`, usa `BUSCARV`:

```excel
=SI.ERROR(BUSCARV(C2,CODIGOS!$D$2:$E$35,1,FALSO),"")
```

### Categoría dependiente de grupo

La parte más delicada es `CATEGORIAF`, porque depende de `GRUPOF`.

La forma simple:

1. Usa lista completa si solo quieres ayuda visual.
2. Valida después en sistema o con consulta SQL.

La forma correcta en Excel:

1. Crear una hoja auxiliar por grupo, o
2. Crear una tabla dinámica por grupo y usar nombres definidos por grupo, o
3. En Excel 365 usar `FILTRAR` en una zona auxiliar y basar la validación en ese rango auxiliar.

Si quieres, te puedo preparar la estructura exacta de listas dependientes para `GRUPOF -> CATEGORIAF` dentro de tu plantilla.

## Consulta para rango de códigos (serie 80000 / 90000)

Usa estas consultas para validar qué número sigue antes de armar el Excel:

```sql
-- Último código en serie 80000
WITH ARTICULOS_LIMPIOS AS (
	SELECT LTRIM(RTRIM(ARTICULO)) AS ARTICULO_TXT
	FROM ARTICULOS
),
ARTICULOS_NUMERICOS AS (
	SELECT CAST(ARTICULO_TXT AS INT) AS ARTICULO_INT
	FROM ARTICULOS_LIMPIOS
	WHERE ARTICULO_TXT <> ''
		AND ARTICULO_TXT NOT LIKE '%[^0-9]%'
)
SELECT MAX(ARTICULO_INT) AS ULTIMO_80000
FROM ARTICULOS_NUMERICOS
WHERE ARTICULO_INT BETWEEN 80000 AND 89999;

-- Último código en serie 90000
WITH ARTICULOS_LIMPIOS AS (
	SELECT LTRIM(RTRIM(ARTICULO)) AS ARTICULO_TXT
	FROM ARTICULOS
),
ARTICULOS_NUMERICOS AS (
	SELECT CAST(ARTICULO_TXT AS INT) AS ARTICULO_INT
	FROM ARTICULOS_LIMPIOS
	WHERE ARTICULO_TXT <> ''
		AND ARTICULO_TXT NOT LIKE '%[^0-9]%'
)
SELECT MAX(ARTICULO_INT) AS ULTIMO_90000
FROM ARTICULOS_NUMERICOS
WHERE ARTICULO_INT BETWEEN 90000 AND 99999;
```

Si `CODIGO` es alfanumérico (ej. `DF000012`), no aplica rango 80000/90000 y debes usar el consecutivo del prefijo.

### Control de cupo por serie (cuántos llevas y cuánto te falta)

Si estás cargando en la serie 80000 o 90000, usa esta consulta para ver capacidad total, usados, restantes y siguiente sugerido:

```sql
WITH ARTICULOS_LIMPIOS AS (
	SELECT LTRIM(RTRIM(ARTICULO)) AS ARTICULO_TXT
	FROM ARTICULOS
),
ARTICULOS_NUMERICOS AS (
	SELECT CAST(ARTICULO_TXT AS INT) AS ARTICULO_INT
	FROM ARTICULOS_LIMPIOS
	WHERE ARTICULO_TXT <> ''
		AND ARTICULO_TXT NOT LIKE '%[^0-9]%'
),
RANGOS AS (
	SELECT 80000 AS DESDE, 89999 AS HASTA, 'SERIE 80000' AS SERIE
	UNION ALL
	SELECT 90000, 99999, 'SERIE 90000'
),
USADOS AS (
	SELECT
		R.SERIE,
		R.DESDE,
		R.HASTA,
		COUNT(DISTINCT A.ARTICULO_INT) AS CODIGOS_USADOS,
		MAX(A.ARTICULO_INT) AS ULTIMO_CODIGO
	FROM RANGOS R
	LEFT JOIN ARTICULOS_NUMERICOS A
		ON A.ARTICULO_INT BETWEEN R.DESDE AND R.HASTA
	GROUP BY R.SERIE, R.DESDE, R.HASTA
)
SELECT
	SERIE,
	DESDE,
	HASTA,
	(HASTA - DESDE + 1) AS CAPACIDAD_TOTAL,
	CODIGOS_USADOS,
	((HASTA - DESDE + 1) - CODIGOS_USADOS) AS CODIGOS_RESTANTES,
	ULTIMO_CODIGO,
	CASE
		WHEN ULTIMO_CODIGO IS NULL THEN DESDE
		WHEN ULTIMO_CODIGO < HASTA THEN ULTIMO_CODIGO + 1
		ELSE NULL
	END AS SIGUIENTE_SUGERIDO
FROM USADOS
ORDER BY DESDE;
```

Si además quieres revisar huecos (códigos faltantes dentro de la serie), usa:

```sql
DECLARE @SERIE_DESDE INT = 80000;
DECLARE @SERIE_HASTA INT = 89999;

;WITH ARTICULOS_LIMPIOS AS (
	SELECT LTRIM(RTRIM(ARTICULO)) AS ARTICULO_TXT
	FROM ARTICULOS
),
ARTICULOS_NUMERICOS AS (
	SELECT CAST(ARTICULO_TXT AS INT) AS ARTICULO_INT
	FROM ARTICULOS_LIMPIOS
	WHERE ARTICULO_TXT <> ''
		AND ARTICULO_TXT NOT LIKE '%[^0-9]%'
),
NUMEROS AS (
	SELECT @SERIE_DESDE AS CODIGO
	UNION ALL
	SELECT CODIGO + 1
	FROM NUMEROS
	WHERE CODIGO < @SERIE_HASTA
)
SELECT N.CODIGO AS CODIGO_FALTANTE
FROM NUMEROS N
LEFT JOIN ARTICULOS_NUMERICOS A
	ON A.ARTICULO_INT = N.CODIGO
WHERE A.ARTICULO_INT IS NULL
ORDER BY N.CODIGO
OPTION (MAXRECURSION 0);
```

## Consulta de valores de selección (TRANSMISION / PUERTAS)

Primero revisa los valores reales usados en tu sistema:

```sql
SELECT DISTINCT TRANSMISION
FROM ARTICULOS
WHERE TRANSMISION IS NOT NULL
ORDER BY TRANSMISION;

SELECT DISTINCT PUERTAS
FROM ARTICULOS
WHERE PUERTAS IS NOT NULL
ORDER BY PUERTAS;
```

Si manejas catálogo en `CODIGOS`, usa esta búsqueda para ubicar el tipo correcto:

```sql
SELECT TIPO, CODIGO, DESCRIPCION
FROM CODIGOS
WHERE UPPER(DESCRIPCION) LIKE '%SINCRON%'
	OR UPPER(DESCRIPCION) LIKE '%AUTOM%'
	OR UPPER(DESCRIPCION) LIKE '%PUERTA%'
ORDER BY TIPO,
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END,
	DESCRIPCION;
```

## Consultas SQL de catálogo (DFSK)

Usa estas consultas para sacar códigos y nombres válidos antes de armar el Excel.

### 1) Grupos generales (tipo G) en CODIGOS

```sql
SELECT
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END AS IDGRUPO,
	DESCRIPCION AS GRUPO,
	TIPO
FROM CODIGOS
WHERE TIPO = 'G'
ORDER BY CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END, DESCRIPCION;
```

### 2) Grupos de repuesto + categorías activas

Esta consulta incluye grupos aunque no tengan categoría activa (evita perder grupos como el `66`).

```sql
SELECT
	G.IDGRUPO,
	G.GRUPO,
	CR.IDCATEGORIA,
	CR.CATEGORIA,
	CR.ESTADO
FROM GRUPOSREPUESTO G
LEFT JOIN CATEGORIAREPUESTO CR
	ON CR.IDGRUPO = G.IDGRUPO
	AND CR.ESTADO = 1
WHERE G.GRUPO IS NOT NULL
ORDER BY G.IDGRUPO, CR.IDCATEGORIA;
```

### 2.1) Subgrupos/categorías por grupo seleccionado (para analista)

En SSMS cambia `@IDGRUPOF` y obtendrás solo los subgrupos/categorías de ese grupo.

```sql
DECLARE @IDGRUPOF INT = 7; -- ejemplo: MOTOR

SELECT
	G.IDGRUPO AS IDGRUPOF,
	G.GRUPO   AS GRUPOF,
	CR.IDCATEGORIA,
	CR.CATEGORIA,
	CR.ESTADO
FROM GRUPOSREPUESTO G
LEFT JOIN CATEGORIAREPUESTO CR
	ON CR.IDGRUPO = G.IDGRUPO
WHERE G.IDGRUPO = @IDGRUPOF
	AND (CR.ESTADO = 1 OR CR.IDCATEGORIA IS NULL)
ORDER BY CR.IDCATEGORIA;
```

### 2.2) Consulta por nombre de grupo (sin conocer ID)

```sql
DECLARE @GRUPOF NVARCHAR(100) = 'MOTOR';

SELECT
	G.IDGRUPO AS IDGRUPOF,
	G.GRUPO   AS GRUPOF,
	CR.IDCATEGORIA,
	CR.CATEGORIA,
	CR.ESTADO
FROM GRUPOSREPUESTO G
LEFT JOIN CATEGORIAREPUESTO CR
	ON CR.IDGRUPO = G.IDGRUPO
WHERE UPPER(G.GRUPO) = UPPER(@GRUPOF)
	AND (CR.ESTADO = 1 OR CR.IDCATEGORIA IS NULL)
ORDER BY CR.IDCATEGORIA;
```

### 3) Marcas válidas

```sql
SELECT
	CODIGO,
	DESCRIPCION
FROM CODIGOS
WHERE TIPO = 'M'
ORDER BY DESCRIPCION;
```

### 4) Validar un grupo específico (ejemplo DFSK-Z9 / 66)

```sql
SELECT
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END AS IDGRUPO,
	DESCRIPCION AS GRUPO
FROM CODIGOS
WHERE TIPO = 'G'
	AND (
		(
			LTRIM(RTRIM(CODIGO)) <> ''
			AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
			AND CAST(LTRIM(RTRIM(CODIGO)) AS INT) = 66
		)
		OR UPPER(DESCRIPCION) LIKE '%DFSK-Z9%'
	);
```

## Conversión rápida para llenar Excel con códigos correctos

Sí, ese flujo es correcto: armas cada catálogo en Excel y luego para cada campo colocas el código/ID que corresponda.

Usa estas consultas para traducir texto visible a código interno:

### A) GRUPOG (tipo G)

```sql
DECLARE @GRUPOG NVARCHAR(100) = 'GRUPO 1';

SELECT
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END AS GRUPOG,
	DESCRIPCION
FROM CODIGOS
WHERE TIPO = 'G'
	AND UPPER(DESCRIPCION) = UPPER(@GRUPOG);
```

### B) CLASIFICACION (tipo 1)

```sql
DECLARE @CLASIFICACION NVARCHAR(100) = 'GRUPO 1';

SELECT
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END AS CODIGO_CLASIFICACION,
	DESCRIPCION
FROM CODIGOS
WHERE TIPO = '1'
	AND UPPER(DESCRIPCION) = UPPER(@CLASIFICACION);
```

### C) GRUPOF y CATEGORIAF (dependiente)

```sql
DECLARE @GRUPOF NVARCHAR(100) = 'MOTOR';
DECLARE @CATEGORIAF NVARCHAR(150) = 'FILTROS';

SELECT
	G.IDGRUPO AS IDGRUPOF,
	G.GRUPO,
	CR.IDCATEGORIA,
	CR.CATEGORIA
FROM GRUPOSREPUESTO G
INNER JOIN CATEGORIAREPUESTO CR
	ON CR.IDGRUPO = G.IDGRUPO
WHERE UPPER(G.GRUPO) = UPPER(@GRUPOF)
	AND UPPER(CR.CATEGORIA) = UPPER(@CATEGORIAF)
	AND CR.ESTADO = 1;
```

### D) UNIDAD

```sql
DECLARE @UNIDAD NVARCHAR(100) = 'UNIDADES';

SELECT
	CODIGO AS UNIDAD,
	DESCRIPCION,
	VALOR
FROM DFSK.DBO.CODIGOUNIDADES
WHERE UPPER(DESCRIPCION) = UPPER(@UNIDAD)
	OR UPPER(CODIGO) = UPPER(@UNIDAD);
```

### E) TRANSMISION (tipo U)

```sql
DECLARE @TRANSMISION NVARCHAR(100) = 'SINCRONICO';

SELECT
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END AS CODIGO_TRANSMISION,
	DESCRIPCION
FROM CODIGOS
WHERE TIPO = 'U'
	AND UPPER(DESCRIPCION) = UPPER(@TRANSMISION);
```

### F) PUERTAS (tipo V)

```sql
DECLARE @PUERTAS NVARCHAR(100) = '4 PUERTAS';

SELECT
	CASE
		WHEN LTRIM(RTRIM(CODIGO)) <> ''
		AND LTRIM(RTRIM(CODIGO)) NOT LIKE '%[^0-9]%'
		THEN CAST(LTRIM(RTRIM(CODIGO)) AS INT)
		ELSE NULL
	END AS CODIGO_PUERTAS,
	DESCRIPCION
FROM CODIGOS
WHERE TIPO = 'V'
	AND UPPER(DESCRIPCION) = UPPER(@PUERTAS);
```

### G) MODELOF

```sql
DECLARE @MODELOF NVARCHAR(100) = 'GLORY 500';

SELECT
	IDMODELO,
	MODELO,
	ANO,
	MARCA
FROM DFSK.DBO.MODELOS
WHERE UPPER(MODELO) = UPPER(@MODELOF)
	AND ESTADO = 1;
```

Regla práctica para Excel:

1. Si el campo es de catálogo con código, guarda el código numérico o alfanumérico oficial.
2. Si el campo es descriptivo (por ejemplo APLICAF o CARACTERISTICASF), guarda texto libre.
3. En CATEGORIAF, siempre valida primero el GRUPOF para evitar cruces incorrectos.

## Pasos para la carga masiva

1. Descarga o crea un archivo Excel con la estructura mostrada arriba.
2. Llena los datos de cada artículo en las filas correspondientes.
3. Ingresa a la aplicación y selecciona la base de datos destino.
4. Carga el archivo Excel usando el componente de carga masiva.
5. Haz clic en "Guardar" para enviar los datos.
6. Verifica en el sistema administrativo que los artículos se hayan cargado correctamente.

---

¿Dudas? Consulta el README.md o contacta al responsable del sistema.
