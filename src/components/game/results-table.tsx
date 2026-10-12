"use client";

import type { QueryResult } from "@/types/database";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

const ERROR_QUIPS = [
  "Запрос провалился. Как и последняя облава.",
  "Синтаксическая ошибка. Даже преступники пишут аккуратнее.",
  "Ошибка. В этом городе ничего не работает с первого раза.",
  "Запрос не прошёл. Попробуйте снова, детектив.",
  "Провал. Но хотя бы никто не пострадал.",
];

function getErrorQuip(): string {
  return ERROR_QUIPS[Math.floor(Math.random() * ERROR_QUIPS.length)];
}

interface ResultsTableProps {
  result: QueryResult | null;
}

export function ResultsTable({ result }: ResultsTableProps) {
  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-sm">
        <div className="text-center space-y-2">
          <p className="text-noir-dim">{"// Введите SQL-запрос и нажмите Ctrl+Enter"}</p>
          <p className="text-noir-dim text-xs">Результаты появятся здесь</p>
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-noir-red font-mono text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-noir-red" />
          ОШИБКА
        </div>
        <p className="text-muted-foreground text-sm italic">{getErrorQuip()}</p>
        <pre className="text-noir-red/80 text-xs font-mono bg-card p-3 rounded border border-noir-red/20 whitespace-pre-wrap">
          {result.error}
        </pre>
        <p className="text-noir-dim text-xs font-mono">
          Время: {result.executionTimeMs}ms
        </p>
      </div>
    );
  }

  if (result.columns.length === 0) {
    return (
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-noir-green font-mono text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-noir-green" />
          Запрос выполнен
        </div>
        <p className="text-muted-foreground text-sm">
          Команда выполнена успешно. Нет данных для отображения.
        </p>
        <p className="text-noir-dim text-xs font-mono">
          Время: {result.executionTimeMs}ms
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-noir-green" />
          <span className="text-xs font-mono text-muted-foreground">
            {result.rowCount} {result.rowCount === 1 ? "запись" : result.rowCount < 5 ? "записи" : "записей"}
          </span>
        </div>
        <span className="text-xs font-mono text-noir-dim">
          {result.executionTimeMs}ms
        </span>
      </div>
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {result.columns.map((col) => (
                <TableHead
                  key={col}
                  className="text-primary font-mono text-xs uppercase tracking-wider whitespace-nowrap"
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, i) => (
              <TableRow
                key={i}
                className="border-border/50 hover:bg-muted/30"
              >
                {row.map((cell, j) => (
                  <TableCell
                    key={j}
                    className="font-mono text-sm whitespace-nowrap py-1.5"
                  >
                    {cell === null ? (
                      <span className="text-noir-dim italic">NULL</span>
                    ) : (
                      String(cell)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
