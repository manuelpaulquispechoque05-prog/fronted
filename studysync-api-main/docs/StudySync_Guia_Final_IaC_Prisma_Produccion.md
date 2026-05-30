# StudySync — Guía Final: IaC, CloudFormation, Prisma + Supabase y Producción

**Asignatura:** Programación IV | **Universidad:** UPDS | **Semestre:** 7mo | **Año:** 2026  
**Docente:** M.Sc. Jimmy Nataniel Requena Llorentty  
**Repositorio:** https://github.com/bolivianotech/studysync-api

---

## Introducción

Esta guía cubre los últimos pasos del proyecto StudySync:

| Paso | Tema | Herramienta |
|------|------|-------------|
| 13 | Infrastructure as Code (IaC) | AWS CloudFormation + LocalStack |
| 14 | Prisma ORM + Supabase completo | Prisma 6, PostgreSQL en la nube |
| 15 | QA Funcional y registro de bugs | Checklist + BUGS.md |
| 16 | Deploy final en Render | GitHub → Render CI/CD |
| 17 | Siguiente nivel: AWS real | S3, DynamoDB, Redis Pub/Sub en producción |
| 18 | Alternativa Azure | App Service, Azure Table Storage |

---

## PASO 13 — Infrastructure as Code (IaC) con CloudFormation + LocalStack

### ¿Qué es Infrastructure as Code?

Antes de IaC, los equipos de desarrollo creaban recursos en AWS manualmente: entrar a la consola, hacer clic en "Crear bucket S3", configurar permisos, repetir en staging, repetir en producción. Cada vez diferente, propenso a errores.

**IaC resuelve esto:** describes la infraestructura en un archivo (YAML o JSON) y una herramienta la crea automáticamente, igual cada vez, en cualquier entorno.

```
Sin IaC:                          Con IaC:
desarrollador → consola AWS       desarrollador → escribe YAML
             → clic clic clic                  → ejecuta un comando
             → rezar que salió bien            → infraestructura idéntica siempre
             → repetir en cada ambiente
```

**Ventajas clave:**
- **Reproducibilidad:** el mismo YAML produce exactamente la misma infraestructura
- **Versionamiento:** la infraestructura vive en Git igual que el código
- **Rollback:** si algo falla, CloudFormation hace rollback automático completo
- **Documentación viva:** el YAML describe exactamente qué recursos existen y por qué

### ¿Qué es LocalStack?

LocalStack es un servidor que **simula los servicios de AWS en tu computadora** en el puerto 4566. Así puedes desarrollar y probar sin gastar dinero en AWS real.

```
Tu app → awslocal → LocalStack:4566 → simula S3, DynamoDB, SSM, CloudFormation
Tu app → aws      → AWS real        → te cobra por cada operación
```

**Servicios disponibles en LocalStack gratuito:** S3, DynamoDB, SSM Parameter Store, SQS, CloudFormation, Lambda (básico), IAM.

### Instalación y arranque de LocalStack

**Prerrequisitos:** Docker Desktop instalado y corriendo.

```bash
# Opción 1: Docker run directo
docker run -d -p 4566:4566 --name localstack localstack/localstack

# Opción 2: Si ya tienes la imagen descargada (más rápido)
docker start localstack

# Verificar que está healthy
docker ps --filter name=localstack
# Debe mostrar: (healthy)

# Instalar el wrapper de AWS CLI para LocalStack
pip install awscli awscli-local

# Verificar instalación
awslocal --version
# aws-cli/1.x.x Python/3.x.x ...
```

**La diferencia entre `aws` y `awslocal`:**
```bash
aws s3 ls                  # consulta AWS real (requiere credenciales reales)
awslocal s3 ls             # consulta LocalStack en localhost:4566 (sin credenciales)
```

### El template CloudFormation explicado

Archivo: `cloudformation/template.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
# Versión estándar — siempre esta misma cadena
```

#### Sección Parameters
Valores configurables al momento del despliegue. Permiten reusar el mismo template para development, staging y production.

```yaml
Parameters:
  Ambiente:
    Type: String
    Default: development
    AllowedValues: [development, staging, production]
    # CloudFormation valida que solo se pasen estos valores
```

#### Sección Resources — El corazón del template

**Recurso 1: S3 Bucket**
```yaml
BucketAdjuntos:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: !Sub "studysync-adjuntos-${Ambiente}"
    # !Sub es una función de CloudFormation: sustituye ${Ambiente} con el valor del parámetro
    # Resultado en development: "studysync-adjuntos-development"
    # Resultado en production:  "studysync-adjuntos-production"
    
    VersioningConfiguration:
      Status: Enabled
    # Guarda el historial de cada versión de cada archivo
    # Si alguien sobreescribe un PDF de apuntes, puedes recuperar la versión anterior
    
    CorsConfiguration:
      CorsRules:
        - AllowedMethods: [GET, PUT, POST, DELETE]
          AllowedOrigins: ['*']
    # CORS en S3 permite que el frontend suba archivos directamente al bucket
    # sin pasar por el servidor Express (más eficiente para archivos grandes)
```

