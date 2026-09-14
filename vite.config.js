import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Registered mock users for authentication
const REGISTERED_USERS = [
  {
    email: 'alex@socialconnect.com',
    password: 'Password123!',
    name: 'Alex Morgan',
    role: 'Product Designer'
  }
];

function mockAuthPlugin() {
  return {
    name: 'mock-auth-plugin',
    configureServer(server) {
      server.middlewares.use('/api/auth/login', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ message: 'Method not allowed' }));
          return;
        }

        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', () => {
      try {
        const { email, password } = JSON.parse(body || '{}');

        if (!email || !password) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: 'Email and password are required.' }));
          return;
        }

        const cleanEmail = email.trim().toLowerCase();

        if (cleanEmail === 'locked@socialconnect.com') {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            message: 'This account has been temporarily locked due to multiple failed attempts.'
          }));
          return;
        }

        if (cleanEmail === 'alex@socialconnect.com' && password === 'Password123!') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            token: 'sc_jwt_' + Date.now(),
            user: REGISTERED_USERS[0],
            message: 'Welcome back, Alex Morgan!'
          }));
          return;
        }

        // Invalid credentials
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          message: 'Incorrect email or password. Please try again.'
        }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, message: 'Server error processing request.' }));
      }
    });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), mockAuthPlugin()],
  server: {
    port: 5173,
    open: false
  }
})
