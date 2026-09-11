import { Inventory } from '../models/Inventory.js';
import { createAppError } from '../utils/AppError.js';

export const addItemService = async (tenantId: string, data: any) => {
  const { itemName, currentStock, lowStockThreshold, price } = data;

  const newItem = new Inventory({
    tenantId,
    itemName,
    currentStock,
    lowStockThreshold,
    price,
  });

  await newItem.save();
  return newItem;
};

export const getInventoryService = async (tenantId: string, pageStr?: string, limitStr?: string) => {
  const page = parseInt(pageStr as string) || 1;
  const limit = parseInt(limitStr as string) || 10;
  const skip = (page - 1) * limit;

  const query = { tenantId };

  const totalDocs = await Inventory.countDocuments(query);
  const totalPages = Math.ceil(totalDocs / limit);

  const items = await Inventory.find(query)
    .sort({ itemName: 1 })
    .skip(skip)
    .limit(limit);

  return { data: items, totalDocs, totalPages };
};

export const getLowStockAlertsService = async (tenantId: string) => {
  const lowStockItems = await Inventory.find({
    tenantId,
    $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
  }).sort({ currentStock: 1 });

  return lowStockItems;
};
