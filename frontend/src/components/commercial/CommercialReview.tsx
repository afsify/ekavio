import type { ReactNode } from 'react';
import { OperationForm } from '../ui/OperationForm';
import { uncertainWrite } from '../../utils/mutationOutcome';

export interface CommercialCommand { title: string; facts: ReactNode; submit: () => void; retryIdentical?: boolean }
/** Review is a component-memory command snapshot, never a credential or new authority. */
export function CommercialReview({command,busy,error,close}:{command:CommercialCommand|null;busy:boolean;error:unknown;close:()=>void}) {
  return <OperationForm open={Boolean(command)} title={command?.title??'Commercial action'} dirty={false} busy={busy} error={error} valid={Boolean(command)&&(!uncertainWrite(error)||Boolean(command?.retryIdentical))} confirmLabel={command?.title??'Confirm'} onConfirm={()=>command?.submit()} onClose={close} retryAdvice={command?.retryIdentical?'Retry retains exactly the reviewed payload and original key.':'Check authoritative records before retrying a conflicting or uncertain operation.'} review={<section className="panel page-stack">{command?.facts}<p>Operator-only action. The server rechecks current authority, lifecycle and exact settlement. No payment gateway, automatic charge or tax invoice is created.</p></section>}><p>Review the selected organization, exact terms and consequences before confirming.</p>{command?.facts}</OperationForm>;
}
