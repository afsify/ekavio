import { useState } from 'react';
import { useCustomers, useBranchServices } from './useQueue';
export function useReceptionSelection() {
  const [customerSearch, setCustomerSearch] = useState(''), [serviceSearch, setServiceSearch] = useState('');
  const [customerId, setCustomerId] = useState(''), [serviceId, setServiceId] = useState('');
  const customers = useCustomers(customerSearch), services = useBranchServices(serviceSearch);
  const customer = customers.data?.data.find(c => c.id === customerId), service = services.data?.data.find(s => s.id === serviceId);
  return { customerSearch, setCustomerSearch, serviceSearch, setServiceSearch, customerId, setCustomerId, serviceId, setServiceId, customers, services, customer, service,
    ready: Boolean(customer && service && !customers.isFetching && !services.isFetching && !customers.isError && !services.isError),
    reset: () => { setCustomerSearch(''); setServiceSearch(''); setCustomerId(''); setServiceId(''); } };
}
