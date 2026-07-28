import type { StylesConfig } from 'react-select'

export const multiSelectStyles: StylesConfig<any, true> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#ffffff',
    borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
    boxShadow: state.isFocused
      ? '0 0 0 1px #2563eb'
      : 'none',
    minHeight: 34,
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    color: '#1f2937',
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#2563eb'
      : state.isFocused
      ? '#eef2ff'
      : '#ffffff',
    color: state.isSelected ? '#ffffff' : '#1f2937',
  }),
  singleValue: (base) => ({ ...base, color: '#1f2937' }),
  placeholder: (base) => ({ ...base, color: '#6b7280' }),
  input: (base) => ({ ...base, color: '#1f2937' }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: '#eef2ff',
    border: '1px solid #2563eb',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: '#1f2937',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: '#2563eb',
  }),
}