**Recurso 2: DynamoDB Table**
```yaml
TablaEventos:
  Type: AWS::DynamoDB::Table
  Properties:
    BillingMode: PAY_PER_REQUEST
    # Sin capacidad provisionada — pagas solo cuando usas
    # Ideal para proyectos con tráfico variable
    
    KeySchema:
      - AttributeName: eventId
        KeyType: HASH     # Partition key: define en qué partición física va el dato
      - AttributeName: timestamp
        KeyType: RANGE    # Sort key: ordena los datos dentro de cada partición
    
    TimeToLiveSpecification:
      AttributeName: expiresAt
      Enabled: true
    # DynamoDB elimina automáticamente registros cuando 'expiresAt' (timestamp Unix) 
    # es menor que la hora actual. Gratis. Sin costo extra.
```

¿Por qué DynamoDB para eventos y no PostgreSQL?
- PostgreSQL (Supabase) es excelente para datos estructurados con relaciones (usuarios, sesiones)
- DynamoDB es excelente para logs y eventos: millones de escrituras/segundo, latencia <10ms
- En producción real, usarías ambos: PostgreSQL para el dominio, DynamoDB para eventos

**Recurso 3: SSM Parameter Store**
```yaml
ParametroApiUrl:
  Type: AWS::SSM::Parameter
  Properties:
    Name: !Sub "/studysync/${Ambiente}/api-url"
    # Convención de nombres: /proyecto/ambiente/clave
    # Permite separar configuración por ambiente fácilmente
```

SSM Parameter Store es el "vault de configuración" de AWS. En lugar de tener URLs hardcodeadas en el código, la aplicación consulta SSM al arrancar:

```javascript
// Código que leería el parámetro en una app real
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const ssm = new SSMClient({ region: 'us-east-1' });
const param = await ssm.send(new GetParameterCommand({ Name: '/studysync/production/api-url' }));
const apiUrl = param.Parameter.Value;
```

#### Sección Outputs
Valores que CloudFormation exporta al completar el despliegue. Útiles para referenciar recursos desde otros stacks.

```yaml
Outputs:
  BucketNombre:
    Value: !Ref BucketAdjuntos
    # !Ref en un bucket devuelve su nombre (no el ARN)
    Export:
      Name: !Sub "${AWS::StackName}-BucketAdjuntos"
      # Otros stacks pueden importar este valor con: !ImportValue studysync-api-BucketAdjuntos
```

### Comandos CloudFormation — referencia completa

```bash
# Validar el template antes de desplegarlo (detecta errores de sintaxis)
awslocal cloudformation validate-template \
  --template-body file://cloudformation/template.yaml

# Crear el stack (primera vez)
awslocal cloudformation create-stack \
  --stack-name studysync-api \
  --template-body file://cloudformation/template.yaml \
  --parameters \
    ParameterKey=Ambiente,ParameterValue=development \
    ParameterKey=ApiUrl,ParameterValue=http://localhost:3000

# Verificar estado (esperar CREATE_COMPLETE)
awslocal cloudformation describe-stacks \
  --stack-name studysync-api \
  --query "Stacks[0].StackStatus" \
  --output text

# Ver todos los recursos creados
awslocal cloudformation describe-stack-resources \
  --stack-name studysync-api \
  --output table

# Ver los Outputs del stack
awslocal cloudformation describe-stacks \
  --stack-name studysync-api \
  --query "Stacks[0].Outputs" \
  --output table

# Actualizar el stack (si modificas el template)
awslocal cloudformation update-stack \
  --stack-name studysync-api \
  --template-body file://cloudformation/template.yaml

# Eliminar el stack (elimina TODOS los recursos)
awslocal cloudformation delete-stack --stack-name studysync-api
```

### Trabajar con los recursos creados

**S3 — operaciones comunes:**
```bash
# Listar todos los buckets
awslocal s3 ls

# Subir un archivo
awslocal s3 cp mi-archivo.pdf s3://studysync-adjuntos-development/docs/mi-archivo.pdf

# Listar contenido del bucket
awslocal s3 ls s3://studysync-adjuntos-development/ --recursive

# Descargar un archivo
awslocal s3 cp s3://studysync-adjuntos-development/docs/mi-archivo.pdf ./descargado.pdf

# Eliminar un archivo
awslocal s3 rm s3://studysync-adjuntos-development/docs/mi-archivo.pdf
```

**DynamoDB — operaciones comunes:**
```bash
# Insertar un evento (desde archivo JSON para evitar problemas con comillas)
# Crear el archivo evento.json:
# {
#   "eventId": {"S": "evt-001"},
#   "timestamp": {"S": "2026-05-26T10:00:00Z"},
#   "tipo": {"S": "sesion:creada"},
#   "titulo": {"S": "Mi primera sesion"},
#   "expiresAt": {"N": "1800000000"}
# }

awslocal dynamodb put-item \
  --table-name studysync-eventos-development \
  --item file://cloudformation/evento-prueba.json

# Leer todos los registros (scan — solo para tablas pequeñas)
awslocal dynamodb scan \
  --table-name studysync-eventos-development \
  --output table

# Buscar por ID (query — eficiente, usa el índice)
awslocal dynamodb get-item \
  --table-name studysync-eventos-development \
  --key '{"eventId":{"S":"evt-001"},"timestamp":{"S":"2026-05-26T10:00:00Z"}}'
```

