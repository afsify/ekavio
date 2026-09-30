import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Download,
  History,
  PackagePlus,
  PackageSearch,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { getErrorMessage } from '../../api/errors';
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  type InventoryItem,
  type InventoryUnit,
  type StockMovement,
  useAdjustInventoryStock,
  useConsumeInventoryStock,
  useCreateInventoryItem,
  useInventory,
  useInventoryMovements,
  useInventoryUnits,
  useLowStockAlerts,
  useReceiveInventoryStock,
  useReverseInventoryMovement,
  useUpdateInventoryItem,
} from '../../hooks/useInventory';
import { useAppStore } from '../../store/useAppStore';
import { exportToCSV } from '../../utils/exportUtils';

type ModalMode = 'create' | 'edit' | 'receive' | 'consume' | 'adjust' | 'reverse';

interface InventoryFormState {
  name: string;
  sku: string;
  barcode: string;
  unitCode: InventoryUnit['code'];
  price: string;
  reorderThreshold: string;
  openingQuantity: string;
  status: 'active' | 'inactive';
  quantity: string;
  reason: string;
  reference: string;
  direction: 'increase' | 'decrease';
}

const emptyForm = (): InventoryFormState => ({
  name: '',
  sku: '',
  barcode: '',
  unitCode: 'unit',
  price: '',
  reorderThreshold: '0',
  openingQuantity: '',
  status: 'active',
  quantity: '',
  reason: '',
  reference: '',
  direction: 'increase',
});

const movementLabels: Record<StockMovement['movementType'], string> = {
  opening: 'Opening stock',
  receive: 'Received',
  consume: 'Consumed',
  adjustment_increase: 'Adjustment increase',
  adjustment_decrease: 'Adjustment decrease',
  reversal: 'Reversal',
};

const newCommandKey = (): string => window.crypto.randomUUID();

const selectClass = 'block min-h-[44px] w-full rounded-2xl border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300';

