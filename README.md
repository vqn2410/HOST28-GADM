# SGAE — Sistema de Gestión Administrativa Escolar
**E.E.S. N° 28 "Gustavo Cerati" · Distrito de Lanús · Provincia de Buenos Aires**

Sistema web modular para la gestión administrativa escolar: base única y permanente de estudiantes, ciclos lectivos independientes, cursos/divisiones/turnos, matrícula anual con trazabilidad, migración entre ciclos, emisión individual y masiva de certificados A4 en PDF con códigos QR y portal público de validación documental (Ley 25.326).

---

## 1. Integración con HOST28_EF (Base de Datos Compartida)

SGAE se conecta directamente al proyecto Firebase Firestore **`partesees28`** ya utilizado por **HOST28_EF**:

- **Fuente única de estudiantes (`alumnos/{dni}`)**:
  - Preserva íntegramente todos los campos de Educación Física (`dni`, `nombre`, `cursoOrigen`, `turno`, `cursoEF`, `noCursaEF`, `recursaCursos`, `fechaDeBaja`).
  - Agrega campos administrativos de forma **aditiva** (`{ merge: true }`): `id`, `apellido`, `nombres`, `fechaNacimiento`, `anioIngreso`, `estadoInstitucional`, `observaciones`, `createdAt`, `updatedAt`.
  - Nunca elimina registros históricos ni duplica estudiantes.
- **Autenticación y RBAC independiente (`usuarios/{dni}` + `sgae_users/{dni}`)**:
  - Valida credenciales sobre `usuarios/{dni}`, pero **no otorga acceso automático** a usuarios de Educación Física (por ejemplo, Docentes).
  - Los roles de SGAE (`admin`, `conduccion`, `secretaria`, `preceptoria`, `consulta`) se administran exclusivamente en `sgae_users/{dni}`.
- **Aislamiento de nuevas colecciones**: todas las colecciones propias de SGAE utilizan el prefijo `sgae_` (`sgae_academic_years`, `sgae_shifts`, `sgae_courses`, `sgae_enrollments`, `sgae_enrollment_movements`, `sgae_certificates`, `sgae_certificate_templates`, `sgae_certificate_counters`, `sgae_settings`, `sgae_users`, `sgae_audit_logs`).

---

## 2. Paso Obligatorio en Firebase Console (Reglas de Firestore)

El proyecto `partesees28` actualmente solo autoriza las 8 colecciones originales de `HOST28_EF`. Para habilitar las colecciones `sgae_*` sin afectar a `HOST28_EF`:

1. Abrí **Firebase Console → Proyecto `partesees28` → Firestore Database → Reglas (Rules)**.
2. Copiá el contenido completo del archivo [`firestore.rules`](./firestore.rules) de este repositorio.
3. Hacé clic en **Publicar (Publish)**.

---

## 3. Instalación y Desarrollo Local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Completar .env.local con las claves cliente del proyecto partesees28

# 3. (Recomendado) Generar respaldo local antes de operar en producción
node --env-file=.env.local scripts/backup-firestore.mjs

# 4. Iniciar servidor de desarrollo
npm run dev
```

### Pruebas y Build de Producción

```bash
# Ejecutar suite de pruebas unitarias e integración
npm test

# Compilar verificación TypeScript + build de producción
npm run build
```

---

## 4. Despliegue en Vercel

1. Conectá el repositorio en Vercel (Framework Preset: **Vite**).
2. Configurá las variables de entorno en **Vercel → Project Settings → Environment Variables**:
   - **Públicas (cliente)**: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_PUBLIC_APP_URL` (ej. `https://tu-dominio.vercel.app`), `VITE_BACKEND_MODE=api`.
   - **Privadas (solo servidor, sin prefijo `VITE_`)**: `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON de Service Account de Firebase Admin para el endpoint seguro `/api/certificates/validate`).
3. El archivo [`vercel.json`](./vercel.json) ya incluye rewrites SPA, headers de seguridad y `X-Robots-Tag: noindex, nofollow` para `/validar/*`.
