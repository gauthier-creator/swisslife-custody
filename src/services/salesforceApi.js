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

const ACCOUNT_FIELDS = 'Id, Name, Phone, Industry, Type, AnnualRevenue, CreatedDate, BillingStreet, BillingCity, BillingPostalCode, BillingCountry, Website, Description, NumberOfEmployees, OwnerId, AccountNumber';

export async function fetchClients(search = '') {
  const soql = search
    ? `SELECT ${ACCOUNT_FIELDS} FROM Account WHERE Name LIKE '%${search}%' ORDER BY Name LIMIT 50`
    : `SELECT ${ACCOUNT_FIELDS} FROM Account ORDER BY Name LIMIT 50`;

  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, { headers });
  if (!res.ok) {
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
  const soql = `SELECT Id, FirstName, LastName, Email, Phone, Title, Department, CreatedDate FROM Contact WHERE AccountId = '${accountId}' ORDER BY LastName`;
  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
}

// Parse structured info from Description field
export function parseDescription(desc) {
  if (!desc) return { text: '', kyc: null, risk: null, documents: [], allocation: null };

  const kycMatch = desc.match(/KYC\s+(valid[eé]\s+le\s+[\d/]+|en cours[^.]*|rejet[eé][^.]*)/i);
  const riskMatch = desc.match(/Profil de risque\s*:\s*([^.]+)/i);
  const docsMatch = desc.match(/Documents?\s*:\s*([^.]+(?:\.[^A-Z])*)/i);
  const allocMatch = desc.match(/[Aa]llocation\s+(?:crypto\s+)?(?:cible\s*:\s*)?(\d+[^.]*)/i);

  // Extract the main description text (first sentence or two)
  const mainText = desc.split(/\.\s*KYC|Documents|Profil de risque/i)[0]?.trim();

  return {
    text: mainText || desc,
    kyc: kycMatch ? kycMatch[1].trim() : null,
    risk: riskMatch ? riskMatch[1].trim() : null,
    documents: docsMatch ? docsMatch[1].split(',').map(d => d.trim()).filter(Boolean) : [],
    allocation: allocMatch ? allocMatch[1].trim() : null,
  };
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
    street: a.BillingStreet,
    city: a.BillingCity,
    postalCode: a.BillingPostalCode,
    country: a.BillingCountry,
    website: a.Website,
    description: a.Description,
    employees: a.NumberOfEmployees,
    ownerId: a.OwnerId,
    accountNumber: a.AccountNumber,
  };
}
