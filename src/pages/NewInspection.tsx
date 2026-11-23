import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Info, PlayCircle } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { Segmented } from '../components/ui';
import { AQL_VALUES, samplingPlan, type AqlValue, type InspectionLevel } from '../lib/aql';
import { db, getSetting, setSetting, type InspectionType } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { createInspection } from '../lib/repo';
import { PRODUCTS } from '../lib/seed';

export function NewInspection() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const factories = useLiveQuery(() => db.factories.toArray(), []);
  const [form, setForm] = useState({
    buyer: '',
    factoryId: '',
    poNumber: '',
    style: '',
    productCategory: PRODUCTS[0],
    type: 'final' as InspectionType,
    lotSize: 3000,
    level: 'II' as InspectionLevel,
    aqlMajor: '2.5' as AqlValue,
    aqlMinor: '4.0' as AqlValue,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Remember the last order's buyer / factory / AQL setup — inspectors often do several POs in a row.
  useEffect(() => {
    getSetting<Partial<typeof form> | null>('lastNewInspection', null).then((last) => {
      if (last) setForm((f) => ({ ...f, ...last, poNumber: '', style: '' }));
    });
  }, []);

  useEffect(() => {
    if (factories?.length && !form.factoryId) set('factoryId', factories[0].id);
  }, [factories, form.factoryId]);

  const plan = useMemo(() => (form.lotSize >= 2 ? samplingPlan(form.lotSize, form.level, form.aqlMajor, form.aqlMinor) : null), [form]);
  const valid = plan && form.factoryId && form.poNumber.trim() && form.style.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const inspector = await getSetting('inspector', 'Inspector');
    const { poNumber: _p, style: _s, ...defaults } = form;
    void _p, void _s;
    await setSetting('lastNewInspection', defaults);
    const id = await createInspection({ ...form, buyer: form.buyer.trim() || undefined, poNumber: form.poNumber.trim(), style: form.style.trim(), inspector });
    navigate(`/inspect/${id}`, { replace: true });
  }

  return (
    <>
      <TopBar
        title={t('newInspection')}
        left={
          <button onClick={() => navigate(-1)} className="-ml-1 grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
        }
      />
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-36">
        <section className="card space-y-4 p-4">
          <div>
            <label className="label" htmlFor="buyer">{t('buyer')}</label>
            <input id="buyer" className="field" placeholder="e.g. Nordic Home AB" value={form.buyer} onChange={(e) => set('buyer', e.target.value)} autoComplete="organization" />
          </div>
          <div>
            <label className="label" htmlFor="factory">{t('factory')}</label>
            <select id="factory" className="field" value={form.factoryId} onChange={(e) => set('factoryId', e.target.value)}>
              {factories?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.location}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="po">{t('poNumber')}</label>
              <input id="po" className="field" placeholder="PO-25102" value={form.poNumber} onChange={(e) => set('poNumber', e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="style">{t('style')}</label>
              <input id="style" className="field" placeholder="KNT-1048" value={form.style} onChange={(e) => set('style', e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="product">{t('product')}</label>
            <select id="product" className="field" value={form.productCategory} onChange={(e) => set('productCategory', e.target.value)}>
              {PRODUCTS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">{t('inspectionType')}</span>
            <Segmented
              value={form.type}
              onChange={(v) => set('type', v)}
              options={(['inline', 'pre-final', 'final'] as const).map((v) => ({ value: v, label: t(v) }))}
            />
          </div>
        </section>

        <section className="card space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lot">{t('lotSize')}</label>
              <input
                id="lot"
                className="field tabular-nums"
                type="number"
                inputMode="numeric"
                min={2}
                value={form.lotSize || ''}
                onChange={(e) => set('lotSize', Number(e.target.value))}
              />
            </div>
            <div>
              <span className="label">{t('level')}</span>
              <Segmented value={form.level} onChange={(v) => set('level', v)} options={(['I', 'II', 'III'] as const).map((v) => ({ value: v, label: v }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="aqlMaj">AQL · {t('major')}</label>
              <select id="aqlMaj" className="field" value={form.aqlMajor} onChange={(e) => set('aqlMajor', e.target.value as AqlValue)}>
                {AQL_VALUES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="aqlMin">AQL · {t('minor')}</label>
              <select id="aqlMin" className="field" value={form.aqlMinor} onChange={(e) => set('aqlMinor', e.target.value as AqlValue)}>
                {AQL_VALUES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {plan && (
          <section className="animate-fade overflow-hidden rounded-2xl bg-ink-900 text-white">
            <div className="flex items-center justify-between px-4 pt-4">
              <span className="text-xs font-semibold tracking-wide text-ink-400 uppercase">{t('samplingPlan')}</span>
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold">
                ISO 2859-1 · Code {plan.codeLetter}
              </span>
            </div>
            <div className="flex items-end gap-2 px-4 pt-2">
              <span className="text-5xl font-bold tabular-nums">{plan.sampleSize}</span>
              <span className="pb-1.5 text-ink-400">
                pcs {t('sample').toLowerCase()} {plan.fullInspection && '· 100%'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
              {(
                [
                  ['critical', plan.critical, '0'],
                  ['major', plan.major, plan.major.aql],
                  ['minor', plan.minor, plan.minor.aql],
                ] as const
              ).map(([k, p, aql]) => (
                <div key={k} className="px-4 py-3">
                  <div className="text-[11px] font-semibold text-ink-400 uppercase">
                    {t(k)} · {aql}
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums">
                    Ac <b className="text-lg">{p.ac}</b> · Re <b className="text-lg">{p.re}</b>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <p className="flex gap-2 px-1 text-xs text-ink-500">
          <Info className="size-4 shrink-0" />
          Accept the lot if defects ≤ Ac; reject at Re. Critical (safety) defects are zero-tolerance.
        </p>

        <div className="no-print pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-2xl px-4 pt-3">
            <button type="submit" disabled={!valid} className="btn-brand w-full text-base">
              <PlayCircle className="size-5" /> {t('start')}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
