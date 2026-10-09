import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link,useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../api/client';
import { hasEntitlement } from '../../commercial/catalogue';
import { getErrorMessage } from '../../api/errors';
import { AppPage, PageHeader, StatusBadge, DetailSection, ErrorState, FilterPanel, FilterChip, Pagination, SearchField, Skeleton } from '../../components/ui/WorkspacePrimitives';
import { AdvancedTable, type Column } from '../../components/ui/AdvancedTable';
import { OperationForm } from '../../components/ui/OperationForm';
import { EmptyState } from '../../components/ui/EmptyState';
import { useOperationalContext, useOperationalScope } from '../../hooks/useOperationalContext';
import { branchTime, decimalUnits, quantityText } from '../../utils/operations';
import { exactRupees } from '../../components/analytics/contracts';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
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
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { EntityFields } from '../../components/forms/EntityFields';

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

const selectClass = '';
const labelClass = 'form-label';

export const InventoryPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const [chosenHistoryItem, setHistoryItem] = useState<InventoryItem | null | undefined>(undefined);
  const [linkParams,setLinkParams] = useSearchParams();
  const [historyPage, setHistoryPage] = useState(1);
  const [commandKey, setCommandKey] = useState(newCommandKey);
  const [form, setForm] = useState<InventoryFormState>(emptyForm);
  const fields=useDynamicForm('inventory_item',modalMode==='edit'?selectedItem?.id:null,modalMode==='create'||modalMode==='edit');
  const pageLimit = 20;
  const scope = useOperationalScope(), context = useOperationalContext();
  const [lowOnly, setLowOnly] = useState(false), [filtersOpen, setFiltersOpen] = useState(false), [commandError, setCommandError] = useState<unknown>(null);

  const user = useAppStore((state) => state.user);
  const activeTenantId = useAppStore((state) => state.activeTenantId);
  const activeBranchId = useAppStore((state) => state.activeBranchId);
  const entitlements = useAppStore((state) => state.entitlements);
  const linkedItem = useQuery({ queryKey: ['inventory', ...scope, 'detail', chosenHistoryItem?.id ?? linkParams.get('item')], enabled: Boolean(chosenHistoryItem?.id || (chosenHistoryItem === undefined && linkParams.get('item'))), queryFn: async ({ signal }) => (await client.get<{data:InventoryItem}>('/inventory/' + (chosenHistoryItem?.id ?? linkParams.get('item')), { signal })).data.data });
  const historyItem = chosenHistoryItem === null ? null : linkedItem.data ?? chosenHistoryItem ?? null;
  const canManage = user?.permissions?.includes('inventory.manage') ?? false;
  const activeMembership = user?.memberships?.find(
    (membership) => membership.organizationId === activeTenantId,
  );
  const branchName = activeMembership?.branches.find(({ id }) => id === activeBranchId)?.name
    ?? 'Selected branch';

  const catalogueQuery = useInventory(page, pageLimit, search, status);
  const lowItemsQuery = useLowStockAlerts(page, pageLimit);
  const inventoryQuery = lowOnly ? lowItemsQuery : catalogueQuery;
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
    setCommandError(null);
    setModalMode(mode);
    setSelectedItem(item);
    setSelectedMovement(movement);
    fields.reset();
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
    if (!canManage || isMutating || !formValid) return;
    try {
      if (modalMode === 'create') {
        if (!form.name.trim()) throw new Error('Item name is required');
        await createMutation.mutateAsync({
          customFields:fields.patch,
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
          customFields:fields.patch,
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
      setModalMode(null);
      setSelectedItem(null);
      setSelectedMovement(null);
      setForm(emptyForm());
    } catch (error) {
      setCommandError(error);
      toast.error(getErrorMessage(error, 'Inventory command failed'));
    }
  };

  const showHistory = (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryPage(1);
  };


  const amount = decimalUnits(form.quantity.trim(), 3), threshold = decimalUnits(form.reorderThreshold.trim(), 3);
  const opening = form.openingQuantity.trim() ? decimalUnits(form.openingQuantity.trim(), 3) : 0n, price = form.price.trim() ? decimalUnits(form.price.trim(), 2) : 0n;
  const catalogueMode = modalMode === 'create' || modalMode === 'edit';
  const formValid = canManage && (catalogueMode
    ? Boolean(fields.ready && fields.valid && !fields.error && form.name.trim() && unitsQuery.data?.some(u => u.code === form.unitCode) && threshold !== null && opening !== null && price !== null)
    : modalMode === 'reverse'
      ? Boolean(selectedMovement && selectedMovement.movementType !== 'reversal' && !selectedMovement.reversedByMovementId && !selectedMovement.purchaseReceiptLineId && form.reason.trim().length >= 3)
      : Boolean(selectedItem?.status === 'active' && amount !== null && amount > 0n && (modalMode === 'receive' || form.reason.trim().length >= 3)));
  const current = selectedItem ? decimalUnits(selectedItem.quantity, 3) : null;
  const delta = modalMode === 'reverse' && selectedMovement
    ? (selectedMovement.quantityDelta.startsWith('-') ? decimalUnits(selectedMovement.quantityDelta.slice(1), 3) : -(decimalUnits(selectedMovement.quantityDelta, 3) ?? 0n))
    : amount === null ? null : modalMode === 'consume' || (modalMode === 'adjust' && form.direction === 'decrease') ? -amount : amount;
  const itemActions = (item: InventoryItem) => <button className="quiet-button" onClick={() => showHistory(item)}>Details &amp; history</button>;
  const columns: Column<InventoryItem>[] = [
    { header: 'Item', accessor: 'name', cell: ({ row }) => <div><strong>{row.name}</strong><p className="muted">{row.sku ?? 'No SKU'} · {row.unit.label}</p></div> },
    { header: 'Available', accessor: 'quantity', cell: ({ row }) => <strong>{row.quantity} {row.unit.label}</strong> },
    { header: 'Stock state', accessor: 'isLowStock', cell: ({ row }) => <StatusBadge tone={row.isLowStock ? 'warning' : 'success'}>{row.isLowStock ? 'Low stock' : 'Above threshold'}</StatusBadge> },
    { header: 'Status', accessor: 'status', cell: ({ row }) => <StatusBadge>{row.status === 'active' ? 'Active' : 'Inactive'}</StatusBadge> },
    { header: 'Reference price', accessor: 'priceMinor', cell: ({ row }) => row.priceMinor !== null ? exactRupees(row.priceMinor) : '—' },
    { header: 'Actions', accessor: 'actions', cell: ({ row }) => itemActions(row) },
  ];
  const purchasing = hasEntitlement(entitlements, 'purchasing') && user?.permissions?.includes('purchasing.read');
  const closeHistory = () => { setHistoryItem(null); setLinkParams({}); };
  return <AppPage className="operations-workspace">
    <PageHeader title="Inventory" eyebrow="Daily operations · Stock control" description={branchName + ' · default stock location · exact permanent movement history'} actions={<>
      {purchasing && <Link className="quiet-button" to="/purchasing">View Purchasing</Link>}
      <button className="quiet-button" disabled={!items.length} onClick={() => exportToCSV(items.map(item => ({ name: item.name, sku: item.sku ?? '', barcode: item.barcode ?? '', unit: item.unit.label, quantity: item.quantity, reorderThreshold: item.reorderThreshold, price: item.price ?? '', currency: item.currency, status: item.status })), 'inventory_current_page_' + page)}>Export current page</button>
      {canManage && <button className="action-link" onClick={() => openModal('create')}>Create item</button>}
    </>} />
    <div className="operations-summary"><section className="panel"><h2>{lowOnly ? 'Low-stock matches' : 'Filtered catalogue items'}</h2><p className="stat-value">{inventoryQuery.isError ? '—' : inventoryQuery.data?.total ?? '—'}</p><p className="muted">Selected branch · server-filtered total</p></section><section className="panel"><h2>Branch low stock</h2><p className="stat-value">{lowStockQuery.isError ? '—' : lowStockQuery.data?.total ?? '—'}</p><button className="quiet-button" aria-pressed={lowOnly} onClick={() => { setLowOnly(v => !v); setPage(1); }}>{lowOnly ? 'Show catalogue' : 'View low-stock items'}</button>{lowStockQuery.isError && <button className="quiet-button" onClick={() => void lowStockQuery.refetch()}>Retry low-stock count</button>}</section></div>
    {context.isError && <ErrorState title="Branch time unavailable" message="Timestamps wait for the authorized branch timezone; no device-time fallback is used." retry={() => void context.refetch()} />}
    {!canManage && <p className="muted">Read-only catalogue and history; stock commands require Inventory manage permission.</p>}
    {!lowOnly && <><SearchField label="Search inventory" maxLength={200} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search names, SKU or barcode" /><FilterPanel label="Inventory filters" open={filtersOpen} onToggle={() => setFiltersOpen(v => !v)} count={status ? 1 : 0}><label className="field">Item status<select aria-label="Item status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></FilterPanel>{(search || status) && <FilterChip label="Catalogue filters" onRemove={() => { setSearch(''); setStatus(''); setPage(1); }} />}</>}
    {lowOnly && <p className="muted">Canonical branch low-stock list. Catalogue search/status filters do not apply.</p>}
    <AdvancedTable mode="server" title={lowOnly ? 'Low-stock items' : 'Item catalogue'} description="Bounded server pages · quantities retain three decimal places · no page-local sorting" columns={columns} rowKey={i => i.id} data={items} loading={inventoryQuery.isPending} error={inventoryQuery.isError ? getErrorMessage(inventoryQuery.error, 'Catalogue unavailable') : null} onRetry={() => void inventoryQuery.refetch()} server={{ search: '', page, pageSize: pageLimit, total: inventoryQuery.data?.total ?? 0, totalPages: inventoryQuery.data?.totalPages ?? 1, onPage: setPage }} emptyState={<EmptyState title={lowOnly ? 'No low-stock items' : 'No matching items'} description={lowOnly ? 'No items meet the server low-stock condition.' : 'Change filters or create an item if authorized.'} />} mobileCard={item => <article className="panel mobile-record-card"><div className="operations-record-heading"><h2>{item.name}</h2><StatusBadge tone={item.isLowStock ? 'warning' : 'neutral'}>{item.isLowStock ? 'Low stock' : item.status}</StatusBadge></div><p className="stat-value">{item.quantity} <small>{item.unit.label}</small></p><p className="muted">{item.sku ?? 'No SKU'} · threshold {item.reorderThreshold}</p>{itemActions(item)}</article>} />
    {linkedItem.isError && <ErrorState title="Item detail unavailable" message={getErrorMessage(linkedItem.error, 'Unavailable in this branch.')} retry={() => void linkedItem.refetch()} />}
    <AdvancedModal isOpen={Boolean(historyItem) && !modalMode} title="Inventory item details" presentation="drawer" onClose={closeHistory} actions={historyItem && canManage && <div className="record-actions">{(['receive', 'consume', 'adjust', 'edit'] as const).map(mode => <button className={mode === 'receive' ? 'action-link' : 'quiet-button'} key={mode} disabled={mode !== 'edit' && historyItem.status !== 'active'} onClick={() => openModal(mode, historyItem)}>{mode === 'edit' ? 'Edit item' : mode === 'receive' ? 'Receive stock' : mode === 'consume' ? 'Consume stock' : 'Adjust stock'}</button>)}</div>}>
      {historyItem && <div className="page-stack"><h2>{historyItem.name}</h2><StatusBadge tone={historyItem.isLowStock ? 'warning' : 'neutral'}>{historyItem.isLowStock ? 'Low stock' : historyItem.status}</StatusBadge><DetailSection title="Available stock"><p className="stat-value">{historyItem.quantity} {historyItem.unit.label}</p><p>{branchName} · {historyItem.locationName}</p><p>Threshold {historyItem.reorderThreshold} · Reference price {historyItem.priceMinor !== null ? exactRupees(historyItem.priceMinor) : 'Not set'}</p></DetailSection><DetailSection title="Catalogue"><p>SKU: {historyItem.sku ?? 'Not set'} · Barcode: {historyItem.barcode ?? 'Not set'}</p><EntityFields entity="inventory_item" id={historyItem.id} /></DetailSection>
      <DetailSection title="Movement history"><p className="muted">Permanent branch facts. Reversal appends an exact inverse, never deletes.</p>{movementQuery.isPending ? <Skeleton label="Loading movement history" /> : movementQuery.isError ? <ErrorState title="History unavailable" message={getErrorMessage(movementQuery.error, 'Retry history')} retry={() => void movementQuery.refetch()} /> : movementQuery.data?.data.length === 0 ? <p>No movements yet.</p> : <div className="page-stack">{movementQuery.data?.data.map(m => <article className="panel" key={m.id}><div className="operations-record-heading"><h3>{movementLabels[m.movementType]}</h3><StatusBadge tone={m.quantityDelta.startsWith('-') ? 'warning' : 'success'}>{m.quantityDelta.startsWith('-') ? '' : '+'}{m.quantityDelta} {m.unit.label}</StatusBadge></div><p className="muted">{branchTime(m.occurredAt, context.timezone, true)} · {m.actorName ?? (m.actorMembershipId ? 'Actor name unavailable' : 'Migration import')}</p><p>{m.reason ?? 'No reason'}{m.reference ? ' · Ref: ' + m.reference : ''}</p>{m.reversedByMovementId && <StatusBadge>Reversed</StatusBadge>}{m.reversesMovementId && <p>Inverse of a retained movement.</p>}{m.purchaseReceiptLineId ? <p>Purchasing receipt — independent reversal blocked; returns/corrections deferred. {purchasing && <Link to="/purchasing">View Purchasing</Link>}</p> : canManage && m.movementType !== 'reversal' && !m.reversedByMovementId && <button className="quiet-button" onClick={() => openModal('reverse', historyItem, m)}>Reverse movement</button>}</article>)}</div>}<Pagination page={historyPage} totalPages={movementQuery.data?.totalPages ?? 1} total={movementQuery.data?.total ?? 0} pageSize={20} onPage={setHistoryPage} busy={movementQuery.isFetching} /></DetailSection></div>}
    </AdvancedModal>
    <OperationForm open={modalMode !== null} title={modalTitle} valid={formValid} busy={isMutating} dirty={JSON.stringify(form) !== JSON.stringify(emptyForm()) || Object.keys(fields.patch).length > 0} error={commandError} retryAdvice={modalMode === 'edit' ? 'Reviewed catalogue values are retained. Refresh authoritative records if the result is uncertain.' : undefined} confirmLabel={modalMode === 'reverse' ? 'Record reversal' : 'Save'} onClose={closeModal} onConfirm={() => void submit()} review={<DetailSection title={catalogueMode ? form.name : selectedItem?.name ?? 'Stock movement'}><p>{branchName} · {modalTitle}</p>{catalogueMode ? <><p>{form.unitCode} · SKU {form.sku || 'Not set'} · Barcode {form.barcode || 'Not set'}</p><p>Reference price {price !== null && form.price ? exactRupees(price.toString()) : 'Not set'} · threshold {form.reorderThreshold} · status {modalMode === 'create' ? 'Active' : form.status}</p>{modalMode === 'create' && <p>Opening quantity {form.openingQuantity || '0.000'}; creates an immutable movement.</p>}{fields.schema && <DynamicForm schema={fields.schema} values={fields.values} readOnly />}</> : <><p>Stock change {delta !== null ? quantityText(delta) : '—'} {selectedItem?.unit.label}</p><p>Available at review {selectedItem?.quantity}. Projected quantity {current !== null && delta !== null ? quantityText(current + delta) : '—'}. Preview only; revalidated transactionally.</p><p>{form.reason || 'No reason'} · {form.reference || 'No reference'}</p><p>Appends a permanent fact; original history remains visible.</p></>}</DetailSection>}>
        {(modalMode === 'create' || modalMode === 'edit') && (
          <div className="space-y-4">
            {unitsQuery.isError && <ErrorState title="Units unavailable" message="Reload canonical units before saving." retry={() => void unitsQuery.refetch()} />}
            {fields.error&&<p role="alert">Form configuration unavailable. <button onClick={fields.retry}>Retry fields</button></p>}
            {fields.schema&&<DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
              name:<Input label="Item name" required value={form.name} onChange={e=>setField('name',e.target.value)}/>,
              unitCode:<label className="field">Unit<select aria-label="Unit" value={form.unitCode} onChange={e=>setField('unitCode',e.target.value as InventoryUnit['code'])} className={selectClass}>{(unitsQuery.data??[]).map(u=><option key={u.code} value={u.code}>{u.label}</option>)}</select></label>,
              sku:<Input label="SKU (optional)" value={form.sku} onChange={e=>setField('sku',e.target.value)}/>,
              barcode:<Input label="Barcode (optional)" value={form.barcode} onChange={e=>setField('barcode',e.target.value)}/>,
              price:<Input label="Reference price (INR)" inputMode="decimal" value={form.price} onChange={e=>setField('price',e.target.value)}/>
            }}/>}
            {modalMode==='edit'&&<label className="field">Status<select aria-label="Status" value={form.status} onChange={e=>setField('status',e.target.value as 'active'|'inactive')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
            <Input
                label="Low-stock threshold"
                inputMode="decimal"
                placeholder="0.000"
                value={form.reorderThreshold}
                onChange={(event) => setField('reorderThreshold', event.target.value)}
              />
            {modalMode === 'create' && (
              <Input
                label="Opening quantity (optional)"
                inputMode="decimal"
                placeholder="0.000"
                value={form.openingQuantity}
                onChange={(event) => setField('openingQuantity', event.target.value)}
              />
            )}
            <p className="panel">
              Quantity is never edited directly. An opening quantity creates an immutable opening movement in the same transaction.
            </p>
          </div>
        )}

        {(modalMode === 'receive' || modalMode === 'consume' || modalMode === 'adjust') && selectedItem && (
          <div className="space-y-4">
            <div className="panel">
              <p className="form-label">{selectedItem.name}</p>
              <p className="muted">
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
              required maxLength={32} helper="Positive quantity, up to three decimal places. The server prevents negative stock."
              error={form.quantity && (amount === null || amount <= 0n) ? "Enter a positive exact quantity." : undefined}
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
                maxLength={1000} minLength={modalMode === 'receive' ? undefined : 3} required={modalMode !== 'receive'}
                value={form.reason}
                onChange={(event) => setField('reason', event.target.value)}
                className={`${selectClass} min-h-24`}
              />
            </div>
            <Input
              label="Reference (optional)" maxLength={128}
              value={form.reference}
              onChange={(event) => setField('reference', event.target.value)}
            />
            {modalMode === 'adjust' && (
              <p className="panel">
                This adjustment becomes a permanent inventory fact. Correct a mistake with a reversal.
              </p>
            )}
          </div>
        )}

        {modalMode === 'reverse' && selectedMovement && (
          <div className="space-y-4">
            <div className="panel">
              Reversing {movementLabels[selectedMovement.movementType]} records an exact inverse movement of{' '}
              {selectedMovement.quantity} {selectedMovement.unit.label}. The original fact remains visible.
            </div>
            <div>
              <label className={labelClass} htmlFor="reversal-reason">Reversal reason</label>
              <textarea
                id="reversal-reason"
                required minLength={3} maxLength={1000}
                value={form.reason}
                onChange={(event) => setField('reason', event.target.value)}
                className={`${selectClass} min-h-24`}
              />
            </div>
          </div>
        )}

    </OperationForm>
  </AppPage>;
};
export default InventoryPage;
