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
  sharedDocuments: {
    storageDir: process.env.SHARED_DOCUMENTS_STORAGE_DIR || './uploads/shared-documents',
    retentionDays: parseInt(process.env.SHARED_DOCUMENTS_RETENTION_DAYS || '14', 10),
  },
  backup: {
    storageDir: process.env.BACKUP_STORAGE_DIR || './backups',
    encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || '',
    cronSchedule: process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *',
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
    pgDumpPath: process.env.PG_DUMP_PATH || 'pg_dump',
    pgRestorePath: process.env.PG_RESTORE_PATH || 'pg_restore',
    adminEmail: process.env.BACKUP_ADMIN_EMAIL || '',
    s3: {
      bucket: process.env.BACKUP_S3_BUCKET || '',
      region: process.env.BACKUP_S3_REGION || 'us-east-1',
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY || '',
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'no-reply@erp.local',
    },
  },
});
