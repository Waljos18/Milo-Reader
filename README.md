# MiloReader

Lector personal de EPUB/PDF para Windows. Proyecto personal, un solo usuario, stack elegido
para costo $0 y cero fricción de instalación.

## Stack

- **Electron + React + TypeScript** (electron-vite)
- **epub.js** para render de EPUB (paginación, TOC, CFI para marcadores/subrayados)
- **pdf.js** para render de PDF
- **sql.js** (SQLite en WASM) para no requerir compilación nativa (evita instalar Visual Studio
  Build Tools que sí exige `better-sqlite3`)
- **Tailwind CSS v4**
- **react-router-dom** (HashRouter, requerido en Electron)
- TTS vía Web Speech API del navegador (voces nativas de Windows, sin librería extra)
- Traducción/diccionario: APIs gratuitas (MyMemory para traducir, dictionaryapi.dev con fallback a
  Wiktionary para definiciones)
- Sincronización entre equipos: sin backend. La carpeta de biblioteca (elegible en Ajustes) debe
  vivir dentro de OneDrive/Google Drive; ellos sincronizan el `library.db` y los libros.

## Estructura

```
src/
  main/            proceso principal de Electron
    db/            sql.js: schema.sql, database.ts (abrir/persistir), repositories.ts
    ipc/           handlers.ts registra los canales IPC
    config.ts      config.json en userData (solo guarda la ruta de la carpeta de biblioteca)
    library.ts      importar/copiar archivos de libros a la carpeta de biblioteca
  preload/         puente contextBridge (window.api.*)
  renderer/src/
    views/         Biblioteca, Lector, Anotaciones, Estadísticas, Ajustes
    layouts/        AppLayout (sidebar + rutas)
    context/        ThemeContext (claro/oscuro/sistema)
  shared/types.ts  tipos compartidos entre main/preload/renderer
```

## Estado actual

Funcional: elegir carpeta de biblioteca, agregar libros (EPUB/PDF), listarlos con portadas,
lector EPUB/PDF, progreso, subrayados/notas, marcadores, tema de interfaz (claro/oscuro/sistema)
separado del tema de lectura (claro/oscuro), texto a voz (TTS vía Web Speech API), traducción y
diccionario de definiciones al seleccionar texto, panel de índice/páginas, buscador de texto en
el lector y estadísticas de lectura (tiempo total, sesiones, avance por libro, últimos 7 días).

Pendiente (siguientes pasos): catálogo de libros gratuitos (Gutendex), tipografía del lector,
metadata real de libros (autor/título desde el EPUB/PDF en vez del nombre del archivo).

## Desarrollo

```bash
npm install
npm run dev
```

## Build (Windows)

```bash
npm run build:win
```

No hay certificado de firma de código configurado (no es necesario para uso personal); Windows
SmartScreen puede mostrar una advertencia la primera vez — "Más información → Ejecutar de todas
formas".
