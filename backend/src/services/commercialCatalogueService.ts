import { initialAddOns, initialModuleCatalogue, initialPlans } from '../commercial/catalogue.js';
import { AddOn } from '../models/AddOn.js';
import { ModuleDefinition } from '../models/ModuleDefinition.js';
import { Plan } from '../models/Plan.js';

export interface CatalogueBootstrapResult {
  modules: number;
  plans: number;
  addOns: number;
}

export const bootstrapCommercialCatalogue = async (): Promise<CatalogueBootstrapResult> => {
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

export const getPublicCommercialCatalogue = async () => {
  const [modules, plans, addOns] = await Promise.all([
    ModuleDefinition.find({ status: 'active' }).sort({ key: 1 }).lean(),
    Plan.find({ status: 'active', available: true }).sort({ key: 1 }).lean(),
    AddOn.find({ status: 'active', available: true }).sort({ key: 1 }).lean(),
  ]);

  return {
    modules: modules.map((module) => ({
      key: module.key,
      displayName: module.displayName,
      description: module.description,
      category: module.category,
      commercialType: module.commercialType,
      status: module.status,
    })),
    plans: plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      description: plan.description,
      moduleKeys: [...plan.moduleKeys],
      limits: plan.limits.map((limit) => ({ key: limit.key, value: limit.value })),
    })),
    addOns: addOns.map((addOn) => ({
      key: addOn.key,
      name: addOn.name,
      description: addOn.description,
      moduleKeys: [...addOn.moduleKeys],
      limitAdjustments: addOn.limitAdjustments.map((limit) => ({
        key: limit.key,
        mode: limit.mode,
        value: limit.value,
      })),
    })),
  };
};
