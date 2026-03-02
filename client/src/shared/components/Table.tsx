import { type ReactNode } from 'react'

export interface TableProps {
  headers: ReactNode[]
  rows: ReactNode[][]
  emptyMessage?: string
  className?: string
}

export function Table({
  headers,
  rows,
  emptyMessage = 'Nenhum registro.',
  className = '',
}: TableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-fg-secondary font-semibold text-xs uppercase px-3 py-3 text-left border-b border-surface-border"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-3 py-8 text-center text-muted text-sm"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-surface-border last:border-0 hover:bg-surface-hover transition-colors"
              >
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3 text-sm text-fg">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
