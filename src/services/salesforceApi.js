import { API_BASE } from '../config/constants';

const headers = { 'Content-Type': 'application/json' };

// Check if Salesforce is configured server-side
export async function getSalesforceStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/salesforce/status`, { headers });
    if (!res.ok) return { configured: false };
    return res.json();
  } catch {
    return { configured: false };
  }
}

export async function fetchClients(search = '') {
  const soql = search
    ? `SELECT Id, Name, Phone, Industry, Type, AnnualRevenue, CreatedDate, BillingCity, BillingCountry, Website, Description FROM Account WHERE Name LIKE '%${search}%' ORDER BY Name LIMIT 50`
    : `SELECT Id, Name, Phone, Industry, Type, AnnualRevenue, CreatedDate, BillingCity, BillingCountry, Website, Description FROM Account ORDER BY Name LIMIT 50`;

  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.mock) throw new Error('MOCK_MODE');
    throw new Error('Salesforce query failed');
  }
  const data = await res.json();
  return (data.records || []).map(mapAccount);
}

export async function fetchClientById(id) {
  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/sobjects/Account/${id}`, { headers });
  if (!res.ok) throw new Error('Client not found');
  const data = await res.json();
  return mapAccount(data);
}

export async function fetchContacts(accountId) {
  const soql = `SELECT Id, FirstName, LastName, Email, Phone, Title, Department FROM Contact WHERE AccountId = '${accountId}' ORDER BY LastName`;
  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
}

export async function testConnection() {
  try {
    const status = await getSalesforceStatus();
    return status.configured;
  } catch {
    return false;
  }
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
