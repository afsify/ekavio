import { Inventory } from '../models/Inventory.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  legacyOrganizationScope,
} from '../persistence/operationalIdentity.js';
import type { AuthorizationContext } from './requestContextService.js';

interface InventoryItemInput {
  itemName: string;
  currentStock: number;
  lowStockThreshold: number;
  price: number;
}

export const addItemService = async (context: AuthorizationContext, data: InventoryItemInput) => {
  const { itemName, currentStock, lowStockThreshold, price } = data;
  const operational = await runtimePersistence.operationalIdentity.resolve(context);

  const newItem = new Inventory({
    tenantId: operational.legacyMongoOrganizationId,
    itemName,
    currentStock,
    lowStockThreshold,
    price,
  });

  await newItem.save();
  return newItem;
};

export const getInventoryService = async (context: AuthorizationContext, pageStr?: string, limitStr?: string) => {
  const page = parseInt(pageStr ?? '') || 1;
  const limit = parseInt(limitStr ?? '') || 10;
  const skip = (page - 1) * limit;
  const operational = await runtimePersistence.operationalIdentity.resolve(context);
  const query = legacyOrganizationScope(operational);

  const totalDocs = await Inventory.countDocuments(query);
  const totalPages = Math.ceil(totalDocs / limit);

  const items = await Inventory.find(query)
    .sort({ itemName: 1 })
    .skip(skip)
    .limit(limit);

  return { data: items, totalDocs, totalPages };
};

export const getLowStockAlertsService = async (context: AuthorizationContext) => {
  const operational = await runtimePersistence.operationalIdentity.resolve(context);
  const lowStockItems = await Inventory.find({
    ...legacyOrganizationScope(operational),
    $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
  }).sort({ currentStock: 1 });

  return lowStockItems;
};
