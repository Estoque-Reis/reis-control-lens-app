import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatRefraction(value: number) {
  if (value === null || value === undefined) return '0,00';
  return (value >= 0 ? '+' : '') + value.toFixed(2).replace('.', ',');
}

export function generateSkuCode(familyLine: string, esf: number, cil: number) {
  const esfStr = formatRefraction(esf);
  const cilStr = formatRefraction(cil);
  return `${familyLine.toUpperCase()}-ESF${esfStr}-CIL${cilStr}`;
}
