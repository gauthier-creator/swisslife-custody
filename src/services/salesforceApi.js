import { API_BASE, STORAGE_KEYS } from '../config/constants';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-sf-instance-url': localStorage.getItem(STORAGE_KEYS.SF_INSTANCE_URL) || '',
  'x-sf-access-token': localStorage.getItem(STORAGE_KEYS.SF_ACCESS_TOKEN) || '',
});

export async function fetchClients(search = '') {
  const soql = search
    ? `SELECT Id, Name, Phone, Industry, Type, AnnualRevenue, CreatedDate, BillingCity, BillingCountry, Website, Description FROM Account WHERE Name LIKE '%${search}%' ORDER BY Name LIMIT 50`
    : `SELECT Id, Name, Phone, Industry, Type, AnnualRevenue, CreatedDate, BillingCity, BillingCountry, Website, Description FROM Account ORDER BY Name LIMIT 50`;

  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Salesforce query failed');
  const data = await res.json();
  return (data.records || []).map(mapAccount);
}

export async function fetchClientById(id) {
  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/sobjects/Account/${id}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Client not found');
  const data = await res.json();
  return mapAccount(data);
}

export async function fetchContacts(accountId) {
  const soql = `SELECT Id, FirstName, LastName, Email, Phone, Title, Department FROM Contact WHERE AccountId = '${accountId}' ORDER BY LastName`;
  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, {
    headers: getHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
}

export async function testConnection() {
  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/limits`, {
    headers: getHeaders(),
  });
  return res.ok;
}

function mapAccount(a) {
  return {
    id: a.Id,
    name: a.Name,
    phone: a.Phone,
    industry: a.Industry,
    type: a.Type,
    aum: a.AnnualRevenue || 0,
    createdDate: a.CreatedDate,
    city: a.BillingCity,
    country: a.BillingCountry,
    website: a.Website,
    description: a.Description,
  };
}