**SSM — leer y escribir parámetros:**
```bash
# Leer un parámetro
awslocal ssm get-parameter --name "/studysync/development/api-url"

# Escribir/actualizar un parámetro
awslocal ssm put-parameter \
  --name "/studysync/development/api-url" \
  --value "http://localhost:3001" \
  --type String \
  --overwrite
```

---

## PASO 14 — Prisma ORM + Supabase: Guía Completa

### ¿Qué es un ORM?

ORM = Object Relational Mapper. Es una capa que traduce entre objetos JavaScript y tablas SQL.

```
Sin ORM:  await pool.query('SELECT * FROM sesiones WHERE id = $1', [id])
Con ORM:  await prisma.sesion.findUnique({ where: { id } })
```

El ORM se encarga de:
- Generar el SQL correcto para cada base de datos (PostgreSQL, MySQL, SQLite...)
- Prevenir SQL Injection automáticamente (usa parámetros preparados)
- Tipar los resultados (TypeScript/IntelliSense sabe los campos disponibles)
- Gestionar conexiones con un pool eficiente

### ¿Qué es Supabase?

Supabase es "Firebase de código abierto" — una plataforma que provee PostgreSQL gestionado en la nube más servicios adicionales (autenticación, storage, realtime). **Tier gratuito:** 2 proyectos, 500MB de base de datos, sin fecha de expiración.

```
Supabase provee:
├── PostgreSQL gestionado (nosotros usamos esto)
├── API REST automática (PostgREST)
├── Autenticación built-in
├── Storage (similar a S3)
└── Realtime (websockets sobre cambios en BD)
```

### Configuración inicial de Supabase

1. Ir a https://supabase.com → New Project
2. Nombre: `studysync` | Región: South America (São Paulo) | Anotar el Database Password
3. En Settings → Database → Connection string, copiar:
   - **Transaction pooler** (puerto 6543) → `DATABASE_URL`
   - **Session mode** (puerto 5432) → `DIRECT_URL`

```env
# .env (NUNCA subir a Git)
DATABASE_URL=postgresql://postgres.PROYECTO:[PASSWORD]@aws-1-us-west-2.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.PROYECTO:[PASSWORD]@aws-1-us-west-2.pooler.supabase.com:5432/postgres
```

**¿Por qué dos URLs?**
- `DATABASE_URL` (pooler, puerto 6543): usa PgBouncer, múltiples conexiones simultáneas → para las queries de la app
- `DIRECT_URL` (session, puerto 5432): conexión directa → para migraciones y `prisma db push`

### El schema de Prisma explicado

Archivo: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
  // Dice a Prisma qué cliente generar — el de JavaScript/TypeScript
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Conexión para queries normales
  directUrl = env("DIRECT_URL")        // Conexión directa para migraciones
}

model Usuario {
  id         Int       @id @default(autoincrement())
  // @id = clave primaria
  // @default(autoincrement()) = PostgreSQL asigna el ID (SERIAL)
  
  nombre     String
  email      String    @unique
  // @unique = columna con índice único, PostgreSQL rechaza duplicados
  
  password   String    // Hash bcrypt — NUNCA texto plano
  
  creadoEn   DateTime  @default(now()) @map("creado_en")
  // @default(now()) = PostgreSQL inserta la fecha/hora actual automáticamente
  // @map("creado_en") = en la BD se llama "creado_en" (snake_case)
  //                     en Prisma se llama "creadoEn" (camelCase)
  
  sesiones   Sesion[]  // Relación uno-a-muchos: un usuario tiene muchas sesiones
  
  @@map("usuarios") // El modelo se llama "Usuario" en Prisma, "usuarios" en PostgreSQL
}

model Sesion {
  id            Int       @id @default(autoincrement())
  titulo        String
  descripcion   String    @default("")
  materia       String    @default("General")
  fechaHora     DateTime  @default(now()) @map("fecha_hora")
  completada    Boolean   @default(false)
  creadaEn      DateTime  @default(now()) @map("creada_en")
  actualizadaEn DateTime? @updatedAt @map("actualizada_en")
  // @updatedAt = Prisma actualiza este campo automáticamente en cada UPDATE
  // ? = campo nullable (puede ser null)
  
  autorId       Int       @map("autor_id")
  autor         Usuario   @relation(fields: [autorId], references: [id])
  // Clave foránea: "autor_id" en la tabla "sesiones" apunta a "id" en "usuarios"
  
  @@map("sesiones")
}
```

### Comandos Prisma esenciales

```bash
# Generar el cliente Prisma (después de cambiar schema.prisma)
npx prisma generate
# Crea node_modules/@prisma/client con tipos y funciones basados en tu schema

# Sincronizar el schema con la base de datos (desarrollo)
npx prisma db push
# Lee schema.prisma, calcula las diferencias con la BD, aplica los cambios
# NO guarda historial de migraciones

# Abrir Prisma Studio (interfaz visual de la BD)
npx prisma studio
# Abre http://localhost:5555 con tabla visual de todos los modelos

