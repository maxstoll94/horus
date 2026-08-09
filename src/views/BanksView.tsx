import { useEffect, useState } from 'react'
import Select from 'react-select'
import { multiSelectStyles } from '../lib/reactSelectStyles'

type Aspsp = { name: string; country: string; maximum_consent_validity: number }
type Option = { value: string; label: string }
type ConnectStatus = { type: string; url?: string }
type BankConnection = Awaited<ReturnType<typeof window.api.banks.listConnections>>[number]

type Props = {
  pushToast: (message: string, kind?: 'success' | 'error' | 'info', durationMs?: number) => void
  // Connecting/syncing a bank creates or updates rows in the shared `accounts`
  // table behind the scenes — refresh the app-level list too, or the Accounts
  // page and the sidebar account filter show stale data until a manual Refresh.
  loadAccounts: () => void
  setActiveView: (view: 'bank-settings') => void
}

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null
  return Math.floor((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function StatusBadge({ status, validUntil }: { status: BankConnection['status']; validUntil: string | null }) {
  if (status === 'revoked') return <span className="status-badge">Disconnected</span>
  if (status === 'expired') return <span className="status-badge warning">Expired — reconnect</span>
  if (status === 'pending') return <span className="status-badge">Connecting…</span>

  const remaining = daysUntil(validUntil)
  if (remaining !== null && remaining < 0) return <span className="status-badge warning">Expired — reconnect</span>
  if (remaining !== null && remaining < 14) {
    return <span className="status-badge warning">Active — expires in {remaining}d</span>
  }
  return <span className="status-badge success">Active{remaining !== null ? ` — ${remaining}d left` : ''}</span>
}

export function BanksView({ pushToast, loadAccounts, setActiveView }: Props) {
  const [credentialsPresent, setCredentialsPresent] = useState<boolean | null>(null)

  const [connections, setConnections] = useState<BankConnection[]>([])
  const [accountDrafts, setAccountDrafts] = useState<Record<number, string>>({})

  const [countries, setCountries] = useState<string[]>([])
  const [country, setCountry] = useState('DE')
  const [aspsps, setAspsps] = useState<Aspsp[]>([])
  const [selectedAspspName, setSelectedAspspName] = useState('')
  const [loadingAspsps, setLoadingAspsps] = useState(false)

  const [connecting, setConnecting] = useState<Aspsp | null>(null)
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null)
  const [manualUrl, setManualUrl] = useState('')

  const loadCredentialsStatus = async () => {
    const status = await window.api.banks.credentialsStatus()
    setCredentialsPresent(status.present)
  }

  // Populates the country dropdown from the app's own registered country list.
  const loadCountries = async () => {
    const result = await window.api.banks.testCredentials()
    if (result.success && result.countries?.length) {
      setCountries(result.countries)
      setCountry((current) => (result.countries!.includes(current) ? current : result.countries!.includes('DE') ? 'DE' : result.countries![0]))
    }
  }

  const loadConnections = async () => {
    const rows = await window.api.banks.listConnections()
    setConnections(rows)
    setAccountDrafts((prev) => {
      const next = { ...prev }
      rows.forEach((c) => c.accounts.forEach((a) => {
        if (next[a.id] === undefined) next[a.id] = a.syncFromDate ?? ''
      }))
      return next
    })
  }

  useEffect(() => {
    loadCredentialsStatus()
    loadConnections()
    const unsubscribe = window.api.banks.onConnectStatus((status) => setConnectStatus(status))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (credentialsPresent) loadCountries()
  }, [credentialsPresent])

  useEffect(() => {
    if (!credentialsPresent || !country) return
    setLoadingAspsps(true)
    window.api.banks
      .listAspsps(country)
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name))
        setAspsps(sorted)
        setSelectedAspspName(sorted[0]?.name ?? '')
      })
      .catch((error) => pushToast(error instanceof Error ? error.message : 'Could not list banks.', 'error'))
      .finally(() => setLoadingAspsps(false))
  }, [country, credentialsPresent])

  const startConnect = async (aspsp: Aspsp) => {
    setConnecting(aspsp)
    setConnectStatus(null)
    setManualUrl('')
    const result = await window.api.banks.connect({
      aspspName: aspsp.name,
      aspspCountry: aspsp.country,
      maximumConsentValidity: aspsp.maximum_consent_validity,
    })
    setConnecting(null)
    setConnectStatus(null)
    if (!result.success) {
      pushToast(result.error ?? 'Connect failed.', 'error')
      return
    }
    pushToast(`Connected to ${aspsp.name}. Set a "sync from" date for each account below, then Sync now.`, 'success')
    loadConnections()
    loadAccounts()
  }

  const cancelConnect = async () => {
    await window.api.banks.connectCancel()
    setConnecting(null)
    setConnectStatus(null)
  }

  const submitManualUrl = async () => {
    const result = await window.api.banks.completeAuth({ redirectUrl: manualUrl.trim() })
    if (!result.success) {
      pushToast(result.error ?? 'That URL did not work.', 'error')
      return
    }
    setManualUrl('')
  }

  const saveAccountSyncFrom = async (accountId: number) => {
    const value = accountDrafts[accountId]
    await window.api.banks.updateAccount({ id: accountId, syncFromDate: value || null })
    pushToast('Sync start date saved.', 'success')
    loadConnections()
  }

  const syncNow = async (connectionId: number) => {
    const result = await window.api.banks.sync({ connectionId })
    if (!result.success) {
      pushToast(result.error ?? 'Sync failed.', 'error')
      return
    }
    if (result.needsReauth) {
      pushToast('Session expired — reconnect this bank to keep syncing.', 'error')
    } else {
      const inserted = result.perAccount?.reduce((sum, a) => sum + a.inserted, 0) ?? 0
      const skipped = result.perAccount?.reduce((sum, a) => sum + a.skipped, 0) ?? 0
      const accountErrors = result.perAccount?.filter((a) => a.error) ?? []
      if (accountErrors.length > 0) {
        pushToast(
          `Sync skipped ${accountErrors.length} account(s): ${accountErrors.map((a) => a.error).join('; ')}. Set a "sync from" date below and try again.`,
          'error',
          8000
        )
      }
      if (inserted > 0 || skipped > 0 || accountErrors.length === 0) {
        pushToast(`Sync complete: ${inserted} inserted, ${skipped} skipped.`, accountErrors.length > 0 ? 'info' : 'success')
      }
    }
    loadConnections()
    loadAccounts()
  }

  const disconnectConnection = async (connectionId: number) => {
    const result = await window.api.banks.disconnect({ connectionId })
    if (!result.success) {
      pushToast(result.error ?? 'Disconnect failed.', 'error')
      return
    }
    pushToast('Disconnected.', 'success')
    loadConnections()
  }

  const deleteConnection = async (connectionId: number) => {
    const deleted = await window.api.banks.deleteConnection({ connectionId })
    if (!deleted) {
      pushToast('Could not delete connection.', 'error')
      return
    }
    pushToast('Connection deleted.', 'success')
    loadConnections()
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Banks</h2>
        <div className="actions">
          <button onClick={loadConnections}>Refresh</button>
        </div>
      </div>
      <p className="muted">
        Live bank sync via Enable Banking (PSD2). Synced data transits Enable Banking's servers — the
        rest of Horus stays local. CSV import keeps working alongside this.
      </p>

      {!credentialsPresent && (
        <div className="status warning">
          No Enable Banking credentials configured.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveView('bank-settings') }}>Set them up in Settings</a>.
        </div>
      )}

      <h3>Connect a bank</h3>
      {!credentialsPresent ? (
        <p className="muted">Save your Enable Banking credentials in Settings first.</p>
      ) : (
        <div className="actions" style={{ alignItems: 'flex-start' }}>
          <label>
            Country
            <Select<Option>
              className="multi-select"
              classNamePrefix="rs"
              isSearchable
              options={countries.map((c) => ({ value: c, label: c }))}
              value={country ? { value: country, label: country } : null}
              onChange={(option) => option && setCountry(option.value)}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={{ ...multiSelectStyles, container: (base) => ({ ...base, width: '8rem' }) }}
            />
          </label>
          <label>
            Bank
            <Select<Option>
              className="multi-select"
              classNamePrefix="rs"
              isSearchable
              isLoading={loadingAspsps}
              isDisabled={aspsps.length === 0}
              options={aspsps.map((a) => ({ value: a.name, label: a.name }))}
              value={selectedAspspName ? { value: selectedAspspName, label: selectedAspspName } : null}
              onChange={(option) => setSelectedAspspName(option?.value ?? '')}
              placeholder={loadingAspsps ? 'Loading…' : 'Select a bank...'}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={{ ...multiSelectStyles, container: (base) => ({ ...base, width: '20rem' }) }}
            />
          </label>
          <button
            style={{ marginTop: '1.4rem' }}
            onClick={() => {
              const aspsp = aspsps.find((a) => a.name === selectedAspspName)
              if (aspsp) startConnect(aspsp)
            }}
            disabled={!selectedAspspName || !!connecting || loadingAspsps}
          >
            Connect
          </button>
        </div>
      )}

      <h3>Connections</h3>
      {connections.length === 0 ? (
        <p className="muted">No banks connected yet.</p>
      ) : (
        connections.map((c) => (
          <div key={c.id} className="danger-zone-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{c.aspspName}</strong> ({c.aspspCountry}) — <StatusBadge status={c.status} validUntil={c.validUntil} />
              </div>
              <div className="actions">
                <button onClick={() => syncNow(c.id)} disabled={c.status !== 'active'}>Sync now</button>
                {c.status === 'active' || c.status === 'pending' ? (
                  <button className="danger-btn" onClick={() => disconnectConnection(c.id)}>Disconnect</button>
                ) : (
                  <button className="danger-btn" onClick={() => deleteConnection(c.id)}>Delete</button>
                )}
              </div>
            </div>
            {c.accounts.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', paddingLeft: '1rem' }}>
                <span>{a.accountName} ({a.accountIdentifier})</span>
                <label>
                  Sync from{' '}
                  <input
                    type="date"
                    value={accountDrafts[a.id] ?? ''}
                    onChange={(event) => setAccountDrafts((prev) => ({ ...prev, [a.id]: event.target.value }))}
                  />
                </label>
                <button onClick={() => saveAccountSyncFrom(a.id)}>Save</button>
                {!a.syncFromDate && !a.lastBookedDate ? (
                  <span className="status-badge warning">Set a sync-from date before syncing</span>
                ) : (
                  <span className="muted">
                    Last synced: {a.lastSyncedAt ?? 'never'}{a.lastBookedDate ? ` · through ${a.lastBookedDate}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      {connecting && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Connecting to {connecting.name}</h3>
              <button onClick={cancelConnect}>Cancel</button>
            </div>
            <div className="modal-body">
              <p>
                A browser window should have opened for you to log in and authorize access.
                {connectStatus?.url && (
                  <>
                    {' '}If it didn't,{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); window.open(connectStatus.url) }}>
                      open it manually
                    </a>.
                  </>
                )}
              </p>
              <p className="muted">
                If your browser refuses the local redirect (certificate warning), copy the final URL
                from its address bar and paste it here:
              </p>
              <div className="actions">
                <input
                  type="text"
                  value={manualUrl}
                  onChange={(event) => setManualUrl(event.target.value)}
                  placeholder="https://localhost:53289/eb-callback?code=...&state=..."
                  style={{ flex: 1 }}
                />
                <button onClick={submitManualUrl} disabled={!manualUrl.trim()}>Submit</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
