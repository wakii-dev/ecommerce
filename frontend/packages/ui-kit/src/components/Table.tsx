import type { ReactNode } from 'react';

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Không truyền → render giá trị (row as Record) */
  render?: (row: Row) => ReactNode;
  align?: 'left' | 'right' | 'center';
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** Key ổn định cho row (mặc định: index) */
  rowKey?: (row: Row, index: number) => string;
  /** Nội dung khi rows rỗng (mặc định: text "Không có dữ liệu") */
  empty?: ReactNode;
  caption?: string;
  className?: string;
}

export function Table<Row>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className
}: TableProps<Row>) {
  const alignClass = (align?: TableColumn<Row>['align']) =>
    align === 'right' ? ' uk-table__right' : '';

  return (
    <table
      className={['uk-table', className ?? null].filter(Boolean).join(' ')}
    >
      {caption ? <caption className="uk-hint">{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              scope="col"
              className={alignClass(col.align).trim() || undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="uk-table__empty" colSpan={columns.length}>
              {empty ?? 'Không có dữ liệu'}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={alignClass(col.align).trim() || undefined}
                >
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