export const InventoryPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [commandKey, setCommandKey] = useState(newCommandKey);
  const [form, setForm] = useState<InventoryFormState>(emptyForm);
  const pageLimit = 12;

  const user = useAppStore((state) => state.user);
  const activeTenantId = useAppStore((state) => state.activeTenantId);
  const activeBranchId = useAppStore((state) => state.activeBranchId);
  const canManage = user?.permissions?.includes('inventory.manage') ?? false;
  const activeMembership = user?.memberships?.find(
    (membership) => membership.organizationId === activeTenantId,
  );
  const branchName = activeMembership?.branches.find(({ id }) => id === activeBranchId)?.name
    ?? 'Selected branch';

  const inventoryQuery = useInventory(page, pageLimit, search, status);
  const lowStockQuery = useLowStockAlerts(1, 1);
  const unitsQuery = useInventoryUnits();
  const movementQuery = useInventoryMovements(historyItem?.id ?? null, historyPage, 20);
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const receiveMutation = useReceiveInventoryStock();
  const consumeMutation = useConsumeInventoryStock();
  const adjustMutation = useAdjustInventoryStock();
  const reverseMutation = useReverseInventoryMovement();

  const items = inventoryQuery.data?.data ?? [];
  const isMutating = createMutation.isPending
    || updateMutation.isPending
    || receiveMutation.isPending
    || consumeMutation.isPending
    || adjustMutation.isPending
    || reverseMutation.isPending;

  const modalTitle = useMemo(() => {
    if (modalMode === 'create') return 'Create inventory item';
    if (modalMode === 'edit') return `Edit ${selectedItem?.name ?? 'item'}`;
    if (modalMode === 'receive') return `Receive ${selectedItem?.name ?? 'stock'}`;
    if (modalMode === 'consume') return `Consume ${selectedItem?.name ?? 'stock'}`;
    if (modalMode === 'adjust') return `Adjust ${selectedItem?.name ?? 'stock'}`;
    if (modalMode === 'reverse') return 'Reverse stock movement';
    return 'Inventory';
  }, [modalMode, selectedItem]);

  const openModal = (
    mode: ModalMode,
    item: InventoryItem | null = null,
    movement: StockMovement | null = null,
  ) => {
    setModalMode(mode);
    setSelectedItem(item);
    setSelectedMovement(movement);
    setCommandKey(newCommandKey());
    if (mode === 'edit' && item) {
      setForm({
        ...emptyForm(),
        name: item.name,
        sku: item.sku ?? '',
        barcode: item.barcode ?? '',
        unitCode: item.unitCode,
        price: item.price ?? '',
        reorderThreshold: item.reorderThreshold,
        status: item.status,
      });
    } else {
      setForm(emptyForm());
    }
  };

  const closeModal = () => {
    if (isMutating) return;
    setModalMode(null);
    setSelectedItem(null);
    setSelectedMovement(null);
    setForm(emptyForm());
  };

  const setField = <Key extends keyof InventoryFormState>(
    key: Key,
    value: InventoryFormState[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      if (modalMode === 'create') {
        if (!form.name.trim()) throw new Error('Item name is required');
        await createMutation.mutateAsync({
          name: form.name.trim(),
          unitCode: form.unitCode,
          sku: form.sku.trim() || null,
          barcode: form.barcode.trim() || null,
          price: form.price.trim() || null,
          currency: 'INR',
          reorderThreshold: form.reorderThreshold.trim(),
          ...(form.openingQuantity.trim()
            ? { openingQuantity: form.openingQuantity.trim() }
            : {}),
          idempotencyKey: commandKey,
        });
        toast.success('Inventory item created');
      } else if (modalMode === 'edit' && selectedItem) {
        await updateMutation.mutateAsync({
          itemId: selectedItem.id,
          name: form.name.trim(),
          unitCode: form.unitCode,
          sku: form.sku.trim() || null,
          barcode: form.barcode.trim() || null,
          price: form.price.trim() || null,
          reorderThreshold: form.reorderThreshold.trim(),
          status: form.status,
        });
        toast.success('Inventory item updated');
      } else if (modalMode === 'receive' && selectedItem) {
        await receiveMutation.mutateAsync({
          itemId: selectedItem.id,
          quantity: form.quantity.trim(),
          reason: form.reason.trim() || null,
          reference: form.reference.trim() || null,
          idempotencyKey: commandKey,
        });
        toast.success('Stock received');
      } else if (modalMode === 'consume' && selectedItem) {
        await consumeMutation.mutateAsync({
          itemId: selectedItem.id,
          quantity: form.quantity.trim(),
          reason: form.reason.trim(),
          reference: form.reference.trim() || null,
          idempotencyKey: commandKey,
        });
        toast.success('Stock consumed');
      } else if (modalMode === 'adjust' && selectedItem) {
        await adjustMutation.mutateAsync({
          itemId: selectedItem.id,
          direction: form.direction,
          quantity: form.quantity.trim(),
          reason: form.reason.trim(),
          reference: form.reference.trim() || null,
          idempotencyKey: commandKey,
        });
        toast.success('Stock adjustment recorded');
      } else if (modalMode === 'reverse' && selectedMovement) {
        await reverseMutation.mutateAsync({
          movementId: selectedMovement.id,
          reason: form.reason.trim(),
          idempotencyKey: commandKey,
        });
        toast.success('Reversal recorded');
      }
      closeModal();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Inventory command failed'));
    }
  };

  const showHistory = (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryPage(1);
  };

  const header = (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400">
            <PackageSearch className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Inventory</h1>
            <p className="text-sm text-slate-400">
              {branchName} · default stock location · exact movement history
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => exportToCSV(items.map((item) => ({
              name: item.name,
              sku: item.sku ?? '',
              barcode: item.barcode ?? '',
              unit: item.unit.label,
              quantity: item.quantity,
              reorderThreshold: item.reorderThreshold,
              price: item.price ?? '',
              currency: item.currency,
              status: item.status,
            })), `inventory_current_page_${page}`)}
            disabled={items.length === 0}
          >
            <Download className="h-4 w-4" />
            Export current page
          </Button>
          {canManage && (
            <Button onClick={() => openModal('create')}>
              <PackagePlus className="h-4 w-4" />
              Create item
            </Button>
          )}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Catalogue items</p>
          <p className="mt-1 text-xl font-bold text-white">{inventoryQuery.data?.total ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-rose-300">Low stock</p>
          <p className="mt-1 text-xl font-bold text-rose-300">{lowStockQuery.data?.total ?? '—'}</p>
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="relative">
            <span className="sr-only">Search inventory</span>
            <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search name, SKU, or barcode"
              className={`${selectClass} pl-11`}
            />
          </label>
          <select
            aria-label="Filter inventory status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      {inventoryQuery.isLoading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">
          Loading branch inventory…
        </div>
      )}
      {inventoryQuery.isError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
          <p className="font-semibold">Inventory could not be loaded.</p>
          <p className="mt-1 text-sm">{getErrorMessage(inventoryQuery.error, 'Request failed safely')}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void inventoryQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {!inventoryQuery.isLoading && !inventoryQuery.isError && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center">
          <PackageSearch className="mx-auto h-10 w-10 text-slate-600" />
          <h2 className="mt-3 font-semibold text-white">No inventory items found</h2>
          <p className="mt-1 text-sm text-slate-400">
            Create a catalogue item or change the current filters.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className={`rounded-2xl border p-5 shadow-lg ${
              item.isLowStock
                ? 'border-rose-500/30 bg-rose-500/5'
                : 'border-slate-800 bg-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{item.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {item.sku ? `SKU ${item.sku}` : 'No SKU'}
                  {item.barcode ? ` · ${item.barcode}` : ''}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                item.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {item.status}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950/60 p-3">
                <p className="text-xs text-slate-500">Branch quantity</p>
                <p className={`mt-1 text-xl font-bold ${item.isLowStock ? 'text-rose-300' : 'text-white'}`}>
                  {item.quantity} <span className="text-xs font-medium text-slate-400">{item.unit.label}</span>
                </p>
              </div>
              <div className="rounded-xl bg-slate-950/60 p-3">
                <p className="text-xs text-slate-500">Reference price</p>
                <p className="mt-1 text-xl font-bold text-white">
                  {item.price === null ? '—' : `₹${item.price}`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Low-stock threshold: {item.reorderThreshold}</span>
              {item.isLowStock && (
                <span className="inline-flex items-center gap-1 font-semibold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Low stock
                </span>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              <Button size="sm" variant="secondary" onClick={() => showHistory(item)}>
                <History className="h-4 w-4" /> History
              </Button>
              {canManage && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => openModal('receive', item)} disabled={item.status !== 'active'}>
                    <ArrowDownToLine className="h-4 w-4" /> Receive
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openModal('consume', item)} disabled={item.status !== 'active'}>
                    <ArrowUpFromLine className="h-4 w-4" /> Consume
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openModal('adjust', item)} disabled={item.status !== 'active'}>
                    <SlidersHorizontal className="h-4 w-4" /> Adjust
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openModal('edit', item)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      {(inventoryQuery.data?.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-400">
            Page {page} of {inventoryQuery.data?.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= (inventoryQuery.data?.totalPages ?? 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {historyItem && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <ClipboardList className="h-5 w-5 text-indigo-400" />
                {historyItem.name} movement history
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Permanent facts for {branchName}; reversals remain visible.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryItem(null)}
              aria-label="Close movement history"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {movementQuery.isLoading && <p className="py-8 text-center text-slate-400">Loading movement history…</p>}
          {movementQuery.isError && (
            <p className="py-6 text-rose-300">{getErrorMessage(movementQuery.error, 'Movement history failed to load')}</p>
          )}
          {!movementQuery.isLoading && movementQuery.data?.data.length === 0 && (
            <p className="py-8 text-center text-slate-500">No stock movements exist for this branch.</p>
          )}
          <div className="divide-y divide-slate-800">
            {(movementQuery.data?.data ?? []).map((movement) => (
              <div key={movement.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{movementLabels[movement.movementType]}</span>
                    <span className={`font-mono text-sm font-bold ${
                      movement.quantityDelta.startsWith('-') ? 'text-rose-300' : 'text-emerald-300'
                    }`}>
                      {movement.quantityDelta.startsWith('-') ? '' : '+'}{movement.quantityDelta} {movement.unit.label}
                    </span>
                    {movement.reversedByMovementId && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">Reversed</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(movement.occurredAt).toLocaleString()}
                    {movement.actorName ? ` · ${movement.actorName}` : ' · migration import'}
                  </p>
                  {(movement.reason || movement.reference) && (
                    <p className="mt-2 text-sm text-slate-300">
                      {movement.reason ?? 'No reason'}{movement.reference ? ` · Ref: ${movement.reference}` : ''}
                    </p>
                  )}
                </div>
                {canManage
                  && movement.movementType !== 'reversal'
                  && !movement.reversedByMovementId && (
                  <Button size="sm" variant="ghost" onClick={() => openModal('reverse', historyItem, movement)}>
                    <RotateCcw className="h-4 w-4" /> Reverse
                  </Button>
                )}
              </div>
            ))}
          </div>
          {(movementQuery.data?.totalPages ?? 0) > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4">
              <Button variant="secondary" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => value - 1)}>
                Previous
              </Button>
              <span className="text-xs text-slate-400">Page {historyPage} of {movementQuery.data?.totalPages}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={historyPage >= (movementQuery.data?.totalPages ?? 1)}
                onClick={() => setHistoryPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );

  return (
    <>
      <DetailViewLayout header={header} mainContent={mainContent} />
      <AdvancedModal
        isOpen={modalMode !== null}
        onClose={closeModal}
        title={modalTitle}
        size="lg"
        closeOnBackdropClick={!isMutating}
        closeOnEscape={!isMutating}
        actions={(
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isMutating}>Cancel</Button>
            <Button
              variant={modalMode === 'reverse' ? 'danger' : 'primary'}
              onClick={() => void submit()}
              isLoading={isMutating}
            >
              {modalMode === 'reverse' ? 'Record reversal' : 'Save'}
            </Button>
          </>
        )}
      >
        {(modalMode === 'create' || modalMode === 'edit') && (
          <div className="space-y-4">
            <Input label="Item name" value={form.name} onChange={(event) => setField('name', event.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="inventory-unit">Unit</label>
                <select
                  id="inventory-unit"
                  value={form.unitCode}
                  onChange={(event) => setField('unitCode', event.target.value as InventoryUnit['code'])}
                  className={selectClass}
                >
                  {(unitsQuery.data ?? []).map((unit) => <option key={unit.code} value={unit.code}>{unit.label}</option>)}
                </select>
                {modalMode === 'edit' && (
                  <p className="mt-1 text-xs text-slate-500">Unit changes are rejected after movement history exists.</p>
                )}
              </div>
              {modalMode === 'edit' && (
                <div>
                  <label className={labelClass} htmlFor="inventory-status">Status</label>
                  <select
                    id="inventory-status"
                    value={form.status}
                    onChange={(event) => setField('status', event.target.value as 'active' | 'inactive')}
                    className={selectClass}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="SKU (optional)" value={form.sku} onChange={(event) => setField('sku', event.target.value)} />
              <Input label="Barcode (optional)" value={form.barcode} onChange={(event) => setField('barcode', event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Reference price (INR)"
                inputMode="decimal"
                placeholder="0.00"
                value={form.price}
                onChange={(event) => setField('price', event.target.value)}
              />
              <Input
                label="Low-stock threshold"
                inputMode="decimal"
                placeholder="0.000"
                value={form.reorderThreshold}
                onChange={(event) => setField('reorderThreshold', event.target.value)}
              />
            </div>
            {modalMode === 'create' && (
              <Input
                label="Opening quantity (optional)"
                inputMode="decimal"
                placeholder="0.000"
                value={form.openingQuantity}
                onChange={(event) => setField('openingQuantity', event.target.value)}
              />
            )}
            <p className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
              Quantity is never edited directly. An opening quantity creates an immutable opening movement in the same transaction.
            </p>
          </div>
        )}

        {(modalMode === 'receive' || modalMode === 'consume' || modalMode === 'adjust') && selectedItem && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="font-semibold text-white">{selectedItem.name}</p>
              <p className="mt-1 text-sm text-slate-400">
                Available: {selectedItem.quantity} {selectedItem.unit.label} · {branchName}
              </p>
            </div>
            {modalMode === 'adjust' && (
              <div>
                <label className={labelClass} htmlFor="adjustment-direction">Adjustment direction</label>
                <select
                  id="adjustment-direction"
                  value={form.direction}
                  onChange={(event) => setField('direction', event.target.value as 'increase' | 'decrease')}
                  className={selectClass}
                >
                  <option value="increase">Increase</option>
                  <option value="decrease">Decrease</option>
                </select>
              </div>
            )}
            <Input
              label={`Quantity (${selectedItem.unit.label})`}
              inputMode="decimal"
              placeholder="0.000"
              value={form.quantity}
              onChange={(event) => setField('quantity', event.target.value)}
            />
            <div>
              <label className={labelClass} htmlFor="stock-reason">
                Reason {modalMode === 'receive' ? '(optional)' : ''}
              </label>
              <textarea
                id="stock-reason"
                value={form.reason}
                onChange={(event) => setField('reason', event.target.value)}
                className={`${selectClass} min-h-24`}
              />
            </div>
            <Input
              label="Reference (optional)"
              value={form.reference}
              onChange={(event) => setField('reference', event.target.value)}
            />
            {modalMode === 'adjust' && (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                This adjustment becomes a permanent inventory fact. Correct a mistake with a reversal.
              </p>
            )}
          </div>
        )}

        {modalMode === 'reverse' && selectedMovement && (
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
              Reversing {movementLabels[selectedMovement.movementType]} records an exact inverse movement of{' '}
              {selectedMovement.quantity} {selectedMovement.unit.label}. The original fact remains visible.
            </div>
            <div>
              <label className={labelClass} htmlFor="reversal-reason">Reversal reason</label>
              <textarea
                id="reversal-reason"
                value={form.reason}
                onChange={(event) => setField('reason', event.target.value)}
                className={`${selectClass} min-h-24`}
              />
            </div>
          </div>
        )}
      </AdvancedModal>
    </>
  );
};

export default InventoryPage;
