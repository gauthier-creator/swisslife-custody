// Déploie un patch sur le Page Layout Account via l'API Metadata SOAP.
// Étapes :
//   1. Retrieve du Layout actuel (pour récupérer tous les champs standards)
//   2. Ajout de notre section Custody à layoutSections
//   3. Deploy du ZIP via deploy() SOAP
//   4. Poll du statut tant que Done=false
//
// Bien plus robuste que la Tooling API pour les Layouts car on reste en XML.
import 'dotenv/config';
import JSZip from 'jszip';

const LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const LAYOUT_FULL_NAME = 'Account-Account (Sales) Layout';

async function getToken() {
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    username: process.env.SF_USERNAME,
    password: `${process.env.SF_PASSWORD}${process.env.SF_SECURITY_TOKEN || ''}`,
  });
  const r = await fetch(`${LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return { accessToken: d.access_token, instanceUrl: d.instance_url };
}

// --- Metadata SOAP helpers -----------------------------------------------
function soap(accessToken, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>${accessToken}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;
}

async function soapCall(instanceUrl, accessToken, action, body) {
  const r = await fetch(`${instanceUrl}/services/Soap/m/59.0`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'SOAPAction': `"${action}"`,
    },
    body: soap(accessToken, body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SOAP ${action} ${r.status}: ${text.slice(0, 500)}`);
  return text;
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

// --- Retrieve the existing layout as MDAPI XML --------------------------
async function retrieveLayout(instanceUrl, accessToken) {
  const body = `<met:retrieve>
    <met:retrieveRequest>
      <met:apiVersion>59.0</met:apiVersion>
      <met:unpackaged>
        <met:types>
          <met:members>${LAYOUT_FULL_NAME}</met:members>
          <met:name>Layout</met:name>
        </met:types>
        <met:version>59.0</met:version>
      </met:unpackaged>
    </met:retrieveRequest>
  </met:retrieve>`;
  const txt = await soapCall(instanceUrl, accessToken, 'retrieve', body);
  const id = extractTag(txt, 'id');
  if (!id) throw new Error('No retrieve id : ' + txt.slice(0, 400));
  return id;
}

async function checkRetrieve(instanceUrl, accessToken, asyncId) {
  const body = `<met:checkRetrieveStatus>
    <met:asyncProcessId>${asyncId}</met:asyncProcessId>
    <met:includeZip>true</met:includeZip>
  </met:checkRetrieveStatus>`;
  const txt = await soapCall(instanceUrl, accessToken, 'checkRetrieveStatus', body);
  return {
    done: extractTag(txt, 'done') === 'true',
    status: extractTag(txt, 'status'),
    zipFile: extractTag(txt, 'zipFile'),
    raw: txt,
  };
}

// --- Deploy helpers ------------------------------------------------------
async function deploy(instanceUrl, accessToken, zipBase64) {
  const body = `<met:deploy>
    <met:ZipFile>${zipBase64}</met:ZipFile>
    <met:DeployOptions>
      <met:allowMissingFiles>false</met:allowMissingFiles>
      <met:autoUpdatePackage>false</met:autoUpdatePackage>
      <met:checkOnly>false</met:checkOnly>
      <met:ignoreWarnings>true</met:ignoreWarnings>
      <met:performRetrieve>false</met:performRetrieve>
      <met:purgeOnDelete>false</met:purgeOnDelete>
      <met:rollbackOnError>true</met:rollbackOnError>
      <met:runAllTests>false</met:runAllTests>
      <met:singlePackage>true</met:singlePackage>
    </met:DeployOptions>
  </met:deploy>`;
  const txt = await soapCall(instanceUrl, accessToken, 'deploy', body);
  const id = extractTag(txt, 'id');
  if (!id) throw new Error('No deploy id : ' + txt.slice(0, 400));
  return id;
}

async function checkDeploy(instanceUrl, accessToken, asyncId) {
  const body = `<met:checkDeployStatus>
    <met:asyncProcessId>${asyncId}</met:asyncProcessId>
    <met:includeDetails>true</met:includeDetails>
  </met:checkDeployStatus>`;
  const txt = await soapCall(instanceUrl, accessToken, 'checkDeployStatus', body);
  return {
    done: extractTag(txt, 'done') === 'true',
    success: extractTag(txt, 'success') === 'true',
    status: extractTag(txt, 'status'),
    raw: txt,
  };
}

