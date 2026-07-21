export const MAURITIUS_BANKS = [
  "ABC Banking Corporation",
  "Absa Bank (Mauritius)",
  "AfrAsia Bank",
  "Bank of Baroda",
  "Bank One",
  "BCP Bank (Mauritius)",
  "Habib Bank",
  "HSBC Bank (Mauritius)",
  "Investec Bank (Mauritius)",
  "MauBank",
  "Mauritius Commercial Bank (MCB)",
  "SBI (Mauritius)",
  "SBM Bank (Mauritius)",
  "Silver Bank",
  "Standard Bank (Mauritius)",
  "Standard Chartered Bank (Mauritius)",
] as const;

export type MauritiusBank = (typeof MAURITIUS_BANKS)[number];
