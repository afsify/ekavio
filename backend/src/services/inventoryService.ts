import { Inventory } from '../models/Inventory.js';
import { organizationScope, type OrganizationContext } from '../utils/tenantScope.js';

interface InventoryItemInput {
  itemName: string;
  currentStock: number;
  lowStockThreshold: number;
  price: number;
}

export const addItemService = async (context: OrganizationContext, data: InventoryItemInput) => {
  const { itemName, currentStock, lowStockThreshold, price } = data;

  const newItem = new Inventory({
    tenantId: context.organizationId,
    itemName,
    currentStock,
    lowStockThreshold,
    price,
  });

  await newItem.save();
  return newItem;
};

export const getInventoryService = async (context: OrganizationContext, pageStr?: string, limitStr?: string) => {
  const page = parseInt(pageStr ?? '') || 1;
  const limit = parseInt(limitStr ?? '') || 10;
  const skip = (page - 1) * limit;

  const query = organizationScope(context);

  const totalDocs = await Inventory.countDocuments(query);
  const totalPages = Math.ceil(totalDocs / limit);

  const items = await Inventory.find(query)
    .sort({ itemName: 1 })
    .skip(skip)
    .limit(limit);

  return { data: items, totalDocs, totalPages };
};

export const getLowStockAlertsService = async (context: OrganizationContext) => {
  const lowStockItems = await Inventory.find({
    ...organizationScope(context),
    $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
  }).sort({ currentStock: 1 });

  return lowStockItems;
};
