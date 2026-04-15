import { useState, useEffect, useRef } from 'react';

/* ─────────────────────────────────────────────────────────
   Contract signing — the client's first encounter
   An instrument as much as a document. Editorial gravitas.
   ───────────────────────────────────────────────────────── */

const fmtDateFR = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ContractSigningPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signerName, setSignerName] = useState('');
  const contractRef = useRef(null);

  useEffect(() => { fetchContract(); }, [token]);

  const fetchContract = async () => {
    try {
      const res = await fetch(`/api/signing/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lien invalide ou expiré');
      }
      const json = await res.json();
      setData(json);
      if (json.status === 'signed') setSigned(true);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleSign = async () => {
    if (!signerName.trim()) return alert('Veuillez saisir votre nom complet pour signer.');
    setSigning(true);
    try {
      const res = await fetch(`/api/signing/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la signature');
      }
      setSigned(true);
    } catch (err) { alert(err.message); }
    setSigning(false);
  };

  const handlePrint = () => {
    const content = contractRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Contrat · ${data.client_name}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Geist:wght@400;500&display=swap');
        body{font-family:'Fraunces',Georgia,serif;max-width:680px;margin:40px auto;padding:40px;color:#0B0B0C;line-height:1.7;font-size:13px;background:#FAFAF7}
        h1{font-family:'Fraunces',Georgia,serif;font-size:32px;font-weight:400;text-align:left;margin:0 0 40px;letter-spacing:-0.02em;line-height:1.05}
        h2{font-family:'Geist',sans-serif;font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#6B6B70;margin:32px 0 8px}
        p{margin:8px 0;text-align:justify}
        .signature{margin-top:48px;display:flex;justify-content:space-between}
        .signature div{width:45%;border-top:1px solid #0B0B0C;padding-top:8px}
        @media print{body{margin:0;padding:20px;background:white}}
      </style>
      </head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center animate-fade">
          <div className="w-5 h-5 border border-[rgba(11,11,12,0.12)] border-t-[#0B0B0C] rounded-full animate-spin mx-auto" style={{ animationDuration: '1.1s' }} />
          <p className="eyebrow mt-6">Chargement du contrat</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center animate-rise">
          <p className="eyebrow text-[#7A2424] mb-4">Lien invalide</p>
          <h1 className="font-display text-[34px] text-[#0B0B0C] leading-tight">
            Ce lien n'est plus valide.
          </h1>
          <p className="text-[14px] text-[#6B6B70] mt-5 font-light leading-relaxed">
            {error}
          </p>
          <div className="mt-10 pt-8 border-t border-[rgba(11,11,12,0.08)]">
            <p className="eyebrow">
              SwissLife Banque Privée · Paris
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────
  if (signed) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center animate-whisper">
          <p className="eyebrow text-[#2E5D4F] mb-6">Signature enregistrée</p>
          <h1 className="font-display-tight text-[56px] leading-[0.96] text-[#0B0B0C]">
            Merci, {data.client_name.split(' ')[0]}.
          </h1>
          <p className="mt-8 text-[15px] text-[#2C2C2E] leading-[1.7] font-light max-w-md mx-auto">
            Votre contrat de conservation d'actifs numériques a été enregistré
            et versé à votre dossier. Votre banquier privé vous contactera
            pour les prochaines étapes.
          </p>
          <div className="mt-16 pt-10 border-t border-[rgba(11,11,12,0.08)]">
            <p className="eyebrow">
              SwissLife Banque Privée · Paris
            </p>
            <p className="eyebrow text-[#A8A8AD] mt-1">
              Signature électronique · Art. 1367 C. civ.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Contract ──────────────────────────────────────────
  const clientName = data.client_name || '';
  const clientAddress = [data.client_street, data.client_postal_code, data.client_city, data.client_country].filter(Boolean).join(' · ') || 'Adresse non renseignée';
  const clientPhone = data.client_phone || 'Non renseigné';
  const currentDate = fmtDateFR();

  const articles = [
    { n: 'I', title: 'Objet', body: 'Le présent contrat a pour objet de définir les conditions dans lesquelles La Banque assure, pour le compte du Client, la conservation d\'actifs numériques au sens de l\'article L.54-10-1 du Code Monétaire et Financier et du règlement (UE) 2023/1114 (MiCA).' },
    { n: 'II', title: 'Services de conservation', body: 'La Banque assure la garde des clés cryptographiques privées nécessaires à la détention et au transfert des actifs numériques du Client, au moyen d\'une infrastructure de type MPC (Multi-Party Computation) conforme aux standards de sécurité de l\'industrie.' },
    { n: 'III', title: 'Ségrégation des actifs', body: 'Conformément à l\'article 75(7) du règlement MiCA, les actifs numériques du Client sont conservés sur des adresses blockchain distinctes de celles de La Banque et des autres clients. Les actifs du Client ne font pas partie du bilan de La Banque.' },
    { n: 'IV', title: 'Responsabilité', body: 'La Banque est responsable de la perte d\'actifs numériques résultant d\'un incident imputable à La Banque ou à ses prestataires techniques, conformément à l\'article 75(8) du règlement MiCA. La valeur de restitution correspond à la valeur de marché des actifs au moment de la perte.' },
    { n: 'V', title: 'Restitution', body: 'Le Client peut demander la restitution de tout ou partie de ses actifs numériques à tout moment. La Banque s\'engage à exécuter la restitution dans un délai raisonnable ne pouvant excéder cinq jours ouvrables.' },
    { n: 'VI', title: 'Frais', body: 'Les frais de conservation sont exprimés en points de base par an, calculés sur la valeur de marché moyenne des actifs conservés. Les frais de transaction sont facturés séparément selon le barème en vigueur.' },
    { n: 'VII', title: 'Lutte contre le blanchiment', body: 'Le Client s\'engage à respecter l\'ensemble des obligations relatives à la lutte contre le blanchiment et le financement du terrorisme. La Banque se réserve le droit de geler les actifs du Client sur instruction de Tracfin ou de toute autorité compétente (art. L.562-4 CMF).' },
    { n: 'VIII', title: 'Durée et résiliation', body: 'Le présent contrat est conclu pour une durée indéterminée. Chaque partie peut le résilier moyennant un préavis de trente jours. En cas de résiliation, les actifs sont restitués au Client conformément à l\'article V.' },
    { n: 'IX', title: 'Droit applicable', body: 'Le présent contrat est soumis au droit français. Tout litige sera soumis aux tribunaux compétents de Paris.' },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0B0B0C]">
      {/* ── Masthead ──────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[rgba(250,250,247,0.85)] border-b border-[rgba(11,11,12,0.08)]"
              style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="max-w-[760px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[20px] text-[#0B0B0C] tracking-[-0.03em]">SwissLife</span>
            <span className="eyebrow text-[#8A6F3D]">Conservation</span>
          </div>
          <button
            onClick={handlePrint}
            className="eyebrow text-[#6B6B70] hover:text-[#0B0B0C] transition-colors"
          >
            Imprimer ↗
          </button>
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-8 py-16">
        {/* ── Preface ────────────────────────────────── */}
        <div className="mb-16 animate-rise">
          <p className="eyebrow mb-4">Document contractuel · {currentDate}</p>
          <h1 className="font-display-tight text-[54px] leading-[0.96] text-[#0B0B0C] max-w-xl">
            Contrat de conservation d'actifs numériques
          </h1>
          <p className="mt-8 text-[15px] text-[#6B6B70] leading-[1.8] font-light max-w-xl">
            Veuillez prendre le temps de lire ce document en entier. Il décrit
            les conditions selon lesquelles SwissLife Banque Privée assure la
            garde de vos actifs numériques, conformément au règlement européen
            MiCA et au Code monétaire et financier.
          </p>
        </div>

        {/* ── Contract body ──────────────────────────── */}
        <article
          ref={contractRef}
          className="animate-fade"
        >
          {/* Parties */}
          <div className="grid grid-cols-2 gap-12 py-10 border-t border-b border-[rgba(11,11,12,0.16)]">
            <div>
              <p className="eyebrow mb-3">La Banque</p>
              <p className="font-display text-[18px] text-[#0B0B0C] leading-tight">
                SwissLife Banque Privée
              </p>
              <div className="mt-2 text-[12px] text-[#6B6B70] leading-relaxed font-light">
                Société Anonyme · 7 rue Belgrand<br />
                92300 Levallois-Perret<br />
                RCS Nanterre<br />
                Prestataire de Services sur Actifs Numériques
              </div>
            </div>
            <div>
              <p className="eyebrow mb-3">Le Client</p>
              <p className="font-display text-[18px] text-[#0B0B0C] leading-tight">
                {clientName}
              </p>
              <div className="mt-2 text-[12px] text-[#6B6B70] leading-relaxed font-light">
                {clientAddress}<br />
                {clientPhone}
              </div>
            </div>
          </div>

          {/* Articles */}
          <div className="mt-12 space-y-10">
            {articles.map(a => (
              <section key={a.n} className="grid grid-cols-12 gap-6">
                <div className="col-span-2">
                  <p className="eyebrow text-[#8A6F3D] tabular">Article {a.n}</p>
                </div>
                <div className="col-span-10">
                  <h2 className="font-display text-[22px] text-[#0B0B0C] leading-tight mb-3">
                    {a.title}
                  </h2>
                  <p className="text-[14px] text-[#2C2C2E] leading-[1.8] font-light text-justify">
                    {a.body}
                  </p>
                </div>
              </section>
            ))}
          </div>

          {/* Closing */}
          <div className="mt-16 pt-10 border-t border-[rgba(11,11,12,0.16)]">
            <p className="text-[14px] text-[#2C2C2E] font-light">
              Fait à Paris, le {currentDate}.
            </p>
            <div className="mt-12 grid grid-cols-2 gap-12">
              <div>
                <div className="border-t border-[#0B0B0C] pt-3">
                  <p className="eyebrow mb-1">Le Client</p>
                  <p className="font-display text-[15px] text-[#0B0B0C]">{clientName}</p>
                </div>
              </div>
              <div>
                <div className="border-t border-[#0B0B0C] pt-3">
                  <p className="eyebrow mb-1">La Banque</p>
                  <p className="font-display text-[15px] text-[#0B0B0C]">SwissLife Banque Privée</p>
                </div>
              </div>
            </div>
          </div>
        </article>

        {/* ── Signature panel ─────────────────────────── */}
        <div className="mt-16 pt-12 border-t border-[rgba(11,11,12,0.16)]">
          <p className="eyebrow mb-4">Signature électronique</p>
          <h3 className="font-display text-[32px] text-[#0B0B0C] leading-tight">
            Apposez votre signature
          </h3>
          <p className="mt-4 text-[14px] text-[#6B6B70] leading-relaxed font-light max-w-xl">
            En signant, vous acceptez les conditions ci-dessus.
            Cette signature électronique a valeur contractuelle conformément à l'article 1367 du Code civil.
            L'horodatage et l'adresse IP sont enregistrés pour la conformité réglementaire.
          </p>

          <div className="mt-10 max-w-lg">
            <label className="eyebrow block mb-3">Votre nom complet</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={clientName}
              className="w-full px-0 py-3 text-[24px] text-[#0B0B0C] bg-transparent border-0 border-b border-[rgba(11,11,12,0.16)] outline-none focus:border-[#0B0B0C] transition-colors placeholder:text-[#CFCFD1] placeholder:font-light"
              style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 400 }}
            />
          </div>

          <div className="mt-10">
            <button
              onClick={handleSign}
              disabled={signing || !signerName.trim()}
              className="inline-flex items-center gap-3 px-8 py-4 bg-[#0B0B0C] text-[#FAFAF7] text-[13px] font-medium tracking-tight hover:bg-[#2C2C2E] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderRadius: '2px' }}
            >
              {signing ? (
                <>
                  <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" style={{ animationDuration: '1.1s' }} />
                  Signature en cours
                </>
              ) : (
                <>
                  Signer le contrat
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Colophon ────────────────────────────────── */}
        <footer className="mt-20 pt-10 border-t border-[rgba(11,11,12,0.08)]">
          <div className="flex items-center justify-between">
            <p className="eyebrow">SwissLife Banque Privée · Paris</p>
            <p className="eyebrow text-[#A8A8AD]">AMF · ACPR · MiCA Art. 60</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
