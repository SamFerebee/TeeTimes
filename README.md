# Tee Time Finder

Local web app for searching public golf tee times across configured courses.

## Run This App

You only need to do the install step the first time.

### Windows

1. Install Node.js from https://nodejs.org if it is not already installed.
2. Open this folder in Windows Terminal or PowerShell.
3. Run:

```powershell
npm install
npm run dev
```

4. Open this in your browser:

```text
http://localhost:5173
```

Leave the terminal window open while using the app.

### Mac

1. Install Node.js from https://nodejs.org if it is not already installed.
2. Open this folder in Terminal.
3. Run:

```bash
npm install
npm run dev
```

4. Open this in your browser:

```text
http://localhost:5173
```

Leave the Terminal window open while using the app.

### After The First Time

After the first install, you only need:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Requirements

- Node.js
- npm

## First-Time Setup

Install dependencies from the project folder:

Windows PowerShell:

```powershell
npm install
```

macOS Terminal:

```bash
npm install
```

## Run Locally

Start both the API server and the browser app:

Windows PowerShell:

```powershell
npm run dev
```

macOS Terminal:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

The backend API runs at:

```text
http://localhost:3001
```

## Useful Commands

Run lint checks:

Windows PowerShell:

```powershell
npm run lint
```

macOS Terminal:

```bash
npm run lint
```

Build the app:

Windows PowerShell:

```powershell
npm run build
```

macOS Terminal:

```bash
npm run build
```

## How Data Is Stored

There is no database right now.

- Courses are stored in `data/courses.json`.
- Tee-time results are cached in server memory for 60 seconds.
- UI filters are stored in browser/app state and reset on refresh.

## Adding Courses

In the app, click the `+` button near the top.

Paste the course booking URL, then click `Check`.

If the app recognizes the booking site, it will fill in live tee-time support automatically. Supported automatic setup currently works for:

- ForeUp
- TeeItUp
- GolfNow

If the app cannot recognize the booking site, the course can still be saved, but it may not show live tee times until a provider is added later.

## Course Providers

Provider adapters live in `server/providers`.

Current provider types include:

- `foreup`
- `teeitup`
- `golfnow`
- `protected`
- `manual`

Notes about tricky providers, including Bergen County and Galloping Hill, are in:

```text
docs/provider-notes.md
```

## Main Files

- `src/App.tsx`: frontend app and filters
- `src/App.css`: app styling
- `server/index.ts`: Express API
- `server/providers`: tee-time provider adapters
- `data/courses.json`: configured courses
