/** Entry fed to the near-duplicate lookup (pHash table). */
export type PhotoOrStampEntry = {
  hash: string;
  kind: string; // "stamp" | "lab" | "classroom" | content label
  applicationId: string;
};
