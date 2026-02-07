# Immediart

An Instagram-style art discovery app that lets you explore The Metropolitan Museum of Art's collection. Scroll through curated artworks, tap hashtags and artist names to discover related pieces, and view detailed artwork information in a modal overlay.

**Live Site:** [immediart.netlify.app](https://immediart.netlify.app)

## Features

- Infinite scroll feed of public domain artworks
- Click artist names to see more works by that artist
- Click hashtags to discover artworks with similar themes
- Modal view with detailed artwork metadata
- Responsive mobile-first design

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/robtl400/immediart.git
cd immediart

# Install dependencies
npm install
```

### Run Locally

```bash
# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview  # Preview the production build locally
```

## API

This app uses **The Metropolitan Museum of Art Collection API**.

**Base URL:** `https://collectionapi.metmuseum.org/public/collection/v1`

### Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `GET /search?hasImages=true&q={query}` | Search for artworks by keyword |
| `GET /search?hasImages=true&artistOrCulture=true&q={artist}` | Search by artist name |
| `GET /objects/{objectID}` | Get detailed artwork data |

**Documentation:** [metmuseum.github.io](https://metmuseum.github.io/)

**Rate Limit:** 80 requests/second (the app implements parallel fetching with cooldowns to stay within limits)

## Tech Stack

- React 19
- React Router 7
- Vite
- Netlify (hosting)
