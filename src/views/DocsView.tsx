import type { ReactNode } from 'react'

type DocSection = {
  icon: string
  title: string
  body: ReactNode
}

const SECTIONS: DocSection[] = [
  {
    icon: '👋',
    title: 'What is Horus?',
    body: (
      <p>
        Horus imports your bank transactions, helps you categorize them (by hand, with rules, or
        with AI), and turns that into budgets and spending insights.
      </p>
    ),
  },
  {
    icon: '📥',
    title: 'Importing transactions',
    body: (
      <>
        <p>
          Go to <strong>Transactions → Import</strong>, pick your bank (DKB, ING, Sparkasse, or
          Volksbank), and choose the CSV file exported from your bank's online portal.
        </p>
        <ul>
          <li>Horus detects the account and starting balance automatically where possible.</li>
          <li>A file you've already imported is skipped automatically — no duplicate transactions.</li>
        </ul>
      </>
    ),
  },
  {
    icon: '💳',
    title: 'Transactions',
    body: (
      <p>
        A transaction is a single booking on one of your accounts — a purchase, a transfer, a
        salary payment, and so on. Each has a date, a payee, a purpose (the bank's description
        text), and an amount. Browse and search all of them under <strong>Transactions</strong>.
      </p>
    ),
  },
  {
    icon: '🗂️',
    title: 'Categories',
    body: (
      <p>
        Categories classify what a transaction is for — Groceries, Rent, Salary, and so on. Every
        category belongs to a group (Income, Fixed Expenses, Variable Expenses, Savings &amp;
        Investments, or Internal Transfers), which drives how it's shown on the Dashboard and
        Budget. Manage them under <strong>Configuration → Categories</strong>.
      </p>
    ),
  },
  {
    icon: '🏷️',
    title: 'Tags',
    body: (
      <p>
        Tags are a second, more flexible label you can stack on top of a category — for example,
        tag a handful of unrelated transactions "Vacation 2026" to see their combined total.
        Manage them under <strong>Configuration → Tags</strong>.
      </p>
    ),
  },
  {
    icon: '⚙️',
    title: 'Rules',
    body: (
      <p>
        A rule automatically assigns a category (and optionally tags) to any transaction matching
        a condition, like "Payee contains Netflix". Rules run automatically on new imports and can
        also be applied on demand. Manage them under <strong>Configuration → Rules</strong>.
      </p>
    ),
  },
  {
    icon: '🤖',
    title: 'Categorization & AI suggestions',
    body: (
      <>
        <p>
          The <strong>Categorization</strong> screen is where you clear out uncategorized
          transactions. Pick a category and/or tags, then click the green "A" button to apply
          them.
        </p>
        <ul>
          <li>
            If AI suggestions are enabled (see Settings), Horus pre-fills its best guess for you.
          </li>
          <li>Click the blue "i" icon to see the suggestion's reasoning.</li>
          <li>Use the "C" icon to turn a transaction into a reusable rule.</li>
        </ul>
      </>
    ),
  },
  {
    icon: '🏦',
    title: 'Accounts',
    body: (
      <>
        <p>
          An account represents one bank account or card. It's created automatically the first
          time you import a file for it. Its balance is calculated from an anchor balance (a known
          starting point) plus every transaction booked after that date.
        </p>
        <ul>
          <li>Manage accounts — rename, retype, adjust the anchor — under <strong>Configuration → Accounts</strong>.</li>
          <li>Deleting an account deletes all of its transactions too — this can't be undone.</li>
        </ul>
      </>
    ),
  },
  {
    icon: '📊',
    title: 'Budget & Dashboard',
    body: (
      <p>
        Set a monthly or yearly budget per category under <strong>Budget</strong>, then compare it
        against what you actually spent. The <strong>Dashboard</strong> gives a rolling overview
        of income, spending, and net across any month or range.
      </p>
    ),
  },
  {
    icon: '🔑',
    title: 'Settings',
    body: (
      <p>
        Configure the AI model, turn AI suggestions on or off, and set your OpenAI API key (or
        leave it blank to fall back to the <code>OPENAI_API_KEY</code> environment variable). The
        Danger Zone lets you wipe transactions or reset the whole database.
      </p>
    ),
  },
]

export function DocsView() {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Docs</h2>
      </div>
      <p className="muted">A quick guide to what everything in Horus does.</p>
      {SECTIONS.map((section) => (
        <div className="docs-section" key={section.title}>
          <h3>
            <span className="docs-icon" aria-hidden="true">
              {section.icon}
            </span>
            {section.title}
          </h3>
          {section.body}
        </div>
      ))}
    </div>
  )
}
