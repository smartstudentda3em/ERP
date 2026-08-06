export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'erp_user',
    password: process.env.DB_PASSWORD || 'erp_password',
    database: process.env.DB_DATABASE || 'erp_db',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'aymanmakroum83@gmail.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Ayman987654#',
  },
});