# Ver el estado actual de la BD vs el schema
npx prisma db pull
# Lee la BD y actualiza schema.prisma (útil cuando la BD ya existe)

# Formatear schema.prisma
npx prisma format
```

### Operaciones CRUD con Prisma — referencia completa

#### Buscar registros

```javascript
const prisma = require('./src/db');

// Todos los registros
const sesiones = await prisma.sesion.findMany();

// Con filtro
const sesionesDeProgIV = await prisma.sesion.findMany({
  where: { materia: 'Programacion IV' }
});

// Buscar uno por ID (devuelve null si no existe)
const sesion = await prisma.sesion.findUnique({
  where: { id: 1 }
});

// Buscar uno por otro campo único
const usuario = await prisma.usuario.findUnique({
  where: { email: 'jimmy@upds.edu.bo' }
});

// Con relaciones incluidas (JOIN automático)
const sesiones = await prisma.sesion.findMany({
  include: {
    autor: {
      select: { id: true, nombre: true, email: true }
      // select evita traer el campo password
    }
  }
});

// Ordenar y paginar
const sesiones = await prisma.sesion.findMany({
  orderBy: { creadaEn: 'desc' },
  skip: 0,   // offset
  take: 10,  // limit
});

// Contar registros
const total = await prisma.sesion.count({
  where: { completada: false }
});
```

#### Crear registros

```javascript
const nuevaSesion = await prisma.sesion.create({
  data: {
    titulo: 'Redis Pub/Sub',
    materia: 'Programacion IV',
    autorId: 1,           // Clave foránea directa
  },
  include: { autor: true } // Devolver también el autor en la respuesta
});

// Crear con relación anidada (crea el usuario Y la sesión en una transacción)
const resultado = await prisma.usuario.create({
  data: {
    nombre: 'Nuevo Alumno',
    email: 'alumno@upds.edu.bo',
    password: hashedPassword,
    sesiones: {
      create: [
        { titulo: 'Primera sesion', materia: 'Prog IV' }
      ]
    }
  }
});
```

#### Actualizar registros

```javascript
const actualizada = await prisma.sesion.update({
  where: { id: 1 },
  data: {
    completada: true,
    titulo: 'Titulo actualizado',
    // Solo se actualizan los campos que se pasan
    // Los demás quedan igual
  }
});

// Actualizar múltiples registros
const { count } = await prisma.sesion.updateMany({
  where: { materia: 'General' },
  data: { materia: 'Sin materia asignada' }
});
console.log(`Actualizadas: ${count} sesiones`);
```

#### Eliminar registros

```javascript
// Eliminar uno
await prisma.sesion.delete({ where: { id: 1 } });

// Eliminar múltiples
const { count } = await prisma.sesion.deleteMany({
  where: { completada: true }
});
```

#### Transacciones

Cuando necesitas que varias operaciones sean atómicas (todas o ninguna):

```javascript
const [usuario, sesion] = await prisma.$transaction([
  prisma.usuario.create({ data: { nombre: 'Test', email: 't@t.com', password: 'x' } }),
  prisma.sesion.create({ data: { titulo: 'Test', autorId: 1 } })
]);
// Si alguna falla, ninguna se guarda
```

---

## PASO 15 — QA Funcional: Checklist completo con Thunder Client

### Configuración de Thunder Client para el proyecto

En VS Code con Thunder Client instalado:

1. Crear colección "StudySync API"
2. Crear variable de colección: `base_url = http://localhost:3000`
3. Después del login, guardar el token en variable `token`

### BLOQUE A — Autenticación

#### A1 — Registro exitoso
```
POST {{base_url}}/auth/register
Body (JSON):
{
  "nombre": "Jimmy Requena",
  "email": "jimmy@upds.edu.bo",
  "password": "progIV2026"
}

Resultado esperado: 201 Created
{
  "ok": true,
  "mensaje": "Usuario registrado exitosamente",
  "usuario": {
    "id": 1,
    "nombre": "Jimmy Requena",
    "email": "jimmy@upds.edu.bo",
    "creadoEn": "2026-05-26T..."
  }
}

Verificar: NO aparece el campo "password" en la respuesta
```

#### A2 — Email duplicado
```
POST {{base_url}}/auth/register (mismo email)

Resultado esperado: 409 Conflict
{ "error": "El email jimmy@upds.edu.bo ya está registrado" }
```

#### A3 — Login correcto → guardar token
```
POST {{base_url}}/auth/login
Body (JSON):
{
  "email": "jimmy@upds.edu.bo",
  "password": "progIV2026"
}

Resultado esperado: 200 OK
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": { "id": 1, "nombre": "Jimmy Requena", "email": "..." }
}

Acción: copiar el token y guardarlo en la variable {{token}} de Thunder Client
```

#### A4 — Password incorrecto
```
POST {{base_url}}/auth/login
Body: { "email": "jimmy@upds.edu.bo", "password": "incorrecto" }

Resultado esperado: 401 Unauthorized
{ "error": "Credenciales inválidas" }

Nota pedagógica: El mensaje es GENÉRICO — no dice "password incorrecto" ni "email no encontrado".
Si dijera cuál campo falla, un atacante podría saber qué emails están registrados (enumeración de usuarios).
```

