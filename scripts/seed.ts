import { AccountStatus } from '../src/common/enums/account-status.enum.js';
import { UserRole } from '../src/common/enums/user-role.enum.js';
import { hashPassword } from '../src/common/utils/hash.util.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../src/infrastructure/database/mongoose.connection.js';
import { UserModel } from '../src/modules/users/user.model.js';

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin user.');
}

async function seedAdmin(): Promise<void> {
  await connectDatabase();

  const passwordHash = await hashPassword(adminPassword);
  const now = new Date();

  const admin = await UserModel.findOneAndUpdate(
    { email: adminEmail },
    {
      $set: {
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
        emailVerifiedAt: now,
        failedLoginAttempts: 0,
      },
      $unset: {
        lockedUntil: 1,
      },
      $setOnInsert: {
        profile: { isSetupComplete: false },
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
      upsert: true,
    },
  ).exec();

  console.info(`Admin user ready: ${admin.email}`);
}

try {
  await seedAdmin();
} finally {
  await disconnectDatabase();
}
