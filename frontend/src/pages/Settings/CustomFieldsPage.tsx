import { isAxiosError } from 'axios';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { useLayoutStudio } from '../../hooks/useLayoutStudio';
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { useAppStore } from '../../store/useAppStore';
import { FieldCatalogue } from '../../components/forms/FieldCatalogue';
import { FieldDefinitionEditor, FieldDefinitionSummary } from '../../components/forms/FieldDefinitionEditor';
import { FormLayoutStudio } from '../../components/forms/FormLayoutStudio';
import { blankDefinition, entityNames } from '../../components/forms/fieldDefinitionUtils';
import { ErrorState, Skeleton } from '../../components/ui/WorkspacePrimitives';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { entities, type Definition, type FieldEntity } from '../../components/forms/formSchema';
import { getErrorMessage } from '../../api/errors';

export default function CustomFieldsPage() {
  const scope = useOperationalScope();
  return <CustomFieldsWorkspace key={JSON.stringify(scope)} />;
}
function CustomFieldsWorkspace() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('entity');
  const entity = entities.find(item => item === requested) ?? 'customer';
  const changeEntity = (next: FieldEntity) => {
    setParams(previous => { const query = new URLSearchParams(previous); query.set('entity', next); return query; });
  };
  return <EntityWorkspace key={entity} entity={entity} changeEntity={changeEntity} />;
}
function EntityWorkspace({ entity, changeEntity }: { entity: FieldEntity; changeEntity: (entity: FieldEntity) => void }) {
  const form = useDynamicForm(entity, null);
  const denied = isAxiosError(form.error) && form.error.response?.status === 403;
  // Unmount every old editor/preview/guard immediately on a denied refresh,
  // even when React Query still retains an earlier successful schema.
  if (denied) return <div className="page-stack dynamic-fields-admin"><h1>Data & Forms</h1><label className="field">Record type<select aria-label="Record type" value={entity} onChange={event => changeEntity(event.target.value as FieldEntity)}>{entities.map(item => <option key={item} value={item}>{entityNames[item]}</option>)}</select></label><ErrorState title="Configuration access denied" message={getErrorMessage(form.error, 'Unable to load current configuration.')} retry={form.retry} retryLabel="Reload configuration" /></div>;
  return <LayoutEntityWorkspace entity={entity} changeEntity={changeEntity} form={form} />;
}
function LayoutEntityWorkspace({ entity, changeEntity, form }: { entity: FieldEntity; changeEntity: (entity: FieldEntity) => void; form: ReturnType<typeof useDynamicForm> }) {
  const [editing, setEditing] = useState<Definition | null>(null), [inspecting, setInspecting] = useState<Definition | null>(null);
  const cache = useQueryClient(), scope = useOperationalScope();
  const authority = JSON.stringify(scope), manage = Boolean(useAppStore(state => state.user?.permissions?.includes('fields.manage')));
  const refresh = useCallback(async () => {
    const capturedScope = JSON.parse(authority) as unknown[];
    await cache.invalidateQueries({ queryKey: ['form-schema', ...capturedScope, entity] }, { throwOnError: true });
    await cache.invalidateQueries({ queryKey: ['form-values', ...capturedScope, entity] }, { throwOnError: true });
  }, [cache, entity, authority]);
  const studio = useLayoutStudio(form.schema, authority, manage, refresh);
  return <div className="page-stack dynamic-fields-admin"><header className="page-heading"><div><h1>Data & Forms</h1><p>Organization fields inherit the record’s permissions. Do not store credentials or differently restricted sensitive information here.</p></div></header>
    <label className="field">Record type<select aria-label="Record type" value={entity} disabled={studio.busy} onChange={event => { const next = event.target.value as FieldEntity; studio.guard(() => changeEntity(next)); }}>{entities.map(item => <option key={item} value={item}>{entityNames[item]}</option>)}</select></label>
    {form.error && <ErrorState title="Form configuration unavailable" message={getErrorMessage(form.error, 'Unable to load current configuration.')} retry={form.retry} retryLabel="Reload configuration" />}
    {!form.schema ? (!form.error && <Skeleton label="Loading form schema…" />) : <>
      <FieldCatalogue definitions={form.schema.definitions} manage={manage && !studio.busy} onAdd={() => setEditing(blankDefinition())} onEdit={field => setEditing(structuredClone(field))} onInspect={setInspecting} />
      <FormLayoutStudio studio={studio} manage={manage} />
    </>}
    {editing && <FieldDefinitionEditor key={entity + ':' + (editing.id || 'new')} entity={entity} initial={editing} manage={manage} definitions={form.schema?.definitions ?? []} onSaved={refresh} onClose={() => setEditing(null)} />}
    <AdvancedModal isOpen={Boolean(inspecting)} onClose={() => setInspecting(null)} title="Field definition" presentation="drawer" size="xl">{inspecting && <FieldDefinitionSummary field={inspecting} />}</AdvancedModal>
  </div>;
}
