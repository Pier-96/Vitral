# MVP — Diario de progreso físico

## Estado actual

Aplicación privada local con React, API Node/Express, SQLite y Prisma. Los datos están aislados por `userId` desde el modelo, usando inicialmente el usuario local único. Las fotografías quedan organizadas por semana y los backups se pueden dirigir a otro volumen mediante `BACKUP_DIR`.

El check-in incluye báscula mediante OCR, fotografías, medidas corporales opcionales y evaluación subjetiva. El entrenamiento se registra en una pantalla separada por ejercicio y semana: series, repeticiones fijas o en rango, carga y notas; el volumen se calcula cuando los datos permiten hacerlo.

## Apple Health

Está preparado el contrato `POST /api/health/webhook`. Requiere `HEALTH_WEBHOOK_TOKEN`, es idempotente usando `source + externalId`, limita peticiones y acepta hasta 500 registros por envío. El payload esperado es:

```json
{
  "records": [{
    "externalId": "healthkit-uuid",
    "metricType": "steps",
    "value": 8432,
    "unit": "count",
    "recordedAt": "2026-09-06T10:00:00Z",
    "source": "apple_health"
  }]
}
```

Al crear un check-in se congelan los resúmenes de los siete días previos cuando existen datos disponibles.

## Pendiente de servicios externos

Google OAuth, almacenamiento cloud privado, PostgreSQL cloud y Gemini requieren definir proveedor, cuentas y secretos. La estructura actual no finge que estén activos; pueden incorporarse sustituyendo el usuario local y el almacenamiento sin cambiar los contratos de check-ins, salud o entrenamiento.
