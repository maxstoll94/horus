import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import type { TagRow } from '../types'

type TagTableMeta = {
  tagEdits: Record<number, { name: string }>
  setTagEdits: React.Dispatch<React.SetStateAction<Record<number, { name: string }>>>
  saveTagRow: (id: number) => void
  deleteTagRow: (id: number) => void
}

type Props = {
  tags: TagRow[]
  tagsTotal: number
  tagSearch: string
  setTagSearch: (value: string) => void
  tagsPage: number
  setTagsPage: (page: number | ((p: number) => number)) => void
  pageSizeTags: number
  tagStatus: string
  tagEdits: TagTableMeta['tagEdits']
  setTagEdits: TagTableMeta['setTagEdits']
  saveTagRow: (id: number) => void
  deleteTagRow: (id: number) => void
  loadTags: () => void
  setNewTagModalOpen: (open: boolean) => void
  tagColumns: ColumnDef<TagRow>[]
}

export function TagsView({
  tags,
  tagsTotal,
  tagSearch,
  setTagSearch,
  tagsPage,
  setTagsPage,
  pageSizeTags,
  tagStatus,
  tagEdits,
  setTagEdits,
  saveTagRow,
  deleteTagRow,
  loadTags,
  setNewTagModalOpen,
  tagColumns,
}: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Tags</h2>
        <div className="actions">
          <input
            type="text"
            placeholder="Search tags..."
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
          />
          <button onClick={() => setNewTagModalOpen(true)}>Add Tag</button>
          <button onClick={loadTags}>Refresh</button>
          <button onClick={() => setTagsPage(0)} disabled={tagsPage === 0}>
            First
          </button>
          <button
            onClick={() => setTagsPage((p) => Math.max(0, p - 1))}
            disabled={tagsPage === 0}
          >
            Prev
          </button>
          <span className="page-indicator">
            Page {tagsTotal === 0 ? 0 : tagsPage + 1}
          </span>
          <button
            onClick={() => setTagsPage((p) => p + 1)}
            disabled={tagsTotal === 0 || (tagsPage + 1) * pageSizeTags >= tagsTotal}
          >
            Next
          </button>
        </div>
      </div>
      <p className="muted">
        Cross-cutting labels for trips, people, projects, or one-offs — added on transactions in
        the Transactions view, via Rules, or by the AI chat. Renaming a tag to an existing name
        merges them; deleting a tag removes it everywhere it's applied.
      </p>
      {tagStatus && <div className="status">{tagStatus}</div>}
      <DataTable
        data={tags}
        columns={tagColumns}
        getRowId={(row) => String(row.id)}
        totalCount={tagsTotal}
        meta={{ tagEdits, setTagEdits, saveTagRow, deleteTagRow }}
        emptyMessage="No tags yet."
      />
    </div>
  )
}
