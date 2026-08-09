import { useEffect, useState } from 'react'

type Props = {
  pushToast: (message: string, kind?: 'success' | 'error' | 'info', durationMs?: number) => void
}

export function BankSettingsView({ pushToast }: Props) {
  const [credentialsPresent, setCredentialsPresent] = useState<boolean | null>(null)
  const [appIdInput, setAppIdInput] = useState('')
  const [keyPath, setKeyPath] = useState<string | null>(null)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const loadCredentialsStatus = async () => {
    const status = await window.api.banks.credentialsStatus()
    setCredentialsPresent(status.present)
    if (status.appId) setAppIdInput(status.appId)
  }

  useEffect(() => {
    loadCredentialsStatus()
  }, [])

  const pickKeyFile = async () => {
    const path = await window.api.banks.pickKeyFile()
    if (path) setKeyPath(path)
  }

  const saveCredentials = async () => {
    if (!appIdInput.trim() || !keyPath) {
      pushToast('Application ID and private key file are both required.', 'error')
      return
    }
    setSavingCredentials(true)
    const result = await window.api.banks.setCredentials({ appId: appIdInput.trim(), keyPath })
    setSavingCredentials(false)
    if (!result.success) {
      pushToast(result.error ?? 'Could not save credentials.', 'error')
      return
    }
    pushToast('Credentials saved.', 'success')
    setKeyPath(null)
    loadCredentialsStatus()
  }

  const testConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)
    const result = await window.api.banks.testCredentials()
    setTestingConnection(false)
    if (!result.success) {
      setTestResult(`Failed: ${result.error}`)
      return
    }
    setTestResult(`OK — "${result.name}" (${result.environment}), active=${result.active}`)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Banking</h2>
        <button onClick={loadCredentialsStatus}>Refresh</button>
      </div>
      <p className="muted">
        Enable Banking credentials, used for live bank sync. Synced data transits Enable Banking's
        servers — see the Banks page for connecting and syncing individual banks.
      </p>
      <div className="status">
        <strong>Status:</strong>{' '}
        {credentialsPresent === null ? 'Checking…' : credentialsPresent ? 'Saved' : 'Not configured'}
      </div>
      <div className="ai-form">
        <label>
          Application ID
          <input
            type="text"
            value={appIdInput}
            onChange={(event) => setAppIdInput(event.target.value)}
            placeholder="app_id from the Enable Banking Control Panel"
          />
        </label>
        <label>
          Private key
          <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" onClick={pickKeyFile}>Choose .pem file</button>
            <span className="muted">
              {keyPath ?? (credentialsPresent ? 'Key saved (choose a file to replace it)' : 'No file selected')}
            </span>
          </span>
        </label>
        <button onClick={saveCredentials} disabled={savingCredentials}>
          {savingCredentials ? 'Saving…' : 'Save credentials'}
        </button>
        <button onClick={testConnection} disabled={testingConnection || !credentialsPresent}>
          {testingConnection ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && <div className="muted">{testResult}</div>}
      </div>
    </div>
  )
}