#### A5 — Validación de campos faltantes
```
POST {{base_url}}/auth/register
Body: { "email": "solo@email.com" }   ← sin nombre ni password

Resultado esperado: 400 Bad Request
{ "error": "Los campos nombre, email y password son obligatorios" }
```

### BLOQUE B — Protección de rutas JWT

#### B1 — POST sin token
```
POST {{base_url}}/api/sesiones
Body: { "titulo": "Sin token" }
SIN header Authorization

Resultado esperado: 401 Unauthorized
{
  "error": "Acceso denegado. Token no proporcionado.",
  "hint": "Incluye el header: Authorization: Bearer <tu_token>"
}
```

#### B2 — Token inválido (modificado)
```
POST {{base_url}}/api/sesiones
Headers: Authorization: Bearer tokencompletamenteinvalido
Body: { "titulo": "Token falso" }

Resultado esperado: 401 Unauthorized
{ "error": "Token inválido." }
```

#### B3 — Token expirado (simulación)
```
Para probar: cambiar JWT_EXPIRES_IN=5s en .env, esperar 6 segundos
Resultado esperado: 401 Unauthorized
{ "error": "Token expirado. Inicia sesión de nuevo." }
Restaurar: JWT_EXPIRES_IN=1h
```

#### B4 — GET público (sin token)
```
GET {{base_url}}/api/sesiones
SIN ningún header

Resultado esperado: 200 OK
{ "ok": true, "total": N, "datos": [...] }

Explicación: Los GET son públicos — cualquiera puede ver las sesiones
```

### BLOQUE C — CRUD con Prisma + Supabase

#### C1 — Crear sesión
```
POST {{base_url}}/api/sesiones
Headers: Authorization: Bearer {{token}}
Body:
{
  "titulo": "Redis Pub/Sub en tiempo real",
  "materia": "Programacion IV",
  "descripcion": "Patrón publicador-suscriptor con Upstash e ioredis",
  "fechaHora": "2026-06-01T10:00:00.000Z"
}

Resultado esperado: 201 Created
{
  "id": 1,
  "titulo": "Redis Pub/Sub en tiempo real",
  "materia": "Programacion IV",
  "completada": false,
  "autor": { "id": 1, "nombre": "Jimmy Requena", "email": "..." }
}

Verificar en Supabase Table Editor: la sesión aparece en la tabla "sesiones"
```

#### C2 — Listar sesiones (con datos de Supabase)
```
GET {{base_url}}/api/sesiones

Resultado esperado: 200 OK
{
  "ok": true,
  "total": 1,
  "datos": [{ "id": 1, "titulo": "...", "autor": {...} }]
}
```

#### C3 — Obtener sesión por ID
```
GET {{base_url}}/api/sesiones/1

Resultado esperado: 200 OK — la sesión completa con el autor
```

#### C4 — Actualizar sesión
```
PUT {{base_url}}/api/sesiones/1
Headers: Authorization: Bearer {{token}}
Body: { "completada": true, "titulo": "Redis Pub/Sub — COMPLETADO" }

Resultado esperado: 200 OK con los campos actualizados
Verificar en Supabase: "completada" = true en la tabla
```

#### C5 — Eliminar sesión
```
DELETE {{base_url}}/api/sesiones/1
Headers: Authorization: Bearer {{token}}

Resultado esperado: 200 OK
{ "ok": true, "mensaje": "Sesión 1 eliminada correctamente" }

Verificar en Supabase: la fila desapareció de la tabla
```

#### C6 — Sesión no encontrada
```
GET {{base_url}}/api/sesiones/999

Resultado esperado: 404 Not Found
{ "error": "Sesión 999 no encontrada" }
```

### BLOQUE D — Tiempo real con Redis + Socket.io

#### D1 — Verificar eventos en el frontend

1. Abrir `http://localhost:3000/login.html` en el navegador
2. Iniciar sesión con las credenciales registradas
3. Verificar que el badge muestra **"🟢 Conectado"**
4. Abrir una segunda pestaña con `http://localhost:3000`

#### D2 — Crear sesión y ver el evento

1. En la segunda pestaña, crear una sesión desde el formulario
2. En **ambas pestañas**: el feed de eventos debe mostrar el evento instantáneamente
3. En la consola del servidor: `[Redis] Evento publicado: sesion:creada → ...`

#### D3 — Verificar el flujo Redis Pub/Sub

```
Cliente (navegador) → POST /api/sesiones
                     ↓
sesionesController.crear()
                     ↓
pub.publish('study:sesion:creada', datos)
                     ↓
Redis/Upstash → distribuye a todos los suscriptores
                     ↓
subscribers/notificaciones.js → recibe el evento
                     ↓
io.emit('nuevo-evento', datos)
                     ↓
Todos los navegadores conectados → muestran el evento
```

### BLOQUE E — Swagger UI con autenticación

