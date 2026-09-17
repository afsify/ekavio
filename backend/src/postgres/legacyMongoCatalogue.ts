import { initialAddOns, initialModuleCatalogue, initialPlans } from '../commercial/catalogue.js';
import { AddOn } from '../models/AddOn.js';
import { ModuleDefinition } from '../models/ModuleDefinition.js';
import { Plan } from '../models/Plan.js';

/** Pre-cutover/recovery helper only; runtime catalogue authority is PostgreSQL. */
export const reconcileLegacyMongoCatalogue = async () => {
  await Promise.all([
    ...initialModuleCatalogue.map((definition) =>
      ModuleDefinition.updateOne(
        { key: definition.key },
        { $set: { ...definition } },
        { upsert: true, runValidators: true },
      ),
    ),
    ...initialPlans.map((plan) =>
      Plan.updateOne(
        { key: plan.key },
        { $set: { ...plan } },
        { upsert: true, runValidators: true },
      ),
    ),
    ...initialAddOns.map((addOn) =>
      AddOn.updateOne(
        { key: addOn.key },
        { $set: { ...addOn } },
        { upsert: true, runValidators: true },
      ),
    ),
  ]);
  return {
    modules: initialModuleCatalogue.length,
    plans: initialPlans.length,
    addOns: initialAddOns.length,
  };
};
