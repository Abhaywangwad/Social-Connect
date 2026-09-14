# Social-Connect

A modern web application built with React and Vite featuring a responsive user authentication system.

## Features

- **Modern UI / UX**: Premium dark glassmorphic design system with ambient glow effects, responsive card layout, and fluid transitions.
- **Client-Side Validation**:
  - Real-time inline feedback for email format (RFC standard) and password length (minimum 6 characters).
  - Visual error states with custom shake animations.
- **Interactive Controls**:
  - Password visibility toggle (eye / eye-off SVG icons).
  - "Remember me" persistence state.
  - Social login options (Google & GitHub).
  - Quick autofill demo credential chip for easy testing.
- **Backend Authentication Integration**:
  - Full async integration sending requests to `/api/auth/login`.
  - Built-in Vite middleware handling real HTTP responses (200 OK, 401 Unauthorized, 403 Forbidden, 400 Bad Request).
  - JWT token and session storage in `localStorage` / `sessionStorage`.
- **Responsive States**:
  - Instant loading feedback with button spinner.
  - Error alert banners with auto-dismiss and close actions.
  - Success banner and authenticated checkmark feedback.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
```

## Demo Credentials
- **Email**: `alex@socialconnect.com`
- **Password**: `Password123!`
