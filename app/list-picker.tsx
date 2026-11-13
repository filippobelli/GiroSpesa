'use client';

import { useState } from 'react';
import { GENERAL, visibleItems, type ShoppingList } from '@/lib/shopping-lists';

export function ListPicker({ familyId, lists, onChoose, onCreate, onSignOut }: {
  familyId: string;
  lists: ShoppingList[];
  onChoose: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <main className="list-choice">
      <header>
        <div className="brand"><span className="brand-mark">g</span><span>giro<span>spesa</span></span></div>
        <button className="outline-btn" onClick={onSignOut}>Esci</button>
      </header>
      <h1>Scegli la lista</h1>
      <p>Apri una lista oppure creane una nuova.</p>
      <div className="list-choice-options">
        {lists.map(list => {
          const general = list.id === familyId;
          const count = visibleItems(lists, list.id, familyId).length;
          return (
            <button className={general ? 'list-choice-general' : undefined} key={list.id} onClick={() => onChoose(list.id)}>
              <strong>{general ? GENERAL : list.name}</strong>
              <small>{count} {count === 1 ? 'prodotto' : 'prodotti'}{general && ' · include le altre liste'}</small>
            </button>
          );
        })}
      </div>
      <form onSubmit={async event => {
        event.preventDefault();
        if (busy || !name.trim()) return;
        setBusy(true);
        setError('');
        try {
          await onCreate(name.trim().normalize('NFC'));
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Non riesco a creare la lista.');
        } finally {
          setBusy(false);
        }
      }}>
        <input aria-label="Nome nuova lista" placeholder="Nome nuova lista" value={name} onChange={event => setName(event.target.value)} maxLength={40} required />
        <button className="primary-btn" disabled={busy || !name.trim()}>{busy ? 'Creo…' : 'Crea'}</button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </main>
  );
}
