import { useState } from 'react'

type AiSettings = {
  model: string
  enabled: number
  confidenceThreshold: number
  inputCostPer1M: number | null
  outputCostPer1M: number | null
  webSearch: number
  apiKey: string | null
}

type AiRequest = {
  id: number
  model: string | null
  requestPayload: string | null
  responsePayload: string | null
  status: string
  error: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  createdAt: string
}

type Props = {
  aiKeyStatus: { present: boolean; source: 'settings' | 'env' | null } | null
  aiSettings: AiSettings | null
  setAiSettings: (settings: AiSettings) => void
  aiRequests: AiRequest[]
  aiRequestsTotal: number
  aiRequestsPage: number
  setAiRequestsPage: (page: number | ((p: number) => number)) => void
  pageSizeAiRequests: number
  loadAiRequests: () => void
  loadAiSettings: () => void
  clearAndReset: () => void
  clearTransactions: () => void
}

export function AiSettingsView({
  aiKeyStatus,
  aiSettings,
  setAiSettings,
  aiRequests,
  aiRequestsTotal,
  aiRequestsPage,
  setAiRequestsPage,
  pageSizeAiRequests,
  loadAiRequests,
  loadAiSettings,
  clearAndReset,
  clearTransactions,
}: Props) {
  const [showApiKey, setShowApiKey] = useState(false)

  return (
    <div className="card">
      <div className="card-header">
        <h2>AI Settings</h2>
        <button onClick={loadAiSettings}>Refresh</button>
      </div>
      <div className="status">
        <strong>API key:</strong>{' '}
        {aiKeyStatus === null
          ? 'Checking...'
          : aiKeyStatus.present
          ? `Present (from ${aiKeyStatus.source === 'settings' ? 'Settings' : 'environment'})`
          : 'Missing'}
      </div>
      {aiKeyStatus?.present === false && (
        <div className="status warning">
          No OpenAI API key configured. Enter one below, or set OPENAI_API_KEY
          in your environment.
        </div>
      )}
      {aiSettings && (
        <div className="ai-form">
          <label>
            Model
            <input
              type="text"
              value={aiSettings.model}
              onChange={(event) =>
                setAiSettings({
                  ...aiSettings,
                  model: event.target.value,
                })
              }
            />
          </label>
          <label className="ai-checkbox">
            Enabled
            <input
              type="checkbox"
              checked={aiSettings.enabled === 1}
              onChange={(event) =>
                setAiSettings({
                  ...aiSettings,
                  enabled: event.target.checked ? 1 : 0,
                })
              }
            />
          </label>
          <label className="ai-checkbox" title="Lets the categorization AI look up unknown payees on the web. Slower and slightly more expensive per run; requires a model that supports OpenAI web search.">
            Web search for unknown payees
            <input
              type="checkbox"
              checked={aiSettings.webSearch === 1}
              onChange={(event) =>
                setAiSettings({
                  ...aiSettings,
                  webSearch: event.target.checked ? 1 : 0,
                })
              }
            />
          </label>
          <label title="Suggestions at or above this confidence are applied automatically; anything below waits for your review.">
            Auto-apply threshold
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={aiSettings.confidenceThreshold}
              onChange={(event) =>
                setAiSettings({
                  ...aiSettings,
                  confidenceThreshold: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Input cost ($ per 1M tokens)
            <input
              type="number"
              min={0}
              step={0.000001}
              value={aiSettings.inputCostPer1M ?? ''}
              onChange={(event) =>
                setAiSettings({
                  ...aiSettings,
                  inputCostPer1M:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Output cost ($ per 1M tokens)
            <input
              type="number"
              min={0}
              step={0.000001}
              value={aiSettings.outputCostPer1M ?? ''}
              onChange={(event) =>
                setAiSettings({
                  ...aiSettings,
                  outputCostPer1M:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            OpenAI API key
            <span style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder={
                  aiKeyStatus?.source === 'env'
                    ? 'Using OPENAI_API_KEY from environment'
                    : 'sk-...'
                }
                value={aiSettings.apiKey ?? ''}
                onChange={(event) =>
                  setAiSettings({
                    ...aiSettings,
                    apiKey: event.target.value === '' ? null : event.target.value,
                  })
                }
              />
              <button type="button" onClick={() => setShowApiKey((v) => !v)}>
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <button
            onClick={async () => {
              const updated = await window.api.ai.updateSettings({
                model: aiSettings.model,
                enabled: aiSettings.enabled,
                confidenceThreshold: aiSettings.confidenceThreshold,
                inputCostPer1M: aiSettings.inputCostPer1M,
                outputCostPer1M: aiSettings.outputCostPer1M,
                webSearch: aiSettings.webSearch,
                apiKey: aiSettings.apiKey,
              })
              setAiSettings({
                model: updated.model,
                enabled: updated.enabled,
                confidenceThreshold: updated.confidenceThreshold,
                inputCostPer1M: updated.inputCostPer1M,
                outputCostPer1M: updated.outputCostPer1M,
                webSearch: updated.webSearch ?? 0,
                apiKey: updated.apiKey,
              })
              loadAiSettings()
            }}
          >
            Save
          </button>
        </div>
      )}
      <div className="danger-zone">
        <h3>Danger Zone</h3>
        <div className="danger-zone-actions">
          <div className="danger-zone-row">
            <div>
              <strong>Delete all transactions</strong>
              <p>Removes all transactions and imports. Accounts, categories and rules are kept.</p>
            </div>
            <button className="danger-btn" onClick={clearTransactions}>Delete Transactions</button>
          </div>
          <div className="danger-zone-row">
            <div>
              <strong>Reset database</strong>
              <p>Deletes everything and restores the default categories.</p>
            </div>
            <button className="danger-btn" onClick={clearAndReset}>Reset All Data</button>
          </div>
        </div>
      </div>
      <div className="ai-requests">
        <div className="card-header">
          <h3>AI Requests</h3>
          <div className="actions">
            <button onClick={loadAiRequests}>Refresh</button>
            <button
              onClick={() => setAiRequestsPage(0)}
              disabled={aiRequestsPage === 0}
            >
              First
            </button>
            <button
              onClick={() => setAiRequestsPage((p) => Math.max(0, p - 1))}
              disabled={aiRequestsPage === 0}
            >
              Prev
            </button>
            <span className="page-indicator">
              Page {aiRequestsTotal === 0 ? 0 : aiRequestsPage + 1}
            </span>
            <button
              onClick={() => setAiRequestsPage((p) => p + 1)}
              disabled={
                aiRequestsTotal === 0 ||
                (aiRequestsPage + 1) * pageSizeAiRequests >= aiRequestsTotal
              }
            >
              Next
            </button>
          </div>
        </div>
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {aiRequests.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={6}>
                    No AI requests yet.
                  </td>
                </tr>
              ) : (
                aiRequests.map((req) => (
                  <tr key={req.id}>
                    <td>{req.createdAt}</td>
                    <td>{req.status}</td>
                    <td>{req.model ?? '-'}</td>
                    <td>
                      {req.inputTokens != null && req.outputTokens != null
                        ? `${req.inputTokens}/${req.outputTokens}/${req.totalTokens ?? req.inputTokens + req.outputTokens}`
                        : '-'}
                    </td>
                    <td>
                      {req.costUsd != null ? `$${req.costUsd.toFixed(6)}` : '-'}
                    </td>
                    <td>
                      <details>
                        <summary>View</summary>
                        {req.error && (
                          <div className="muted">Error: {req.error}</div>
                        )}
                        {req.requestPayload && (
                          <pre className="payload">
                            {req.requestPayload}
                          </pre>
                        )}
                        {req.responsePayload && (
                          <pre className="payload">
                            {req.responsePayload}
                          </pre>
                        )}
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="data-table-footer">Total: {aiRequestsTotal}</div>
        </div>
      </div>
    </div>
  )
}
