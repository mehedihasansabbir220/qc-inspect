import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BadgeCheck, Info, PlayCircle, Plus } from 'lucide-react';
import { TopBar } from '../components/AppShell';
import { Segmented } from '../components/ui';
import { Combo } from '../components/Combo';
import { AQL_VALUES, samplingPlan, type AqlValue, type InspectionLevel } from '../lib/aql';
import { db, getSetting, setSetting, uid, type InspectionType } from '../lib/db';
import { useI18n } from '../lib/i18n';
import { createInspection } from '../lib/repo';
import { BUYERS, TEMPLATES, buyerByName, templateById } from '../lib/templates';

const unique = (xs: (string | undefined)[]) => [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));

export function NewInspection() {
  const { t, pick } = useI18n();
  const navigate = useNavigate();
  const factories = useLiveQuery(() => db.factories.toArray(), []);
  const history = useLiveQuery(() => db.inspections.toArray(), []);
  const [form, setForm] = useState({
    templateId: TEMPLATES[0].id,
    buyer: '',
    factoryName: '',
    factoryLocation: '',
    poNumber: '',
    style: '',
    productCategory: TEMPLATES[0].products[0],
    type: 'final' as InspectionType,
    lotSize: 3000,
    level: 'II' as InspectionLevel,
    aqlMajor: '2.5' as AqlValue,
    aqlMinor: '4.0' as AqlValue,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const template = templateById.get(form.templateId) ?? TEMPLATES[0];
  const profile = buyerByName(form.buyer);

  // Remember the last order's setup — inspectors often do several POs in a row for the same buyer.
  useEffect(() => {
    getSetting<Partial<typeof form> | null>('lastNewInspection', null).then((last) => {
      if (last) setForm((f) => ({ ...f, ...last, poNumber: '', style: '' }));
    });
  }, []);

  useEffect(() => {
    if (factories?.length && !form.factoryName) set('factoryName', factories[0].name);
  }, [factories, form.factoryName]);

  // A known buyer's QA manual sets its AQL / level automatically (still editable below).
  function setBuyer(v: string) {
    const p = buyerByName(v);
    setForm((f) => ({ ...f, buyer: v, ...(p ? { level: p.level, aqlMajor: p.aqlMajor, aqlMinor: p.aqlMinor } : {}) }));
  }

  function setTemplate(id: string) {
    const tpl = templateById.get(id)!;
    setForm((f) => ({ ...f, templateId: id, productCategory: tpl.products.includes(f.productCategory) ? f.productCategory : tpl.products[0] }));
  }

  const knownFactory = factories?.find((f) => f.name.toLowerCase() === form.factoryName.trim().toLowerCase());
  const buyerOptions = unique([...BUYERS.map((b) => b.name), ...(history ?? []).map((i) => i.buyer)]);
  const productOptions = unique([...template.products, ...(history ?? []).filter((i) => (i.templateId ?? 'apparel-top') === template.id).map((i) => i.productCategory)]);

  const plan = useMemo(() => (form.lotSize >= 2 ? samplingPlan(form.lotSize, form.level, form.aqlMajor, form.aqlMinor) : null), [form.lotSize, form.level, form.aqlMajor, form.aqlMinor]);
  const valid = plan && form.factoryName.trim() && form.poNumber.trim() && form.style.trim() && form.productCategory.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // New factory typed in → add it to this device's factory list for next time.
    let factoryId = knownFactory?.id;
    if (!factoryId) {
      factoryId = uid();
      await db.factories.add({ id: factoryId, name: form.factoryName.trim(), location: form.factoryLocation.trim() });
    }
    const inspector = await getSetting('inspector', 'Inspector');
    const { poNumber: _p, style: _s, ...defaults } = form;
    void _p, void _s;
    await setSetting('lastNewInspection', defaults);
    const id = await createInspection({
      templateId: form.templateId,
      buyer: form.buyer.trim() || undefined,
      factoryId,
      poNumber: form.poNumber.trim(),
      style: form.style.trim(),
      productCategory: form.productCategory.trim(),
      type: form.type,
      lotSize: form.lotSize,
      level: form.level,
      aqlMajor: form.aqlMajor,
      aqlMinor: form.aqlMinor,
      inspector,
    });
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
        {/* 1. What is being inspected */}
        <section className="card space-y-3 p-4">
          <span className="label">Product type</span>
          {(['Soft goods', 'Hard goods'] as const).map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-[11px] font-semibold text-ink-400">{g}</div>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.filter((x) => x.group === g).map((x) => {
                  const on = x.id === form.templateId;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setTemplate(x.id)}
                      aria-pressed={on}
                      className={`rounded-xl p-3 text-left ring-1 transition ${on ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white ring-ink-200 hover:ring-ink-400'}`}
                    >
                      <span className="block text-sm leading-tight font-bold">{pick(x)}</span>
                      <span className={`mt-0.5 block text-[11px] ${on ? 'text-ink-300' : 'text-ink-500'}`}>
                        {x.defects.length} defects · {x.poms.length} measurements
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* 2. Order */}
        <section className="card space-y-4 p-4">
          <Combo
            id="buyer"
            label={t('buyer')}
            value={form.buyer}
            onChange={setBuyer}
            options={buyerOptions}
            placeholder="Pick from the list or type a company name"
            hint={
              profile && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-brand-600">
                  <BadgeCheck className="mt-px size-4 shrink-0" />
                  {profile.name} QA manual applied: AQL {profile.aqlMajor} / {profile.aqlMinor}, level {profile.level}
                  {profile.checks.length ? ` + ${profile.checks.length} buyer check${profile.checks.length > 1 ? 's' : ''}` : ''}.
                </p>
              )
            }
          />
          <Combo
            id="factory"
            label={t('factory')}
            value={form.factoryName}
            onChange={(v) => set('factoryName', v)}
            options={unique((factories ?? []).map((f) => f.name))}
            placeholder="Pick a factory or type a new one"
            hint={
              form.factoryName.trim() && !knownFactory ? (
                <div className="mt-2 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                    <Plus className="size-3.5" /> New factory — it will be saved for next time
                  </p>
                  <input className="field !py-2" placeholder="Location, e.g. Gazipur" value={form.factoryLocation} onChange={(e) => set('factoryLocation', e.target.value)} aria-label="Factory location" />
                </div>
              ) : (
                knownFactory?.location && <p className="mt-1 text-xs text-ink-500">{knownFactory.location}</p>
              )
            }
          />
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
          <Combo id="product" label={t('product')} value={form.productCategory} onChange={(v) => set('productCategory', v)} options={productOptions} placeholder="Pick or type a product" />
          <div>
            <span className="label">{t('inspectionType')}</span>
            <Segmented value={form.type} onChange={(v) => set('type', v)} options={(['inline', 'pre-final', 'final'] as const).map((v) => ({ value: v, label: t(v) }))} />
          </div>
        </section>

        {/* 3. Sampling */}
        <section className="card space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lot">{t('lotSize')}</label>
              <input id="lot" className="field tabular-nums" type="number" inputMode="numeric" min={2} value={form.lotSize || ''} onChange={(e) => set('lotSize', Number(e.target.value))} />
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
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold">ISO 2859-1 · Code {plan.codeLetter}</span>
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
          Every field accepts your own value. During the inspection you can also add your own checks, measurement points and “other” defects.
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
