import { app } from './app';
import { config } from './config';
import { initCleanupCronJob } from './cron/cleanup';
import { ensureDatabaseSchema } from './utils/prisma';

const server = app.listen(config.port, async () => {
  console.log(`=======================================================`);
  console.log(`  SISTEM INFORMASI LOST & FOUND KAMPUS - BACKEND API   `);
  console.log(`  Server aktif di port: http://localhost:${config.port}       `);
  console.log(`  Environment: ${config.nodeEnv} | Timezone: ${config.timezone} `);
  console.log(`=======================================================`);

  // Pastikan skema database dan akun admin terverifikasi
  await ensureDatabaseSchema();

  // Aktifkan Background Job Node-cron (SRS-FR-004 & CST-04)
  initCleanupCronJob();
});

export default server;