1. Abrir `http://localhost:3000/api-docs`
2. Verificar que aparecen 2 secciones: **Auth** y **Sesiones**
3. Expandir **POST /auth/login**, hacer clic en **Try it out**
4. Ingresar credenciales, ejecutar
5. Copiar el `token` de la respuesta
6. Hacer clic en el botón **Authorize** (candado) en la parte superior derecha
7. Pegar el token en el campo **BearerAuth** (sin escribir "Bearer")
8. Hacer clic en **Authorize** → **Close**
9. Probar **POST /api/sesiones** desde Swagger → debe funcionar con el token

### BLOQUE F — Headers de seguridad Helmet

Abrir DevTools del navegador (F12) → pestaña Network → clic en cualquier request → Headers de respuesta. Verificar:

| Header | Valor esperado | Qué hace |
|--------|---------------|---------|
| `x-frame-options` | `SAMEORIGIN` | Evita clickjacking |
| `x-content-type-options` | `nosniff` | Evita MIME sniffing |
| `cross-origin-opener-policy` | `same-origin` | Aísla el contexto de navegación |
| `referrer-policy` | `no-referrer` | No filtra URLs como Referer |

### BLOQUE G — Frontend completo

1. Abrir `http://localhost:3000/register.html` → registrar un nuevo usuario
2. El formulario redirige automáticamente a `/login.html`
3. Iniciar sesión → redirige al panel `/`
4. El panel muestra las sesiones de Supabase (no del array en memoria)
5. Crear una sesión desde el formulario → aparece en la lista inmediatamente
6. El feed de eventos muestra el evento en tiempo real
7. Hacer clic en "Eliminar" en una sesión → desaparece de la lista y de Supabase
8. Hacer clic en "Salir" → limpia el sessionStorage y redirige al login

---

## PASO 16 — Deploy Final en Render

### Variables de entorno en Render (obligatorio)

En https://render.com → Dashboard → Tu servicio → Environment → Add Environment Variable:

| Variable | Valor | Notas |
|----------|-------|-------|
| `NODE_ENV` | `production` | Activa modo producción |
| `JWT_SECRET` | `(tu secreto seguro)` | Cambiar en producción |
| `JWT_EXPIRES_IN` | `1h` | Duración del token |
| `REDIS_URL` | `rediss://...@upstash.io:6379` | Desde Upstash dashboard |
| `DATABASE_URL` | `postgresql://...pooler...:6543/postgres` | Desde Supabase Settings |
| `DIRECT_URL` | `postgresql://...pooler...:5432/postgres` | Desde Supabase Settings |

**IMPORTANTE:** NO agregar `PORT` — Render lo asigna automáticamente.

### Script de build en package.json

El script `build` se ejecuta automáticamente antes del `start` en Render:

```json
"scripts": {
  "start": "node src/server.js",
  "build": "prisma generate",
  "dev": "nodemon src/server.js"
}
```

Render ejecuta: `npm run build` → `prisma generate` (compila el cliente Prisma)
Luego: `npm start` → `node src/server.js`

### Verificar el deploy

Después de hacer push a GitHub, Render despliega automáticamente. Verificar:

```bash
# Endpoint raíz
curl https://studysync-api-XXXXX.onrender.com/

# GET sesiones (público)
curl https://studysync-api-XXXXX.onrender.com/api/sesiones

# La UI de Swagger
# Abrir en navegador: https://studysync-api-XXXXX.onrender.com/api-docs
```

**Nota sobre cold starts:** El tier gratuito de Render pausa el servicio tras 15 minutos de inactividad. El primer request tarda 50-60 segundos en despertar. Es normal.

---

## PASO 17 — Siguiente nivel: AWS Real

### Cuenta gratuita de AWS (Free Tier)

AWS ofrece 12 meses de capa gratuita más algunos servicios siempre gratis:

| Servicio | Free Tier | Suficiente para... |
|---------|-----------|-------------------|
| S3 | 5 GB almacenamiento, 20k GET, 2k PUT/mes | Adjuntos del proyecto |
| DynamoDB | 25 GB, 25 WCU/RCU siempre gratis | Eventos y logs |
| Lambda | 1M invocaciones/mes siempre gratis | Functions sin servidor |
| EC2 | 750 horas/mes t2.micro (12 meses) | Servidor alternativo a Render |
| SSM Parameter Store | Parámetros estándar: gratis | Configuración centralizada |
| CloudFormation | Gratis (pagas solo los recursos) | IaC |

### Migración de LocalStack a AWS real

El template de CloudFormation es **idéntico**. Solo cambia el comando:

```bash
# Con LocalStack (desarrollo local)
awslocal cloudformation create-stack \
  --stack-name studysync-api \
  --template-body file://cloudformation/template.yaml \
  --parameters ParameterKey=Ambiente,ParameterValue=development

# Con AWS real (producción)
aws cloudformation create-stack \
  --stack-name studysync-api \
  --template-body file://cloudformation/template.yaml \
  --parameters ParameterKey=Ambiente,ParameterValue=production \
  --region us-east-1
```

### Paso a paso: Configurar AWS CLI real

#### 1. Crear cuenta AWS
- Ir a https://aws.amazon.com → Create an AWS Account
- Requiere tarjeta de crédito (no se cobra si se mantiene en el Free Tier)
- Activar MFA en la cuenta root inmediatamente (seguridad crítica)

