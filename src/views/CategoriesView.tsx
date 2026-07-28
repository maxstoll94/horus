import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import type { CategoryRow } from '../types'

type CategoryTableMeta = {
  categoryEdits: Record<
    number,
    {
      name: string
      color: string | null
      isActive: number
    }
  >
  setCategoryEdits: React.Dispatch<
    React.SetStateAction<
      Record<
        number,
        {
          name: string
          color: string | null
          isActive: number
        }
      >
    >
  >
  saveCategory: (id: number) => void
  deleteCategoryRow: (id: number) => void
}

type Props = {
  categories: CategoryRow[]
  categoriesTotal: number
  categorySearch: string
  setCategorySearch: (value: string) => void
  categoriesPage: number
  setCategoriesPage: (page: number | ((p: number) => number)) => void
  pageSizeCategories: number
  categoryStatus: string
  categoryEdits: CategoryTableMeta['categoryEdits']
  setCategoryEdits: CategoryTableMeta['setCategoryEdits']
  saveCategory: (id: number) => void
  deleteCategoryRow: (id: number) => void
  loadCategories: () => void
  setNewCategoryModalOpen: (open: boolean) => void
  categoryColumns: ColumnDef<CategoryRow>[]
}

export function CategoriesView({
  categories,
  categoriesTotal,
  categorySearch,
  setCategorySearch,
  categoriesPage,
  setCategoriesPage,
  pageSizeCategories,
  categoryStatus,
  categoryEdits,
  setCategoryEdits,
  saveCategory,
  deleteCategoryRow,
  loadCategories,
  setNewCategoryModalOpen,
  categoryColumns,
}: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Categories</h2>
        <div className="actions">
          <input
            type="text"
            placeholder="Search category..."
            value={categorySearch}
            onChange={(event) => setCategorySearch(event.target.value)}
          />
          <button onClick={() => setNewCategoryModalOpen(true)}>
            Add Category
          </button>
          <button onClick={loadCategories}>Refresh</button>
          <button
            onClick={() => setCategoriesPage(0)}
            disabled={categoriesPage === 0}
          >
            First
          </button>
          <button
            onClick={() => setCategoriesPage((p) => Math.max(0, p - 1))}
            disabled={categoriesPage === 0}
          >
            Prev
          </button>
          <span className="page-indicator">
            Page {categoriesTotal === 0 ? 0 : categoriesPage + 1}
          </span>
          <button
            onClick={() => setCategoriesPage((p) => p + 1)}
            disabled={
              categoriesTotal === 0 ||
              (categoriesPage + 1) * pageSizeCategories >= categoriesTotal
            }
          >
            Next
          </button>
        </div>
      </div>
      {categoryStatus && <div className="status">{categoryStatus}</div>}
      <DataTable
        data={categories}
        columns={categoryColumns}
        getRowId={(row) => String(row.id)}
        totalCount={categoriesTotal}
        meta={{
          categoryEdits,
          setCategoryEdits,
          saveCategory,
          deleteCategoryRow,
        }}
        emptyMessage="No categories yet."
      />
    </div>
  )
}
