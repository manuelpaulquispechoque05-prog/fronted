# StudySync API

API REST para coordinar grupos de estudio universitarios, construida como guía pedagógica para la asignatura **Programación IV** — UPDS 2026.

**Producción:** https://studysync-api-a5o9.onrender.com  
**Documentación:** https://studysync-api-a5o9.onrender.com/api-docs  
**Frontend:** https://studysync-api-a5o9.onrender.com

---

## Stack tecnológico

| Capa | Tecnología | Propósito |
|------|-----------|-----------|
| Runtime | Node.js 20+ | Servidor JavaScript |
| Framework | Express v5 | Rutas y middlewares |
| Base de datos | PostgreSQL (Supabase) | Persistencia de datos |
| ORM | Prisma 6 | Acceso type-safe a la BD |
| Caché / Mensajería | Redis (Upstash) | Pub/Sub en tiempo real |
| WebSockets | Socket.io | Notificaciones al frontend |
| Autenticación | JWT + bcryptjs | Login seguro sin sesiones |
| Seguridad HTTP | Helmet | Headers de seguridad |
| CORS | cors | Control de origen cruzado |
| Rate Limiting | express-rate-limit | 100 req/15min por IP |
| Documentación | Swagger / OpenAPI 3.0 | UI interactiva de la API |
| IaC (local) | LocalStack + CloudFormation | Simulación de AWS |
| Deploy | Render.com | Hosting gratuito |

---

## Arquitectura

```
┌─────────────────────────────────────────┐
│  Frontend  (public/)                    │
│  index.html · login.html · register.html│
│  Vanilla JS + Socket.io client + JWT    │
└───────────────┬─────────────────────────┘
                │ HTTP + WebSocket
┌───────────────▼─────────────────────────┐
│  Express API  (src/)                    │
│  Helmet → CORS → Rate Limit → JWT Auth  │
│  /auth/register   /auth/login           │
│  /api/sesiones (CRUD protegido)         │
└─────────┬───────────────┬───────────────┘
          │               │
┌─────────▼──────┐  ┌─────▼──────────────┐
│  Upstash Redis │  │  Supabase          │
│  Pub/Sub       │  │  PostgreSQL        │
│  pub.publish() │  │  Prisma ORM        │
│  sub.subscribe │  │  usuarios + sesion │
└─────────┬──────┘  └────────────────────┘
          │
┌─────────▼──────┐
│  Socket.io     │
│  io.emit() →   │
│  todos los WS  │
└────────────────┘
```

---

## Endpoints

### Autenticación (públicos)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/register` | Crear cuenta nueva |
| POST | `/auth/login` | Iniciar sesión → devuelve JWT |

### Sesiones de estudio

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/sesiones` | No | Listar todas las sesiones |
| GET | `/api/sesiones/:id` | No | Obtener una sesión |
| POST | `/api/sesiones` | JWT | Crear nueva sesión |
| PUT | `/api/sesiones/:id` | JWT | Actualizar sesión |
| DELETE | `/api/sesiones/:id` | JWT | Eliminar sesión |

---

## Instalación local

```bash
# Clonar el repositorio
git clone https://github.com/bolivianotech/studysync-api.git
cd studysync-api

# Instalar dependencias
npm install

# Crear el archivo .env (ver sección de variables)
cp .env.example .env   # editar con tus credenciales

# Generar el cliente Prisma
npm run build

# Sincronizar el schema con Supabase (solo primera vez)
npx prisma db push

# Iniciar en desarrollo
npm run dev
```

## Variables de entorno requeridas

Crear el archivo `.env` en la raíz (nunca subir a Git):

```env
PORT=3000
NODE_ENV=development

# Redis — obtener en https://upstash.com
REDIS_URL=rediss://default:TOKEN@host.upstash.io:6379

# Supabase — obtener en https://supabase.com → Settings → Database
DATABASE_URL=postgresql://postgres.PROJECT:PASSWORD@aws-X-region.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.PROJECT:PASSWORD@aws-X-region.pooler.supabase.com:5432/postgres

# JWT
JWT_SECRET=cambia_esto_en_produccion_minimo_32_caracteres
JWT_EXPIRES_IN=1h
```

---

## Infraestructura como código (LocalStack)

Simula los recursos AWS localmente con Docker:

```bash
# Levantar LocalStack
docker run -d -p 4566:4566 localstack/localstack

# Desplegar el stack de CloudFormation
awslocal cloudformation create-stack \
  --stack-name studysync-api \
  --template-body file://cloudformation/template.yaml \
  --parameters ParameterKey=Ambiente,ParameterValue=development

# Verificar recursos creados (S3 + DynamoDB + SSM)
awslocal cloudformation describe-stack-resources \
  --stack-name studysync-api --output table
```

El template crea:
- **S3 Bucket** `studysync-adjuntos-development` — para adjuntos de sesiones
- **DynamoDB Table** `studysync-eventos-development` — para registro de eventos
- **SSM Parameter** `/studysync/development/api-url` — configuración centralizada

---

## Estructura del proyecto

```
studysync-api/
├── cloudformation/
│   ├── template.yaml          # IaC: S3 + DynamoDB + SSM
│   └── evento-prueba.json     # Dato de prueba para DynamoDB
├── docs/
│   └── StudySync_Guia_Final_IaC_Prisma_Produccion.md
├── prisma/
│   └── schema.prisma          # Modelos Usuario y Sesion
├── public/
│   ├── index.html             # Panel principal (requiere login)
│   ├── login.html             # Formulario de login
│   ├── register.html          # Formulario de registro
│   └── app.css                # Estilos globales (tema oscuro)
├── src/
│   ├── app.js                 # Express + middlewares globales
│   ├── server.js              # HTTP server + Socket.io
│   ├── db.js                  # Singleton PrismaClient
│   ├── controllers/
│   │   └── sesionesController.js
│   ├── middlewares/
│   │   └── autenticar.js      # Verificación de JWT
│   ├── redis/
│   │   └── client.js          # Conexiones pub y sub de Redis
│   ├── routes/
│   │   ├── auth.js            # POST /auth/register y /auth/login
│   │   └── sesiones.js        # CRUD /api/sesiones
│   ├── subscribers/
│   │   └── notificaciones.js  # Redis Pub/Sub → Socket.io
│   └── swagger/
│       └── config.js          # Especificación OpenAPI 3.0
├── BUGS.md                    # Registro de defectos (IEEE 829)
├── .env                       # Secretos locales (NO en Git)
├── .gitignore
└── package.json
```

---

## Registro de bugs

Ver [BUGS.md](./BUGS.md) para el historial completo de defectos detectados y resueltos durante el desarrollo.

---

*Programación IV — UPDS 2026 · M.Sc. Jimmy Nataniel Requena Llorentty*
