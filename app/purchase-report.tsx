'use client';

import { useState } from 'react';
import { reportPeriod, summarizePurchases, type Period, type Purchase } from '@/lib/purchase-report';

const periods = { week: 'Settimana', month: 'Mese', year: 'Anno' };
const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const euro = (cents: number) => currency.format(cents / 100);

export function PurchaseReport({ purchases }: { purchases: Purchase[] }) {
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const { start, end, label } = reportPeriod(period, offset);
  const rows = summarizePurchases(purchases, start, end);
  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const priced = rows.reduce((sum, row) => sum + row.priced, 0);
  const cents = rows.reduce((sum, row) => sum + row.cents, 0);

  function chart(title: string, key: 'qty' | 'cents') {
    const top = rows.filter(row => key === 'qty' || row.priced > 0)
      .sort((a, b) => b[key] - a[key]).slice(0, 3);
    if (!top.length) return null;
    return <section className="report-chart"><h2>{title}</h2>{top.map(row =>
      <div className="report-bar" key={row.id}>
        <div><span>{row.name}</span><strong>{key === 'qty' ? row.qty : euro(row.cents)}</strong></div>
        <meter aria-label={row.name} max={Math.max(1, top[0][key])} value={row[key]} />
      </div>
    )}</section>;
  }

  return <section className="purchase-report">
    <h1>Report</h1>
    <div className="report-periods" aria-label="Periodo">
      {(Object.keys(periods) as Period[]).map(value =>
        <button key={value} aria-pressed={period === value} onClick={() => { setPeriod(value); setOffset(0); }}>{periods[value]}</button>
      )}
    </div>
    <div className="report-date">
      <button aria-label="Periodo precedente" onClick={() => setOffset(value => value - 1)}>‹</button>
      <strong aria-live="polite">{label}</strong>
      <button aria-label="Periodo successivo" disabled={offset === 0} onClick={() => setOffset(value => value + 1)}>›</button>
    </div>
    <div className="report-totals">
      <span><b>{rows.length}</b>Prodotti distinti</span>
      <span><b>{qty}</b>Quantità totale</span>
      <span><b>{priced ? euro(cents) : '—'}</b>Totale in euro</span>
    </div>
    {priced < qty && <p className="report-coverage">Prezzo disponibile per {priced} di {qty} unità. Il totale include solo queste.</p>}
    {rows.length > 0 && <div className="report-charts">{chart('Più acquistati', 'qty')}{chart('Spesa per prodotto', 'cents')}</div>}
    <div className="report-table">
      <table>
        <thead><tr><th scope="col">Prodotto</th><th scope="col">Quantità</th><th scope="col">Totale €</th></tr></thead>
        <tbody>{rows.length ? rows.map(row => <tr key={row.id}>
          <td>{row.name}</td><td>{row.qty}</td>
          <td>{row.priced ? euro(row.cents) : '—'}{row.priced > 0 && row.priced < row.qty && <small>Parziale</small>}</td>
        </tr>) : <tr><td colSpan={3}>Nessun acquisto in questo periodo.</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