// --- Layout XML manipulation --------------------------------------------
function custodySectionXml() {
  return `  <layoutSections>
    <customLabel>true</customLabel>
    <detailHeading>true</detailHeading>
    <editHeading>true</editHeading>
    <label>Custody · Conformité KYC</label>
    <layoutColumns>
      <layoutItems><behavior>Edit</behavior><field>Custody_KYC_Status__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_Risk_Level__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_Sanctions_Clear__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_Adequacy_Done__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_Contract_Signed__c</field></layoutItems>
    </layoutColumns>
    <layoutColumns>
      <layoutItems><behavior>Readonly</behavior><field>Custody_Eligible__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_KYC_Validated_At__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_KYC_Validated_By__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_KYC_Provider__c</field></layoutItems>
      <layoutItems><behavior>Edit</behavior><field>Custody_KYC_Notes__c</field></layoutItems>
    </layoutColumns>
    <style>TwoColumnsTopToBottom</style>
  </layoutSections>
`;
}

function addCustodySection(layoutXml) {
  // XML Layout exige que tous les <layoutSections> soient contigus.
  // Si la section existe déjà → on la remplace in-place. Sinon on
  // l'insère juste APRÈS le dernier </layoutSections> existant.
  if (layoutXml.includes('Custody · Conformité KYC')) {
    return layoutXml.replace(
      /\n {4}<layoutSections>[\s\S]*?Custody · Conformité KYC[\s\S]*?<\/layoutSections>\n/,
      '\n' + custodySectionXml()
    );
  }
  // Find the LAST </layoutSections> and insert right after it.
  const lastIdx = layoutXml.lastIndexOf('</layoutSections>');
  if (lastIdx === -1) {
    // Pas de section existante — insert avant </Layout>
    return layoutXml.replace('</Layout>', custodySectionXml() + '</Layout>');
  }
  const cutAt = lastIdx + '</layoutSections>'.length;
  return layoutXml.slice(0, cutAt) + '\n' + custodySectionXml().trimEnd() + layoutXml.slice(cutAt);
}

// --- Main ---------------------------------------------------------------
async function main() {
  console.log('→ Auth…');
  const { accessToken, instanceUrl } = await getToken();

  console.log('→ Retrieve Layout (SOAP MDAPI)…');
  const retrieveId = await retrieveLayout(instanceUrl, accessToken);
  console.log(`  async id : ${retrieveId}`);

  let retrieveResult;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    retrieveResult = await checkRetrieve(instanceUrl, accessToken, retrieveId);
    process.stdout.write('.');
    if (retrieveResult.done) break;
  }
  console.log('');
  if (!retrieveResult?.done || retrieveResult.status !== 'Succeeded') {
    throw new Error('Retrieve failed : ' + retrieveResult?.raw?.slice(0, 400));
  }
  if (!retrieveResult.zipFile) throw new Error('No zipFile in retrieve result');

  console.log('→ Extraction du ZIP retourné…');
  const retrievedZip = await JSZip.loadAsync(Buffer.from(retrieveResult.zipFile, 'base64'));
  const layoutFileName = Object.keys(retrievedZip.files).find(f => f.endsWith('.layout'));
  if (!layoutFileName) {
    console.log('  fichiers du zip :', Object.keys(retrievedZip.files));
    throw new Error('Layout .layout non trouvé dans le ZIP');
  }
  const layoutXml = await retrievedZip.files[layoutFileName].async('string');
  console.log(`  layout XML : ${layoutXml.length} caractères`);

  console.log('→ Patch : ajout de la section Custody…');
  const patchedXml = addCustodySection(layoutXml);

  console.log('→ Construction du deploy ZIP…');
  const deployZip = new JSZip();
  deployZip.file(`layouts/${LAYOUT_FULL_NAME}.layout`, patchedXml);
  deployZip.file('package.xml', `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${LAYOUT_FULL_NAME}</members>
        <name>Layout</name>
    </types>
    <version>59.0</version>
</Package>
`);
  const deployBuffer = await deployZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const deployBase64 = deployBuffer.toString('base64');

  console.log(`→ Deploy (SOAP MDAPI) · ZIP ${deployBuffer.length} bytes…`);
  const deployId = await deploy(instanceUrl, accessToken, deployBase64);
  console.log(`  async id : ${deployId}`);

  let deployResult;
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 2000));
    deployResult = await checkDeploy(instanceUrl, accessToken, deployId);
    process.stdout.write('.');
    if (deployResult.done) break;
  }
  console.log('');
  if (!deployResult?.done || !deployResult.success) {
    console.error(deployResult?.raw?.slice(0, 1500));
    throw new Error(`Deploy failed : status=${deployResult?.status}`);
  }
  console.log('✓ Deploy succeeded — section Custody ajoutée au Layout Account.');
}

main().catch((err) => { console.error('\nÉchec :', err.message); process.exit(1); });
