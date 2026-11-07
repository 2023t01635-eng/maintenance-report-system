import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const serializableOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable
} as const;

function isWriteConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

export async function withSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, serializableOptions);
    } catch (error) {
      if (!isWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Serializable transaction retry limit exceeded");
}