#### 2. Crear usuario IAM con permisos mínimos
```
IAM → Users → Create User → nombre: studysync-deploy
Permissions:
  - AmazonS3FullAccess
  - AmazonDynamoDBFullAccess
  - AmazonSSMFullAccess
  - AWSCloudFormationFullAccess
Generate Access Key → tipo: CLI
Guardar Access Key ID y Secret Access Key
```

#### 3. Configurar AWS CLI
```bash
aws configure
# AWS Access Key ID: AKIAIOSFODNN7EXAMPLE
# AWS Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
# Default region name: us-east-1
# Default output format: json
```

#### 4. Verificar que funciona
```bash
aws sts get-caller-identity
# Debe mostrar tu Account ID y el ARN del usuario IAM
```

#### 5. Desplegar el stack en AWS real
```bash
aws cloudformation create-stack \
  --stack-name studysync-api-prod \
  --template-body file://cloudformation/template.yaml \
  --parameters \
    ParameterKey=Ambiente,ParameterValue=production \
    ParameterKey=ApiUrl,ParameterValue=https://studysync-api-XXXXX.onrender.com

# Verificar estado
aws cloudformation describe-stacks \
  --stack-name studysync-api-prod \
  --query "Stacks[0].StackStatus"

# Ver recursos creados
aws cloudformation describe-stack-resources \
  --stack-name studysync-api-prod \
  --output table
```

#### 6. Subir un archivo real a S3
```bash
# Subir el template como documentación
aws s3 cp cloudformation/template.yaml \
  s3://studysync-adjuntos-production/docs/template.yaml

# Verificar
aws s3 ls s3://studysync-adjuntos-production/ --recursive
```

### Redis Pub/Sub en producción con Upstash

Upstash Redis ya está configurado y funcionando en producción en el proyecto. El flujo real es:

```
Render (Node.js) ──pub.publish()──► Upstash Redis (cloud)
                                           │
                                    sub.on('pmessage')
                                           │
Render (Node.js) ◄──io.emit()────── subscribers/notificaciones.js
                                           │
                               Todos los navegadores conectados
```

**Para ver Redis en producción:**
1. Ir al dashboard de Upstash → tu base de datos Redis
2. Ir a la pestaña **Data Browser** → ver los datos en tiempo real
3. Usar la consola integrada de Upstash para ejecutar comandos Redis directamente

**Ver mensajes publicados en Upstash CLI:**
```bash
# En la consola de Upstash:
SUBSCRIBE study:sesion:creada
# Al crear una sesión desde el frontend, el mensaje aparecerá aquí
```

### DynamoDB real para registrar eventos de producción

Agregar al proyecto la integración real con DynamoDB para registrar cada sesión creada:

```javascript
// src/services/eventLogger.js
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { randomUUID } = require('crypto');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE = process.env.DYNAMO_TABLE || 'studysync-eventos-production';

async function logEvent(tipo, payload) {
  const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
  
  try {
    await dynamo.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        eventId:   { S: randomUUID() },
        timestamp: { S: new Date().toISOString() },
        tipo:      { S: tipo },
        payload:   { S: JSON.stringify(payload) },
        expiresAt: { N: String(expiresAt),  }
      }
    }));
  } catch (err) {
    console.error('[DynamoDB] No se pudo registrar evento:', err.message);
    // No lanzar el error — el logging no debe romper el flujo principal
  }
}

module.exports = { logEvent };
```

Integrar en el controlador:
```javascript
// En sesionesController.js, en la función crear():
const { logEvent } = require('../services/eventLogger');

// Después de crear la sesión en Prisma:
await logEvent('sesion:creada', { 
  sesionId: nuevaSesion.id, 
  titulo: nuevaSesion.titulo,
  autorId: nuevaSesion.autorId 
});
```

Variables de entorno adicionales para AWS real:
```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/...
DYNAMO_TABLE=studysync-eventos-production
```

### Comandos de instalación para AWS SDK v3
```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/client-s3 @aws-sdk/client-ssm
```

---

## PASO 18 — Alternativa: Microsoft Azure

Para estudiantes que prefieran Microsoft Azure (compatible con créditos estudiantiles de Azure for Students):

| AWS | Azure equivalente | Descripción |
|-----|------------------|-------------|
| S3 | Azure Blob Storage | Almacenamiento de archivos |
| DynamoDB | Azure Cosmos DB (Table API) | Base de datos NoSQL |
| SSM Parameter Store | Azure App Configuration | Configuración centralizada |
| CloudFormation | Azure ARM Templates / Bicep | Infrastructure as Code |
| Lambda | Azure Functions | Funciones serverless |
| EC2 | Azure App Service / VMs | Servidores virtuales |
| Elastic Beanstalk | Azure App Service | PaaS para apps web |

### IaC en Azure: Bicep (recomendado sobre ARM Templates)

Bicep es el lenguaje de IaC nativo de Azure, más simple que CloudFormation YAML:

