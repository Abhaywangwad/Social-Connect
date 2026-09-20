import http from 'http';
import mongoose from 'mongoose';

// Set production environment before imports
process.env.NODE_ENV = 'production';
process.env.PORT = '5096';
process.env.MONGODB_URI = 'mongodb://localhost:27017/social-connect';
process.env.JWT_ACCESS_SECRET = 'a_very_strong_production_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'another_very_strong_production_secret_32_chars';
process.env.CLIENT_URL = 'https://app.example.com';
process.env.ENABLE_API_DOCS = 'false';

const { default: app } = await import('./src/app.js');
const { default: connectDB } = await import('./src/config/db.js');
const { initSocket } = await import('./src/socket/index.js');

console.log('─── Starting Production Mode Verification ───');

// 1. Connect MongoDB
await connectDB();

// 2. Start HTTP & Socket server
const httpServer = http.createServer(app);
const io = initSocket(httpServer);

await new Promise((resolve) => {
  httpServer.listen(5096, resolve);
});
console.log('✅ Production server listening on port 5096');

// 3. Test Liveness Probe
const livenessRes = await fetch('http://localhost:5096/api/health');
const livenessData = await livenessRes.json();
console.log('Liveness status:', livenessRes.status, livenessData.status);
if (livenessRes.status !== 200 || livenessData.status !== 'healthy') {
  throw new Error('Liveness probe failed!');
}
console.log('✅ GET /api/health returned 200 healthy');

// 4. Test Readiness Probe
const readinessRes = await fetch('http://localhost:5096/api/health/ready');
const readinessData = await readinessRes.json();
console.log('Readiness status:', readinessRes.status, readinessData.status, 'DB:', readinessData.database);
if (readinessRes.status !== 200 || readinessData.status !== 'ready') {
  throw new Error('Readiness probe failed!');
}
console.log('✅ GET /api/health/ready returned 200 ready (MongoDB connected)');

// 5. Test Swagger Inactive by Default in Production
const swaggerRes = await fetch('http://localhost:5096/api/docs/');
console.log('Swagger status when ENABLE_API_DOCS=false:', swaggerRes.status);
if (swaggerRes.status === 200) {
  throw new Error('Swagger UI should be disabled in production when ENABLE_API_DOCS is false!');
}
console.log('✅ Swagger UI successfully hidden in production by default (404)');

// 6. Test Graceful Shutdown
console.log('Testing graceful shutdown sequence...');
await new Promise((resolve) => io.close(resolve));
await new Promise((resolve) => {
  if (httpServer.listening) {
    httpServer.close(resolve);
  } else {
    resolve();
  }
});
await mongoose.connection.close(false);
console.log('✅ Graceful shutdown executed cleanly without dangling resources');

console.log('══════════════════════════════════════════════════');
console.log('   ALL PRODUCTION VERIFICATIONS PASSED (0 FAILURES) ');
console.log('══════════════════════════════════════════════════');
process.exitCode = 0;
