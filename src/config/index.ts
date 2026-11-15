import dotenv from 'dotenv';
import path from 'path';

// Load .env from multiple potential working directories
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env'),
];

for (const envPath of possibleEnvPaths) {
  dotenv.config({ path: envPath });
}
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'rahasia_super_secure_lostfound_kampus_kelompok7_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '2097152', 10), // 2MB
  timezone: process.env.TZ || 'Asia/Jakarta',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lost_and_found_db?schema=public',
  googleClientId:
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    '246831581192-2rf8sj8ub2o9716nht8h7c9g46a2tcec.apps.googleusercontent.com',
};