```bicep
// cloudformation/azure-studysync.bicep
param ambiente string = 'development'
param location string = resourceGroup().location

// Cuenta de Storage (equivalente a S3)
resource storageAccount 'Microsoft.Storage/storageAccounts@2021-09-01' = {
  name: 'studysync${ambiente}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}

// Contenedor (equivalente a un bucket S3)
resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2021-09-01' = {
  name: '${storageAccount.name}/default/adjuntos'
}

// Cosmos DB (equivalente a DynamoDB)
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2021-10-15' = {
  name: 'studysync-cosmos-${ambiente}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [{ locationName: location }]
  }
}
```

### Desplegar con Azure CLI
```bash
# Instalar Azure CLI
# Windows: winget install Microsoft.AzureCLI

# Iniciar sesión
az login

# Crear grupo de recursos
az group create --name studysync-rg --location eastus

# Desplegar template Bicep
az deployment group create \
  --resource-group studysync-rg \
  --template-file cloudformation/azure-studysync.bicep \
  --parameters ambiente=production
```

---

## Proyectos de extensión para los alumnos

### Nivel 1 — Mejoras al proyecto actual

1. **Paginación en GET /api/sesiones**: agregar `?page=1&limit=10` con `prisma.sesion.findMany({ skip, take })`
2. **Filtros**: `?materia=ProgIV&completada=false`
3. **Upload real de archivos**: usar `multer` para subir PDFs a S3/LocalStack
4. **Notificaciones push**: cuando alguien crea una sesión, enviar email con Nodemailer
5. **Refresh tokens**: implementar tokens de refresh para no cerrar sesión cada hora

### Nivel 2 — Arquitectura de microservicios

1. **Separar en servicios**: auth-service, sessions-service, notification-service
2. **API Gateway**: usar un reverse proxy (nginx) que enruta a cada microservicio
3. **Message queue**: reemplazar Redis Pub/Sub por SQS/RabbitMQ para mayor durabilidad
4. **Service discovery**: los servicios se registran en un registro central

### Nivel 3 — DevOps completo

1. **GitHub Actions CI/CD**: ejecutar tests automáticamente en cada push
2. **Docker Compose**: levantar toda la infraestructura local con un solo comando
3. **Terraform**: alternativa a CloudFormation compatible con AWS, Azure y GCP
4. **Monitoring**: integrar Datadog o New Relic para métricas en producción

### Ideas de proyectos finales

- **Sistema de reservas universitarias**: salones, laboratorios, equipos
- **Plataforma de tutorías**: estudiantes ofrecen tutorías, otros se inscriben
- **Seguimiento de proyectos**: tablero Kanban con tiempo real (como Trello)
- **API de biblioteca**: préstamos, devoluciones, notificaciones por vencimiento
- **Sistema de asistencia**: QR code → registro en DynamoDB → reporte en PDF a S3

---

## Resumen del stack completo de StudySync

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (público/)                          │
│  index.html  login.html  register.html  app.css                  │
│  Vanilla JS + Socket.io client + sessionStorage para JWT         │
└───────────────────────────┬─────────────────────────────────────┘
                             │ HTTP + WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│                  EXPRESS API (src/)                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Helmet  │  │   CORS   │  │ Rate Limiting│  │ JWT Auth   │  │
│  └──────────┘  └──────────┘  └──────────────┘  └────────────┘  │
│                                                                   │
│  Routes:  /auth/register  /auth/login  /api/sesiones             │
│  Middleware: autenticar.js → verifica JWT antes del controlador   │
└──────────┬────────────────────────┬────────────────────────────-┘
           │                        │
┌──────────▼────────┐   ┌───────────▼──────────────────────────┐
│  Upstash Redis    │   │  Supabase PostgreSQL                  │
│  pub.publish()    │   │  prisma.usuario.findUnique()          │
│  sub.subscribe()  │   │  prisma.sesion.create()               │
│  Pub/Sub pattern  │   │  prisma.sesion.findMany()             │
└──────────┬────────┘   └──────────────────────────────────────┘
           │
┌──────────▼────────┐
│  Socket.io        │
│  io.emit() → todos│
│  los clientes WS  │
└───────────────────┘
```

---

## Checklist final antes de entregar el proyecto

- [ ] `git status` no muestra archivos sensibles (`.env`) en el staging
- [ ] `.gitignore` incluye `.env`, `node_modules/`, `*.log`
- [ ] Las variables de entorno están configuradas en Render (no `PORT`)
- [ ] `npm run build` ejecuta `prisma generate` sin errores
- [ ] `GET /api/sesiones` en producción devuelve datos de Supabase
- [ ] `POST /auth/register` en producción crea usuario en Supabase
- [ ] `/api-docs` en producción carga la UI de Swagger
- [ ] El badge de WebSocket en el frontend muestra "🟢 Conectado"
- [ ] Al crear una sesión, el feed de eventos se actualiza en tiempo real
- [ ] Los headers de Helmet (`X-Frame-Options`, etc.) están presentes en las respuestas
- [ ] `BUGS.md` documenta al menos 3 bugs encontrados y resueltos

---

*Guía preparada para Programación IV — UPDS 2026. Repositorio: https://github.com/bolivianotech/studysync-api*
