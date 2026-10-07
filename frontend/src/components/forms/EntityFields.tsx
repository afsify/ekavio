import { DynamicForm, type FieldEntity } from './DynamicForm';
import { useDynamicForm } from '../../hooks/useDynamicForm';
export function EntityFields({entity,id}:{entity:FieldEntity;id:string}) {
 const form=useDynamicForm(entity,id);
 return form.error?<p role="alert">Additional information unavailable. <button onClick={form.retry}>Retry fields</button></p>:!form.ready?<p role="status">Loading additional information…</p>:form.schema?<DynamicForm schema={form.schema} values={form.values} readOnly/>:null;
}
