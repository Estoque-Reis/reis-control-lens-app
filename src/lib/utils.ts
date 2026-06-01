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
  if (Math.abs(value) < 0.01) return '0,00';
  return (value > 0 ? '+' : '') + value.toFixed(2).replace('.', ',');
}

export function formatCylinder(value: number) {
  if (value === null || value === undefined) return '0,00';
  const val = Number(value);
  if (Math.abs(val) < 0.01) return '0,00';
  return '-' + Math.abs(val).toFixed(2).replace('.', ',');
}

export function generateSkuCode(familyLine: string, esf: number, cil: number) {
  const esfStr = formatRefraction(esf);
  const cilStr = formatCylinder(cil);
  return `${familyLine.toUpperCase()}-ESF${esfStr}-CIL${cilStr}`;
}

export function sanitizeResidualText(value: string | null | undefined): string {
  if (!value) return '';
  let res = value;
  // Replace all capitalization variants of VERDE RESIDUAL -> RESIDUAL VERDE
  res = res.replace(/VERDE\s+RESIDUAL/g, 'RESIDUAL VERDE');
  res = res.replace(/Verde\s+Residual/g, 'Residual Verde');
  res = res.replace(/verde\s+residual/gi, (match) => {
    if (match === match.toUpperCase()) return 'RESIDUAL VERDE';
    if (match[0] === match[0].toUpperCase()) return 'Residual Verde';
    return 'residual verde';
  });

  // Replace all capitalization variants of AZUL RESIDUAL -> RESIDUAL AZUL
  res = res.replace(/AZUL\s+RESIDUAL/g, 'RESIDUAL AZUL');
  res = res.replace(/Azul\s+Residual/g, 'Residual Azul');
  res = res.replace(/azul\s+residual/gi, (match) => {
    if (match === match.toUpperCase()) return 'RESIDUAL AZUL';
    if (match[0] === match[0].toUpperCase()) return 'Residual Azul';
    return 'residual azul';
  });

  return res;
}

