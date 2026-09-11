import cron from 'node-cron';
import { Organization } from '../models/Organization.js';

export const initSubscriptionCron = () => {
  // Run daily at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      const now = new Date();
      // Find all organizations where the nextBillingDate has passed and they are currently active
      const overdueOrganizations = await Organization.find({
        subscriptionStatus: 'active',
        nextBillingDate: { $lt: now }
      });

      for (const org of overdueOrganizations) {
        org.subscriptionStatus = 'suspended';
        await org.save();
        console.log(`[Cron] Suspended organization ${org._id} (${org.name}) due to passed billing date.`);
      }
    } catch (error) {
      console.error('[Cron] Error running subscription cron job:', error);
    }
  });

  console.log('[Cron] Subscription cron job initialized.');
};
