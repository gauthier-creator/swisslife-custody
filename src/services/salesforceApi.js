import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';

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

const BASE_FIELDS = 'Id, Name, Phone, Industry, Type, AnnualRevenue, CreatedDate, BillingStreet, BillingCity, BillingPostalCode, BillingCountry, Website, Description, NumberOfEmployees, OwnerId, AccountNumber';
const CUSTODY_FIELDS = ', Custody_KYC_Status__c, Custody_Risk_Level__c, Custody_Sanctions_Clear__c, Custody_Adequacy_Done__c, Custody_Contract_Signed__c, Custody_Eligible__c';

export async function fetchClients(search = '') {
  const where = search ? ` WHERE Name LIKE '%${search}%'` : '';
  const order = ' ORDER BY Name LIMIT 50';

  // Try with custody custom fields first, fallback without if they don't exist yet
  const soqlFull = `SELECT ${BASE_FIELDS}${CUSTODY_FIELDS} FROM Account${where}${order}`;
  const soqlBase = `SELECT ${BASE_FIELDS} FROM Account${where}${order}`;

  let res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soqlFull)}`, { headers });

  if (!res.ok) {
    // Custom fields may not exist — retry without them
    res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/query/?q=${encodeURIComponent(soqlBase)}`, { headers });
    if (!res.ok) {
      throw new Error('Salesforce query failed');
    }
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

export async function updateAccountFields(accountId, fields) {
  const { data: { session } } = await supabase.auth.getSession();
  const authHeaders = session?.access_token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
    : headers;
  const res = await fetch(`${API_BASE}/api/salesforce/account/${accountId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Salesforce update failed');
  }
  return res.json();
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
    Custody_KYC_Status__c: a.Custody_KYC_Status__c || null,
    Custody_Risk_Level__c: a.Custody_Risk_Level__c || null,
    Custody_Sanctions_Clear__c: !!a.Custody_Sanctions_Clear__c,
    Custody_Adequacy_Done__c: !!a.Custody_Adequacy_Done__c,
    Custody_Contract_Signed__c: !!a.Custody_Contract_Signed__c,
    Custody_Eligible__c: !!a.Custody_Eligible__c,
  };
}
